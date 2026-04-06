// ============================================================================
// Provider Registry
// ============================================================================
// Central registry for all government API providers. Handles discovery,
// lifecycle management, health monitoring, and domain-based routing.

import {
  GovernmentApiProvider,
  GovernmentDomain,
  GovernmentRecord,
  JurisdictionLevel,
  ProviderConfig,
  ProviderHealth,
  SearchParams,
  SearchResult,
} from '../types';

/**
 * Event types emitted by the registry.
 */
export type RegistryEventType =
  | 'provider:registered'
  | 'provider:initialized'
  | 'provider:healthy'
  | 'provider:unhealthy'
  | 'provider:removed'
  | 'sync:started'
  | 'sync:completed'
  | 'sync:error';

export interface RegistryEvent {
  type: RegistryEventType;
  providerSlug: string;
  timestamp: Date;
  data?: unknown;
}

export type RegistryEventHandler = (event: RegistryEvent) => void;

/**
 * Internal state tracked per provider.
 */
interface ProviderEntry {
  provider: GovernmentApiProvider;
  config: ProviderConfig;
  health: ProviderHealth | null;
  lastHealthCheck: Date | null;
  lastSync: Date | null;
  errorCount: number;
  recordCount: number;
}

/**
 * The Provider Registry — the central hub that makes GitTheGov plug-and-play.
 *
 * Register any GovernmentApiProvider and the registry handles:
 * - Initialization and lifecycle
 * - Domain-based routing (ask for BUDGET records, get them from the right provider)
 * - Jurisdiction-based routing
 * - Federated search across providers
 * - Health monitoring
 * - Graceful degradation when providers are down
 */
export class ProviderRegistry {
  private providers = new Map<string, ProviderEntry>();
  private eventHandlers = new Map<RegistryEventType, Set<RegistryEventHandler>>();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Register a new government API provider.
   */
  async register(
    provider: GovernmentApiProvider,
    config: ProviderConfig,
  ): Promise<void> {
    const slug = provider.id.slug;

    if (this.providers.has(slug)) {
      throw new Error(`Provider "${slug}" is already registered`);
    }

    await provider.initialize(config);

    this.providers.set(slug, {
      provider,
      config,
      health: null,
      lastHealthCheck: null,
      lastSync: null,
      errorCount: 0,
      recordCount: 0,
    });

    this.emit({
      type: 'provider:registered',
      providerSlug: slug,
      timestamp: new Date(),
    });

    // Run initial health check
    await this.checkHealth(slug);
  }

  /**
   * Remove and shut down a provider.
   */
  async unregister(slug: string): Promise<void> {
    const entry = this.providers.get(slug);
    if (!entry) return;

    await entry.provider.shutdown();
    this.providers.delete(slug);

    this.emit({
      type: 'provider:removed',
      providerSlug: slug,
      timestamp: new Date(),
    });
  }

  /**
   * Get a specific provider by slug.
   */
  getProvider(slug: string): GovernmentApiProvider | undefined {
    return this.providers.get(slug)?.provider;
  }

  /**
   * List all registered providers.
   */
  listProviders(): Array<{
    slug: string;
    name: string;
    version: string;
    domains: GovernmentDomain[];
    healthy: boolean;
    enabled: boolean;
  }> {
    return Array.from(this.providers.entries()).map(([slug, entry]) => ({
      slug,
      name: entry.provider.id.name,
      version: entry.provider.id.version,
      domains: entry.provider.capabilities.domains,
      healthy: entry.health?.healthy ?? false,
      enabled: entry.config.enabled,
    }));
  }

  /**
   * Find all providers that serve a given domain.
   */
  getProvidersForDomain(domain: GovernmentDomain): GovernmentApiProvider[] {
    return Array.from(this.providers.values())
      .filter(
        (entry) =>
          entry.config.enabled &&
          entry.provider.capabilities.domains.includes(domain) &&
          (entry.health?.healthy ?? true),
      )
      .map((entry) => entry.provider);
  }

  /**
   * Find all providers that serve a given jurisdiction level.
   */
  getProvidersForJurisdiction(
    level: JurisdictionLevel,
    code?: string,
  ): GovernmentApiProvider[] {
    return Array.from(this.providers.values())
      .filter((entry) => {
        if (!entry.config.enabled) return false;
        const caps = entry.provider.capabilities;
        if (!caps.jurisdictions.includes(level)) return false;
        if (
          code &&
          caps.jurisdictionCodes.length > 0 &&
          !caps.jurisdictionCodes.includes(code)
        ) {
          return false;
        }
        return entry.health?.healthy ?? true;
      })
      .map((entry) => entry.provider);
  }

  /**
   * Federated search across all matching providers.
   * Merges results from multiple providers that match the search criteria.
   */
  async searchAll(params: SearchParams): Promise<{
    results: SearchResult;
    providerResults: Map<string, SearchResult>;
  }> {
    // Find providers that match the search domain/jurisdiction
    let candidates = Array.from(this.providers.values()).filter(
      (e) => e.config.enabled && (e.health?.healthy ?? true),
    );

    if (params.domain) {
      candidates = candidates.filter((e) =>
        e.provider.capabilities.domains.includes(params.domain!),
      );
    }

    // Search all matching providers in parallel
    const providerResults = new Map<string, SearchResult>();
    const allRecords: GovernmentRecord[] = [];
    let totalCount = 0;

    const searchPromises = candidates.map(async (entry) => {
      try {
        const result = await entry.provider.search(params);
        providerResults.set(entry.provider.id.slug, result);
        allRecords.push(...result.records);
        totalCount += result.total;
      } catch {
        entry.errorCount++;
      }
    });

    await Promise.all(searchPromises);

    // Sort merged results by date (most recent first)
    allRecords.sort(
      (a, b) =>
        new Date(b.dateUpdated).getTime() - new Date(a.dateUpdated).getTime(),
    );

    // Apply limit
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;
    const paged = allRecords.slice(offset, offset + limit);

    return {
      results: {
        records: paged,
        total: totalCount,
        hasMore: offset + limit < allRecords.length,
        nextOffset: offset + limit < allRecords.length ? offset + limit : undefined,
      },
      providerResults,
    };
  }

  /**
   * Fetch a specific record, routing to the correct provider.
   */
  async fetchRecord(
    providerSlug: string,
    externalId: string,
  ): Promise<GovernmentRecord> {
    const entry = this.providers.get(providerSlug);
    if (!entry) {
      throw new Error(`Provider "${providerSlug}" not found`);
    }
    return entry.provider.fetchRecord(externalId);
  }

  /**
   * Sync all enabled providers for updates since a given date.
   */
  async syncAll(since?: Date): Promise<{
    totalNew: number;
    totalUpdated: number;
    byProvider: Map<string, { records: GovernmentRecord[]; errors: string[] }>;
  }> {
    const syncSince = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h
    const byProvider = new Map<string, { records: GovernmentRecord[]; errors: string[] }>();
    let totalNew = 0;
    let totalUpdated = 0;

    const syncPromises = Array.from(this.providers.entries())
      .filter(
        ([, entry]) =>
          entry.config.enabled &&
          entry.provider.capabilities.supportsIncrementalSync,
      )
      .map(async ([slug, entry]) => {
        this.emit({
          type: 'sync:started',
          providerSlug: slug,
          timestamp: new Date(),
        });

        try {
          const records = await entry.provider.fetchUpdatedSince(syncSince);
          entry.lastSync = new Date();
          entry.recordCount += records.length;
          totalNew += records.length; // Simplified — real impl would diff

          byProvider.set(slug, { records, errors: [] });

          this.emit({
            type: 'sync:completed',
            providerSlug: slug,
            timestamp: new Date(),
            data: { count: records.length },
          });
        } catch (error) {
          entry.errorCount++;
          byProvider.set(slug, {
            records: [],
            errors: [(error as Error).message],
          });

          this.emit({
            type: 'sync:error',
            providerSlug: slug,
            timestamp: new Date(),
            data: { error: (error as Error).message },
          });
        }
      });

    await Promise.all(syncPromises);
    return { totalNew, totalUpdated, byProvider };
  }

  // ---------------------------------------------------------------------------
  // Health Monitoring
  // ---------------------------------------------------------------------------

  /**
   * Check health of a specific provider.
   */
  async checkHealth(slug: string): Promise<ProviderHealth> {
    const entry = this.providers.get(slug);
    if (!entry) throw new Error(`Provider "${slug}" not found`);

    const health = await entry.provider.healthCheck();
    entry.health = health;
    entry.lastHealthCheck = new Date();

    this.emit({
      type: health.healthy ? 'provider:healthy' : 'provider:unhealthy',
      providerSlug: slug,
      timestamp: new Date(),
      data: health,
    });

    return health;
  }

  /**
   * Check health of all registered providers.
   */
  async checkAllHealth(): Promise<Map<string, ProviderHealth>> {
    const results = new Map<string, ProviderHealth>();

    await Promise.all(
      Array.from(this.providers.keys()).map(async (slug) => {
        try {
          const health = await this.checkHealth(slug);
          results.set(slug, health);
        } catch {
          results.set(slug, {
            healthy: false,
            latencyMs: -1,
            message: 'Health check failed',
          });
        }
      }),
    );

    return results;
  }

  /**
   * Start periodic health monitoring.
   */
  startHealthMonitoring(intervalMs = 60000): void {
    this.stopHealthMonitoring();
    this.healthCheckInterval = setInterval(() => {
      this.checkAllHealth();
    }, intervalMs);
  }

  /**
   * Stop periodic health monitoring.
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Event System
  // ---------------------------------------------------------------------------

  on(event: RegistryEventType, handler: RegistryEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: RegistryEventType, handler: RegistryEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private emit(event: RegistryEvent): void {
    this.eventHandlers.get(event.type)?.forEach((handler) => handler(event));
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Gracefully shut down all providers and stop monitoring.
   */
  async shutdown(): Promise<void> {
    this.stopHealthMonitoring();
    await Promise.all(
      Array.from(this.providers.values()).map((entry) =>
        entry.provider.shutdown(),
      ),
    );
    this.providers.clear();
    this.eventHandlers.clear();
  }
}
