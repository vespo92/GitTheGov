/**
 * Ingestion Orchestrator
 *
 * Coordinates data ingestion across all four external sources:
 * 1. Congress.gov — Federal bills, sponsors, amendments, text
 * 2. GovInfo (GPO) — Full bill text, related documents
 * 3. LegiScan — All 50 states + federal, votes, full text
 * 4. OpenStates — State bills, sponsors, actions, votes
 *
 * The orchestrator:
 * - Runs connectors in parallel where possible
 * - Deduplicates bills across sources (same bill in Congress.gov + GovInfo)
 * - Normalizes all data into LegislationCommit format
 * - Tracks ingestion state (last sync time per source)
 * - Reports errors without stopping the pipeline
 */

import { CongressGovConnector } from '../connectors/congress-gov.js';
import { GovInfoConnector } from '../connectors/govinfo.js';
import { LegiScanConnector } from '../connectors/legiscan.js';
import { OpenStatesConnector } from '../connectors/openstates.js';
import { normalizeBillToCommits } from '../normalizers/bill-to-commits.js';
import type { NormalizedBill } from '../normalizers/bill-to-commits.js';
import type { BaseConnector } from '../connectors/base-connector.js';
import type { ConnectorConfig, DataSource, IngestionResult, IngestionError, RawBillRecord } from '../types/index.js';

export interface OrchestratorConfig {
  congressGov: ConnectorConfig;
  govInfo: ConnectorConfig;
  legiScan: ConnectorConfig;
  openStates: ConnectorConfig;
  /** How many bills to process in parallel per source */
  concurrency: number;
  /** Callback for when a bill is successfully normalized */
  onBillNormalized?: (bill: NormalizedBill) => Promise<void>;
  /** Callback for when a bill encounters an error */
  onError?: (error: IngestionError) => void;
}

export interface IngestionState {
  lastSyncTime: Record<string, Date>;
  totalBillsIngested: number;
  totalCommitsCreated: number;
}

export class IngestionOrchestrator {
  private connectors: Map<string, BaseConnector>;
  private config: OrchestratorConfig;
  private state: IngestionState;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.connectors = new Map();
    this.state = {
      lastSyncTime: {},
      totalBillsIngested: 0,
      totalCommitsCreated: 0,
    };

    // Initialize enabled connectors
    if (config.congressGov.enabled) {
      this.connectors.set('congress.gov', new CongressGovConnector(config.congressGov));
    }
    if (config.govInfo.enabled) {
      this.connectors.set('govinfo', new GovInfoConnector(config.govInfo));
    }
    if (config.legiScan.enabled) {
      this.connectors.set('legiscan', new LegiScanConnector(config.legiScan));
    }
    if (config.openStates.enabled) {
      this.connectors.set('openstates', new OpenStatesConnector(config.openStates));
    }
  }

  /**
   * Check health of all enabled data sources.
   */
  async healthCheck(): Promise<Record<string, { healthy: boolean; message: string }>> {
    const results: Record<string, { healthy: boolean; message: string }> = {};

    const checks = Array.from(this.connectors.entries()).map(async ([name, connector]) => {
      results[name] = await connector.healthCheck();
    });

    await Promise.all(checks);
    return results;
  }

  /**
   * Run a full ingestion cycle — pull updated bills from all sources.
   * This is the main entry point for the ingestion pipeline.
   */
  async ingestUpdates(since?: Date): Promise<IngestionResult[]> {
    const sincDate = since || this.getDefaultSinceDate();
    const results: IngestionResult[] = [];

    // Run all connectors in parallel
    const promises = Array.from(this.connectors.entries()).map(
      async ([name, connector]) => {
        const startTime = Date.now();
        const result: IngestionResult = {
          source: name as DataSource,
          billsProcessed: 0,
          billsCreated: 0,
          billsUpdated: 0,
          commitsCreated: 0,
          errors: [],
          duration: 0,
          timestamp: new Date(),
        };

        try {
          // Fetch updated bills
          const rawBills = await connector.fetchUpdatedBills(sincDate);
          result.billsProcessed = rawBills.length;

          // Process bills with controlled concurrency
          const batches = chunk(rawBills, this.config.concurrency);
          for (const batch of batches) {
            const normalized = await Promise.all(
              batch.map((raw) => this.processBill(raw, result))
            );

            for (const bill of normalized) {
              if (bill) {
                result.commitsCreated += bill.commits.length;
                result.billsCreated++;
                this.state.totalBillsIngested++;
                this.state.totalCommitsCreated += bill.commits.length;
              }
            }
          }

          this.state.lastSyncTime[name] = new Date();
        } catch (error) {
          result.errors.push({
            source: name as DataSource,
            phase: 'fetch',
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
          });
        }

        result.duration = Date.now() - startTime;
        results.push(result);
      }
    );

    await Promise.all(promises);
    return results;
  }

  /**
   * Ingest a specific bill from a specific source.
   * Useful for on-demand lookups and manual imports.
   */
  async ingestBill(
    source: string,
    externalId: string
  ): Promise<NormalizedBill | null> {
    const connector = this.connectors.get(source);
    if (!connector) {
      throw new Error(`Connector not found: ${source}`);
    }

    try {
      const raw = await connector.fetchBill(externalId);

      // Try to fetch full text
      try {
        const text = await connector.fetchBillText(externalId);
        if (text) raw.textContent = text;
      } catch {
        // Text may not be available
      }

      const normalized = normalizeBillToCommits(raw);

      if (this.config.onBillNormalized) {
        await this.config.onBillNormalized(normalized);
      }

      return normalized;
    } catch (error) {
      const err: IngestionError = {
        source: source as DataSource,
        billId: externalId,
        phase: 'fetch',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      };
      this.config.onError?.(err);
      return null;
    }
  }

  /**
   * Search across all enabled sources simultaneously.
   */
  async searchAllSources(params: {
    query: string;
    state?: string;
    limit?: number;
  }): Promise<{ source: string; bills: RawBillRecord[] }[]> {
    const results: { source: string; bills: RawBillRecord[] }[] = [];

    const searches = Array.from(this.connectors.entries()).map(
      async ([name, connector]) => {
        try {
          const result = await connector.searchBills({
            query: params.query,
            state: params.state,
            limit: params.limit || 10,
          });
          results.push({ source: name, bills: result.bills });
        } catch {
          results.push({ source: name, bills: [] });
        }
      }
    );

    await Promise.all(searches);
    return results;
  }

  /**
   * Ingest federal bills with full text enrichment.
   * Uses Congress.gov for structure and GovInfo for full text.
   */
  async ingestFederalBillWithText(
    congressExternalId: string
  ): Promise<NormalizedBill | null> {
    const congressConnector = this.connectors.get('congress.gov') as CongressGovConnector;
    const govInfoConnector = this.connectors.get('govinfo') as GovInfoConnector;

    if (!congressConnector) {
      throw new Error('Congress.gov connector not enabled');
    }

    // Fetch from Congress.gov (rich metadata)
    const raw = await congressConnector.fetchBill(congressExternalId);

    // Enrich with full text from Congress.gov
    try {
      const text = await congressConnector.fetchBillText(congressExternalId);
      if (text) raw.textContent = text;
    } catch {
      // Try GovInfo as fallback for text
      if (govInfoConnector) {
        try {
          // Construct GovInfo package ID from Congress.gov ID
          const [congress, type, number] = congressExternalId.split('/');
          const packageId = `BILLS-${congress}${type}${number}ih`;
          const text = await govInfoConnector.fetchBillText(packageId);
          if (text) raw.textContent = text;
        } catch {
          // Text not available from either source
        }
      }
    }

    return normalizeBillToCommits(raw);
  }

  /**
   * Get current ingestion state.
   */
  getState(): IngestionState {
    return { ...this.state };
  }

  /**
   * Get list of enabled connectors.
   */
  getEnabledSources(): string[] {
    return Array.from(this.connectors.keys());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  private async processBill(
    raw: RawBillRecord,
    result: IngestionResult
  ): Promise<NormalizedBill | null> {
    try {
      // Try to fetch full text if not already present
      if (!raw.textContent) {
        const connector = this.connectors.get(raw.source);
        if (connector) {
          try {
            const text = await connector.fetchBillText(raw.externalId);
            if (text) raw.textContent = text;
          } catch {
            // Text fetch is best-effort
          }
        }
      }

      const normalized = normalizeBillToCommits(raw);

      if (this.config.onBillNormalized) {
        await this.config.onBillNormalized(normalized);
      }

      return normalized;
    } catch (error) {
      const err: IngestionError = {
        source: raw.source as DataSource,
        billId: raw.externalId,
        phase: 'normalize',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      };
      result.errors.push(err);
      this.config.onError?.(err);
      return null;
    }
  }

  private getDefaultSinceDate(): Date {
    // Default to 7 days ago
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  }
}

/** Split an array into chunks */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
