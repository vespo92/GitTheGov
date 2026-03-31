// ============================================================================
// Executive Governance Domain
// ============================================================================
// Git-style version control for executive actions: executive orders,
// presidential memoranda, proclamations, and agency directives.
// Every executive action is tracked from issuance through amendment,
// revocation, or judicial review.

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
// Executive-Specific Types
// ---------------------------------------------------------------------------

export enum ExecutiveActionType {
  EXECUTIVE_ORDER = 'EXECUTIVE_ORDER',
  PRESIDENTIAL_MEMORANDUM = 'PRESIDENTIAL_MEMORANDUM',
  PROCLAMATION = 'PROCLAMATION',
  PRESIDENTIAL_DIRECTIVE = 'PRESIDENTIAL_DIRECTIVE',
  SIGNING_STATEMENT = 'SIGNING_STATEMENT',
  AGENCY_DIRECTIVE = 'AGENCY_DIRECTIVE',
  AGENCY_GUIDANCE = 'AGENCY_GUIDANCE',
  EXECUTIVE_AGREEMENT = 'EXECUTIVE_AGREEMENT',
}

export interface ExecutiveAction {
  /** Identifier (e.g., EO 14110, PPM-2024-01) */
  identifier: string;
  /** Type of executive action */
  actionType: ExecutiveActionType;
  /** Title */
  title: string;
  /** Issuing authority (President, Agency Head, etc.) */
  issuingAuthority: string;
  /** Signing date */
  signedDate: string;
  /** Effective date (may differ from signing) */
  effectiveDate?: string;
  /** Federal Register citation */
  federalRegisterCitation?: string;
  /** Status */
  status: ExecutiveActionStatus;
  /** Which previous executive actions this modifies */
  modifies: string[];
  /** Which previous executive actions this revokes */
  revokes: string[];
  /** Legal authority cited */
  legalAuthority: string[];
  /** Agencies directed to take action */
  directedAgencies: string[];
  /** Deadlines for agency compliance */
  complianceDeadlines: Array<{
    agency: string;
    action: string;
    deadline: string;
    status: 'pending' | 'met' | 'missed' | 'extended';
  }>;
  /** Judicial challenges */
  judicialChallenges: Array<{
    caseId: string;
    court: string;
    status: 'pending' | 'upheld' | 'struck-down' | 'partially-struck' | 'stayed';
    description: string;
  }>;
}

export enum ExecutiveActionStatus {
  ACTIVE = 'ACTIVE',
  PARTIALLY_REVOKED = 'PARTIALLY_REVOKED',
  REVOKED = 'REVOKED',
  SUPERSEDED = 'SUPERSEDED',
  EXPIRED = 'EXPIRED',
  STAYED = 'STAYED',
  STRUCK_DOWN = 'STRUCK_DOWN',
}

// ---------------------------------------------------------------------------
// Executive Governance Operations
// ---------------------------------------------------------------------------

/**
 * Create a governance repository for executive actions.
 */
export function createExecutiveRepository(
  administration: string,
  jurisdictionCode: string,
  jurisdictionName: string,
  jurisdictionLevel: JurisdictionLevel,
): GovernanceRepository {
  const id = `exec-${jurisdictionCode.toLowerCase()}-${administration.toLowerCase().replace(/\s+/g, '-')}`;

  const branches: GovernanceBranch[] = [
    {
      name: 'active-orders',
      purpose: BranchPurpose.CURRENT_LAW,
      headCommitHash: '',
      protected: true,
      createdAt: new Date().toISOString(),
      description: 'Currently active executive orders and directives',
    },
    {
      name: 'executive-orders',
      purpose: BranchPurpose.EXECUTIVE,
      headCommitHash: '',
      protected: false,
      createdAt: new Date().toISOString(),
      description: 'Executive order tracking',
    },
    {
      name: 'memoranda',
      purpose: BranchPurpose.EXECUTIVE,
      headCommitHash: '',
      protected: false,
      createdAt: new Date().toISOString(),
      description: 'Presidential memoranda',
    },
    {
      name: 'agency-directives',
      purpose: BranchPurpose.EXECUTIVE,
      headCommitHash: '',
      protected: false,
      createdAt: new Date().toISOString(),
      description: 'Agency-level directives and guidance',
    },
    {
      name: 'judicial-review',
      purpose: BranchPurpose.JUDICIAL_REVIEW,
      headCommitHash: '',
      protected: true,
      createdAt: new Date().toISOString(),
      description: 'Court challenges and rulings on executive actions',
    },
  ];

  return {
    id,
    name: `Executive Actions — ${administration}`,
    domain: GovernmentDomain.EXECUTIVE_ORDERS,
    jurisdiction: {
      level: jurisdictionLevel,
      code: jurisdictionCode,
      name: jurisdictionName,
    },
    branches,
    defaultBranch: 'active-orders',
    metadata: {
      recordCount: 0,
      commitCount: 0,
      contributorCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      providerSlugs: ['federal-register'],
      tags: ['executive', administration.toLowerCase()],
    },
  };
}

/**
 * Track the chain of executive actions that modify or revoke each other.
 * Returns a dependency graph showing which orders depend on others.
 */
export function buildExecutiveActionChain(
  actions: ExecutiveAction[],
): ExecutiveActionGraph {
  const nodes = new Map<string, ExecutiveActionNode>();
  const edges: ExecutiveActionEdge[] = [];

  // Build nodes
  for (const action of actions) {
    nodes.set(action.identifier, {
      identifier: action.identifier,
      title: action.title,
      actionType: action.actionType,
      status: action.status,
      signedDate: action.signedDate,
      issuingAuthority: action.issuingAuthority,
    });
  }

  // Build edges
  for (const action of actions) {
    for (const modified of action.modifies) {
      edges.push({
        from: action.identifier,
        to: modified,
        relationship: 'modifies',
      });
    }
    for (const revoked of action.revokes) {
      edges.push({
        from: action.identifier,
        to: revoked,
        relationship: 'revokes',
      });
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    activeCount: actions.filter(
      (a) => a.status === ExecutiveActionStatus.ACTIVE,
    ).length,
    revokedCount: actions.filter(
      (a) => a.status === ExecutiveActionStatus.REVOKED,
    ).length,
    challengedCount: actions.filter(
      (a) => a.judicialChallenges?.length > 0,
    ).length,
  };
}

export interface ExecutiveActionGraph {
  nodes: ExecutiveActionNode[];
  edges: ExecutiveActionEdge[];
  activeCount: number;
  revokedCount: number;
  challengedCount: number;
}

export interface ExecutiveActionNode {
  identifier: string;
  title: string;
  actionType: ExecutiveActionType;
  status: ExecutiveActionStatus;
  signedDate: string;
  issuingAuthority: string;
}

export interface ExecutiveActionEdge {
  from: string;
  to: string;
  relationship: 'modifies' | 'revokes' | 'supersedes' | 'implements';
}

/**
 * Approval rules for executive actions.
 * Executive actions have lower approval bars but higher review requirements.
 */
export function executiveApprovalRules(
  actionType: ExecutiveActionType,
): ApprovalRules {
  return {
    minApprovals: 1,
    requiresConstitutionalReview: true, // All executive actions need constitutional check
    requiresPublicComment: false,       // Executive actions don't require APA notice-and-comment
    requiresVote: false,                // No legislative vote required
    requiresImpactAssessment: true,
    requiredReviewerRoles:
      actionType === ExecutiveActionType.EXECUTIVE_ORDER
        ? ['legal-counsel', 'olc-review'] // Office of Legal Counsel
        : ['legal-counsel'],
  };
}

/**
 * Convert executive action records into governance commits.
 */
export function executiveRecordToCommits(
  record: GovernmentRecord,
): GovernanceCommit[] {
  return recordToCommits(record);
}
