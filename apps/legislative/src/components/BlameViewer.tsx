'use client';

import { useState, useMemo } from 'react';
import type {
  LegislationBlame,
  BlameLine,
  AuthorContribution,
} from '@constitutional-shrinkage/governance-utils';

interface BlameViewerProps {
  blame: LegislationBlame;
  billTitle: string;
}

/** Color palette for distinguishing authors */
const AUTHOR_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', badge: 'bg-blue-100' },
  { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', badge: 'bg-green-100' },
  { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', badge: 'bg-purple-100' },
  { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', badge: 'bg-amber-100' },
  { bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-700', badge: 'bg-rose-100' },
  { bg: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-700', badge: 'bg-teal-100' },
  { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', badge: 'bg-orange-100' },
  { bg: 'bg-indigo-50', border: 'border-indigo-300', text: 'text-indigo-700', badge: 'bg-indigo-100' },
];

function getAuthorColor(authorId: string, authorIds: string[]) {
  const idx = authorIds.indexOf(authorId);
  return AUTHOR_COLORS[idx % AUTHOR_COLORS.length];
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function BlameViewer({ blame, billTitle }: BlameViewerProps) {
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [highlightedAuthor, setHighlightedAuthor] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(true);

  const authorIds = useMemo(
    () => blame.stats.authorContributions.map((c) => c.author.id),
    [blame.stats.authorContributions]
  );

  const selectedBlame = selectedLine
    ? blame.lines.find((l) => l.lineNumber === selectedLine)
    : null;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-100 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">
              Git Blame: {billTitle}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {blame.stats.totalLines} lines | {blame.stats.uniqueAuthors} authors | {blame.stats.totalCommits} commits
            </p>
          </div>
          <button
            onClick={() => setShowStats(!showStats)}
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 transition"
          >
            {showStats ? 'Hide' : 'Show'} Stats
          </button>
        </div>
      </div>

      {/* Author Contribution Stats */}
      {showStats && (
        <div className="bg-gray-50 border-b px-4 py-3">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Author Contributions</h4>
          <div className="space-y-2">
            {blame.stats.authorContributions.map((contrib) => (
              <ContributionBar
                key={contrib.author.id}
                contribution={contrib}
                color={getAuthorColor(contrib.author.id, authorIds)}
                isHighlighted={highlightedAuthor === contrib.author.id}
                onHover={() => setHighlightedAuthor(contrib.author.id)}
                onLeave={() => setHighlightedAuthor(null)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Blame Content */}
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-sm">
          <tbody>
            {blame.lines.map((line) => {
              const color = getAuthorColor(line.author.id, authorIds);
              const isSelected = selectedLine === line.lineNumber;
              const isAuthorHighlighted = highlightedAuthor === line.author.id;
              const isDimmed = highlightedAuthor && !isAuthorHighlighted;

              return (
                <tr
                  key={line.lineNumber}
                  className={`cursor-pointer border-b border-gray-100 transition-colors ${
                    isSelected
                      ? 'ring-2 ring-inset ring-blue-400'
                      : ''
                  } ${
                    isAuthorHighlighted
                      ? color.bg
                      : isDimmed
                      ? 'opacity-40'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() =>
                    setSelectedLine(isSelected ? null : line.lineNumber)
                  }
                >
                  {/* Commit hash */}
                  <td className={`px-2 py-0.5 text-xs whitespace-nowrap border-r ${color.text}`}>
                    {line.commitHash.substring(0, 8)}
                  </td>
                  {/* Author */}
                  <td className={`px-2 py-0.5 text-xs whitespace-nowrap border-r max-w-[120px] truncate ${color.text}`}>
                    {line.author.name}
                  </td>
                  {/* Timestamp */}
                  <td className="px-2 py-0.5 text-xs text-gray-400 whitespace-nowrap border-r">
                    {timeAgo(line.timestamp)}
                  </td>
                  {/* Line number */}
                  <td className="px-2 py-0.5 text-right text-gray-400 select-none w-10 border-r">
                    {line.lineNumber}
                  </td>
                  {/* Content */}
                  <td className="px-3 py-0.5 whitespace-pre-wrap">
                    {line.content || '\u00A0'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selected line detail panel */}
      {selectedBlame && (
        <div className="bg-gray-50 border-t px-4 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-sm font-medium text-gray-900">
                  {selectedBlame.commitHash.substring(0, 12)}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  getAuthorColor(selectedBlame.author.id, authorIds).badge
                }`}>
                  {selectedBlame.changeType}
                </span>
              </div>
              <p className="text-sm text-gray-700 mt-1">
                {selectedBlame.commitMessage}
              </p>
              <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                <span>
                  <strong>Author:</strong> {selectedBlame.author.name} ({selectedBlame.author.role})
                </span>
                <span>
                  <strong>Date:</strong> {formatDate(selectedBlame.timestamp)}
                </span>
                <span>
                  <strong>Revisions:</strong> {selectedBlame.revisionCount}
                </span>
                {selectedBlame.revisionCount > 1 && (
                  <span>
                    <strong>Original commit:</strong>{' '}
                    {selectedBlame.originCommitHash.substring(0, 8)}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setSelectedLine(null)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              aria-label="Close detail panel"
            >
              x
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Contribution bar for the stats section */
function ContributionBar({
  contribution,
  color,
  isHighlighted,
  onHover,
  onLeave,
}: {
  contribution: AuthorContribution;
  color: (typeof AUTHOR_COLORS)[number];
  isHighlighted: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  return (
    <div
      className={`flex items-center space-x-3 rounded px-2 py-1 transition ${
        isHighlighted ? color.bg : ''
      }`}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div className="w-28 truncate text-sm font-medium">
        {contribution.author.name}
      </div>
      <div className="flex-1 bg-gray-200 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full ${color.border.replace('border', 'bg')}`}
          style={{ width: `${contribution.percentage}%` }}
        />
      </div>
      <div className="w-16 text-right text-xs text-gray-600">
        {contribution.linesAuthored} lines
      </div>
      <div className="w-12 text-right text-xs text-gray-500">
        {contribution.percentage.toFixed(1)}%
      </div>
      <div className="text-xs text-gray-400">
        {contribution.author.role}
      </div>
    </div>
  );
}
