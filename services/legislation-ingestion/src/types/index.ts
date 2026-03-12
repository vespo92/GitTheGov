/**
 * Shared types for legislation data ingestion.
 *
 * These types represent the raw data as it comes from external APIs,
 * before normalization into our LegislationCommit format.
 */

/** Which external data source a record came from */
export enum DataSource {
  CONGRESS_GOV = 'congress.gov',
  GOVINFO = 'govinfo',
  LEGISCAN = 'legiscan',
  OPENSTATES = 'openstates',
}

/** Jurisdiction level */
export enum Jurisdiction {
  FEDERAL = 'federal',
  STATE = 'state',
  LOCAL = 'local',
}

/** A raw bill record before normalization */
export interface RawBillRecord {
  /** Source system */
  source: DataSource;
  /** External ID in the source system */
  externalId: string;
  /** Bill number (e.g., "HR 1234", "SB 567") */
  billNumber: string;
  /** Bill title */
  title: string;
  /** Short title if available */
  shortTitle?: string;
  /** Full bill text (latest version) */
  textContent?: string;
  /** Text format (html, xml, plain) */
  textFormat?: string;
  /** All available text versions */
  textVersions: RawTextVersion[];
  /** Bill type (bill, resolution, joint_resolution, etc.) */
  billType: string;
  /** Current status */
  status: string;
  /** Jurisdiction */
  jurisdiction: Jurisdiction;
  /** State abbreviation (if state-level) */
  stateCode?: string;
  /** Congressional session or state session */
  session: string;
  /** Chamber (house, senate, joint) */
  chamber?: string;
  /** Sponsors */
  sponsors: RawSponsor[];
  /** Actions/history */
  actions: RawAction[];
  /** Amendments */
  amendments: RawAmendment[];
  /** Vote records */
  votes: RawVoteRecord[];
  /** Subjects/tags */
  subjects: string[];
  /** Related bill IDs */
  relatedBills: string[];
  /** Source URLs */
  sourceUrls: string[];
  /** Date introduced */
  introducedDate: string;
  /** Last action date */
  lastActionDate: string;
  /** Raw API response for reference */
  rawResponse?: unknown;
}

/** A version of a bill's text */
export interface RawTextVersion {
  /** Version identifier (e.g., "ih" = introduced in house) */
  versionCode: string;
  /** Human-readable version name */
  versionName: string;
  /** Date this version was published */
  date: string;
  /** URL to the full text */
  url: string;
  /** The actual text content (fetched separately) */
  content?: string;
  /** Format of the content */
  format: 'xml' | 'html' | 'pdf' | 'plain';
}

/** A bill sponsor or cosponsor */
export interface RawSponsor {
  /** Name as provided by source */
  name: string;
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** External ID in the source system */
  externalId?: string;
  /** Bioguide ID (federal legislators) */
  bioguideId?: string;
  /** Whether this is the primary sponsor */
  isPrimary: boolean;
  /** Role (sponsor, cosponsor, author, coauthor) */
  role: string;
  /** Party */
  party?: string;
  /** State */
  state?: string;
  /** District */
  district?: string;
  /** Date they became a sponsor */
  sponsoredDate?: string;
  /** Date they withdrew (if applicable) */
  withdrawnDate?: string;
}

/** A legislative action */
export interface RawAction {
  /** Date of the action */
  date: string;
  /** Description of the action */
  description: string;
  /** Action type/classification */
  type?: string;
  /** Chamber where action occurred */
  chamber?: string;
  /** Who performed the action (committee name, etc.) */
  actor?: string;
  /** Ordering */
  order?: number;
}

/** A bill amendment */
export interface RawAmendment {
  /** External ID */
  externalId: string;
  /** Amendment number */
  number?: string;
  /** Title or description */
  title: string;
  /** Full text of the amendment */
  textContent?: string;
  /** Who proposed it */
  sponsor?: RawSponsor;
  /** Current status */
  status: string;
  /** Date proposed */
  proposedDate: string;
  /** Chamber */
  chamber?: string;
  /** URL to amendment details */
  url?: string;
}

/** A vote record */
export interface RawVoteRecord {
  /** External ID */
  externalId: string;
  /** Date of the vote */
  date: string;
  /** Chamber */
  chamber?: string;
  /** Description */
  description: string;
  /** Result (passed, failed, etc.) */
  result: string;
  /** Vote counts */
  yea: number;
  nay: number;
  abstain: number;
  absent: number;
  /** Individual votes */
  individualVotes?: RawIndividualVote[];
}

/** An individual legislator's vote */
export interface RawIndividualVote {
  /** Legislator name */
  name: string;
  /** Legislator external ID */
  externalId?: string;
  /** How they voted */
  vote: 'yea' | 'nay' | 'abstain' | 'absent' | 'not_voting';
  /** Party */
  party?: string;
  /** State */
  state?: string;
}

/** Configuration for a data source connector */
export interface ConnectorConfig {
  /** API key */
  apiKey: string;
  /** Base URL override */
  baseUrl?: string;
  /** Rate limit (requests per period) */
  rateLimit: number;
  /** Rate limit period in ms */
  rateLimitPeriod: number;
  /** Request timeout in ms */
  timeout: number;
  /** Whether this connector is enabled */
  enabled: boolean;
}

/** Result of an ingestion run */
export interface IngestionResult {
  source: DataSource;
  billsProcessed: number;
  billsCreated: number;
  billsUpdated: number;
  commitsCreated: number;
  errors: IngestionError[];
  duration: number;
  timestamp: Date;
}

/** An error during ingestion */
export interface IngestionError {
  source: DataSource;
  billId?: string;
  phase: 'fetch' | 'parse' | 'normalize' | 'store';
  message: string;
  details?: unknown;
  timestamp: Date;
}
