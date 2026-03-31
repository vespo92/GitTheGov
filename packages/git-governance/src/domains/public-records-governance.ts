// ============================================================================
// Public Records Governance Domain
// ============================================================================
// Git-style version control for public records: FOIA requests and responses,
// government meetings, permits, licenses, and other official records.
// Ensures transparency and accountability for all government operations.

import {
  GovernmentDomain,
  GovernmentRecord,
  JurisdictionLevel,
} from '@constitutional-shrinkage/government-api-framework';
import {
  GovernanceCommit,
  recordToCommits,
} from '@constitutional-shrinkage/government-api-framework';
import {
  GovernanceRepository,
  GovernanceBranch,
  BranchPurpose,
} from '../types';

// ---------------------------------------------------------------------------
// Public Records-Specific Types
// ---------------------------------------------------------------------------

export enum PublicRecordType {
  /** FOIA request and response */
  FOIA = 'FOIA',
  /** Government meeting (agenda, minutes, recording) */
  MEETING = 'MEETING',
  /** Permit or license */
  PERMIT = 'PERMIT',
  /** Inspector general report */
  IG_REPORT = 'IG_REPORT',
  /** GAO report */
  GAO_REPORT = 'GAO_REPORT',
  /** CBO score/analysis */
  CBO_SCORE = 'CBO_SCORE',
  /** Government contract */
  CONTRACT = 'CONTRACT',
  /** Official correspondence */
  CORRESPONDENCE = 'CORRESPONDENCE',
  /** Financial disclosure */
  FINANCIAL_DISCLOSURE = 'FINANCIAL_DISCLOSURE',
  /** Lobbying registration / activity */
  LOBBYING = 'LOBBYING',
  /** Campaign finance filing */
  CAMPAIGN_FINANCE = 'CAMPAIGN_FINANCE',
  /** Environmental impact statement */
  EIS = 'EIS',
  /** Government data release / dataset */
  DATA_RELEASE = 'DATA_RELEASE',
}

export interface FOIARequest {
  /** Tracking number */
  trackingNumber: string;
  /** Requesting party (may be redacted) */
  requester?: string;
  /** Agency the request was made to */
  agency: string;
  /** Description of records requested */
  description: string;
  /** Current status */
  status: FOIAStatus;
  /** Date submitted */
  dateSubmitted: string;
  /** Date of final response */
  dateResponded?: string;
  /** Processing time in business days */
  processingDays?: number;
  /** Disposition of the request */
  disposition?: FOIADisposition;
  /** Exemptions cited (FOIA exemptions 1-9) */
  exemptionsCited: number[];
  /** Number of pages released */
  pagesReleased?: number;
  /** Number of pages withheld */
  pagesWithheld?: number;
  /** Fee charged */
  fee?: number;
  /** Appeal filed? */
  appealed: boolean;
}

export enum FOIAStatus {
  SUBMITTED = 'SUBMITTED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  PROCESSING = 'PROCESSING',
  READY_FOR_RELEASE = 'READY_FOR_RELEASE',
  COMPLETED = 'COMPLETED',
  APPEALED = 'APPEALED',
  LITIGATION = 'LITIGATION',
  CLOSED = 'CLOSED',
}

export enum FOIADisposition {
  FULL_GRANT = 'FULL_GRANT',
  PARTIAL_GRANT = 'PARTIAL_GRANT',
  FULL_DENIAL = 'FULL_DENIAL',
  NO_RECORDS = 'NO_RECORDS',
  REFERRED = 'REFERRED',
  WITHDRAWN = 'WITHDRAWN',
  FEE_RELATED = 'FEE_RELATED',
}

export interface GovernmentMeeting {
  /** Meeting identifier */
  meetingId: string;
  /** Body conducting the meeting */
  body: string;
  /** Meeting type */
  meetingType: 'regular' | 'special' | 'emergency' | 'hearing' | 'work_session';
  /** Scheduled date/time */
  scheduledAt: string;
  /** Actual start time */
  startedAt?: string;
  /** End time */
  endedAt?: string;
  /** Location (physical or virtual) */
  location: string;
  /** Whether the meeting is open to the public */
  publicAccess: boolean;
  /** Agenda items */
  agenda: AgendaItem[];
  /** Minutes (after meeting) */
  minutes?: string;
  /** Recording URL */
  recordingUrl?: string;
  /** Attendees */
  attendees?: Array<{ name: string; role: string; present: boolean }>;
  /** Votes taken during the meeting */
  votes?: Array<{
    item: string;
    result: string;
    yea: number;
    nay: number;
    abstain: number;
  }>;
}

export interface AgendaItem {
  order: number;
  title: string;
  description?: string;
  type: 'action' | 'discussion' | 'consent' | 'presentation' | 'public_hearing';
  disposition?: string;
  documents?: Array<{ title: string; url: string }>;
}

// ---------------------------------------------------------------------------
// Public Records Governance Operations
// ---------------------------------------------------------------------------

/**
 * Create a governance repository for a jurisdiction's public records.
 */
export function createPublicRecordsRepository(
  jurisdictionCode: string,
  jurisdictionName: string,
  jurisdictionLevel: JurisdictionLevel,
  recordType: PublicRecordType,
): GovernanceRepository {
  const id = `records-${jurisdictionCode.toLowerCase()}-${recordType.toLowerCase()}`;

  const branches: GovernanceBranch[] = [
    {
      name: 'published',
      purpose: BranchPurpose.CURRENT_LAW,
      headCommitHash: '',
      protected: true,
      createdAt: new Date().toISOString(),
      description: 'Published and verified public records',
    },
    {
      name: 'pending-release',
      purpose: BranchPurpose.DRAFT,
      headCommitHash: '',
      protected: false,
      createdAt: new Date().toISOString(),
      description: 'Records pending release or review',
    },
    {
      name: 'archive',
      purpose: BranchPurpose.ARCHIVE,
      headCommitHash: '',
      protected: true,
      createdAt: new Date().toISOString(),
      description: 'Historical records archive',
    },
  ];

  return {
    id,
    name: `${jurisdictionName} ${recordType} Records`,
    domain: GovernmentDomain.PUBLIC_RECORDS,
    jurisdiction: {
      level: jurisdictionLevel,
      code: jurisdictionCode,
      name: jurisdictionName,
    },
    branches,
    defaultBranch: 'published',
    metadata: {
      recordCount: 0,
      commitCount: 0,
      contributorCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      providerSlugs: ['regulations-gov', 'court-listener'],
      tags: [recordType.toLowerCase(), jurisdictionCode.toLowerCase()],
    },
  };
}

/**
 * Analyze FOIA transparency for an agency.
 */
export function analyzeFOIATransparency(
  requests: FOIARequest[],
): FOIATransparencyReport {
  if (requests.length === 0) {
    return {
      totalRequests: 0,
      averageProcessingDays: 0,
      fullGrantRate: 0,
      partialGrantRate: 0,
      denialRate: 0,
      appealRate: 0,
      exemptionBreakdown: {},
      transparencyScore: 0,
      grade: 'F',
    };
  }

  const completed = requests.filter((r) => r.disposition);
  const fullGrants = completed.filter(
    (r) => r.disposition === FOIADisposition.FULL_GRANT,
  );
  const partialGrants = completed.filter(
    (r) => r.disposition === FOIADisposition.PARTIAL_GRANT,
  );
  const denials = completed.filter(
    (r) => r.disposition === FOIADisposition.FULL_DENIAL,
  );
  const appealed = requests.filter((r) => r.appealed);

  const processingDays = completed
    .filter((r) => r.processingDays != null)
    .map((r) => r.processingDays!);
  const avgDays =
    processingDays.length > 0
      ? processingDays.reduce((a, b) => a + b, 0) / processingDays.length
      : 0;

  // Count exemption usage
  const exemptionBreakdown: Record<number, number> = {};
  for (const req of completed) {
    for (const ex of req.exemptionsCited) {
      exemptionBreakdown[ex] = (exemptionBreakdown[ex] ?? 0) + 1;
    }
  }

  const total = completed.length || 1;
  const fullGrantRate = (fullGrants.length / total) * 100;
  const partialGrantRate = (partialGrants.length / total) * 100;
  const denialRate = (denials.length / total) * 100;
  const appealRate = (appealed.length / requests.length) * 100;

  // Transparency score: higher grants = better, faster processing = better
  const grantScore = fullGrantRate * 0.5 + partialGrantRate * 0.3;
  const speedScore = Math.max(0, 100 - avgDays); // Penalty for slow processing
  const transparencyScore = Math.round(grantScore * 0.7 + speedScore * 0.3);

  let grade: string;
  if (transparencyScore >= 90) grade = 'A';
  else if (transparencyScore >= 80) grade = 'B';
  else if (transparencyScore >= 70) grade = 'C';
  else if (transparencyScore >= 60) grade = 'D';
  else grade = 'F';

  return {
    totalRequests: requests.length,
    averageProcessingDays: Math.round(avgDays),
    fullGrantRate: Math.round(fullGrantRate * 10) / 10,
    partialGrantRate: Math.round(partialGrantRate * 10) / 10,
    denialRate: Math.round(denialRate * 10) / 10,
    appealRate: Math.round(appealRate * 10) / 10,
    exemptionBreakdown,
    transparencyScore,
    grade,
  };
}

export interface FOIATransparencyReport {
  totalRequests: number;
  averageProcessingDays: number;
  fullGrantRate: number;
  partialGrantRate: number;
  denialRate: number;
  appealRate: number;
  exemptionBreakdown: Record<number, number>;
  transparencyScore: number;
  grade: string;
}

/**
 * Convert public records into governance commits.
 */
export function publicRecordToCommits(
  record: GovernmentRecord,
): GovernanceCommit[] {
  return recordToCommits(record);
}
