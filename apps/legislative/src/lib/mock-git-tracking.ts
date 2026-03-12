/**
 * Mock Git Tracking Data
 *
 * Realistic commit histories and blame data for development.
 * Shows how every line of legislation traces back to its author.
 */

import type {
  LegislationCommit,
  LegislationAuthor,
  LegislationBlame,
  LegislationChangeType,
  BlameLine,
} from '@constitutional-shrinkage/governance-utils';
import {
  createInitialCommit,
  createCommit,
  generateBlame,
  LegislationChangeType as ChangeType,
} from '@constitutional-shrinkage/governance-utils';

// ─────────────────────────────────────────────────────────────────────────────
// Authors
// ─────────────────────────────────────────────────────────────────────────────

export const mockAuthors: Record<string, LegislationAuthor> = {
  'jane-smith': {
    id: 'citizen-001',
    name: 'Jane Smith',
    publicKey: 'pk_jane_abc123',
    role: 'sponsor',
    regionId: 'region-national',
  },
  'alex-johnson': {
    id: 'citizen-004',
    name: 'Alex Johnson',
    publicKey: 'pk_alex_def456',
    role: 'citizen',
    regionId: 'region-northeast',
  },
  'maria-garcia': {
    id: 'citizen-007',
    name: 'Maria Garcia',
    publicKey: 'pk_maria_ghi789',
    role: 'committee-chair',
    regionId: 'region-northeast',
  },
  'robert-chen': {
    id: 'citizen-012',
    name: 'Robert Chen',
    publicKey: 'pk_robert_jkl012',
    role: 'citizen',
    regionId: 'region-west',
  },
  'linda-williams': {
    id: 'citizen-015',
    name: 'Linda Williams',
    publicKey: 'pk_linda_mno345',
    role: 'sponsor',
    regionId: 'region-southeast',
  },
  'david-kumar': {
    id: 'citizen-020',
    name: 'David Kumar',
    publicKey: 'pk_david_pqr678',
    role: 'legal-counsel',
    regionId: 'region-national',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Clean Energy Transition Act — commit history
// ─────────────────────────────────────────────────────────────────────────────

const cleanEnergyV1 = `# Clean Energy Transition Act

## Purpose
To establish a framework for transitioning to 100% renewable energy by 2035.

## Section 1: Renewable Energy Standards
All electrical utilities shall derive at least:
- 50% of power from renewable sources by 2028
- 75% of power from renewable sources by 2032
- 100% of power from renewable sources by 2035`;

const cleanEnergyV2 = `# Clean Energy Transition Act

## Purpose
To establish a framework for transitioning to 100% renewable energy by 2035.

## Section 1: Renewable Energy Standards
All electrical utilities shall derive at least:
- 50% of power from renewable sources by 2028
- 75% of power from renewable sources by 2032
- 100% of power from renewable sources by 2035

## Section 2: Incentives
Tax credits of 30% for:
- Solar panel installations
- Wind turbine deployment
- Battery storage systems`;

const cleanEnergyV3 = `# Clean Energy Transition Act

## Purpose
To establish a framework for transitioning to 100% renewable energy by 2035.

## Section 1: Renewable Energy Standards
All electrical utilities shall derive at least:
- 50% of power from renewable sources by 2028
- 75% of power from renewable sources by 2032
- 100% of power from renewable sources by 2035

## Section 2: Incentives
Tax credits of 30% for:
- Solar panel installations
- Wind turbine deployment
- Battery storage systems

## Section 3: Enforcement
The Department of Energy shall:
- Monitor compliance quarterly
- Issue fines for non-compliance
- Publish annual progress reports`;

const cleanEnergyV4 = `# Clean Energy Transition Act

## Purpose
To establish a framework for transitioning to 100% renewable energy by 2035.

## Section 1: Renewable Energy Standards
All electrical utilities shall derive at least:
- 50% of power from renewable sources by 2028
- 75% of power from renewable sources by 2032
- 100% of power from renewable sources by 2035
- Rural utilities: 100% renewable by 2038

## Section 2: Incentives
Tax credits of 30% for:
- Solar panel installations
- Wind turbine deployment
- Battery storage systems
- Geothermal energy projects

## Section 3: Enforcement
The Department of Energy shall:
- Monitor compliance quarterly
- Issue fines for non-compliance
- Publish annual progress reports

## Section 4: Rural Transition Support
Rural electrical cooperatives shall receive:
- Extended timelines as outlined in Section 1
- Additional 15% tax credit on top of Section 2 incentives
- Technical assistance grants up to $500,000 per cooperative`;

function buildCleanEnergyCommits(): LegislationCommit[] {
  const commits: LegislationCommit[] = [];

  // Commit 1: Initial draft by Jane Smith
  const c1 = createInitialCommit({
    billId: 'bill-001',
    content: cleanEnergyV1,
    author: mockAuthors['jane-smith'],
    message: 'Initial draft: Clean Energy Transition Act with renewable energy standards',
    references: [],
  });
  c1.timestamp = new Date('2025-01-15T09:00:00Z');
  commits.push(c1);

  // Commit 2: Alex Johnson adds Section 2 (incentives)
  const c2 = createCommit({
    billId: 'bill-001',
    parentCommit: c1,
    newContent: cleanEnergyV2,
    author: mockAuthors['alex-johnson'],
    changeType: ChangeType.ADDITION,
    message: 'Add Section 2: Tax incentives for renewable energy installations',
    references: [
      { type: 'public-comment', id: 'comment-042', description: 'Citizen feedback requesting incentive structure' },
    ],
  });
  c2.timestamp = new Date('2025-01-22T14:30:00Z');
  commits.push(c2);

  // Commit 3: David Kumar adds Section 3 (enforcement)
  const c3 = createCommit({
    billId: 'bill-001',
    parentCommit: c2,
    newContent: cleanEnergyV3,
    author: mockAuthors['david-kumar'],
    committer: mockAuthors['jane-smith'],
    changeType: ChangeType.ADDITION,
    message: 'Add Section 3: Enforcement mechanisms for compliance monitoring',
    references: [
      { type: 'committee-review', id: 'review-007', description: 'Energy Committee legal review' },
    ],
    tags: ['committee-reviewed'],
  });
  c3.timestamp = new Date('2025-01-28T10:15:00Z');
  commits.push(c3);

  // Commit 4: Maria Garcia amends with rural provisions
  const c4 = createCommit({
    billId: 'bill-001',
    parentCommit: c3,
    newContent: cleanEnergyV4,
    author: mockAuthors['maria-garcia'],
    committer: mockAuthors['jane-smith'],
    changeType: ChangeType.AMENDMENT,
    message: 'Amendment: Add rural utility provisions with extended timelines and additional support',
    references: [
      { type: 'amendment', id: 'amendment-001', description: 'Rural Utilities Amendment' },
      { type: 'vote-session', id: 'vote-session-012', description: 'Amendment approval vote (87% in favor)' },
    ],
    tags: ['amendment-approved', 'rural-provisions'],
  });
  c4.timestamp = new Date('2025-02-05T16:45:00Z');
  commits.push(c4);

  return commits;
}

export const cleanEnergyCommits = buildCleanEnergyCommits();
export const cleanEnergyBlame = generateBlame(cleanEnergyCommits);

// ─────────────────────────────────────────────────────────────────────────────
// Digital Privacy Protection Act — commit history
// ─────────────────────────────────────────────────────────────────────────────

const privacyV1 = `# Digital Privacy Protection Act

## Purpose
To protect citizen data and establish digital privacy rights.

## Section 1: Data Rights
Citizens have the right to:
- Access all personal data held by organizations
- Request deletion of personal data
- Opt-out of data collection
- Port data to other services`;

const privacyV2 = `# Digital Privacy Protection Act

## Purpose
To protect citizen data and establish digital privacy rights.

## Section 1: Data Rights
Citizens have the right to:
- Access all personal data held by organizations
- Request deletion of personal data
- Opt-out of data collection
- Port data to other services

## Section 2: Requirements for Organizations
Organizations must:
- Obtain explicit consent before data collection
- Provide clear privacy policies
- Implement security measures
- Report breaches within 72 hours

## Section 3: Penalties
Violations shall result in:
- First offense: Warning and mandatory compliance plan
- Second offense: Fine up to 4% of annual revenue
- Third offense: Operational restrictions`;

function buildPrivacyCommits(): LegislationCommit[] {
  const commits: LegislationCommit[] = [];

  const c1 = createInitialCommit({
    billId: 'bill-002',
    content: privacyV1,
    author: mockAuthors['alex-johnson'],
    message: 'Initial draft: Digital Privacy Protection Act establishing core data rights',
  });
  c1.timestamp = new Date('2025-03-01T08:00:00Z');
  commits.push(c1);

  const c2 = createCommit({
    billId: 'bill-002',
    parentCommit: c1,
    newContent: privacyV2,
    author: mockAuthors['david-kumar'],
    committer: mockAuthors['alex-johnson'],
    changeType: ChangeType.ADDITION,
    message: 'Add organizational requirements (Section 2) and penalty structure (Section 3)',
    references: [
      { type: 'committee-review', id: 'review-015', description: 'Privacy Committee legal review' },
      { type: 'public-comment', id: 'comment-108', description: '247 public comments reviewed' },
    ],
    tags: ['committee-reviewed', 'public-comment-period-complete'],
  });
  c2.timestamp = new Date('2025-03-15T11:30:00Z');
  commits.push(c2);

  return commits;
}

export const privacyCommits = buildPrivacyCommits();
export const privacyBlame = generateBlame(privacyCommits);

// ─────────────────────────────────────────────────────────────────────────────
// Commit index by bill ID
// ─────────────────────────────────────────────────────────────────────────────

export const commitsByBillId: Record<string, LegislationCommit[]> = {
  'bill-001': cleanEnergyCommits,
  'bill-002': privacyCommits,
};

export const blameByBillId: Record<string, LegislationBlame> = {
  'bill-001': cleanEnergyBlame,
  'bill-002': privacyBlame,
};
