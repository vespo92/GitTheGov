// ============================================================================
// Judicial Governance Domain
// ============================================================================
// Git-style version control for court decisions, orders, and the body
// of case law. Tracks opinions, dissents, concurrences, and the citation
// network that forms the foundation of legal precedent.

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
// Judicial-Specific Types
// ---------------------------------------------------------------------------

export interface CourtCase {
  /** Case identifier (docket number) */
  docketNumber: string;
  /** Case name (e.g., "Smith v. Jones") */
  caseName: string;
  /** Court */
  court: CourtInfo;
  /** Case type */
  caseType: CaseType;
  /** Current status */
  status: CaseStatus;
  /** Date filed */
  dateFiled: string;
  /** Date terminated */
  dateTerminated?: string;
  /** Assigned judge */
  assignedJudge?: JudgeInfo;
  /** Parties involved */
  parties: CaseParty[];
  /** Opinions issued */
  opinions: CaseOpinion[];
  /** Citation network */
  citations: CaseCitation[];
  /** Appeal history */
  appealHistory: AppealRecord[];
}

export interface CourtInfo {
  id: string;
  name: string;
  level: 'supreme' | 'appellate' | 'district' | 'bankruptcy' | 'specialized' | 'state-supreme' | 'state-appellate' | 'state-trial';
  circuit?: string;
  state?: string;
}

export enum CaseType {
  CIVIL = 'CIVIL',
  CRIMINAL = 'CRIMINAL',
  CONSTITUTIONAL = 'CONSTITUTIONAL',
  ADMINISTRATIVE = 'ADMINISTRATIVE',
  BANKRUPTCY = 'BANKRUPTCY',
  IMMIGRATION = 'IMMIGRATION',
  TAX = 'TAX',
  PATENT = 'PATENT',
  HABEAS = 'HABEAS',
}

export enum CaseStatus {
  FILED = 'FILED',
  PENDING = 'PENDING',
  DISCOVERY = 'DISCOVERY',
  TRIAL = 'TRIAL',
  DECIDED = 'DECIDED',
  APPEALED = 'APPEALED',
  REMANDED = 'REMANDED',
  SETTLED = 'SETTLED',
  DISMISSED = 'DISMISSED',
  CLOSED = 'CLOSED',
}

export interface JudgeInfo {
  id: string;
  name: string;
  appointedBy?: string;
  seniorStatus?: boolean;
}

export interface CaseParty {
  name: string;
  role: 'plaintiff' | 'defendant' | 'appellant' | 'appellee' | 'petitioner' | 'respondent' | 'intervenor' | 'amicus';
  attorneys: string[];
}

export interface CaseOpinion {
  type: 'majority' | 'concurrence' | 'dissent' | 'per_curiam';
  author: string;
  joinedBy: string[];
  summary?: string;
  precedentialStatus: 'published' | 'unpublished' | 'non-precedential';
  dateFiled: string;
}

export interface CaseCitation {
  citedCaseId: string;
  citedCaseName: string;
  citationType: 'positive' | 'negative' | 'distinguished' | 'overruled' | 'followed';
  context?: string;
}

export interface AppealRecord {
  fromCourt: string;
  toCourt: string;
  dateAppealed: string;
  outcome?: 'affirmed' | 'reversed' | 'remanded' | 'vacated' | 'dismissed';
  dateDecided?: string;
}

// ---------------------------------------------------------------------------
// Judicial Governance Operations
// ---------------------------------------------------------------------------

/**
 * Create a governance repository for a court.
 */
export function createJudicialRepository(
  court: CourtInfo,
): GovernanceRepository {
  const id = `court-${court.id.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;

  const branches: GovernanceBranch[] = [
    {
      name: 'precedent',
      purpose: BranchPurpose.CURRENT_LAW,
      headCommitHash: '',
      protected: true,
      createdAt: new Date().toISOString(),
      description: 'Published precedential opinions',
    },
    {
      name: 'pending-cases',
      purpose: BranchPurpose.DRAFT,
      headCommitHash: '',
      protected: false,
      createdAt: new Date().toISOString(),
      description: 'Cases currently before the court',
    },
    {
      name: 'constitutional-review',
      purpose: BranchPurpose.JUDICIAL_REVIEW,
      headCommitHash: '',
      protected: true,
      createdAt: new Date().toISOString(),
      description: 'Constitutional review decisions',
    },
    {
      name: 'archive',
      purpose: BranchPurpose.ARCHIVE,
      headCommitHash: '',
      protected: true,
      createdAt: new Date().toISOString(),
      description: 'Historical decisions',
    },
  ];

  return {
    id,
    name: `${court.name} Decisions`,
    domain: GovernmentDomain.COURT_DECISIONS,
    jurisdiction: {
      level: court.state ? JurisdictionLevel.STATE : JurisdictionLevel.FEDERAL,
      code: court.state ?? 'US',
      name: court.name,
    },
    branches,
    defaultBranch: 'precedent',
    metadata: {
      recordCount: 0,
      commitCount: 0,
      contributorCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      providerSlugs: ['court-listener'],
      tags: [
        court.level,
        ...(court.circuit ? [court.circuit] : []),
        ...(court.state ? [court.state.toLowerCase()] : ['federal']),
      ],
    },
  };
}

/**
 * Build a citation graph from a set of cases.
 * Shows how court decisions reference and build on each other.
 */
export function buildCitationGraph(cases: CourtCase[]): CitationGraph {
  const nodes: CitationNode[] = cases.map((c) => ({
    caseId: c.docketNumber,
    caseName: c.caseName,
    court: c.court.name,
    dateFiled: c.dateFiled,
    citedByCount: 0,
    citesCount: c.citations.length,
    precedentialWeight: 0,
  }));

  const nodeMap = new Map(nodes.map((n) => [n.caseId, n]));
  const edges: CitationEdge[] = [];

  for (const courtCase of cases) {
    for (const citation of courtCase.citations) {
      edges.push({
        from: courtCase.docketNumber,
        to: citation.citedCaseId,
        type: citation.citationType,
        context: citation.context,
      });

      // Update cited-by count
      const citedNode = nodeMap.get(citation.citedCaseId);
      if (citedNode) {
        citedNode.citedByCount++;
      }
    }
  }

  // Calculate precedential weight (simplified PageRank-like metric)
  for (const node of nodes) {
    node.precedentialWeight =
      node.citedByCount * 10 +
      (node.court.includes('Supreme') ? 100 : 0) +
      (node.court.includes('Circuit') || node.court.includes('Appeals') ? 50 : 0);
  }

  // Sort by precedential weight
  nodes.sort((a, b) => b.precedentialWeight - a.precedentialWeight);

  return {
    nodes,
    edges,
    totalCases: cases.length,
    totalCitations: edges.length,
    mostCited: nodes.slice(0, 10),
  };
}

export interface CitationGraph {
  nodes: CitationNode[];
  edges: CitationEdge[];
  totalCases: number;
  totalCitations: number;
  mostCited: CitationNode[];
}

export interface CitationNode {
  caseId: string;
  caseName: string;
  court: string;
  dateFiled: string;
  citedByCount: number;
  citesCount: number;
  precedentialWeight: number;
}

export interface CitationEdge {
  from: string;
  to: string;
  type: 'positive' | 'negative' | 'distinguished' | 'overruled' | 'followed';
  context?: string;
}

/**
 * Track a case through its appeal chain.
 */
export function traceAppealChain(courtCase: CourtCase): AppealChain {
  const chain: AppealChainStep[] = [
    {
      court: courtCase.court.name,
      courtLevel: courtCase.court.level,
      dateFiled: courtCase.dateFiled,
      dateDecided: courtCase.dateTerminated,
      outcome: courtCase.status === CaseStatus.DECIDED ? 'decided' : 'pending',
    },
  ];

  for (const appeal of courtCase.appealHistory) {
    chain.push({
      court: appeal.toCourt,
      courtLevel: inferCourtLevel(appeal.toCourt),
      dateFiled: appeal.dateAppealed,
      dateDecided: appeal.dateDecided,
      outcome: appeal.outcome ?? 'pending',
    });
  }

  return {
    caseId: courtCase.docketNumber,
    caseName: courtCase.caseName,
    steps: chain,
    currentCourt: chain[chain.length - 1].court,
    finalOutcome: chain[chain.length - 1].outcome,
  };
}

export interface AppealChain {
  caseId: string;
  caseName: string;
  steps: AppealChainStep[];
  currentCourt: string;
  finalOutcome: string;
}

export interface AppealChainStep {
  court: string;
  courtLevel: string;
  dateFiled: string;
  dateDecided?: string;
  outcome: string;
}

/**
 * Convert judicial records into governance commits.
 */
export function judicialRecordToCommits(
  record: GovernmentRecord,
): GovernanceCommit[] {
  return recordToCommits(record);
}

function inferCourtLevel(courtName: string): string {
  if (courtName.includes('Supreme')) return 'supreme';
  if (courtName.includes('Circuit') || courtName.includes('Appeals'))
    return 'appellate';
  if (courtName.includes('District')) return 'district';
  if (courtName.includes('Bankruptcy')) return 'bankruptcy';
  return 'unknown';
}
