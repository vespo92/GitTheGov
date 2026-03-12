'use client';

import { useState } from 'react';
import type {
  LegislationCommit,
  LegislationChangeType,
} from '@constitutional-shrinkage/governance-utils';

interface CommitHistoryProps {
  commits: LegislationCommit[];
  billTitle: string;
  onSelectCommit?: (commit: LegislationCommit) => void;
  onCompareCommits?: (older: LegislationCommit, newer: LegislationCommit) => void;
}

const CHANGE_TYPE_STYLES: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  draft: { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-700' },
  amendment: { label: 'Amendment', bg: 'bg-blue-100', text: 'text-blue-700' },
  edit: { label: 'Edit', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  addition: { label: 'Addition', bg: 'bg-green-100', text: 'text-green-700' },
  removal: { label: 'Removal', bg: 'bg-red-100', text: 'text-red-700' },
  restructure: { label: 'Restructure', bg: 'bg-purple-100', text: 'text-purple-700' },
  merge: { label: 'Merge', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  ratification: { label: 'Ratified', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  repeal: { label: 'Repealed', bg: 'bg-red-200', text: 'text-red-800' },
  sunset: { label: 'Sunset', bg: 'bg-orange-100', text: 'text-orange-700' },
  endorsement: { label: 'Endorsed', bg: 'bg-teal-100', text: 'text-teal-700' },
};

function getChangeStyle(type: LegislationChangeType | string) {
  return CHANGE_TYPE_STYLES[type] || CHANGE_TYPE_STYLES['edit'];
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function countDiffChanges(commit: LegislationCommit): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of commit.diff) {
    for (const change of hunk.changes) {
      if (change.type === 'add') additions++;
      if (change.type === 'delete') deletions++;
    }
  }
  return { additions, deletions };
}

export default function CommitHistory({
  commits,
  billTitle,
  onSelectCommit,
  onCompareCommits,
}: CommitHistoryProps) {
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<LegislationCommit[]>([]);

  // Sort newest first
  const sorted = [...commits].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const handleCompareToggle = (commit: LegislationCommit) => {
    if (!compareMode) return;

    const existing = compareSelection.find((c) => c.hash === commit.hash);
    if (existing) {
      setCompareSelection(compareSelection.filter((c) => c.hash !== commit.hash));
    } else if (compareSelection.length < 2) {
      const updated = [...compareSelection, commit];
      setCompareSelection(updated);
      if (updated.length === 2 && onCompareCommits) {
        const [a, b] = updated.sort(
          (x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime()
        );
        onCompareCommits(a, b);
        setCompareMode(false);
        setCompareSelection([]);
      }
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-100 border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">
            Commit History: {billTitle}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {commits.length} commits tracking every change
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {compareMode ? (
            <>
              <span className="text-sm text-gray-500">
                Select {2 - compareSelection.length} commit{compareSelection.length === 1 ? '' : 's'}
              </span>
              <button
                onClick={() => {
                  setCompareMode(false);
                  setCompareSelection([]);
                }}
                className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setCompareMode(true)}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50"
            >
              Compare Commits
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="divide-y">
        {sorted.map((commit, index) => {
          const style = getChangeStyle(commit.changeType);
          const isExpanded = expandedCommit === commit.hash;
          const isSelected = compareSelection.some((c) => c.hash === commit.hash);
          const { additions, deletions } = countDiffChanges(commit);
          const isFirst = index === sorted.length - 1; // oldest commit

          return (
            <div
              key={commit.hash}
              className={`relative transition ${
                isSelected ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''
              }`}
            >
              {/* Timeline connector */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />
              {isFirst && (
                <div className="absolute left-[18px] bottom-0 w-3 h-3 rounded-full bg-gray-300 border-2 border-white" />
              )}

              <div
                className="flex items-start px-4 py-3 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  if (compareMode) {
                    handleCompareToggle(commit);
                  } else {
                    setExpandedCommit(isExpanded ? null : commit.hash);
                    onSelectCommit?.(commit);
                  }
                }}
              >
                {/* Timeline dot */}
                <div className="relative z-10 mt-1 mr-4">
                  <div
                    className={`w-3 h-3 rounded-full border-2 border-white ${
                      commit.changeType === 'ratification'
                        ? 'bg-emerald-500'
                        : commit.changeType === 'draft'
                        ? 'bg-gray-400'
                        : commit.changeType === 'amendment'
                        ? 'bg-blue-500'
                        : commit.changeType === 'merge'
                        ? 'bg-indigo-500'
                        : 'bg-yellow-500'
                    }`}
                  />
                </div>

                {/* Commit info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 flex-wrap">
                    <span className="font-mono text-sm font-medium text-gray-700">
                      {commit.hash.substring(0, 8)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}
                    >
                      {style.label}
                    </span>
                    {commit.mergeParentHash && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                        merge
                      </span>
                    )}
                    {commit.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-gray-900 mt-1">{commit.message}</p>
                  <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                    <span>{commit.author.name}</span>
                    <span>{formatDate(commit.timestamp)}</span>
                    {(additions > 0 || deletions > 0) && (
                      <span>
                        <span className="text-green-600">+{additions}</span>
                        {' / '}
                        <span className="text-red-600">-{deletions}</span>
                      </span>
                    )}
                    {commit.references.length > 0 && (
                      <span>{commit.references.length} ref(s)</span>
                    )}
                  </div>
                </div>

                {/* Compare checkbox */}
                {compareMode && (
                  <div className="ml-2 mt-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleCompareToggle(commit)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </div>
                )}
              </div>

              {/* Expanded diff preview */}
              {isExpanded && (
                <div className="px-4 pb-3 ml-10">
                  <div className="border rounded-md overflow-hidden bg-white">
                    <div className="bg-gray-50 px-3 py-1.5 border-b text-xs text-gray-500 flex justify-between">
                      <span>
                        Diff: {additions} addition{additions !== 1 ? 's' : ''},{' '}
                        {deletions} deletion{deletions !== 1 ? 's' : ''}
                      </span>
                      <span>
                        Signed by: {commit.committer.name} ({commit.committer.role})
                      </span>
                    </div>
                    <div className="font-mono text-xs max-h-64 overflow-y-auto">
                      {commit.diff.flatMap((hunk) =>
                        hunk.changes.map((change, idx) => (
                          <div
                            key={`${hunk.oldStart}-${idx}`}
                            className={`px-3 py-0.5 ${
                              change.type === 'add'
                                ? 'bg-green-50 text-green-800'
                                : change.type === 'delete'
                                ? 'bg-red-50 text-red-800'
                                : ''
                            }`}
                          >
                            <span className="text-gray-400 mr-2 select-none">
                              {change.type === 'add'
                                ? '+'
                                : change.type === 'delete'
                                ? '-'
                                : ' '}
                            </span>
                            {change.content}
                          </div>
                        ))
                      )}
                    </div>
                    {commit.references.length > 0 && (
                      <div className="bg-gray-50 px-3 py-1.5 border-t text-xs text-gray-500">
                        <strong>References:</strong>{' '}
                        {commit.references.map((ref, i) => (
                          <span key={i}>
                            {i > 0 && ', '}
                            [{ref.type}] {ref.description}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="bg-gray-50 border-t px-4 py-2 text-xs text-gray-500 flex justify-between">
        <span>
          First commit: {sorted.length > 0 ? formatDate(sorted[sorted.length - 1].timestamp) : 'N/A'}
        </span>
        <span>
          Latest commit: {sorted.length > 0 ? formatDate(sorted[0].timestamp) : 'N/A'}
        </span>
      </div>
    </div>
  );
}
