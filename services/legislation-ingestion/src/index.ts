/**
 * Legislation Ingestion Service
 *
 * Pulls legislation from external data sources and converts it into
 * git-style commits with full authorship attribution.
 *
 * Data Sources:
 * - Congress.gov API — Federal bills, sponsors, amendments
 * - GovInfo (GPO) API — Full bill text, related documents
 * - LegiScan API — All 50 states + federal
 * - OpenStates API — State-level legislation
 *
 * Environment Variables:
 * - PORT (default: 3006)
 * - CONGRESS_GOV_API_KEY
 * - GOVINFO_API_KEY
 * - LEGISCAN_API_KEY
 * - OPENSTATES_API_KEY
 * - REDIS_HOST, REDIS_PORT
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { IngestionOrchestrator } from './lib/orchestrator.js';
import type { ConnectorConfig } from './types/index.js';

const PORT = parseInt(process.env.PORT || '3006', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ─────────────────────────────────────────────────────────────────────────────
// Build connector configs from environment
// ─────────────────────────────────────────────────────────────────────────────

function buildConnectorConfig(
  apiKey: string | undefined,
  overrides?: Partial<ConnectorConfig>
): ConnectorConfig {
  return {
    apiKey: apiKey || '',
    enabled: !!apiKey,
    rateLimit: overrides?.rateLimit || 60,
    rateLimitPeriod: overrides?.rateLimitPeriod || 60_000,
    timeout: overrides?.timeout || 30_000,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialize
// ─────────────────────────────────────────────────────────────────────────────

const orchestrator = new IngestionOrchestrator({
  congressGov: buildConnectorConfig(process.env.CONGRESS_GOV_API_KEY, {
    rateLimit: 80,
  }),
  govInfo: buildConnectorConfig(process.env.GOVINFO_API_KEY),
  legiScan: buildConnectorConfig(process.env.LEGISCAN_API_KEY, {
    rateLimit: 30, // Conservative for free tier
  }),
  openStates: buildConnectorConfig(process.env.OPENSTATES_API_KEY),
  concurrency: parseInt(process.env.INGESTION_CONCURRENCY || '5', 10),
  onBillNormalized: async (bill) => {
    // TODO: Write to database once it's set up
    // For now, log the result
    console.log(
      `[ingestion] Normalized: ${bill.raw.billNumber} — ${bill.commits.length} commits, ${bill.authors.length} authors`
    );
  },
  onError: (error) => {
    console.error(`[ingestion] Error in ${error.source}: ${error.message}`, {
      billId: error.billId,
      phase: error.phase,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Fastify Server
// ─────────────────────────────────────────────────────────────────────────────

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    ...(process.env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
  },
});

async function start() {
  // Register plugins
  await fastify.register(helmet);
  await fastify.register(cors, { origin: true });

  // ── Health endpoints ──────────────────────────────────────────────────

  fastify.get('/health', async () => ({
    status: 'ok',
    service: 'legislation-ingestion',
    enabledSources: orchestrator.getEnabledSources(),
    timestamp: new Date().toISOString(),
  }));

  fastify.get('/health/sources', async () => {
    const health = await orchestrator.healthCheck();
    const allHealthy = Object.values(health).every((h) => h.healthy);
    return {
      status: allHealthy ? 'ok' : 'degraded',
      sources: health,
    };
  });

  // ── Ingestion endpoints ───────────────────────────────────────────────

  /** Trigger an ingestion run for all enabled sources */
  fastify.post('/api/v1/ingest', async (request) => {
    const { since } = (request.body as { since?: string }) || {};
    const sinceDate = since ? new Date(since) : undefined;

    const results = await orchestrator.ingestUpdates(sinceDate);
    return {
      status: 'completed',
      results,
      state: orchestrator.getState(),
    };
  });

  /** Ingest a specific bill from a specific source */
  fastify.post('/api/v1/ingest/bill', async (request) => {
    const { source, externalId } = request.body as {
      source: string;
      externalId: string;
    };

    if (!source || !externalId) {
      return { error: 'source and externalId are required' };
    }

    const result = await orchestrator.ingestBill(source, externalId);
    if (!result) {
      return { error: 'Failed to ingest bill' };
    }

    return {
      status: 'ok',
      billId: result.billId,
      commits: result.commits.length,
      authors: result.authors.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
      })),
      blame: result.blame
        ? {
            totalLines: result.blame.stats.totalLines,
            uniqueAuthors: result.blame.stats.uniqueAuthors,
            contributions: result.blame.stats.authorContributions.map((c) => ({
              author: c.author.name,
              lines: c.linesAuthored,
              percentage: c.percentage,
            })),
          }
        : null,
    };
  });

  /** Ingest a federal bill with text enrichment (Congress.gov + GovInfo) */
  fastify.post('/api/v1/ingest/federal', async (request) => {
    const { externalId } = request.body as { externalId: string };

    if (!externalId) {
      return { error: 'externalId is required (format: congress/type/number, e.g., 119/hr/1234)' };
    }

    const result = await orchestrator.ingestFederalBillWithText(externalId);
    if (!result) {
      return { error: 'Failed to ingest federal bill' };
    }

    return {
      status: 'ok',
      billId: result.billId,
      title: result.raw.title,
      commits: result.commits.length,
      hasText: !!result.raw.textContent,
      authors: result.authors.length,
      blame: result.blame
        ? {
            totalLines: result.blame.stats.totalLines,
            uniqueAuthors: result.blame.stats.uniqueAuthors,
          }
        : null,
    };
  });

  /** Search bills across all sources */
  fastify.get('/api/v1/search', async (request) => {
    const { q, state, limit } = request.query as {
      q?: string;
      state?: string;
      limit?: string;
    };

    if (!q) {
      return { error: 'q (query) parameter is required' };
    }

    const results = await orchestrator.searchAllSources({
      query: q,
      state,
      limit: limit ? parseInt(limit, 10) : 10,
    });

    return { results };
  });

  // ── Status endpoint ───────────────────────────────────────────────────

  fastify.get('/api/v1/status', async () => ({
    enabledSources: orchestrator.getEnabledSources(),
    state: orchestrator.getState(),
    configuration: {
      concurrency: parseInt(process.env.INGESTION_CONCURRENCY || '5', 10),
      sources: {
        'congress.gov': { enabled: !!process.env.CONGRESS_GOV_API_KEY },
        govinfo: { enabled: !!process.env.GOVINFO_API_KEY },
        legiscan: { enabled: !!process.env.LEGISCAN_API_KEY },
        openstates: { enabled: !!process.env.OPENSTATES_API_KEY },
      },
    },
  }));

  // ── Start server ──────────────────────────────────────────────────────

  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`Legislation ingestion service running on port ${PORT}`);
    fastify.log.info(`Enabled sources: ${orchestrator.getEnabledSources().join(', ') || 'none (set API keys to enable)'}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
