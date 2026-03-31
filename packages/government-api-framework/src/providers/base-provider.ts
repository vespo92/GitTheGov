// ============================================================================
// Base Government API Provider
// ============================================================================
// Abstract base class that handles common concerns: rate limiting, retries,
// HTTP requests, error handling. Concrete providers only implement the
// domain-specific logic.

import {
  GovernmentApiProvider,
  ProviderId,
  ProviderConfig,
  ProviderCapabilities,
  GovernmentRecord,
  SearchParams,
  SearchResult,
  ProviderHealth,
} from '../types';

/**
 * Abstract base class for all government API providers.
 *
 * Handles:
 * - Rate limiting with sliding window
 * - Automatic retries with exponential backoff
 * - HTTP request abstraction
 * - Error classification (retryable vs fatal)
 *
 * Subclasses implement the abstract methods to talk to their specific API.
 */
export abstract class BaseGovernmentProvider implements GovernmentApiProvider {
  abstract readonly id: ProviderId;
  abstract readonly capabilities: ProviderCapabilities;

  protected config!: ProviderConfig;
  private requestCount = 0;
  private windowStart = Date.now();
  private initialized = false;

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    this.initialized = true;
    await this.onInitialize();
  }

  /** Hook for subclasses to perform custom initialization */
  protected async onInitialize(): Promise<void> {
    // Override in subclass if needed
  }

  // -- Abstract methods that every provider must implement --

  abstract fetchRecord(externalId: string): Promise<GovernmentRecord>;
  abstract fetchRecordText(externalId: string): Promise<string>;
  abstract search(params: SearchParams): Promise<SearchResult>;
  abstract fetchUpdatedSince(since: Date): Promise<GovernmentRecord[]>;
  abstract healthCheck(): Promise<ProviderHealth>;

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  // -- Shared infrastructure --

  /**
   * Make an HTTP request with rate limiting and retries.
   */
  protected async request<T>(
    url: string,
    options: RequestInit = {},
  ): Promise<T> {
    this.ensureInitialized();
    await this.enforceRateLimit();

    const fullUrl = this.config.baseUrl
      ? `${this.config.baseUrl}${url}`
      : url;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'GitTheGov/1.0 (Constitutional Shrinkage Platform)',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.config.apiKey) {
      headers['X-Api-Key'] = this.config.apiKey;
    }

    const maxRetries = 4;
    const backoffMs = [0, 2000, 4000, 8000];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await this.sleep(backoffMs[attempt]);
        }

        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          this.config.timeout,
        );

        const response = await fetch(fullUrl, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          return (await response.json()) as T;
        }

        // Non-retryable HTTP errors
        if ([401, 403, 404, 422].includes(response.status)) {
          throw new ProviderError(
            `HTTP ${response.status}: ${response.statusText}`,
            this.id.slug,
            false,
          );
        }

        // Rate limited — respect Retry-After header
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
          await this.sleep(waitMs);
          continue;
        }

        // Server errors — retryable
        if (response.status >= 500) {
          if (attempt === maxRetries - 1) {
            throw new ProviderError(
              `HTTP ${response.status} after ${maxRetries} attempts`,
              this.id.slug,
              false,
            );
          }
          continue;
        }

        throw new ProviderError(
          `Unexpected HTTP ${response.status}`,
          this.id.slug,
          false,
        );
      } catch (error) {
        if (error instanceof ProviderError) throw error;

        // Network errors are retryable
        if (attempt === maxRetries - 1) {
          throw new ProviderError(
            `Network error after ${maxRetries} attempts: ${(error as Error).message}`,
            this.id.slug,
            false,
          );
        }
      }
    }

    throw new ProviderError(
      'Request failed after all retries',
      this.id.slug,
      false,
    );
  }

  /**
   * Fetch text content (HTML/XML) from a URL.
   */
  protected async fetchTextContent(url: string): Promise<string> {
    await this.enforceRateLimit();

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeout,
    );

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'GitTheGov/1.0 (Constitutional Shrinkage Platform)',
        ...(this.config.apiKey ? { 'X-Api-Key': this.config.apiKey } : {}),
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new ProviderError(
        `Failed to fetch text: HTTP ${response.status}`,
        this.id.slug,
        response.status >= 500,
      );
    }

    return response.text();
  }

  /**
   * Sliding window rate limiter.
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.windowStart;

    if (elapsed >= this.config.rateLimitPeriod) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    if (this.requestCount >= this.config.rateLimit) {
      const waitTime = this.config.rateLimitPeriod - elapsed;
      await this.sleep(waitTime);
      this.requestCount = 0;
      this.windowStart = Date.now();
    }

    this.requestCount++;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new ProviderError(
        `Provider ${this.id.slug} not initialized. Call initialize() first.`,
        this.id.slug,
        false,
      );
    }
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Structured error from a government API provider.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly providerSlug: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
  ) {
    super(`[${providerSlug}] ${message}`);
    this.name = 'ProviderError';
  }
}
