// ============================================================================
// Governance Repository Types
// ============================================================================
// A "governance repository" is the Git-equivalent for a government domain.
// Just as a Git repo tracks code, a governance repo tracks government records
// with full version history, branching, merging, and blame.

import { GovernmentDomain, JurisdictionLevel } from '@constitutional-shrinkage/government-api-framework';

/**
 * A governance repository — the fundamental unit of Git-for-government.
 * Each repo tracks a specific domain of government activity within a jurisdiction.
 */
export interface GovernanceRepository {
  /** Unique repository ID */
  id: string;
  /** Human-readable name, e.g., "US Federal Legislation" */
  name: string;
  /** Government domain this repo tracks */
  domain: GovernmentDomain;
  /** Jurisdiction */
  jurisdiction: {
    level: JurisdictionLevel;
    code: string;
    name: string;
  };
  /** Branches in this repository */
  branches: GovernanceBranch[];
  /** Default branch name (typically 'main' or 'current-law') */
  defaultBranch: string;
  /** Repository metadata */
  metadata: RepositoryMetadata;
}

/**
 * A branch within a governance repository.
 */
export interface GovernanceBranch {
  /** Branch name */
  name: string;
  /** What this branch represents */
  purpose: BranchPurpose;
  /** Latest commit hash on this branch */
  headCommitHash: string;
  /** Whether this is a protected branch */
  protected: boolean;
  /** Who created this branch */
  createdBy?: string;
  /** When the branch was created */
  createdAt: string;
  /** Description of the branch */
  description?: string;
}

export enum BranchPurpose {
  /** Current enacted law / active regulation — the "truth" branch */
  CURRENT_LAW = 'CURRENT_LAW',
  /** Proposed changes awaiting approval */
  PROPOSAL = 'PROPOSAL',
  /** Amendment to existing law */
  AMENDMENT = 'AMENDMENT',
  /** Draft still being written */
  DRAFT = 'DRAFT',
  /** Historical archive */
  ARCHIVE = 'ARCHIVE',
  /** Committee working branch */
  COMMITTEE = 'COMMITTEE',
  /** Conference resolution branch */
  CONFERENCE = 'CONFERENCE',
  /** Regional variant */
  REGIONAL_VARIANT = 'REGIONAL_VARIANT',
  /** Executive action branch */
  EXECUTIVE = 'EXECUTIVE',
  /** Budget cycle branch (e.g., FY2025) */
  FISCAL_YEAR = 'FISCAL_YEAR',
  /** Judicial review branch */
  JUDICIAL_REVIEW = 'JUDICIAL_REVIEW',
}

export interface RepositoryMetadata {
  /** Total number of records tracked */
  recordCount: number;
  /** Total commits across all branches */
  commitCount: number;
  /** Number of contributors (authors) */
  contributorCount: number;
  /** When the repo was created */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Data providers feeding this repo */
  providerSlugs: string[];
  /** Repository tags */
  tags: string[];
}

/**
 * A merge request — the equivalent of a pull request for government.
 * This is how proposed changes (bills, amendments, budget proposals)
 * get reviewed and merged into the current-law branch.
 */
export interface GovernanceMergeRequest {
  id: string;
  /** Repository this MR belongs to */
  repositoryId: string;
  /** Branch containing the proposed changes */
  sourceBranch: string;
  /** Branch to merge into (usually current-law) */
  targetBranch: string;
  /** Title of the merge request */
  title: string;
  /** Detailed description */
  description: string;
  /** Current status */
  status: MergeRequestStatus;
  /** Who proposed this merge */
  author: {
    id: string;
    name: string;
    role: string;
  };
  /** Reviewers and their status */
  reviewers: MergeRequestReview[];
  /** Approval requirements */
  approvalRules: ApprovalRules;
  /** Dates */
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
  closedAt?: string;
  /** Discussion threads */
  discussions: Discussion[];
  /** Impact assessment */
  impactAssessment?: ImpactAssessment;
}

export enum MergeRequestStatus {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  VOTING = 'VOTING',
  MERGED = 'MERGED',
  REJECTED = 'REJECTED',
  CLOSED = 'CLOSED',
  SUPERSEDED = 'SUPERSEDED',
  VETOED = 'VETOED',
}

export interface MergeRequestReview {
  reviewerId: string;
  reviewerName: string;
  reviewerRole: string; // 'committee-chair', 'legal-counsel', 'public', etc.
  status: 'pending' | 'approved' | 'changes_requested' | 'rejected';
  comments?: string;
  reviewedAt?: string;
}

export interface ApprovalRules {
  /** Minimum number of approvals needed */
  minApprovals: number;
  /** Whether constitutional review is required */
  requiresConstitutionalReview: boolean;
  /** Whether public comment period is required */
  requiresPublicComment: boolean;
  /** Public comment period duration (days) */
  publicCommentDays?: number;
  /** Whether a vote is required for merging */
  requiresVote: boolean;
  /** Vote threshold (e.g., 0.5 for simple majority, 0.67 for supermajority) */
  voteThreshold?: number;
  /** Specific roles that must approve */
  requiredReviewerRoles?: string[];
  /** Whether impact assessment is required */
  requiresImpactAssessment: boolean;
}

export interface Discussion {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  replies: Discussion[];
  resolved: boolean;
}

export interface ImpactAssessment {
  /** People impact score (0-100) */
  peopleScore: number;
  /** Planet impact score (0-100) */
  planetScore: number;
  /** Profit impact score (0-100) */
  profitScore: number;
  /** Estimated budget impact */
  budgetImpact?: number;
  /** Affected jurisdictions */
  affectedJurisdictions: string[];
  /** Affected population estimate */
  affectedPopulation?: number;
  /** Summary of impacts */
  summary: string;
  /** Detailed analysis per area */
  details: Array<{
    area: string;
    impact: 'positive' | 'negative' | 'neutral';
    magnitude: 'low' | 'medium' | 'high';
    description: string;
  }>;
}
