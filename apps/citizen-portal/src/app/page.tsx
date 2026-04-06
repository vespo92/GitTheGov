import Link from 'next/link';
import {
  Vote,
  Users,
  FileText,
  Bell,
  MapPin,
  Shield
} from 'lucide-react';

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Citizen Portal
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          Bills, voting, delegations, and regional governance
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        <QuickAction
          href="/dashboard"
          icon={<FileText className="h-8 w-8" />}
          title="Dashboard"
          description="View active bills, your votes, and governance status"
          color="primary"
        />
        <QuickAction
          href="/delegations"
          icon={<Users className="h-8 w-8" />}
          title="Delegations"
          description="Manage your liquid democracy delegations"
          color="delegate"
        />
        <QuickAction
          href="/history"
          icon={<Vote className="h-8 w-8" />}
          title="Voting History"
          description="Review your complete voting record"
          color="vote"
        />
        <QuickAction
          href="/regions"
          icon={<MapPin className="h-8 w-8" />}
          title="Regional Pods"
          description="Discover and join regional governance pods"
          color="civic"
        />
        <QuickAction
          href="/profile"
          icon={<Shield className="h-8 w-8" />}
          title="Profile"
          description="Manage your identity and verification level"
          color="primary"
        />
        <QuickAction
          href="/dashboard"
          icon={<Bell className="h-8 w-8" />}
          title="Notifications"
          description="Stay informed about governance updates"
          color="alert"
        />
      </div>

      {/* Stats Overview */}
      <div className="card p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Platform Overview
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active Bills" value="127" />
          <StatCard label="Total Citizens" value="1.2M" />
          <StatCard label="Votes Cast Today" value="45.2K" />
          <StatCard label="Active Delegations" value="892K" />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Recent Activity
        </h2>
        <div className="space-y-3">
          <ActivityItem
            type="vote"
            title="Infrastructure Investment Act"
            subtitle="Voting ends in 3 days"
            timestamp="2 hours ago"
          />
          <ActivityItem
            type="delegation"
            title="New delegation received"
            subtitle="Sarah Chen delegated healthcare votes to you"
            timestamp="5 hours ago"
          />
          <ActivityItem
            type="bill"
            title="Education Reform Bill 2025"
            subtitle="New bill introduced in your region"
            timestamp="1 day ago"
          />
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  title,
  description,
  color,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'primary' | 'civic' | 'vote' | 'delegate' | 'alert';
}) {
  const colorClasses = {
    primary: 'text-primary-600 bg-primary-100 dark:bg-primary-900/20',
    civic: 'text-governance-civic bg-governance-civic/10',
    vote: 'text-governance-vote bg-governance-vote/10',
    delegate: 'text-governance-delegate bg-governance-delegate/10',
    alert: 'text-governance-alert bg-governance-alert/10',
  };

  return (
    <Link
      href={href}
      className="card p-6 hover:shadow-md transition-shadow group"
    >
      <div className={`inline-flex p-3 rounded-lg ${colorClasses[color]} mb-4`}>
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 transition-colors">
        {title}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
        {description}
      </p>
    </Link>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-gray-900 dark:text-white">
        {value}
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-400">{label}</div>
    </div>
  );
}

function ActivityItem({
  type,
  title,
  subtitle,
  timestamp,
}: {
  type: 'vote' | 'delegation' | 'bill';
  title: string;
  subtitle: string;
  timestamp: string;
}) {
  const typeColors = {
    vote: 'bg-governance-vote',
    delegation: 'bg-governance-delegate',
    bill: 'bg-governance-civic',
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
      <div className={`w-2 h-2 rounded-full mt-2 ${typeColors[type]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {title}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
      </div>
      <span className="text-xs text-gray-500">{timestamp}</span>
    </div>
  );
}
