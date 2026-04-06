'use client';

import { use } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/layout/Navigation';
import { ImplementationTracker } from '@/components/policies/ImplementationTracker';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { useMockPolicies, useMockPolicyImplementation } from '@/hooks/usePolicies';
import { cn, formatDate, getStatusColor } from '@/lib/utils';

export default function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: policiesData } = useMockPolicies();
  const { data: implementationData } = useMockPolicyImplementation(id);

  const policy = policiesData?.data.find((p) => p.id === id) || policiesData?.data[0];
  const implementation = implementationData?.data;

  if (!policy) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">Policy not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Navigation
        breadcrumbs={[
          { name: 'Policies', href: '/policies' },
          { name: policy.title },
        ]}
        title={policy.title}
        description={policy.description}
        actions={
          <Link href={`/policies/${id}/edit`}>
            <Button size="sm">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Policy
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {implementation && <ImplementationTracker implementation={implementation} />}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Policy Info */}
          <Card>
            <CardHeader>
              <CardTitle>Policy Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <span className={cn('inline-flex mt-1 px-2 py-1 text-sm font-medium rounded-full', getStatusColor(policy.status))}>
                  {policy.status.replace('_', ' ')}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Category</p>
                <p className="font-medium">{policy.category}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Region</p>
                <p className="font-medium">{policy.regionName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Target Date</p>
                <p className="font-medium">{formatDate(policy.targetDate)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Created</p>
                <p className="font-medium">{formatDate(policy.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Last Updated</p>
                <p className="font-medium">{formatDate(policy.updatedAt)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Generate Report
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Allocate Resources
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Assign Team
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
