// ============================================================================
// Government API Provider Interfaces
// ============================================================================
// The core plugin contract. Any government data source implements this
// interface to become a first-class data provider in the GitTheGov platform.

import {
  GovernmentDomain,
  Jurisdiction,
  JurisdictionLevel,
  RecordStatus,
  ContentFormat,
} from './domains';

// ---------------------------------------------------------------------------
// Provider Identity & Configuration
// ---------------------------------------------------------------------------

/**
 * Unique identifier for a registered provider.
 */
export interface ProviderId {
  /** Machine-readable slug, e.g., 'congress-gov', 'federal-register' */
  slug: string;
  /** Human-readable name, e.g., 'Congress.gov API' */
  name: string;
  /** Semantic version of the provider adapter */
  version: string;
}

/**
 * Configuration required to initialize a provider.
 */
export interface ProviderConfig {
  /** API key or token (if required) */
  apiKey?: string;
  /** OAuth2 credentials (if required) */
  oauth?: {
    clientId: string;
    clientSecret: string;
    tokenUrl: string;
    scopes?: string[];
  };
  /** Base URL override (useful for staging/test environments) */
  baseUrl?: string;
  /** Max requests per rate limit window */
  rateLimit: number;
  /** Rate limit window in milliseconds */
  rateLimitPeriod: number;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Whether this provider is enabled */
  enabled: boolean;
  /** Provider-specific options (e.g., session IDs, jurisdiction filters) */
  options?: Record<string, unknown>;
}

/**
 * Describes the capabilities of a provider — which domains, jurisdictions,
 * and operations it supports.
 */
export interface ProviderCapabilities {
  /** Which government domains this provider covers */
  domains: GovernmentDomain[];
  /** Which jurisdiction levels this provider covers */
  jurisdictions: JurisdictionLevel[];
  /** Specific jurisdiction codes (e.g., ['US', 'CA', 'NY']) — empty = all */
  jurisdictionCodes: string[];
  /** Whether the provider supports full-text search */
  supportsSearch: boolean;
  /** Whether the provider supports incremental sync (fetch updates since date) */
  supportsIncrementalSync: boolean;
  /** Whether the provider supports webhook/push notifications */
  supportsWebhooks: boolean;
  /** Whether the provider can return full document text */
  supportsFullText: boolean;
  /** Content formats available from this provider */
  contentFormats: ContentFormat[];
  /** Maximum results per search query */
  maxResultsPerQuery: number;
  /** Estimated total records available */
  estimatedRecordCount?: number;
  /** Additional capability flags */
  features: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Unified Government Record
// ---------------------------------------------------------------------------

/**
 * A single government record from any domain — the universal data unit.
 * Every provider normalizes its API responses into this shape.
 */
export interface GovernmentRecord {
  /** Provider-assigned external ID */
  externalId: string;
  /** Which provider this record came from */
  providerSlug: string;
  /** Government domain */
  domain: GovernmentDomain;
  /** Jurisdiction this record belongs to */
  jurisdiction: Jurisdiction;

  // -- Core metadata --
  /** Record title / short description */
  title: string;
  /** Record identifier (e.g., bill number, docket number, case number) */
  identifier: string;
  /** Current lifecycle status */
  status: RecordStatus;
  /** Date the record was created/introduced */
  dateIntroduced: string; // ISO 8601
  /** Date of last update */
  dateUpdated: string;    // ISO 8601
  /** Date the record became effective (if applicable) */
  dateEffective?: string;
  /** Date the record expires/sunsets (if applicable) */
  dateExpires?: string;

  // -- Content --
  /** Summary or abstract */
  summary?: string;
  /** Full text content (may be large) */
  textContent?: string;
  /** Format of textContent */
  textFormat?: ContentFormat;
  /** Available text versions (e.g., introduced, enrolled, engrossed) */
  textVersions?: TextVersion[];

  // -- People & Organizations --
  /** Primary author/sponsor */
  author?: RecordActor;
  /** Co-authors, co-sponsors, signatories */
  coAuthors?: RecordActor[];
  /** People/orgs who acted on this record (votes, approvals, etc.) */
  actors?: RecordActor[];

  // -- Relationships --
  /** Related records from the same or other providers */
  relatedRecords?: RelatedRecord[];
  /** Subject/topic tags */
  subjects?: string[];
  /** Source URLs where this record can be found */
  sourceUrls: string[];

  // -- History --
  /** Chronological action history */
  actions?: RecordAction[];

  // -- Financials (for budgets, procurement, grants) --
  financials?: FinancialData;

  // -- Domain-specific extensions --
  /** Arbitrary domain-specific data the provider wants to pass through */
  extensions?: Record<string, unknown>;
}

/**
 * A specific text version of a record.
 */
export interface TextVersion {
  versionName: string;   // e.g., 'Introduced', 'Engrossed', 'Enrolled'
  versionDate: string;
  format: ContentFormat;
  content?: string;
  url?: string;
}

/**
 * A person or organization that acted on a record.
 */
export interface RecordActor {
  id?: string;
  name: string;
  role: string;          // e.g., 'sponsor', 'judge', 'agency-head'
  party?: string;
  jurisdiction?: string; // e.g., state code
  organization?: string;
  bioguideId?: string;   // Congressional bioguide ID
}

/**
 * A reference to a related record.
 */
export interface RelatedRecord {
  externalId: string;
  providerSlug?: string;
  domain?: GovernmentDomain;
  relationship: string;  // e.g., 'amends', 'supersedes', 'implements', 'companion'
  title?: string;
}

/**
 * A chronological action taken on a record.
 */
export interface RecordAction {
  date: string;
  description: string;
  actionType: string;    // e.g., 'introduced', 'referred-to-committee', 'signed'
  actor?: RecordActor;
  chamber?: string;
  result?: string;
  voteData?: {
    yea: number;
    nay: number;
    abstain: number;
    absent: number;
  };
}

/**
 * Financial data attached to budget/procurement/grant records.
 */
export interface FinancialData {
  /** Total dollar amount */
  amount: number;
  /** Currency code (default USD) */
  currency: string;
  /** Fiscal year */
  fiscalYear?: number;
  /** Budget category / account */
  category?: string;
  /** Funding agency */
  fundingAgency?: string;
  /** Recipient (for grants/contracts) */
  recipient?: string;
  /** Line items */
  lineItems?: FinancialLineItem[];
}

export interface FinancialLineItem {
  description: string;
  amount: number;
  category?: string;
  subcategory?: string;
}

// ---------------------------------------------------------------------------
// Search & Sync Interfaces
// ---------------------------------------------------------------------------

export interface SearchParams {
  query?: string;
  domain?: GovernmentDomain;
  jurisdiction?: string;
  status?: RecordStatus;
  dateFrom?: string;
  dateTo?: string;
  subjects?: string[];
  author?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'relevance' | 'date' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult {
  records: GovernmentRecord[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}

export interface SyncResult {
  records: GovernmentRecord[];
  syncedAt: string;
  newCount: number;
  updatedCount: number;
  errors: SyncError[];
}

export interface SyncError {
  externalId?: string;
  message: string;
  phase: 'fetch' | 'parse' | 'normalize';
  retryable: boolean;
}

// ---------------------------------------------------------------------------
// Health & Diagnostics
// ---------------------------------------------------------------------------

export interface ProviderHealth {
  healthy: boolean;
  latencyMs: number;
  message: string;
  lastSuccessfulSync?: string;
  errorRate?: number;
  remainingQuota?: number;
}

// ---------------------------------------------------------------------------
// The Provider Interface — the core plugin contract
// ---------------------------------------------------------------------------

/**
 * Every government data provider implements this interface.
 * This is the plug-and-play contract that makes any government API
 * a first-class citizen in the GitTheGov platform.
 */
export interface GovernmentApiProvider {
  /** Provider identity */
  readonly id: ProviderId;

  /** What this provider can do */
  readonly capabilities: ProviderCapabilities;

  /**
   * Initialize the provider with configuration.
   * Called once when the provider is registered.
   */
  initialize(config: ProviderConfig): Promise<void>;

  /**
   * Fetch a single record by its external ID.
   */
  fetchRecord(externalId: string): Promise<GovernmentRecord>;

  /**
   * Fetch the full text of a record (if separate from metadata).
   */
  fetchRecordText(externalId: string): Promise<string>;

  /**
   * Search for records matching the given parameters.
   */
  search(params: SearchParams): Promise<SearchResult>;

  /**
   * Fetch all records updated since the given date (incremental sync).
   * Returns empty array if provider doesn't support incremental sync.
   */
  fetchUpdatedSince(since: Date): Promise<GovernmentRecord[]>;

  /**
   * Check if the provider is healthy and responsive.
   */
  healthCheck(): Promise<ProviderHealth>;

  /**
   * Gracefully shut down the provider (close connections, flush caches).
   */
  shutdown(): Promise<void>;
}
