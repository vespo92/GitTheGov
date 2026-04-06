// ============================================================================
// Government Record → Git Commit Adapter
// ============================================================================
// Converts any GovernmentRecord into a chain of Git-style commits,
// extending the legislation-specific normalization to ALL government domains.
// This is the bridge between raw API data and Git-based governance.

import { createHash } from 'crypto';
import {
  GovernmentRecord,
  GovernmentDomain,
  RecordAction,
  RecordStatus,
} from '../types';

// ---------------------------------------------------------------------------
// Git-Style Commit Types (domain-agnostic)
// ---------------------------------------------------------------------------

/**
 * Change types across all government domains.
 */
export enum GovernanceChangeType {
  // Universal
  CREATE = 'CREATE',
  AMEND = 'AMEND',
  UPDATE = 'UPDATE',
  SUPERSEDE = 'SUPERSEDE',
  REPEAL = 'REPEAL',
  ARCHIVE = 'ARCHIVE',

  // Legislative
  INTRODUCE = 'INTRODUCE',
  COMMITTEE_REFERRAL = 'COMMITTEE_REFERRAL',
  COMMITTEE_ACTION = 'COMMITTEE_ACTION',
  FLOOR_VOTE = 'FLOOR_VOTE',
  CONFERENCE = 'CONFERENCE',
  ENROLLMENT = 'ENROLLMENT',
  SIGNING = 'SIGNING',
  VETO = 'VETO',
  OVERRIDE = 'OVERRIDE',

  // Executive
  EXECUTIVE_ORDER = 'EXECUTIVE_ORDER',
  PROCLAMATION = 'PROCLAMATION',
  MEMORANDUM = 'MEMORANDUM',
  DIRECTIVE = 'DIRECTIVE',

  // Regulatory
  PROPOSED_RULE = 'PROPOSED_RULE',
  PUBLIC_COMMENT = 'PUBLIC_COMMENT',
  FINAL_RULE = 'FINAL_RULE',
  INTERIM_RULE = 'INTERIM_RULE',
  WITHDRAWAL = 'WITHDRAWAL',

  // Budget/Procurement
  APPROPRIATION = 'APPROPRIATION',
  ALLOCATION = 'ALLOCATION',
  OBLIGATION = 'OBLIGATION',
  EXPENDITURE = 'EXPENDITURE',
  AWARD = 'AWARD',
  MODIFICATION = 'MODIFICATION',

  // Judicial
  FILING = 'FILING',
  OPINION = 'OPINION',
  ORDER = 'ORDER',
  RULING = 'RULING',
  DISSENT = 'DISSENT',
  CONCURRENCE = 'CONCURRENCE',
  REMAND = 'REMAND',
  APPEAL = 'APPEAL',

  // Personnel
  APPOINTMENT = 'APPOINTMENT',
  CONFIRMATION = 'CONFIRMATION',
  RESIGNATION = 'RESIGNATION',
  TERMINATION = 'TERMINATION',
  ELECTION = 'ELECTION',
}

/**
 * A single Git-style commit representing a government action.
 */
export interface GovernanceCommit {
  /** SHA-256 hash of commit content */
  hash: string;
  /** Hash of parent commit (null for initial commit) */
  parentHash: string | null;
  /** The government record this commit belongs to */
  recordId: string;
  /** Which provider produced this record */
  providerSlug: string;
  /** Government domain */
  domain: GovernmentDomain;
  /** Who authored this change */
  author: CommitAuthor;
  /** Type of governance change */
  changeType: GovernanceChangeType;
  /** Human-readable description of what changed */
  message: string;
  /** Full content snapshot at this point in time */
  snapshot: string;
  /** Diff from parent commit */
  diff: CommitDiff | null;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** References to related records, votes, etc. */
  references: CommitReference[];
  /** Tags (e.g., 'public-law-118-123', 'eo-14110') */
  tags: string[];
  /** Financial impact (for budget/procurement commits) */
  financialImpact?: {
    amount: number;
    currency: string;
    direction: 'increase' | 'decrease' | 'neutral';
  };
}

export interface CommitAuthor {
  id?: string;
  name: string;
  role: string;
  party?: string;
  jurisdiction?: string;
  organization?: string;
}

export interface CommitDiff {
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  header: string;
  content: string;
  lineStart: number;
  lineEnd: number;
}

export interface CommitReference {
  type: string; // 'vote', 'amendment', 'related-record', 'docket', 'citation'
  id: string;
  label?: string;
}

// ---------------------------------------------------------------------------
// The Adapter
// ---------------------------------------------------------------------------

/**
 * Convert a GovernmentRecord into a chain of GovernanceCommits.
 *
 * Each action on the record becomes a commit, creating a complete
 * Git-style history of the government record's lifecycle.
 */
export function recordToCommits(record: GovernmentRecord): GovernanceCommit[] {
  const commits: GovernanceCommit[] = [];

  // 1. Initial commit — record creation
  const initialCommit = createInitialCommit(record);
  commits.push(initialCommit);

  // 2. Action-based commits — each action becomes a commit
  if (record.actions?.length) {
    // Sort actions chronologically
    const sortedActions = [...record.actions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    let parentHash = initialCommit.hash;

    for (const action of sortedActions) {
      // Skip the first action if it matches the introduction date
      if (
        action.date === record.dateIntroduced &&
        commits.length === 1 &&
        isIntroductionAction(action.actionType)
      ) {
        continue;
      }

      const commit = actionToCommit(record, action, parentHash);
      commits.push(commit);
      parentHash = commit.hash;
    }
  }

  // 3. Status-based final commit (if terminal status and not covered by actions)
  if (isTerminalStatus(record.status) && commits.length <= 1) {
    const finalCommit = createStatusCommit(record, commits[commits.length - 1].hash);
    commits.push(finalCommit);
  }

  return commits;
}

/**
 * Generate a blame report — who is responsible for each aspect of a record.
 */
export function generateBlame(commits: GovernanceCommit[]): GovernanceBlame {
  const authorContributions = new Map<
    string,
    { author: CommitAuthor; commitCount: number; changeTypes: Set<string> }
  >();

  for (const commit of commits) {
    const key = commit.author.name;
    const existing = authorContributions.get(key);
    if (existing) {
      existing.commitCount++;
      existing.changeTypes.add(commit.changeType);
    } else {
      authorContributions.set(key, {
        author: commit.author,
        commitCount: 1,
        changeTypes: new Set([commit.changeType]),
      });
    }
  }

  return {
    recordId: commits[0]?.recordId ?? '',
    domain: commits[0]?.domain ?? GovernmentDomain.LEGISLATION,
    totalCommits: commits.length,
    authors: Array.from(authorContributions.values()).map((v) => ({
      ...v.author,
      commitCount: v.commitCount,
      changeTypes: Array.from(v.changeTypes),
    })),
    timeline: commits.map((c) => ({
      hash: c.hash,
      author: c.author.name,
      changeType: c.changeType,
      message: c.message,
      timestamp: c.timestamp,
    })),
  };
}

export interface GovernanceBlame {
  recordId: string;
  domain: GovernmentDomain;
  totalCommits: number;
  authors: Array<
    CommitAuthor & { commitCount: number; changeTypes: string[] }
  >;
  timeline: Array<{
    hash: string;
    author: string;
    changeType: GovernanceChangeType;
    message: string;
    timestamp: string;
  }>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createInitialCommit(record: GovernmentRecord): GovernanceCommit {
  const changeType = mapDomainToInitialChangeType(record.domain);
  const snapshot = buildSnapshot(record);

  const content = `${record.externalId}|${record.dateIntroduced}|${changeType}|${record.title}`;
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 40);

  return {
    hash,
    parentHash: null,
    recordId: record.externalId,
    providerSlug: record.providerSlug,
    domain: record.domain,
    author: record.author
      ? {
          id: record.author.id,
          name: record.author.name,
          role: record.author.role,
          party: record.author.party,
          jurisdiction: record.author.jurisdiction,
          organization: record.author.organization,
        }
      : { name: 'Unknown', role: 'system' },
    changeType,
    message: `${changeType}: ${record.title}`,
    snapshot,
    diff: null,
    timestamp: record.dateIntroduced,
    references: buildReferences(record),
    tags: buildTags(record),
    financialImpact: record.financials
      ? {
          amount: record.financials.amount,
          currency: record.financials.currency,
          direction: 'neutral',
        }
      : undefined,
  };
}

function actionToCommit(
  record: GovernmentRecord,
  action: RecordAction,
  parentHash: string,
): GovernanceCommit {
  const changeType = mapActionToChangeType(action.actionType, record.domain);

  const content = `${parentHash}|${record.externalId}|${action.date}|${action.description}`;
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 40);

  const author: CommitAuthor = action.actor
    ? {
        id: action.actor.id,
        name: action.actor.name,
        role: action.actor.role,
        party: action.actor.party,
        organization: action.actor.organization,
      }
    : record.author
      ? {
          id: record.author.id,
          name: record.author.name,
          role: record.author.role,
        }
      : { name: 'Unknown', role: 'system' };

  const references: CommitReference[] = [];
  if (action.voteData) {
    references.push({
      type: 'vote',
      id: `${record.externalId}-vote-${action.date}`,
      label: `Vote: ${action.voteData.yea}Y-${action.voteData.nay}N`,
    });
  }

  return {
    hash,
    parentHash,
    recordId: record.externalId,
    providerSlug: record.providerSlug,
    domain: record.domain,
    author,
    changeType,
    message: action.description,
    snapshot: action.description,
    diff: null,
    timestamp: action.date,
    references,
    tags: [],
  };
}

function createStatusCommit(
  record: GovernmentRecord,
  parentHash: string,
): GovernanceCommit {
  const changeType = mapStatusToChangeType(record.status, record.domain);
  const content = `${parentHash}|${record.externalId}|${record.status}|status`;
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 40);

  return {
    hash,
    parentHash,
    recordId: record.externalId,
    providerSlug: record.providerSlug,
    domain: record.domain,
    author: record.author
      ? {
          id: record.author.id,
          name: record.author.name,
          role: record.author.role,
        }
      : { name: 'System', role: 'system' },
    changeType,
    message: `Status changed to ${record.status}`,
    snapshot: `${record.title} — ${record.status}`,
    diff: null,
    timestamp: record.dateUpdated,
    references: [],
    tags: [],
  };
}

function buildSnapshot(record: GovernmentRecord): string {
  const parts = [
    `# ${record.title}`,
    `Identifier: ${record.identifier}`,
    `Domain: ${record.domain}`,
    `Status: ${record.status}`,
    `Jurisdiction: ${record.jurisdiction.name}`,
  ];
  if (record.summary) parts.push(`\n## Summary\n${record.summary}`);
  if (record.textContent) parts.push(`\n## Content\n${record.textContent}`);
  if (record.financials) {
    parts.push(
      `\n## Financials\nAmount: $${record.financials.amount.toLocaleString()} ${record.financials.currency}`,
    );
  }
  return parts.join('\n');
}

function buildReferences(record: GovernmentRecord): CommitReference[] {
  const refs: CommitReference[] = [];
  record.relatedRecords?.forEach((r) => {
    refs.push({
      type: r.relationship,
      id: r.externalId,
      label: r.title,
    });
  });
  return refs;
}

function buildTags(record: GovernmentRecord): string[] {
  const tags: string[] = [];
  if (record.status === RecordStatus.ENACTED) tags.push('enacted');
  if (record.status === RecordStatus.ACTIVE) tags.push('active');
  if (record.domain) tags.push(record.domain.toLowerCase());
  if (record.jurisdiction) tags.push(record.jurisdiction.code.toLowerCase());
  return tags;
}

function mapDomainToInitialChangeType(
  domain: GovernmentDomain,
): GovernanceChangeType {
  switch (domain) {
    case GovernmentDomain.LEGISLATION:
      return GovernanceChangeType.INTRODUCE;
    case GovernmentDomain.EXECUTIVE_ORDERS:
      return GovernanceChangeType.EXECUTIVE_ORDER;
    case GovernmentDomain.REGULATIONS:
      return GovernanceChangeType.PROPOSED_RULE;
    case GovernmentDomain.BUDGET:
      return GovernanceChangeType.APPROPRIATION;
    case GovernmentDomain.PROCUREMENT:
      return GovernanceChangeType.AWARD;
    case GovernmentDomain.COURT_DECISIONS:
      return GovernanceChangeType.FILING;
    case GovernmentDomain.PERSONNEL:
      return GovernanceChangeType.APPOINTMENT;
    default:
      return GovernanceChangeType.CREATE;
  }
}

function mapActionToChangeType(
  actionType: string,
  domain: GovernmentDomain,
): GovernanceChangeType {
  const lower = actionType.toLowerCase();

  // Legislative actions
  if (lower.includes('introduced')) return GovernanceChangeType.INTRODUCE;
  if (lower.includes('committee') && lower.includes('refer'))
    return GovernanceChangeType.COMMITTEE_REFERRAL;
  if (lower.includes('committee')) return GovernanceChangeType.COMMITTEE_ACTION;
  if (lower.includes('vote') || lower.includes('passed') || lower.includes('failed'))
    return GovernanceChangeType.FLOOR_VOTE;
  if (lower.includes('conference')) return GovernanceChangeType.CONFERENCE;
  if (lower.includes('enrolled')) return GovernanceChangeType.ENROLLMENT;
  if (lower.includes('signed') || lower.includes('enacted'))
    return GovernanceChangeType.SIGNING;
  if (lower.includes('veto')) return GovernanceChangeType.VETO;
  if (lower.includes('override')) return GovernanceChangeType.OVERRIDE;

  // Regulatory actions
  if (lower.includes('comment')) return GovernanceChangeType.PUBLIC_COMMENT;
  if (lower.includes('final rule')) return GovernanceChangeType.FINAL_RULE;
  if (lower.includes('proposed')) return GovernanceChangeType.PROPOSED_RULE;
  if (lower.includes('effective')) return GovernanceChangeType.FINAL_RULE;
  if (lower.includes('withdraw')) return GovernanceChangeType.WITHDRAWAL;

  // Judicial actions
  if (lower.includes('filed') || lower.includes('filing'))
    return GovernanceChangeType.FILING;
  if (lower.includes('opinion')) return GovernanceChangeType.OPINION;
  if (lower.includes('order')) return GovernanceChangeType.ORDER;
  if (lower.includes('ruling')) return GovernanceChangeType.RULING;
  if (lower.includes('appeal')) return GovernanceChangeType.APPEAL;
  if (lower.includes('remand')) return GovernanceChangeType.REMAND;
  if (lower.includes('terminated')) return GovernanceChangeType.ARCHIVE;

  // Budget actions
  if (lower.includes('obligat')) return GovernanceChangeType.OBLIGATION;
  if (lower.includes('expenditure') || lower.includes('outlay'))
    return GovernanceChangeType.EXPENDITURE;
  if (lower.includes('modif')) return GovernanceChangeType.MODIFICATION;
  if (lower.includes('published')) return GovernanceChangeType.CREATE;

  return GovernanceChangeType.UPDATE;
}

function mapStatusToChangeType(
  status: RecordStatus,
  domain: GovernmentDomain,
): GovernanceChangeType {
  switch (status) {
    case RecordStatus.ENACTED:
      return GovernanceChangeType.SIGNING;
    case RecordStatus.REPEALED:
      return GovernanceChangeType.REPEAL;
    case RecordStatus.EXPIRED:
    case RecordStatus.ARCHIVED:
      return GovernanceChangeType.ARCHIVE;
    case RecordStatus.SUPERSEDED:
      return GovernanceChangeType.SUPERSEDE;
    case RecordStatus.VETOED:
      return GovernanceChangeType.VETO;
    case RecordStatus.WITHDRAWN:
      return GovernanceChangeType.WITHDRAWAL;
    default:
      return GovernanceChangeType.UPDATE;
  }
}

function isIntroductionAction(actionType: string): boolean {
  const lower = actionType.toLowerCase();
  return (
    lower.includes('introduced') ||
    lower.includes('filed') ||
    lower.includes('published') ||
    lower.includes('posted')
  );
}

function isTerminalStatus(status: RecordStatus): boolean {
  return [
    RecordStatus.ENACTED,
    RecordStatus.REPEALED,
    RecordStatus.EXPIRED,
    RecordStatus.ARCHIVED,
    RecordStatus.REJECTED,
    RecordStatus.VETOED,
    RecordStatus.WITHDRAWN,
    RecordStatus.SUPERSEDED,
  ].includes(status);
}
