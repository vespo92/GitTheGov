'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, FileText, Users, MessageSquare, TrendingUp, Calendar, ArrowRight } from 'lucide-react';
import { mockPods, mockLegislation, mockCoordinationRequests, mockEvents } from '@/lib/mock-data';
import PodCard from '@/components/pods/PodCard';
import LegislationCard from '@/components/legislation/LegislationCard';
import CoordinationCard from '@/components/coordination/CoordinationCard';
import EventCard from '@/components/community/EventCard';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    setTimeout(() => setLoading(false), 300);
  }, []);

  const currentPod = mockPods[0]; // User's primary pod
  const recentLegislation = mockLegislation.slice(0, 2);
  const activeCoordination = mockCoordinationRequests.slice(0, 2);
  const upcomingEvents = mockEvents.filter(e => e.status === 'upcoming').slice(0, 2);

  const stats = [
    { label: 'Your Pod', value: currentPod.code, icon: MapPin, color: 'text-pod-green-600' },
    { label: 'TBL Score', value: currentPod.metrics.tblScore.overall.toFixed(1), icon: TrendingUp, color: 'text-blue-600' },
    { label: 'Active Bills', value: recentLegislation.filter(l => l.status === 'voting').length.toString(), icon: FileText, color: 'text-purple-600' },
    { label: 'Coordination', value: activeCoordination.length.toString(), icon: Users, color: 'text-amber-600' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pod-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Regional Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Regional overview and activity
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
              <div className="flex items-center">
                <div className={`p-2 rounded-lg bg-gray-50 ${stat.color}`}>
                  <Icon size={20} />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Current Pod Overview */}
      <div className="bg-gradient-to-r from-pod-green-50 to-pod-brown-50 rounded-xl p-6 border border-pod-green-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{currentPod.name}</h2>
            <p className="text-gray-600">{currentPod.code} · {currentPod.population.toLocaleString()} residents</p>
          </div>
          <Link href={`/pods/${currentPod.id}`} className="text-pod-green-600 hover:text-pod-green-700 text-sm font-medium flex items-center">
            View Details <ArrowRight size={16} className="ml-1" />
          </Link>
        </div>

        {/* TBL Mini Display */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">People</p>
            <div className="flex items-end space-x-2">
              <span className="text-lg font-bold text-blue-600">{currentPod.metrics.tblScore.people}</span>
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${currentPod.metrics.tblScore.people}%` }} />
              </div>
            </div>
          </div>
          <div className="bg-white/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Planet</p>
            <div className="flex items-end space-x-2">
              <span className="text-lg font-bold text-green-600">{currentPod.metrics.tblScore.planet}</span>
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${currentPod.metrics.tblScore.planet}%` }} />
              </div>
            </div>
          </div>
          <div className="bg-white/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Profit</p>
            <div className="flex items-end space-x-2">
              <span className="text-lg font-bold text-amber-600">{currentPod.metrics.tblScore.profit}</span>
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${currentPod.metrics.tblScore.profit}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Local Legislation */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <FileText size={20} className="mr-2 text-purple-600" />
              Local Legislation
            </h2>
            <Link href="/legislation" className="text-pod-green-600 hover:text-pod-green-700 text-sm font-medium">
              View all
            </Link>
          </div>
          <div className="space-y-4">
            {recentLegislation.map((leg) => (
              <LegislationCard key={leg.id} legislation={leg} showPod={false} />
            ))}
          </div>
        </div>

        {/* Coordination Requests */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Users size={20} className="mr-2 text-amber-600" />
              Coordination
            </h2>
            <Link href="/coordination" className="text-pod-green-600 hover:text-pod-green-700 text-sm font-medium">
              View all
            </Link>
          </div>
          <div className="space-y-4">
            {activeCoordination.map((req) => (
              <CoordinationCard key={req.id} request={req} />
            ))}
          </div>
        </div>
      </div>

      {/* Upcoming Events */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Calendar size={20} className="mr-2 text-blue-600" />
            Upcoming Events
          </h2>
          <Link href="/community/events" className="text-pod-green-600 hover:text-pod-green-700 text-sm font-medium">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {upcomingEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/legislation/propose" className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 hover:border-pod-green-300 transition-colors group">
          <FileText size={24} className="mb-3 text-purple-600" />
          <h3 className="font-semibold text-gray-900 group-hover:text-pod-green-600">Propose Legislation</h3>
          <p className="text-sm text-gray-500 mt-1">Draft and submit new local legislation</p>
        </Link>
        <Link href="/coordination/requests" className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 hover:border-pod-green-300 transition-colors group">
          <Users size={24} className="mb-3 text-amber-600" />
          <h3 className="font-semibold text-gray-900 group-hover:text-pod-green-600">Start Coordination</h3>
          <p className="text-sm text-gray-500 mt-1">Request inter-pod collaboration</p>
        </Link>
        <Link href="/map" className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 hover:border-pod-green-300 transition-colors group">
          <MapPin size={24} className="mb-3 text-pod-green-600" />
          <h3 className="font-semibold text-gray-900 group-hover:text-pod-green-600">Explore Map</h3>
          <p className="text-sm text-gray-500 mt-1">View regional pods on the map</p>
        </Link>
      </div>
    </div>
  );
}
