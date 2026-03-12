/**
 * Base Connector
 *
 * Shared infrastructure for all data source connectors:
 * - Rate limiting
 * - Retry with exponential backoff
 * - Logging
 * - Error handling
 */

import type { ConnectorConfig, DataSource, RawBillRecord } from '../types/index.js';

export interface FetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  params?: Record<string, string>;
}

export abstract class BaseConnector {
  protected config: ConnectorConfig;
  protected source: DataSource;
  private requestCount = 0;
  private windowStart = Date.now();

  constructor(source: DataSource, config: ConnectorConfig) {
    this.source = source;
    this.config = config;
  }

  /** Fetch a single bill by its external identifier */
  abstract fetchBill(externalId: string): Promise<RawBillRecord>;

  /** Fetch all text versions for a bill */
  abstract fetchBillText(externalId: string): Promise<string>;

  /** Search for bills matching criteria */
  abstract searchBills(params: {
    query?: string;
    session?: string;
    state?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    offset?: number;
    limit?: number;
  }): Promise<{ bills: RawBillRecord[]; total: number; hasMore: boolean }>;

  /** Fetch recent updates (bills changed since a given date) */
  abstract fetchUpdatedBills(since: Date): Promise<RawBillRecord[]>;

  /** Test connectivity to the data source */
  abstract healthCheck(): Promise<{ healthy: boolean; message: string }>;

  /**
   * Make a rate-limited HTTP request with retry.
   */
  protected async request<T>(url: string, options: FetchOptions = {}): Promise<T> {
    await this.enforceRateLimit();

    const { params, ...fetchOpts } = options;

    // Append query params
    let fullUrl = url;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') {
          searchParams.set(key, value);
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        fullUrl += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    let lastError: Error | null = null;

    // Retry with exponential backoff (4 attempts: 0s, 2s, 4s, 8s)
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
      }

      try {
        const response = await fetch(fullUrl, {
          method: fetchOpts.method || 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'ConstitutionalShrinkage/1.0 (legislation-tracking)',
            ...fetchOpts.headers,
          },
          body: fetchOpts.body,
          signal: AbortSignal.timeout(this.config.timeout),
        });

        if (response.status === 429) {
          // Rate limited — back off longer
          const retryAfter = parseInt(response.headers.get('Retry-After') || '10', 10);
          await sleep(retryAfter * 1000);
          continue;
        }

        if (!response.ok) {
          throw new Error(
            `${this.source} API error: ${response.status} ${response.statusText} for ${fullUrl}`
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on non-retryable errors
        if (
          lastError.message.includes('404') ||
          lastError.message.includes('403') ||
          lastError.message.includes('401')
        ) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error(`${this.source}: request failed after 4 attempts`);
  }

  /**
   * Fetch raw text content (HTML/XML) from a URL.
   */
  protected async fetchTextContent(url: string): Promise<string> {
    await this.enforceRateLimit();

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ConstitutionalShrinkage/1.0 (legislation-tracking)',
        Accept: 'text/html, application/xml, text/plain',
      },
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch text from ${url}: ${response.status}`);
    }

    return response.text();
  }

  /**
   * Enforce rate limits using a sliding window.
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.windowStart;

    if (elapsed >= this.config.rateLimitPeriod) {
      // Reset the window
      this.requestCount = 0;
      this.windowStart = now;
    }

    if (this.requestCount >= this.config.rateLimit) {
      // Wait until the window resets
      const waitTime = this.config.rateLimitPeriod - elapsed;
      await sleep(waitTime);
      this.requestCount = 0;
      this.windowStart = Date.now();
    }

    this.requestCount++;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
