/**
 * Bill-to-Commits Normalizer
 *
 * This is the bridge — it takes raw bill data from any external source
 * (Congress.gov, GovInfo, LegiScan, OpenStates) and converts it into
 * our LegislationCommit format with full authorship attribution.
 *
 * The key insight: a bill's legislative actions (introduction, committee
 * referral, amendments, votes, passage) map directly to commits.
 * Each action is a commit. Each sponsor is an author. Every line of
 * text can be traced to who introduced it.
 */

import {
  createInitialCommit,
  createCommit,
  generateBlame,
  LegislationChangeType,
} from '@constitutional-shrinkage/governance-utils';
import type {
  LegislationCommit,
  LegislationAuthor,
  LegislationBlame,
  CommitReference,
} from '@constitutional-shrinkage/governance-utils';

import type { RawBillRecord, RawAction, RawAmendment, RawSponsor } from '../types/index.js';

/** Result of normalizing a raw bill into commits */
export interface NormalizedBill {
  /** Internal bill ID (generated or mapped) */
  billId: string;
  /** The external bill record */
  raw: RawBillRecord;
  /** The commit chain for this bill */
  commits: LegislationCommit[];
  /** Pre-computed blame for the latest version */
  blame: LegislationBlame | null;
  /** Authors mapped from sponsors */
  authors: LegislationAuthor[];
}

/**
 * Convert a raw bill record into a chain of LegislationCommits.
 *
 * Strategy:
 * 1. The initial bill text = genesis commit (author = primary sponsor)
 * 2. Each text version = a new commit showing the bill's evolution
 * 3. Amendments = amendment-type commits
 * 4. Key actions (committee passage, floor vote, enrollment) = tagged commits
 * 5. Final passage / ratification = ratification commit
 */
export function normalizeBillToCommits(raw: RawBillRecord): NormalizedBill {
  const billId = `${raw.source}-${raw.externalId}`;
  const authors = mapSponsorsToAuthors(raw.sponsors);
  const primaryAuthor = authors.find((a) => a.role === 'sponsor') || authors[0];

  if (!primaryAuthor) {
    // Bill has no sponsors — create a placeholder
    return {
      billId,
      raw,
      commits: [],
      blame: null,
      authors: [],
    };
  }

  const commits: LegislationCommit[] = [];
  const billText = raw.textContent || raw.title; // Use full text if available, else title

  // ── Commit 1: Initial introduction ──────────────────────────────────────
  const introDate = parseDate(raw.introducedDate);
  const introAction = raw.actions.find(
    (a) =>
      a.type?.toLowerCase().includes('introduction') ||
      a.description.toLowerCase().includes('introduced') ||
      a.description.toLowerCase().includes('filed') ||
      a.order === 0
  );

  const initialCommit = createInitialCommit({
    billId,
    content: billText,
    author: primaryAuthor,
    message: introAction?.description || `Introduced: ${raw.title}`,
    references: buildReferences(raw, 'introduction'),
  });
  initialCommit.timestamp = introDate;
  initialCommit.tags = ['introduced', raw.billNumber];
  commits.push(initialCommit);

  // ── Commits from actions (excluding intro) ──────────────────────────────
  // Group significant actions into commits
  const significantActions = raw.actions
    .filter((a, i) => i > 0 || a !== introAction)
    .filter((a) => isSignificantAction(a));

  let previousCommit = initialCommit;
  let lastContent = billText;

  for (const action of significantActions) {
    const changeType = classifyAction(action);
    const actionAuthor = findActionAuthor(action, authors, primaryAuthor);
    const actionDate = parseDate(action.date);

    // Skip actions before the intro date
    if (actionDate < introDate) continue;

    const commit = createCommit({
      billId,
      parentCommit: previousCommit,
      newContent: lastContent, // Same text unless we have a new version
      author: actionAuthor,
      changeType,
      message: action.description,
      references: [
        {
          type: 'bill',
          id: raw.externalId,
          description: action.description,
        },
      ],
      tags: buildActionTags(action),
    });
    commit.timestamp = actionDate;
    commits.push(commit);
    previousCommit = commit;
  }

  // ── Commits from text versions ──────────────────────────────────────────
  // If we have multiple text versions, each one becomes a commit showing
  // the bill text evolving over time
  if (raw.textVersions.length > 1) {
    for (let i = 1; i < raw.textVersions.length; i++) {
      const version = raw.textVersions[i];
      if (!version.content) continue;

      const versionDate = parseDate(version.date);
      const commit = createCommit({
        billId,
        parentCommit: previousCommit,
        newContent: version.content,
        author: primaryAuthor,
        changeType: LegislationChangeType.EDIT,
        message: `Text updated: ${version.versionName}`,
        tags: [version.versionCode],
      });
      commit.timestamp = versionDate;
      commits.push(commit);
      previousCommit = commit;
      lastContent = version.content;
    }
  }

  // ── Commits from amendments ─────────────────────────────────────────────
  for (const amendment of raw.amendments) {
    const amendmentAuthor = amendment.sponsor
      ? mapSponsorToAuthor(amendment.sponsor)
      : primaryAuthor;

    const amendDate = parseDate(amendment.proposedDate);

    const commit = createCommit({
      billId,
      parentCommit: previousCommit,
      newContent: amendment.textContent || lastContent,
      author: amendmentAuthor,
      changeType: LegislationChangeType.AMENDMENT,
      message: `Amendment ${amendment.number || ''}: ${amendment.title}`.trim(),
      references: [
        {
          type: 'amendment',
          id: amendment.externalId,
          description: amendment.title,
        },
      ],
      tags: [
        `amendment-${amendment.status}`,
        ...(amendment.number ? [`amdt-${amendment.number}`] : []),
      ],
    });
    commit.timestamp = amendDate;
    commits.push(commit);
    previousCommit = commit;

    if (amendment.textContent) {
      lastContent = amendment.textContent;
    }
  }

  // ── Commits from votes ──────────────────────────────────────────────────
  for (const vote of raw.votes) {
    const voteDate = parseDate(vote.date);
    const result = vote.result.toLowerCase();
    const passed = result.includes('pass') || result.includes('agreed') || result.includes('adopted');

    const commit = createCommit({
      billId,
      parentCommit: previousCommit,
      newContent: lastContent,
      author: primaryAuthor,
      changeType: passed ? LegislationChangeType.ENDORSEMENT : LegislationChangeType.EDIT,
      message: `Vote: ${vote.description} — ${vote.result} (${vote.yea}-${vote.nay})`,
      references: [
        {
          type: 'vote-session',
          id: vote.externalId,
          description: `${vote.yea} yea, ${vote.nay} nay, ${vote.abstain} abstain`,
        },
      ],
      tags: [
        `vote-${passed ? 'passed' : 'failed'}`,
        ...(vote.chamber ? [`chamber-${vote.chamber}`] : []),
      ],
    });
    commit.timestamp = voteDate;
    commits.push(commit);
    previousCommit = commit;
  }

  // ── Check for final passage / ratification ──────────────────────────────
  const passageAction = raw.actions.find(
    (a) =>
      a.description.toLowerCase().includes('became public law') ||
      a.description.toLowerCase().includes('signed by president') ||
      a.description.toLowerCase().includes('enacted') ||
      a.description.toLowerCase().includes('approved by governor')
  );

  if (passageAction) {
    const commit = createCommit({
      billId,
      parentCommit: previousCommit,
      newContent: lastContent,
      author: primaryAuthor,
      changeType: LegislationChangeType.RATIFICATION,
      message: passageAction.description,
      tags: ['ratified', 'enacted'],
    });
    commit.timestamp = parseDate(passageAction.date);
    commits.push(commit);
  }

  // Sort commits by timestamp
  commits.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Generate blame if we have text
  let blame: LegislationBlame | null = null;
  if (commits.length > 0 && lastContent) {
    try {
      blame = generateBlame(commits);
    } catch {
      // Blame generation can fail if commit chain is malformed
    }
  }

  return {
    billId,
    raw,
    commits,
    blame,
    authors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Map external sponsors to our LegislationAuthor format */
function mapSponsorsToAuthors(sponsors: RawSponsor[]): LegislationAuthor[] {
  return sponsors.map(mapSponsorToAuthor);
}

function mapSponsorToAuthor(sponsor: RawSponsor): LegislationAuthor {
  return {
    id: sponsor.externalId || sponsor.bioguideId || `unknown-${sponsor.name.replace(/\s+/g, '-')}`,
    name: sponsor.name,
    publicKey: `pending-verification:${sponsor.externalId || sponsor.name}`,
    role: sponsor.role || (sponsor.isPrimary ? 'sponsor' : 'cosponsor'),
    regionId: sponsor.state,
  };
}

/** Determine if a legislative action is significant enough to warrant a commit */
function isSignificantAction(action: RawAction): boolean {
  const desc = action.description.toLowerCase();

  // Always significant
  if (
    desc.includes('passed') ||
    desc.includes('failed') ||
    desc.includes('signed') ||
    desc.includes('vetoed') ||
    desc.includes('enacted') ||
    desc.includes('referred to committee') ||
    desc.includes('reported') ||
    desc.includes('placed on calendar') ||
    desc.includes('amendment') ||
    desc.includes('conference') ||
    desc.includes('enrolled') ||
    desc.includes('presented to president') ||
    desc.includes('approved by governor') ||
    desc.includes('became public law')
  ) {
    return true;
  }

  // Significant by type
  if (action.type) {
    const type = action.type.toLowerCase();
    return (
      type.includes('passage') ||
      type.includes('committee') ||
      type.includes('floor') ||
      type.includes('veto') ||
      type.includes('signed')
    );
  }

  return false;
}

/** Classify an action into a LegislationChangeType */
function classifyAction(action: RawAction): LegislationChangeType {
  const desc = action.description.toLowerCase();

  if (desc.includes('amendment')) return LegislationChangeType.AMENDMENT;
  if (desc.includes('passed') || desc.includes('agreed')) return LegislationChangeType.ENDORSEMENT;
  if (desc.includes('signed') || desc.includes('enacted') || desc.includes('became public law'))
    return LegislationChangeType.RATIFICATION;
  if (desc.includes('vetoed')) return LegislationChangeType.REPEAL;
  if (desc.includes('referred') || desc.includes('committee'))
    return LegislationChangeType.RESTRUCTURE;
  if (desc.includes('reported')) return LegislationChangeType.EDIT;

  return LegislationChangeType.EDIT;
}

/** Find the most appropriate author for an action */
function findActionAuthor(
  action: RawAction,
  authors: LegislationAuthor[],
  fallback: LegislationAuthor
): LegislationAuthor {
  // If the action has an actor, try to match to a known author
  if (action.actor) {
    const matched = authors.find(
      (a) =>
        a.name.toLowerCase().includes(action.actor!.toLowerCase()) ||
        action.actor!.toLowerCase().includes(a.name.toLowerCase())
    );
    if (matched) return matched;
  }

  // Committee actions get attributed to the primary sponsor
  if (action.chamber) {
    const chamberAuthor = authors.find(
      (a) => a.regionId?.toLowerCase() === action.chamber?.toLowerCase()
    );
    if (chamberAuthor) return chamberAuthor;
  }

  return fallback;
}

/** Build references for a specific phase */
function buildReferences(raw: RawBillRecord, phase: string): CommitReference[] {
  const refs: CommitReference[] = [
    {
      type: 'bill',
      id: raw.externalId,
      description: `${raw.source}: ${raw.billNumber} — ${raw.title}`,
    },
  ];

  for (const url of raw.sourceUrls) {
    refs.push({
      type: 'bill',
      id: url,
      description: `Source: ${url}`,
    });
  }

  return refs;
}

/** Build tags from an action */
function buildActionTags(action: RawAction): string[] {
  const tags: string[] = [];
  const desc = action.description.toLowerCase();

  if (desc.includes('committee')) tags.push('committee-action');
  if (desc.includes('passed')) tags.push('passed');
  if (desc.includes('failed')) tags.push('failed');
  if (desc.includes('signed')) tags.push('signed');
  if (desc.includes('vetoed')) tags.push('vetoed');
  if (desc.includes('enrolled')) tags.push('enrolled');
  if (action.chamber) tags.push(`chamber-${action.chamber.toLowerCase()}`);

  return tags;
}

/** Parse a date string into a Date object */
function parseDate(dateStr: string): Date {
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}
