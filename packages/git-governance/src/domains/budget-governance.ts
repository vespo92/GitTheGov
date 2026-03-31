// ============================================================================
// Budget Governance Domain
// ============================================================================
// Git-style version control for government budgets.
// Every dollar is tracked, every change is committed, every allocation
// has an author and a reason.

import {
  GovernmentDomain,
  GovernmentRecord,
  JurisdictionLevel,
  FinancialData,
} from '@constitutional-shrinkage/government-api-framework';
import {
  GovernanceCommit,
  GovernanceChangeType,
  recordToCommits,
} from '@constitutional-shrinkage/government-api-framework';
import {
  GovernanceRepository,
  GovernanceBranch,
  BranchPurpose,
  GovernanceMergeRequest,
  ApprovalRules,
} from '../types';

// ---------------------------------------------------------------------------
// Budget-Specific Types
// ---------------------------------------------------------------------------

export interface BudgetVersion {
  /** Fiscal year */
  fiscalYear: number;
  /** Budget phase */
  phase: BudgetPhase;
  /** Total budget amount */
  totalAmount: number;
  /** Currency */
  currency: string;
  /** Line items by agency/department */
  agencies: AgencyAllocation[];
  /** Commit hash representing this version */
  commitHash: string;
  /** When this version was created */
  timestamp: string;
}

export enum BudgetPhase {
  /** President's budget proposal */
  PROPOSAL = 'PROPOSAL',
  /** House version */
  HOUSE_MARKUP = 'HOUSE_MARKUP',
  /** Senate version */
  SENATE_MARKUP = 'SENATE_MARKUP',
  /** Conference agreement */
  CONFERENCE = 'CONFERENCE',
  /** Enacted budget */
  ENACTED = 'ENACTED',
  /** Continuing resolution */
  CONTINUING_RESOLUTION = 'CONTINUING_RESOLUTION',
  /** Supplemental appropriation */
  SUPPLEMENTAL = 'SUPPLEMENTAL',
  /** Sequestration/rescission */
  SEQUESTRATION = 'SEQUESTRATION',
  /** Actual spending */
  EXECUTION = 'EXECUTION',
}

export interface AgencyAllocation {
  agencyName: string;
  agencyCode: string;
  /** Budget authority */
  budgetAuthority: number;
  /** Obligations (committed spending) */
  obligations: number;
  /** Outlays (actual cash disbursed) */
  outlays: number;
  /** Unobligated balance */
  unobligated: number;
  /** Program-level breakdown */
  programs?: ProgramAllocation[];
  /** Change from prior year */
  priorYearChange?: {
    amount: number;
    percentage: number;
    direction: 'increase' | 'decrease' | 'flat';
  };
}

export interface ProgramAllocation {
  programName: string;
  amount: number;
  category: 'mandatory' | 'discretionary' | 'net_interest';
  subcategory?: string;
}

// ---------------------------------------------------------------------------
// Budget Governance Operations
// ---------------------------------------------------------------------------

/**
 * Create a budget governance repository for a jurisdiction and fiscal year.
 */
export function createBudgetRepository(
  jurisdictionCode: string,
  jurisdictionName: string,
  jurisdictionLevel: JurisdictionLevel,
  fiscalYear: number,
): GovernanceRepository {
  const id = `budget-${jurisdictionCode.toLowerCase()}-fy${fiscalYear}`;

  const branches: GovernanceBranch[] = [
    {
      name: 'enacted',
      purpose: BranchPurpose.CURRENT_LAW,
      headCommitHash: '',
      protected: true,
      createdAt: new Date().toISOString(),
      description: `Enacted budget for FY${fiscalYear}`,
    },
    {
      name: `proposal/fy${fiscalYear}`,
      purpose: BranchPurpose.PROPOSAL,
      headCommitHash: '',
      protected: false,
      createdAt: new Date().toISOString(),
      description: `Executive budget proposal for FY${fiscalYear}`,
    },
    {
      name: `house/fy${fiscalYear}`,
      purpose: BranchPurpose.COMMITTEE,
      headCommitHash: '',
      protected: false,
      createdAt: new Date().toISOString(),
      description: `House appropriations for FY${fiscalYear}`,
    },
    {
      name: `senate/fy${fiscalYear}`,
      purpose: BranchPurpose.COMMITTEE,
      headCommitHash: '',
      protected: false,
      createdAt: new Date().toISOString(),
      description: `Senate appropriations for FY${fiscalYear}`,
    },
    {
      name: `execution/fy${fiscalYear}`,
      purpose: BranchPurpose.FISCAL_YEAR,
      headCommitHash: '',
      protected: false,
      createdAt: new Date().toISOString(),
      description: `Actual spending execution for FY${fiscalYear}`,
    },
  ];

  return {
    id,
    name: `${jurisdictionName} Budget — FY${fiscalYear}`,
    domain: GovernmentDomain.BUDGET,
    jurisdiction: {
      level: jurisdictionLevel,
      code: jurisdictionCode,
      name: jurisdictionName,
    },
    branches,
    defaultBranch: 'enacted',
    metadata: {
      recordCount: 0,
      commitCount: 0,
      contributorCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      providerSlugs: ['usa-spending'],
      tags: [`fy${fiscalYear}`, 'budget', jurisdictionCode.toLowerCase()],
    },
  };
}

/**
 * Compare two budget versions to generate a diff.
 */
export function compareBudgetVersions(
  baseline: BudgetVersion,
  proposed: BudgetVersion,
): BudgetComparison {
  const totalChange = proposed.totalAmount - baseline.totalAmount;
  const agencyChanges: AgencyBudgetChange[] = [];

  // Build maps for comparison
  const baselineMap = new Map(
    baseline.agencies.map((a) => [a.agencyCode, a]),
  );
  const proposedMap = new Map(
    proposed.agencies.map((a) => [a.agencyCode, a]),
  );

  // Find changes, additions, removals
  for (const [code, proposedAgency] of proposedMap) {
    const baselineAgency = baselineMap.get(code);
    if (!baselineAgency) {
      agencyChanges.push({
        agencyCode: code,
        agencyName: proposedAgency.agencyName,
        changeType: 'added',
        baselineAmount: 0,
        proposedAmount: proposedAgency.budgetAuthority,
        deltaAmount: proposedAgency.budgetAuthority,
        deltaPercent: 100,
      });
    } else {
      const delta =
        proposedAgency.budgetAuthority - baselineAgency.budgetAuthority;
      if (delta !== 0) {
        agencyChanges.push({
          agencyCode: code,
          agencyName: proposedAgency.agencyName,
          changeType: delta > 0 ? 'increased' : 'decreased',
          baselineAmount: baselineAgency.budgetAuthority,
          proposedAmount: proposedAgency.budgetAuthority,
          deltaAmount: delta,
          deltaPercent:
            baselineAgency.budgetAuthority > 0
              ? (delta / baselineAgency.budgetAuthority) * 100
              : 0,
        });
      }
    }
  }

  for (const [code, baselineAgency] of baselineMap) {
    if (!proposedMap.has(code)) {
      agencyChanges.push({
        agencyCode: code,
        agencyName: baselineAgency.agencyName,
        changeType: 'removed',
        baselineAmount: baselineAgency.budgetAuthority,
        proposedAmount: 0,
        deltaAmount: -baselineAgency.budgetAuthority,
        deltaPercent: -100,
      });
    }
  }

  // Sort by absolute change magnitude
  agencyChanges.sort(
    (a, b) => Math.abs(b.deltaAmount) - Math.abs(a.deltaAmount),
  );

  return {
    baselineFiscalYear: baseline.fiscalYear,
    baselinePhase: baseline.phase,
    proposedFiscalYear: proposed.fiscalYear,
    proposedPhase: proposed.phase,
    baselineTotal: baseline.totalAmount,
    proposedTotal: proposed.totalAmount,
    totalChange,
    totalChangePercent:
      baseline.totalAmount > 0
        ? (totalChange / baseline.totalAmount) * 100
        : 0,
    agencyChanges,
    summary: generateBudgetSummary(totalChange, agencyChanges),
  };
}

export interface BudgetComparison {
  baselineFiscalYear: number;
  baselinePhase: BudgetPhase;
  proposedFiscalYear: number;
  proposedPhase: BudgetPhase;
  baselineTotal: number;
  proposedTotal: number;
  totalChange: number;
  totalChangePercent: number;
  agencyChanges: AgencyBudgetChange[];
  summary: string;
}

export interface AgencyBudgetChange {
  agencyCode: string;
  agencyName: string;
  changeType: 'increased' | 'decreased' | 'added' | 'removed' | 'unchanged';
  baselineAmount: number;
  proposedAmount: number;
  deltaAmount: number;
  deltaPercent: number;
}

/**
 * Build default approval rules for budget merge requests.
 */
export function budgetApprovalRules(phase: BudgetPhase): ApprovalRules {
  return {
    minApprovals: phase === BudgetPhase.ENACTED ? 2 : 1,
    requiresConstitutionalReview: false,
    requiresPublicComment: phase === BudgetPhase.PROPOSAL,
    publicCommentDays: phase === BudgetPhase.PROPOSAL ? 30 : undefined,
    requiresVote: [
      BudgetPhase.HOUSE_MARKUP,
      BudgetPhase.SENATE_MARKUP,
      BudgetPhase.CONFERENCE,
      BudgetPhase.ENACTED,
    ].includes(phase),
    voteThreshold: 0.5, // Simple majority for budgets
    requiredReviewerRoles: ['appropriations-committee'],
    requiresImpactAssessment: true,
  };
}

/**
 * Convert budget records from USASpending into governance commits.
 */
export function budgetRecordToCommits(
  record: GovernmentRecord,
): GovernanceCommit[] {
  return recordToCommits(record);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateBudgetSummary(
  totalChange: number,
  changes: AgencyBudgetChange[],
): string {
  const direction = totalChange > 0 ? 'increase' : totalChange < 0 ? 'decrease' : 'no change';
  const topIncreases = changes
    .filter((c) => c.changeType === 'increased')
    .slice(0, 3);
  const topDecreases = changes
    .filter((c) => c.changeType === 'decreased')
    .slice(0, 3);

  let summary = `Overall ${direction} of $${Math.abs(totalChange).toLocaleString()}. `;

  if (topIncreases.length) {
    summary += `Top increases: ${topIncreases.map((c) => `${c.agencyName} (+$${c.deltaAmount.toLocaleString()})`).join(', ')}. `;
  }
  if (topDecreases.length) {
    summary += `Top decreases: ${topDecreases.map((c) => `${c.agencyName} (-$${Math.abs(c.deltaAmount).toLocaleString()})`).join(', ')}.`;
  }

  return summary;
}
