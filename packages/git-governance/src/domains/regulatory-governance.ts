// ============================================================================
// Regulatory Governance Domain
// ============================================================================
// Git-style version control for federal and state regulations.
// Tracks the full lifecycle: proposed rule → public comment → final rule,
// with every change committed and every comment tracked.

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
  ApprovalRules,
} from '../types';

// ---------------------------------------------------------------------------
// Regulatory-Specific Types
// ---------------------------------------------------------------------------

export interface RegulatoryDocket {
  /** Docket ID (e.g., EPA-HQ-OAR-2023-0001) */
  docketId: string;
  /** Issuing agency */
  agency: string;
  /** Regulation title */
  title: string;
  /** Current stage in the rulemaking process */
  stage: RulemakingStage;
  /** CFR title and part affected */
  cfrReferences: Array<{ title: number; part: number }>;
  /** Regulatory Identifier Number */
  rin?: string;
  /** Is this an economically significant rule? (> $200M impact) */
  economicallySignificant: boolean;
  /** Public comment period */
  commentPeriod?: {
    opens: string;
    closes: string;
    totalComments: number;
    uniqueComments: number;
    formLetters: number;
  };
  /** Timeline of the rulemaking process */
  timeline: RulemakingEvent[];
  /** Cost-benefit analysis */
  costBenefitAnalysis?: {
    estimatedCosts: number;
    estimatedBenefits: number;
    netBenefit: number;
    timeframeYears: number;
    uncertaintyRange: { low: number; high: number };
  };
}

export enum RulemakingStage {
  /** Pre-rule: Advance Notice of Proposed Rulemaking (ANPRM) */
  ADVANCE_NOTICE = 'ADVANCE_NOTICE',
  /** Proposed rule published in Federal Register */
  PROPOSED_RULE = 'PROPOSED_RULE',
  /** Open for public comments */
  PUBLIC_COMMENT = 'PUBLIC_COMMENT',
  /** Comment period closed, agency reviewing */
  COMMENT_REVIEW = 'COMMENT_REVIEW',
  /** Interim final rule (effective immediately but accepting comments) */
  INTERIM_FINAL = 'INTERIM_FINAL',
  /** Final rule published */
  FINAL_RULE = 'FINAL_RULE',
  /** Rule is effective */
  EFFECTIVE = 'EFFECTIVE',
  /** Rule withdrawn before finalization */
  WITHDRAWN = 'WITHDRAWN',
  /** Rule stayed by court or agency */
  STAYED = 'STAYED',
  /** Rule vacated by court */
  VACATED = 'VACATED',
}

export interface RulemakingEvent {
  date: string;
  stage: RulemakingStage;
  description: string;
  federalRegisterCitation?: string;
  actor?: string;
}

// ---------------------------------------------------------------------------
// Regulatory Governance Operations
// ---------------------------------------------------------------------------

/**
 * Create a governance repository for a regulatory docket.
 */
export function createRegulatoryRepository(
  docket: RegulatoryDocket,
): GovernanceRepository {
  const id = `reg-${docket.docketId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;

  const branches: GovernanceBranch[] = [
    {
      name: 'current-cfr',
      purpose: BranchPurpose.CURRENT_LAW,
      headCommitHash: '',
      protected: true,
      createdAt: new Date().toISOString(),
      description: 'Current Code of Federal Regulations text',
    },
    {
      name: 'proposed-rule',
      purpose: BranchPurpose.PROPOSAL,
      headCommitHash: '',
      protected: false,
      createdAt: new Date().toISOString(),
      description: 'Proposed rule changes',
    },
    {
      name: 'public-comments',
      purpose: BranchPurpose.DRAFT,
      headCommitHash: '',
      protected: false,
      createdAt: new Date().toISOString(),
      description: 'Public comment tracking',
    },
    {
      name: 'final-rule',
      purpose: BranchPurpose.PROPOSAL,
      headCommitHash: '',
      protected: false,
      createdAt: new Date().toISOString(),
      description: 'Final rule after comment period',
    },
  ];

  return {
    id,
    name: `${docket.agency}: ${docket.title}`,
    domain: GovernmentDomain.REGULATIONS,
    jurisdiction: {
      level: JurisdictionLevel.FEDERAL,
      code: 'US',
      name: 'United States',
    },
    branches,
    defaultBranch: 'current-cfr',
    metadata: {
      recordCount: 0,
      commitCount: 0,
      contributorCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      providerSlugs: ['federal-register', 'regulations-gov'],
      tags: [
        docket.agency.toLowerCase(),
        docket.docketId,
        ...(docket.rin ? [docket.rin] : []),
        ...(docket.economicallySignificant ? ['significant'] : []),
      ],
    },
  };
}

/**
 * Build approval rules for regulatory merge requests.
 * Regulatory changes follow the Administrative Procedure Act.
 */
export function regulatoryApprovalRules(
  stage: RulemakingStage,
  economicallySignificant: boolean,
): ApprovalRules {
  const baseRules: ApprovalRules = {
    minApprovals: 1,
    requiresConstitutionalReview: false,
    requiresPublicComment: true,
    publicCommentDays: 60, // Standard APA requirement
    requiresVote: false,
    requiresImpactAssessment: true,
  };

  if (economicallySignificant) {
    baseRules.minApprovals = 2;
    baseRules.publicCommentDays = 90;
    baseRules.requiredReviewerRoles = [
      'oira-review',        // Office of Information and Regulatory Affairs
      'agency-head',
      'legal-counsel',
    ];
  }

  if (stage === RulemakingStage.FINAL_RULE) {
    baseRules.requiresPublicComment = false; // Already done
    baseRules.requiredReviewerRoles = [
      ...(baseRules.requiredReviewerRoles ?? []),
      'congressional-review', // Congressional Review Act
    ];
  }

  return baseRules;
}

/**
 * Analyze public comment data for a docket.
 */
export function analyzeCommentPeriod(docket: RegulatoryDocket): CommentAnalysis {
  const period = docket.commentPeriod;
  if (!period) {
    return {
      docketId: docket.docketId,
      hasCommentPeriod: false,
      isOpen: false,
      totalComments: 0,
      uniqueComments: 0,
      formLetterPercentage: 0,
      daysRemaining: 0,
      engagementLevel: 'none',
    };
  }

  const now = new Date();
  const closes = new Date(period.closes);
  const isOpen = now < closes;
  const daysRemaining = isOpen
    ? Math.ceil((closes.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const formLetterPct =
    period.totalComments > 0
      ? (period.formLetters / period.totalComments) * 100
      : 0;

  let engagementLevel: 'none' | 'low' | 'moderate' | 'high' | 'exceptional';
  if (period.uniqueComments === 0) engagementLevel = 'none';
  else if (period.uniqueComments < 100) engagementLevel = 'low';
  else if (period.uniqueComments < 1000) engagementLevel = 'moderate';
  else if (period.uniqueComments < 10000) engagementLevel = 'high';
  else engagementLevel = 'exceptional';

  return {
    docketId: docket.docketId,
    hasCommentPeriod: true,
    isOpen,
    totalComments: period.totalComments,
    uniqueComments: period.uniqueComments,
    formLetterPercentage: Math.round(formLetterPct * 10) / 10,
    daysRemaining,
    engagementLevel,
  };
}

export interface CommentAnalysis {
  docketId: string;
  hasCommentPeriod: boolean;
  isOpen: boolean;
  totalComments: number;
  uniqueComments: number;
  formLetterPercentage: number;
  daysRemaining: number;
  engagementLevel: 'none' | 'low' | 'moderate' | 'high' | 'exceptional';
}

/**
 * Convert regulatory records into governance commits.
 */
export function regulatoryRecordToCommits(
  record: GovernmentRecord,
): GovernanceCommit[] {
  return recordToCommits(record);
}
