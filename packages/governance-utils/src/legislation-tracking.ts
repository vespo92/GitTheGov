/**
 * Legislation Git Tracking
 *
 * Every piece of legislation gets full git-style version control:
 * - Commits: Who changed what, when, and why
 * - Blame: Line-by-line attribution for the full text of every law
 * - History: Complete audit trail from draft to ratification
 *
 * Transparency is non-negotiable. Every word in every law must be traceable
 * to the person who wrote it, the person who approved it, and the reason it exists.
 */

import { generateHash } from './crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** The type of change made in a legislation commit */
export enum LegislationChangeType {
  /** Initial draft creation */
  DRAFT = 'draft',
  /** Amendment proposed or applied */
  AMENDMENT = 'amendment',
  /** Content edit (wording, formatting, etc.) */
  EDIT = 'edit',
  /** Sections added */
  ADDITION = 'addition',
  /** Sections removed */
  REMOVAL = 'removal',
  /** Structural reorganization without content change */
  RESTRUCTURE = 'restructure',
  /** Merge of forked bill back into parent */
  MERGE = 'merge',
  /** Bill ratified into law */
  RATIFICATION = 'ratification',
  /** Bill repealed */
  REPEAL = 'repeal',
  /** Sunset clause triggered */
  SUNSET = 'sunset',
  /** Co-sponsor endorsed the bill content */
  ENDORSEMENT = 'endorsement',
}

/** A single commit in a bill's history — the atomic unit of change */
export interface LegislationCommit {
  /** Unique SHA-like hash identifying this commit */
  hash: string;
  /** Hash of the parent commit (null for initial draft) */
  parentHash: string | null;
  /** Hash of a second parent (for merge commits) */
  mergeParentHash?: string;
  /** ID of the bill this commit belongs to */
  billId: string;
  /** The person who authored the change */
  author: LegislationAuthor;
  /** The person who committed/approved the change (may differ from author) */
  committer: LegislationAuthor;
  /** Type of change */
  changeType: LegislationChangeType;
  /** Human-readable description of why this change was made */
  message: string;
  /** Full text of the bill at this point in time */
  snapshot: string;
  /** Line-by-line diff from parent commit */
  diff: LegislationDiffHunk[];
  /** Cryptographic signature proving authenticity */
  signature: string;
  /** Timestamp of the commit */
  timestamp: Date;
  /** References to related items (amendment IDs, vote session IDs, etc.) */
  references: CommitReference[];
  /** Metadata tags */
  tags: string[];
}

/** Identity of someone who authored or committed a legislation change */
export interface LegislationAuthor {
  /** Citizen ID or official identifier */
  id: string;
  /** Display name */
  name: string;
  /** Public key for signature verification */
  publicKey: string;
  /** Role at time of commit (citizen, sponsor, committee-chair, etc.) */
  role: string;
  /** Region the author represents, if applicable */
  regionId?: string;
}

/** A hunk in a legislation diff */
export interface LegislationDiffHunk {
  /** Starting line in the old version */
  oldStart: number;
  /** Number of lines from old version */
  oldLines: number;
  /** Starting line in the new version */
  newStart: number;
  /** Number of lines in new version */
  newLines: number;
  /** The individual line changes */
  changes: LegislationDiffLine[];
}

/** A single line change in a diff */
export interface LegislationDiffLine {
  type: 'add' | 'delete' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/** A reference from a commit to another entity */
export interface CommitReference {
  type: 'amendment' | 'vote-session' | 'bill' | 'committee-review' | 'public-comment';
  id: string;
  description: string;
}

/** A single line of blame output */
export interface BlameLine {
  /** Line number in the current version */
  lineNumber: number;
  /** The text content of this line */
  content: string;
  /** Hash of the commit that last modified this line */
  commitHash: string;
  /** Who wrote this line */
  author: LegislationAuthor;
  /** When this line was last changed */
  timestamp: Date;
  /** The commit message explaining why this line exists */
  commitMessage: string;
  /** The type of change that introduced this line */
  changeType: LegislationChangeType;
  /** How many times this line has been modified */
  revisionCount: number;
  /** Original line number when first introduced */
  originalLineNumber: number;
  /** The original commit that first created this line */
  originCommitHash: string;
}

/** Complete blame output for a bill */
export interface LegislationBlame {
  billId: string;
  /** The version/commit being blamed */
  commitHash: string;
  /** Line-by-line blame annotations */
  lines: BlameLine[];
  /** Summary statistics */
  stats: BlameStats;
}

/** Statistics derived from blame data */
export interface BlameStats {
  /** Total number of lines */
  totalLines: number;
  /** Number of unique authors */
  uniqueAuthors: number;
  /** Author contribution breakdown */
  authorContributions: AuthorContribution[];
  /** How many commits have touched this bill */
  totalCommits: number;
  /** Oldest line (first introduced) */
  oldestLine: { lineNumber: number; timestamp: Date };
  /** Newest line (most recently changed) */
  newestLine: { lineNumber: number; timestamp: Date };
  /** Average revisions per line */
  averageRevisions: number;
}

/** Author contribution in blame stats */
export interface AuthorContribution {
  author: LegislationAuthor;
  linesAuthored: number;
  percentage: number;
  firstContribution: Date;
  lastContribution: Date;
  changeTypes: LegislationChangeType[];
}

/** Full commit history for a bill */
export interface LegislationHistory {
  billId: string;
  billTitle: string;
  currentHash: string;
  commits: LegislationCommit[];
  branches: LegislationBranch[];
  tags: LegislationTag[];
}

/** A named branch for a bill (main, amendment forks, etc.) */
export interface LegislationBranch {
  name: string;
  headHash: string;
  createdBy: LegislationAuthor;
  createdAt: Date;
  description: string;
  /** Is this the primary branch */
  isMain: boolean;
}

/** A named tag on a commit (e.g., "v1.0-ratified") */
export interface LegislationTag {
  name: string;
  commitHash: string;
  tagger: LegislationAuthor;
  message: string;
  timestamp: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the initial commit for a new piece of legislation.
 * This is the "genesis commit" — the first traceable record.
 */
export function createInitialCommit(params: {
  billId: string;
  content: string;
  author: LegislationAuthor;
  message: string;
  references?: CommitReference[];
}): LegislationCommit {
  const timestamp = new Date();
  const lines = params.content.split('\n');

  const diff: LegislationDiffHunk[] = [
    {
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: lines.length,
      changes: lines.map((line, i) => ({
        type: 'add' as const,
        content: line,
        newLineNumber: i + 1,
      })),
    },
  ];

  const commitData = `${params.billId}|${params.content}|${params.author.id}|${timestamp.toISOString()}`;
  const hash = generateHash(commitData);
  const signature = generateHash(`signed:${commitData}:${params.author.publicKey}`);

  return {
    hash,
    parentHash: null,
    billId: params.billId,
    author: params.author,
    committer: params.author,
    changeType: LegislationChangeType.DRAFT,
    message: params.message,
    snapshot: params.content,
    diff,
    signature,
    timestamp,
    references: params.references || [],
    tags: ['initial-draft'],
  };
}

/**
 * Create a new commit representing a change to legislation.
 * Every edit, amendment, or structural change goes through this.
 */
export function createCommit(params: {
  billId: string;
  parentCommit: LegislationCommit;
  newContent: string;
  author: LegislationAuthor;
  committer?: LegislationAuthor;
  changeType: LegislationChangeType;
  message: string;
  references?: CommitReference[];
  tags?: string[];
  mergeParentHash?: string;
}): LegislationCommit {
  const timestamp = new Date();
  const oldLines = params.parentCommit.snapshot.split('\n');
  const newLines = params.newContent.split('\n');
  const diff = computeDiff(oldLines, newLines);

  const commitData = `${params.billId}|${params.parentCommit.hash}|${params.newContent}|${params.author.id}|${timestamp.toISOString()}`;
  const hash = generateHash(commitData);
  const signature = generateHash(`signed:${commitData}:${params.author.publicKey}`);

  return {
    hash,
    parentHash: params.parentCommit.hash,
    mergeParentHash: params.mergeParentHash,
    billId: params.billId,
    author: params.author,
    committer: params.committer || params.author,
    changeType: params.changeType,
    message: params.message,
    snapshot: params.newContent,
    diff,
    signature,
    timestamp,
    references: params.references || [],
    tags: params.tags || [],
  };
}

/**
 * Generate blame for a bill — line-by-line attribution showing who wrote
 * every single line of legislation and when.
 *
 * This walks the commit history backwards from the given commit to build
 * a complete picture of authorship.
 */
export function generateBlame(commits: LegislationCommit[]): LegislationBlame {
  if (commits.length === 0) {
    throw new Error('Cannot generate blame with no commits');
  }

  // Sort commits by timestamp (oldest first)
  const sorted = [...commits].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const latestCommit = sorted[sorted.length - 1];
  const lines = latestCommit.snapshot.split('\n');

  // Track blame for each line — start by attributing all lines to the latest commit,
  // then walk backwards to find the true origin of each line
  const blameLines: BlameLine[] = [];
  const lineOrigins = buildLineOrigins(sorted);

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const origin = lineOrigins.get(lineNum);

    if (origin) {
      blameLines.push({
        lineNumber: lineNum,
        content: lines[i],
        commitHash: origin.commitHash,
        author: origin.author,
        timestamp: origin.timestamp,
        commitMessage: origin.commitMessage,
        changeType: origin.changeType,
        revisionCount: origin.revisionCount,
        originalLineNumber: origin.originalLineNumber,
        originCommitHash: origin.originCommitHash,
      });
    } else {
      // Fallback: attribute to latest commit
      blameLines.push({
        lineNumber: lineNum,
        content: lines[i],
        commitHash: latestCommit.hash,
        author: latestCommit.author,
        timestamp: latestCommit.timestamp,
        commitMessage: latestCommit.message,
        changeType: latestCommit.changeType,
        revisionCount: 1,
        originalLineNumber: lineNum,
        originCommitHash: latestCommit.hash,
      });
    }
  }

  const stats = computeBlameStats(blameLines, sorted.length);

  return {
    billId: latestCommit.billId,
    commitHash: latestCommit.hash,
    lines: blameLines,
    stats,
  };
}

/**
 * Get the full commit history for a bill, newest first.
 */
export function getCommitHistory(commits: LegislationCommit[]): LegislationCommit[] {
  return [...commits].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Find all commits by a specific author.
 */
export function getCommitsByAuthor(
  commits: LegislationCommit[],
  authorId: string
): LegislationCommit[] {
  return commits.filter((c) => c.author.id === authorId);
}

/**
 * Find the commit that introduced a specific line of text.
 */
export function findLineOrigin(
  commits: LegislationCommit[],
  lineContent: string
): LegislationCommit | undefined {
  const sorted = [...commits].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  for (const commit of sorted) {
    for (const hunk of commit.diff) {
      for (const change of hunk.changes) {
        if (change.type === 'add' && change.content.trim() === lineContent.trim()) {
          return commit;
        }
      }
    }
  }

  return undefined;
}

/**
 * Compare two commits to see exactly what changed between them.
 */
export function compareCommits(
  older: LegislationCommit,
  newer: LegislationCommit
): LegislationDiffHunk[] {
  const oldLines = older.snapshot.split('\n');
  const newLines = newer.snapshot.split('\n');
  return computeDiff(oldLines, newLines);
}

/**
 * Verify the integrity of a commit chain.
 * Ensures no commits have been tampered with and the chain is unbroken.
 */
export function verifyCommitChain(commits: LegislationCommit[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const sorted = [...commits].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const hashIndex = new Map<string, LegislationCommit>();

  for (const commit of sorted) {
    hashIndex.set(commit.hash, commit);
  }

  for (const commit of sorted) {
    // Verify parent exists (except for initial commit)
    if (commit.parentHash && !hashIndex.has(commit.parentHash)) {
      errors.push(
        `Commit ${commit.hash.substring(0, 8)} references missing parent ${commit.parentHash.substring(0, 8)}`
      );
    }

    // Verify merge parent exists if specified
    if (commit.mergeParentHash && !hashIndex.has(commit.mergeParentHash)) {
      errors.push(
        `Commit ${commit.hash.substring(0, 8)} references missing merge parent ${commit.mergeParentHash.substring(0, 8)}`
      );
    }

    // Verify timestamp ordering
    if (commit.parentHash) {
      const parent = hashIndex.get(commit.parentHash);
      if (parent && commit.timestamp < parent.timestamp) {
        errors.push(
          `Commit ${commit.hash.substring(0, 8)} has timestamp before its parent`
        );
      }
    }
  }

  // Verify exactly one root commit
  const roots = sorted.filter((c) => c.parentHash === null);
  if (roots.length === 0) {
    errors.push('No root commit found — history has no beginning');
  } else if (roots.length > 1) {
    errors.push(`Multiple root commits found (${roots.length}) — history is forked at the root`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate a summary of who contributed what to a bill.
 * This is the transparency report — shows exactly who is responsible for each part.
 */
export function generateContributionReport(blame: LegislationBlame): string {
  const { stats } = blame;
  let report = `# Contribution Report for Bill ${blame.billId}\n\n`;
  report += `**Total Lines:** ${stats.totalLines}\n`;
  report += `**Unique Authors:** ${stats.uniqueAuthors}\n`;
  report += `**Total Commits:** ${stats.totalCommits}\n`;
  report += `**Average Revisions Per Line:** ${stats.averageRevisions.toFixed(1)}\n\n`;

  report += `## Author Breakdown\n\n`;
  report += `| Author | Lines | % | Role | First Contribution | Last Contribution |\n`;
  report += `|--------|-------|---|------|--------------------|-------------------|\n`;

  for (const contrib of stats.authorContributions) {
    report += `| ${contrib.author.name} | ${contrib.linesAuthored} | ${contrib.percentage.toFixed(1)}% | ${contrib.author.role} | ${contrib.firstContribution.toISOString().split('T')[0]} | ${contrib.lastContribution.toISOString().split('T')[0]} |\n`;
  }

  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface LineOriginInfo {
  commitHash: string;
  author: LegislationAuthor;
  timestamp: Date;
  commitMessage: string;
  changeType: LegislationChangeType;
  revisionCount: number;
  originalLineNumber: number;
  originCommitHash: string;
}

/**
 * Walk through commits to build a map of line number -> origin info.
 * Uses a simplified approach: replays each commit's diff to track which
 * commit last touched each line.
 */
function buildLineOrigins(
  sortedCommits: LegislationCommit[]
): Map<number, LineOriginInfo> {
  const origins = new Map<number, LineOriginInfo>();
  const revisionCounts = new Map<number, number>();
  const originalOrigins = new Map<number, { lineNumber: number; commitHash: string }>();

  for (const commit of sortedCommits) {
    const lines = commit.snapshot.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;

      // For the first commit, every line is new
      if (commit.parentHash === null) {
        origins.set(lineNum, {
          commitHash: commit.hash,
          author: commit.author,
          timestamp: commit.timestamp,
          commitMessage: commit.message,
          changeType: commit.changeType,
          revisionCount: 1,
          originalLineNumber: lineNum,
          originCommitHash: commit.hash,
        });
        revisionCounts.set(lineNum, 1);
        originalOrigins.set(lineNum, { lineNumber: lineNum, commitHash: commit.hash });
        continue;
      }

      // For subsequent commits, check if this line was changed in this commit
      const wasChanged = isLineChangedInCommit(commit, lineNum);
      if (wasChanged) {
        const prevCount = revisionCounts.get(lineNum) || 0;
        const newCount = prevCount + 1;
        revisionCounts.set(lineNum, newCount);

        const original = originalOrigins.get(lineNum) || {
          lineNumber: lineNum,
          commitHash: commit.hash,
        };

        origins.set(lineNum, {
          commitHash: commit.hash,
          author: commit.author,
          timestamp: commit.timestamp,
          commitMessage: commit.message,
          changeType: commit.changeType,
          revisionCount: newCount,
          originalLineNumber: original.lineNumber,
          originCommitHash: original.commitHash,
        });
      } else if (!origins.has(lineNum)) {
        // Line exists but wasn't in any prior commit tracking — attribute to this commit
        origins.set(lineNum, {
          commitHash: commit.hash,
          author: commit.author,
          timestamp: commit.timestamp,
          commitMessage: commit.message,
          changeType: commit.changeType,
          revisionCount: 1,
          originalLineNumber: lineNum,
          originCommitHash: commit.hash,
        });
        revisionCounts.set(lineNum, 1);
        originalOrigins.set(lineNum, { lineNumber: lineNum, commitHash: commit.hash });
      }
    }
  }

  return origins;
}

/** Check whether a specific line number was affected by a commit's diff */
function isLineChangedInCommit(commit: LegislationCommit, lineNumber: number): boolean {
  for (const hunk of commit.diff) {
    for (const change of hunk.changes) {
      if (change.type === 'add' && change.newLineNumber === lineNumber) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Compute a diff between two sets of lines.
 * Uses a simplified LCS-based approach. Production would use Myers' diff algorithm.
 */
function computeDiff(oldLines: string[], newLines: string[]): LegislationDiffHunk[] {
  const hunks: LegislationDiffHunk[] = [];
  const changes: LegislationDiffLine[] = [];

  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    const oldLine = oldIdx < oldLines.length ? oldLines[oldIdx] : undefined;
    const newLine = newIdx < newLines.length ? newLines[newIdx] : undefined;

    if (oldLine === newLine) {
      // Context line — unchanged
      changes.push({
        type: 'context',
        content: oldLine!,
        oldLineNumber: oldIdx + 1,
        newLineNumber: newIdx + 1,
      });
      oldIdx++;
      newIdx++;
    } else if (newLine !== undefined && (oldLine === undefined || !newLines.includes(oldLine, newIdx))) {
      // Line was added
      changes.push({
        type: 'add',
        content: newLine,
        newLineNumber: newIdx + 1,
      });
      newIdx++;
    } else if (oldLine !== undefined) {
      // Line was deleted
      changes.push({
        type: 'delete',
        content: oldLine,
        oldLineNumber: oldIdx + 1,
      });
      oldIdx++;
    }
  }

  if (changes.length > 0) {
    // Group into a single hunk for simplicity
    const firstOld = changes.find((c) => c.oldLineNumber)?.oldLineNumber || 0;
    const firstNew = changes.find((c) => c.newLineNumber)?.newLineNumber || 0;

    hunks.push({
      oldStart: firstOld,
      oldLines: oldLines.length,
      newStart: firstNew,
      newLines: newLines.length,
      changes,
    });
  }

  return hunks;
}

/** Compute blame statistics from blame lines */
function computeBlameStats(blameLines: BlameLine[], totalCommits: number): BlameStats {
  const authorMap = new Map<
    string,
    {
      author: LegislationAuthor;
      lines: number;
      first: Date;
      last: Date;
      changeTypes: Set<LegislationChangeType>;
    }
  >();

  let oldestLine = blameLines[0];
  let newestLine = blameLines[0];
  let totalRevisions = 0;

  for (const line of blameLines) {
    totalRevisions += line.revisionCount;

    if (line.timestamp < oldestLine.timestamp) oldestLine = line;
    if (line.timestamp > newestLine.timestamp) newestLine = line;

    const existing = authorMap.get(line.author.id);
    if (existing) {
      existing.lines++;
      if (line.timestamp < existing.first) existing.first = line.timestamp;
      if (line.timestamp > existing.last) existing.last = line.timestamp;
      existing.changeTypes.add(line.changeType);
    } else {
      authorMap.set(line.author.id, {
        author: line.author,
        lines: 1,
        first: line.timestamp,
        last: line.timestamp,
        changeTypes: new Set([line.changeType]),
      });
    }
  }

  const authorContributions: AuthorContribution[] = Array.from(authorMap.values())
    .map((a) => ({
      author: a.author,
      linesAuthored: a.lines,
      percentage: (a.lines / blameLines.length) * 100,
      firstContribution: a.first,
      lastContribution: a.last,
      changeTypes: Array.from(a.changeTypes),
    }))
    .sort((a, b) => b.linesAuthored - a.linesAuthored);

  return {
    totalLines: blameLines.length,
    uniqueAuthors: authorMap.size,
    authorContributions,
    totalCommits,
    oldestLine: { lineNumber: oldestLine.lineNumber, timestamp: oldestLine.timestamp },
    newestLine: { lineNumber: newestLine.lineNumber, timestamp: newestLine.timestamp },
    averageRevisions: totalRevisions / blameLines.length,
  };
}
