'use client';

import Link from 'next/link';
import { ArrowLeft, Shield, Cross, Zap, AlertTriangle, Globe } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardBody, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const exemptions = [
  {
    id: 'medical',
    name: 'Medical Necessities',
    description: 'Life-saving medications, medical devices, and healthcare supplies',
    icon: Cross,
    color: 'text-red-500',
    bgColor: 'bg-red-100 dark:bg-red-900/20',
    reduction: 100,
    status: 'active',
    examples: ['Prescription medications', 'Medical devices', 'Vaccines', 'Emergency supplies'],
  },
  {
    id: 'emergency',
    name: 'Emergency Supplies',
    description: 'Disaster relief and emergency response materials',
    icon: AlertTriangle,
    color: 'text-orange-500',
    bgColor: 'bg-orange-100 dark:bg-orange-900/20',
    reduction: 100,
    status: 'active',
    examples: ['Disaster relief supplies', 'Emergency food', 'Water purification', 'Shelter materials'],
  },
  {
    id: 'technology',
    name: 'Critical Technology',
    description: 'Essential technology components unavailable regionally',
    icon: Zap,
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/20',
    reduction: 50,
    status: 'active',
    examples: ['Semiconductors', 'Rare earth components', 'Specialized equipment', 'Research materials'],
  },
  {
    id: 'specialty',
    name: 'Regional Specialties',
    description: 'Products that can only be sourced from specific regions',
    icon: Globe,
    color: 'text-purple-500',
    bgColor: 'bg-purple-100 dark:bg-purple-900/20',
    reduction: 25,
    status: 'active',
    examples: ['Regional specialties', 'Climate-specific crops', 'Traditional crafts', 'Cultural items'],
  },
];

export default function TaxExemptionsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/taxes">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Tax Exemptions
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Categories eligible for tax reductions or exemptions
          </p>
        </div>
      </div>

      {/* Exemption Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {exemptions.map(exemption => {
          const Icon = exemption.icon;
          return (
            <Card key={exemption.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2 rounded-lg', exemption.bgColor)}>
                      <Icon className={cn('h-5 w-5', exemption.color)} />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{exemption.name}</CardTitle>
                      <CardDescription>{exemption.description}</CardDescription>
                    </div>
                  </div>
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium',
                    exemption.status === 'active'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-slate-100 text-slate-700'
                  )}>
                    {exemption.status}
                  </span>
                </div>
              </CardHeader>
              <CardBody>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-slate-500">Tax Reduction</span>
                  <span className={cn(
                    'text-2xl font-bold',
                    exemption.reduction === 100 ? 'text-green-600' : 'text-blue-600'
                  )}>
                    {exemption.reduction}%
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Examples:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {exemption.examples.map(example => (
                      <span
                        key={example}
                        className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs rounded"
                      >
                        {example}
                      </span>
                    ))}
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* Application Process */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Exemption Application Process
          </CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-lg font-bold text-primary-600">1</span>
              </div>
              <h4 className="font-medium text-slate-900 dark:text-white mb-1">Submit Request</h4>
              <p className="text-sm text-slate-500">File exemption application with supporting documentation</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-lg font-bold text-primary-600">2</span>
              </div>
              <h4 className="font-medium text-slate-900 dark:text-white mb-1">Review</h4>
              <p className="text-sm text-slate-500">Application reviewed by regional tax authority</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-lg font-bold text-primary-600">3</span>
              </div>
              <h4 className="font-medium text-slate-900 dark:text-white mb-1">Verification</h4>
              <p className="text-sm text-slate-500">Supply chain audit to verify exemption eligibility</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-lg font-bold text-primary-600">4</span>
              </div>
              <h4 className="font-medium text-slate-900 dark:text-white mb-1">Approval</h4>
              <p className="text-sm text-slate-500">Exemption certificate issued for qualifying products</p>
            </div>
          </div>

          <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              <strong>Note:</strong> Exemptions are reviewed quarterly. Businesses must demonstrate continued
              eligibility and explore local alternatives where available.
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
