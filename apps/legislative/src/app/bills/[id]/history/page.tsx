'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import BlameViewer from '@/components/BlameViewer';
import CommitHistory from '@/components/CommitHistory';
import DiffViewer from '@/components/DiffViewer';
import { fetchBill } from '@/lib/api';
import { commitsByBillId, blameByBillId } from '@/lib/mock-git-tracking';
import { verifyCommitChain, generateContributionReport, compareCommits } from '@constitutional-shrinkage/governance-utils';
import type { Bill } from '@/lib/types';
import type { LegislationCommit } from '@constitutional-shrinkage/governance-utils';

type HistoryTab = 'blame' | 'commits' | 'contributors';

export default function BillHistoryPage() {
  const params = useParams();
  const billId = params.id as string;

  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<HistoryTab>('blame');
  const [compareDiff, setCompareDiff] = useState<{
    older: LegislationCommit;
    newer: LegislationCommit;
  } | null>(null);

  const commits = commitsByBillId[billId] || [];
  const blame = blameByBillId[billId];
  const chainVerification = commits.length > 0 ? verifyCommitChain(commits) : null;

  useEffect(() => {
    async function loadBill() {
      try {
        const data = await fetchBill(billId);
        setBill(data);
      } catch (error) {
        console.error('Failed to load bill:', error);
      } finally {
        setLoading(false);
      }
    }
    loadBill();
  }, [billId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gov-blue"></div>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900">Bill not found</h2>
        <Link href="/bills" className="mt-4 inline-block text-gov-blue hover:underline">
          Back to Bills
        </Link>
      </div>
    );
  }

  const tabs: { id: HistoryTab; label: string }[] = [
    { id: 'blame', label: 'Git Blame' },
    { id: 'commits', label: `Commits (${commits.length})` },
    { id: 'contributors', label: 'Contributors' },
  ];

  const contributionReport = blame ? generateContributionReport(blame) : '';

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav>
        <ol className="flex items-center space-x-2 text-sm text-gray-500">
          <li>
            <Link href="/" className="hover:text-gov-blue">Dashboard</Link>
          </li>
          <li>&gt;</li>
          <li>
            <Link href="/bills" className="hover:text-gov-blue">Bills</Link>
          </li>
          <li>&gt;</li>
          <li>
            <Link href={`/bills/${billId}`} className="hover:text-gov-blue truncate max-w-[200px] inline-block">
              {bill.title}
            </Link>
          </li>
          <li>&gt;</li>
          <li className="text-gray-900">History</li>
        </ol>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Legislation History: {bill.title}
            </h1>
            <p className="text-gray-500 mt-1">
              Full version control — every change tracked, every line attributed
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {chainVerification && (
              <span
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  chainVerification.valid
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {chainVerification.valid
                  ? 'Chain Verified'
                  : `Chain Invalid (${chainVerification.errors.length} errors)`}
              </span>
            )}
            <Link
              href={`/bills/${billId}`}
              className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Back to Bill
            </Link>
          </div>
        </div>

        {/* Quick stats */}
        {blame && (
          <div className="mt-4 grid grid-cols-5 gap-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{blame.stats.totalLines}</p>
              <p className="text-xs text-gray-500">Total Lines</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{blame.stats.uniqueAuthors}</p>
              <p className="text-xs text-gray-500">Authors</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{blame.stats.totalCommits}</p>
              <p className="text-xs text-gray-500">Commits</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {blame.stats.averageRevisions.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500">Avg Revisions/Line</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {bill.gitCommitHash?.substring(0, 8) || 'N/A'}
              </p>
              <p className="text-xs text-gray-500">Latest Hash</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setCompareDiff(null);
                }}
                className={`px-6 py-3 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-gov-blue text-gov-blue'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Blame Tab */}
          {activeTab === 'blame' && blame && (
            <BlameViewer blame={blame} billTitle={bill.title} />
          )}

          {activeTab === 'blame' && !blame && (
            <div className="text-center py-12 text-gray-500">
              No blame data available for this bill. Commit history must be built first.
            </div>
          )}

          {/* Commits Tab */}
          {activeTab === 'commits' && (
            <div className="space-y-6">
              <CommitHistory
                commits={commits}
                billTitle={bill.title}
                onCompareCommits={(older, newer) => setCompareDiff({ older, newer })}
              />

              {/* Comparison diff */}
              {compareDiff && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">
                    Comparing {compareDiff.older.hash.substring(0, 8)} to{' '}
                    {compareDiff.newer.hash.substring(0, 8)}
                  </h3>
                  <DiffViewer
                    oldContent={compareDiff.older.snapshot}
                    newContent={compareDiff.newer.snapshot}
                    oldLabel={`${compareDiff.older.hash.substring(0, 8)} (${compareDiff.older.author.name})`}
                    newLabel={`${compareDiff.newer.hash.substring(0, 8)} (${compareDiff.newer.author.name})`}
                    viewMode="split"
                  />
                </div>
              )}
            </div>
          )}

          {/* Contributors Tab */}
          {activeTab === 'contributors' && blame && (
            <div className="space-y-6">
              {/* Contribution table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Author</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Role</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-700">Lines</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-700">%</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Change Types</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">First</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Last</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {blame.stats.authorContributions.map((contrib) => (
                      <tr key={contrib.author.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{contrib.author.name}</td>
                        <td className="px-4 py-3 text-gray-500">{contrib.author.role}</td>
                        <td className="px-4 py-3 text-right font-mono">{contrib.linesAuthored}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {contrib.percentage.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {contrib.changeTypes.map((ct) => (
                              <span
                                key={ct}
                                className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                              >
                                {ct}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(contrib.firstContribution).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(contrib.lastContribution).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Raw contribution report (markdown) */}
              <details className="border rounded-lg">
                <summary className="px-4 py-3 cursor-pointer font-medium text-gray-700 hover:bg-gray-50">
                  Raw Contribution Report (Markdown)
                </summary>
                <pre className="px-4 py-3 bg-gray-50 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {contributionReport}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
