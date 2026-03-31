// ============================================================================
// Government Data Domains
// ============================================================================
// Every type of government data that can be tracked, versioned, and governed
// through Git-style version control.

/**
 * The core domains of government that can be plugged into GitTheGov.
 * Each domain maps to a distinct category of government activity.
 */
export enum GovernmentDomain {
  /** Bills, laws, statutes, ordinances */
  LEGISLATION = 'LEGISLATION',
  /** Executive orders, presidential memoranda, proclamations */
  EXECUTIVE_ORDERS = 'EXECUTIVE_ORDERS',
  /** Federal/state/local budgets, appropriations, spending */
  BUDGET = 'BUDGET',
  /** Administrative rules, proposed rules, final rules */
  REGULATIONS = 'REGULATIONS',
  /** Court opinions, orders, dockets */
  COURT_DECISIONS = 'COURT_DECISIONS',
  /** Government contracts, grants, awards */
  PROCUREMENT = 'PROCUREMENT',
  /** Elected and appointed officials, staff */
  PERSONNEL = 'PERSONNEL',
  /** Public meetings, agendas, minutes */
  MEETINGS = 'MEETINGS',
  /** Permits, licenses, certifications */
  PERMITS = 'PERMITS',
  /** Elections, referenda, ballot measures */
  ELECTIONS = 'ELECTIONS',
  /** Treaties, international agreements */
  TREATIES = 'TREATIES',
  /** FOIA responses, public records */
  PUBLIC_RECORDS = 'PUBLIC_RECORDS',
  /** Government-owned real estate, vehicles, equipment */
  ASSETS = 'ASSETS',
  /** Environmental assessments, impact statements */
  ENVIRONMENTAL = 'ENVIRONMENTAL',
  /** Audits, inspector general reports, GAO reports */
  AUDITS = 'AUDITS',
}

/**
 * Jurisdiction levels for government data.
 */
export enum JurisdictionLevel {
  FEDERAL = 'FEDERAL',
  STATE = 'STATE',
  COUNTY = 'COUNTY',
  MUNICIPAL = 'MUNICIPAL',
  TOWNSHIP = 'TOWNSHIP',
  TRIBAL = 'TRIBAL',
  TERRITORY = 'TERRITORY',
  INTERNATIONAL = 'INTERNATIONAL',
}

/**
 * A specific jurisdiction instance (e.g., "State of California", "City of Austin").
 */
export interface Jurisdiction {
  level: JurisdictionLevel;
  code: string;        // e.g., 'US', 'CA', 'TX-AUSTIN'
  name: string;        // e.g., 'United States', 'California', 'City of Austin'
  parentCode?: string; // e.g., 'US' for states, 'CA' for CA counties
  fipsCode?: string;   // Federal Information Processing Standards code
}

/**
 * Lifecycle status of a government record.
 */
export enum RecordStatus {
  DRAFT = 'DRAFT',
  PROPOSED = 'PROPOSED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  PUBLIC_COMMENT = 'PUBLIC_COMMENT',
  APPROVED = 'APPROVED',
  ENACTED = 'ENACTED',
  ACTIVE = 'ACTIVE',
  AMENDED = 'AMENDED',
  SUSPENDED = 'SUSPENDED',
  REPEALED = 'REPEALED',
  EXPIRED = 'EXPIRED',
  SUPERSEDED = 'SUPERSEDED',
  ARCHIVED = 'ARCHIVED',
  REJECTED = 'REJECTED',
  VETOED = 'VETOED',
  WITHDRAWN = 'WITHDRAWN',
}

/**
 * Data format of source content.
 */
export enum ContentFormat {
  PLAIN_TEXT = 'PLAIN_TEXT',
  HTML = 'HTML',
  XML = 'XML',
  JSON = 'JSON',
  PDF = 'PDF',
  MARKDOWN = 'MARKDOWN',
  RTF = 'RTF',
}
