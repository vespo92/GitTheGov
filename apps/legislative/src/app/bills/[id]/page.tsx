'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { fetchBill, checkConstitutionalCompliance, getImpactAssessment } from '@/lib/api';
import { statusLabels, levelLabels } from '@/lib/mock-data';
import DiffViewer from '@/components/DiffViewer';
import ConstitutionalCheck from '@/components/ConstitutionalCheck';
import VotingPanel from '@/components/VotingPanel';
import ImpactPredictor from '@/components/ImpactPredictor';
import type { Bill, ConstitutionalCheckResult, ImpactAssessment } from '@/lib/types';
import { LawStatus } from '@constitutional-shrinkage/constitutional-framework';

type Tab = 'content' | 'diff' | 'amendments' | 'compliance' | 'impact';

export default function BillDetailPage() {
  const params = useParams();
  const billId = params.id as string;

  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('content');
  const [compliance, setCompliance] = useState<ConstitutionalCheckResult | null>(null);
  const [impact, setImpact] = useState<ImpactAssessment | null>(null);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [loadingImpact, setLoadingImpact] = useState(false);

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

  const loadCompliance = async () => {
    if (compliance || loadingCompliance) return;
    setLoadingCompliance(true);
    try {
      const result = await checkConstitutionalCompliance(billId);
      setCompliance(result);
    } catch (error) {
      console.error('Failed to load compliance:', error);
    } finally {
      setLoadingCompliance(false);
    }
  };

  const loadImpact = async () => {
    if (impact || loadingImpact) return;
    setLoadingImpact(true);
    try {
      const result = await getImpactAssessment(billId);
      setImpact(result);
    } catch (error) {
      console.error('Failed to load impact:', error);
    } finally {
      setLoadingImpact(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'compliance') loadCompliance();
    if (activeTab === 'impact') loadImpact();
  }, [activeTab]);

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
        <p className="text-gray-600 mt-2">
          The bill you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <Link
          href="/bills"
          className="mt-4 inline-block text-gov-blue hover:underline"
        >
          &larr; Back to Bills
        </Link>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'content', label: 'Bill Content' },
    { id: 'amendments', label: `Amendments (${bill.amendments.length})` },
    { id: 'compliance', label: 'Constitutional Check' },
    { id: 'impact', label: 'Impact Analysis' },
  ];

  if (bill.parentBillId && bill.diff) {
    tabs.splice(1, 0, { id: 'diff', label: 'View Changes' });
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav>
        <ol className="flex items-center space-x-2 text-sm text-gray-500">
          <li>
            <Link href="/" className="hover:text-gov-blue">
              Dashboard
            </Link>
          </li>
          <li>&gt;</li>
          <li>
            <Link href="/bills" className="hover:text-gov-blue">
              Bills
            </Link>
          </li>
          <li>&gt;</li>
          <li className="text-gray-900 truncate max-w-[200px]">{bill.title}</li>
        </ol>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900">{bill.title}</h1>
              <span className={`status-badge status-${bill.status}`}>
                {statusLabels[bill.status]}
              </span>
            </div>
            <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
              <span>Sponsored by {bill.sponsor}</span>
              <span>&bull;</span>
              <span>{levelLabels[bill.level]}</span>
              {bill.regionId && (
                <>
                  <span>&bull;</span>
                  <span>{bill.regionId}</span>
                </>
              )}
              <span>&bull;</span>
              <span>v{bill.version}</span>
            </div>
            {bill.coSponsors.length > 0 && (
              <div className="mt-2 text-sm text-gray-500">
                Co-sponsors: {bill.coSponsors.length} citizen
                {bill.coSponsors.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
          <div className="flex space-x-3">
            {bill.status === LawStatus.DRAFT && (
              <button className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                Edit
              </button>
            )}
            <Link
              href={`/bills/${bill.id}/history`}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Git History
            </Link>
            <Link
              href={`/amendments/${bill.id}`}
              className="px-4 py-2 border border-gov-blue text-gov-blue rounded-lg hover:bg-blue-50"
            >
              Propose Amendment
            </Link>
            {bill.status === LawStatus.VOTING && (
              <Link
                href={`/vote/${bill.id}`}
                className="px-4 py-2 bg-gov-blue text-white rounded-lg hover:bg-blue-800"
              >
                Vote Now
              </Link>
            )}
          </div>
        </div>

        {/* Metadata Cards */}
        <div className="mt-6 grid grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Created</p>
            <p className="font-medium">
              {new Date(bill.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Sunset Date</p>
            <p className="font-medium">
              {new Date(bill.sunsetDate).toLocaleDateString()}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Git Branch</p>
            <p className="font-medium text-sm font-mono truncate">
              {bill.gitBranch}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Votes</p>
            <div className="flex items-center space-x-2">
              <span className="text-green-600 font-medium">{bill.votes.for}</span>
              <span className="text-gray-400">/</span>
              <span className="text-red-600 font-medium">{bill.votes.against}</span>
              <span className="text-gray-400">
                ({bill.votes.abstain} abstain)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Voting Panel (if voting is active) */}
      {bill.status === LawStatus.VOTING && (
        <VotingPanel bill={bill} onVoteUpdate={(newVotes) => setBill({ ...bill, votes: newVotes })} />
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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
          {/* Content Tab */}
          {activeTab === 'content' && (
            <div className="markdown-content prose max-w-none">
              <ReactMarkdown>{bill.content}</ReactMarkdown>
            </div>
          )}

          {/* Diff Tab */}
          {activeTab === 'diff' && bill.diff && (
            <DiffViewer
              oldContent={bill.diff.split('\n').filter(l => l.startsWith('- ') || l.startsWith('  ')).map(l => l.substring(2)).join('\n')}
              newContent={bill.content}
              oldLabel="Original Bill"
              newLabel="This Fork"
            />
          )}

          {/* Amendments Tab */}
          {activeTab === 'amendments' && (
            <div className="space-y-4">
              {bill.amendments.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No amendments proposed yet</p>
                  <Link
                    href={`/amendments/${bill.id}`}
                    className="mt-2 inline-block text-gov-blue hover:underline"
                  >
                    Propose an amendment
                  </Link>
                </div>
              ) : (
                bill.amendments.map((amendment) => (
                  <div
                    key={amendment.id}
                    className="border rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{amendment.description}</h4>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          amendment.status === 'accepted'
                            ? 'bg-green-100 text-green-800'
                            : amendment.status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {amendment.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">
                      Proposed by {amendment.proposedBy} on{' '}
                      {new Date(amendment.createdAt).toLocaleDateString()}
                    </p>
                    <div className="bg-gray-50 rounded p-3 font-mono text-sm overflow-x-auto">
                      <pre>{amendment.diff}</pre>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Compliance Tab */}
          {activeTab === 'compliance' && (
            loadingCompliance ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gov-blue"></div>
              </div>
            ) : compliance ? (
              <ConstitutionalCheck result={compliance} />
            ) : (
              <p className="text-gray-500">Loading compliance check...</p>
            )
          )}

          {/* Impact Tab */}
          {activeTab === 'impact' && (
            loadingImpact ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gov-blue"></div>
              </div>
            ) : impact ? (
              <ImpactPredictor assessment={impact} />
            ) : (
              <p className="text-gray-500">Loading impact analysis...</p>
            )
          )}
        </div>
      </div>
    </div>
  );
}
