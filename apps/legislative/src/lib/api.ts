/**
 * Legislative API Client
 * Handles all API calls for the legislative application
 *
 * NOTE: Currently using mock data. Will connect to real API when Agent_5 completes backend services.
 */

import {
  createBill,
  forkBill,
  generateDiff,
  parseDiff,
  proposeAmendment,
  mergeBill,
  addCoSponsor,
} from '@constitutional-shrinkage/governance-utils';
import type { LegislationCommit, LegislationBlame } from '@constitutional-shrinkage/governance-utils';
import { LawStatus } from '@constitutional-shrinkage/constitutional-framework';
import type {
  Bill,
  BillFormData,
  BillSearchFilters,
  BillListItem,
  AmendmentFormData,
  VoteCastData,
  ConstitutionalCheckResult,
  ImpactAssessment,
  VoteResults,
  ParsedDiff,
  Amendment,
} from './types';
import { mockBills, mockCitizen } from './mock-data';
import { commitsByBillId, blameByBillId } from './mock-git-tracking';

// Simulated API delay
const simulateDelay = (ms: number = 300) => new Promise(resolve => setTimeout(resolve, ms));

// In-memory storage (will be replaced with real API)
const bills: Bill[] = [...mockBills];

/**
 * Fetch all bills with optional filters
 */
export async function fetchBills(filters?: BillSearchFilters): Promise<BillListItem[]> {
  await simulateDelay();

  let filtered = [...bills];

  if (filters?.status) {
    filtered = filtered.filter(b => b.status === filters.status);
  }
  if (filters?.level) {
    filtered = filtered.filter(b => b.level === filters.level);
  }
  if (filters?.regionId) {
    filtered = filtered.filter(b => b.regionId === filters.regionId);
  }
  if (filters?.sponsor) {
    filtered = filtered.filter(b => b.sponsor.toLowerCase().includes(filters.sponsor!.toLowerCase()));
  }
  if (filters?.searchQuery) {
    const query = filters.searchQuery.toLowerCase();
    filtered = filtered.filter(b =>
      b.title.toLowerCase().includes(query) ||
      b.content.toLowerCase().includes(query)
    );
  }

  return filtered.map(b => ({
    id: b.id,
    title: b.title,
    sponsor: b.sponsor,
    status: b.status,
    level: b.level,
    createdAt: b.createdAt,
    votesFor: b.votes.for,
    votesAgainst: b.votes.against,
    hasConflicts: false, // Would check with detectConflicts in real implementation
  }));
}

/**
 * Fetch a single bill by ID
 */
export async function fetchBill(id: string): Promise<Bill | null> {
  await simulateDelay();
  return bills.find(b => b.id === id) || null;
}

/**
 * Create a new bill
 */
export async function createNewBill(data: BillFormData): Promise<Bill> {
  await simulateDelay(500);

  const newBill = createBill({
    title: data.title,
    content: data.content,
    sponsor: mockCitizen.id,
    level: data.level,
    regionId: data.regionId,
    sunsetYears: data.sunsetYears,
  });

  bills.push(newBill);
  return newBill;
}

/**
 * Fork an existing bill
 */
export async function forkExistingBill(billId: string, proposedChanges: string): Promise<Bill> {
  await simulateDelay(500);

  const originalBill = bills.find(b => b.id === billId);
  if (!originalBill) {
    throw new Error('Bill not found');
  }

  const forkedBill = forkBill(originalBill, mockCitizen.id, proposedChanges);
  bills.push(forkedBill);
  return forkedBill;
}

/**
 * Propose an amendment to a bill
 */
export async function proposeNewAmendment(billId: string, data: AmendmentFormData): Promise<Amendment> {
  await simulateDelay(500);

  const bill = bills.find(b => b.id === billId);
  if (!bill) {
    throw new Error('Bill not found');
  }

  const amendment = proposeAmendment(bill, mockCitizen.id, data.description, data.proposedChanges);
  bill.amendments.push(amendment);
  return amendment;
}

/**
 * Cast a vote on a bill
 */
export async function castVote(data: VoteCastData): Promise<VoteResults> {
  await simulateDelay(500);

  const bill = bills.find(b => b.id === data.billId);
  if (!bill) {
    throw new Error('Bill not found');
  }

  // Update vote counts (simplified - in production would use voting-system package)
  if (data.choice === 'for') {
    bill.votes.for += 1;
  } else if (data.choice === 'against') {
    bill.votes.against += 1;
  } else {
    bill.votes.abstain += 1;
  }
  bill.votes.total += 1;

  // Check if quorum and approval threshold met (simplified)
  bill.votes.quorumMet = bill.votes.total >= 100;
  bill.votes.approvalThresholdMet = bill.votes.for / bill.votes.total >= 0.6;

  return bill.votes as VoteResults;
}

/**
 * Check constitutional compliance of a bill
 */
export async function checkConstitutionalCompliance(billId: string): Promise<ConstitutionalCheckResult> {
  await simulateDelay(800);

  const bill = bills.find(b => b.id === billId);
  if (!bill) {
    throw new Error('Bill not found');
  }

  // Mock constitutional check (in production would use constitutional-framework package)
  const violations: ConstitutionalCheckResult['violations'] = [];
  const warnings: ConstitutionalCheckResult['warnings'] = [];

  // Check for potential violations (simplified keyword analysis)
  const content = bill.content.toLowerCase();

  if (content.includes('mandatory') && content.includes('religion')) {
    violations.push({
      rightId: 'right-001',
      rightTitle: 'Freedom of Religion',
      description: 'Bill may infringe on freedom of religion by mandating religious practices',
      severity: 'critical',
      suggestedFix: 'Remove mandatory religious requirements',
    });
  }

  if (content.includes('surveillance') && !content.includes('warrant')) {
    warnings.push({
      rightId: 'right-002',
      rightTitle: 'Privacy Rights',
      description: 'Surveillance provisions should include warrant requirements',
      recommendation: 'Add explicit warrant requirement for surveillance activities',
    });
  }

  const score = violations.length === 0 ? (warnings.length === 0 ? 100 : 85) : 40;

  return {
    isConstitutional: violations.length === 0,
    violations,
    warnings,
    score,
  };
}

/**
 * Get impact assessment for a bill
 */
export async function getImpactAssessment(_billId: string): Promise<ImpactAssessment> {
  await simulateDelay(1000);

  // Mock impact assessment (in production would use metrics package)
  return {
    prediction: {
      shortTerm: {
        people: 72,
        planet: 65,
        profit: 58,
        composite: 65,
        timestamp: new Date(),
        tradeoffs: [],
      },
      mediumTerm: {
        people: 78,
        planet: 70,
        profit: 62,
        composite: 70,
        timestamp: new Date(),
        tradeoffs: [],
      },
      longTerm: {
        people: 85,
        planet: 75,
        profit: 68,
        composite: 76,
        timestamp: new Date(),
        tradeoffs: [],
      },
      uncertainty: {
        people: { min: 60, max: 90 },
        planet: { min: 55, max: 85 },
        profit: { min: 50, max: 80 },
      },
      assumptions: [
        'Economic conditions remain stable',
        'Implementation follows proposed timeline',
        'Public participation reaches expected levels',
      ],
    },
    confidence: 0.72,
    methodology: 'Machine learning model trained on historical policy outcomes',
    keyFactors: [
      'Regional economic indicators',
      'Historical policy effectiveness',
      'Public sentiment analysis',
      'Environmental impact models',
    ],
  };
}

/**
 * Generate and parse diff between two bill versions
 */
export function getBillDiff(oldContent: string, newContent: string): ParsedDiff {
  const diffStr = generateDiff(oldContent, newContent);
  const parsed = parseDiff(diffStr);

  const lines: ParsedDiff['lines'] = [];
  let lineNum = 1;

  diffStr.split('\n').forEach((line) => {
    if (line.startsWith('+ ')) {
      lines.push({ type: 'addition', content: line.substring(2), lineNumber: lineNum++ });
    } else if (line.startsWith('- ')) {
      lines.push({ type: 'deletion', content: line.substring(2) });
    } else if (line.startsWith('  ')) {
      lines.push({ type: 'unchanged', content: line.substring(2), lineNumber: lineNum++ });
    }
  });

  return {
    lines,
    stats: {
      additions: parsed.additions.length,
      deletions: parsed.deletions.length,
      modifications: parsed.modifications.length,
    },
  };
}

/**
 * Add a co-sponsor to a bill
 */
export async function addBillCoSponsor(billId: string, coSponsorId: string): Promise<Bill> {
  await simulateDelay();

  const billIndex = bills.findIndex(b => b.id === billId);
  if (billIndex === -1) {
    throw new Error('Bill not found');
  }

  bills[billIndex] = addCoSponsor(bills[billIndex], coSponsorId);
  return bills[billIndex];
}

/**
 * Update bill status
 */
export async function updateBillStatus(billId: string, status: LawStatus): Promise<Bill> {
  await simulateDelay();

  const billIndex = bills.findIndex(b => b.id === billId);
  if (billIndex === -1) {
    throw new Error('Bill not found');
  }

  bills[billIndex] = { ...bills[billIndex], status };
  return bills[billIndex];
}

/**
 * Fetch commit history for a bill
 */
export async function fetchBillCommits(billId: string): Promise<LegislationCommit[]> {
  await simulateDelay();
  return commitsByBillId[billId] || [];
}

/**
 * Fetch blame data for a bill
 */
export async function fetchBillBlame(billId: string): Promise<LegislationBlame | null> {
  await simulateDelay();
  return blameByBillId[billId] || null;
}

/**
 * Merge a bill (convert to active law)
 */
export async function mergeBillToLaw(billId: string): Promise<Bill> {
  await simulateDelay(1000);

  const billIndex = bills.findIndex(b => b.id === billId);
  if (billIndex === -1) {
    throw new Error('Bill not found');
  }

  const mergedBill = mergeBill(bills[billIndex]);
  bills[billIndex] = mergedBill;
  return mergedBill;
}
