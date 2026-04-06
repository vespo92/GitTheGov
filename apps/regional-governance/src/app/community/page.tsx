'use client';

import Link from 'next/link';
import { MessageSquare, Calendar, ClipboardList, HelpCircle } from 'lucide-react';
import { mockForumTopics, mockForumPosts, mockEvents } from '@/lib/mock-data';
import ForumPost from '@/components/community/ForumPost';
import EventCard from '@/components/community/EventCard';
import Card, { CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

export default function CommunityPage() {
  const recentPosts = mockForumPosts.slice(0, 3);
  const upcomingEvents = mockEvents.filter(e => e.status === 'upcoming').slice(0, 2);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Community Hub</h1>
        <p className="mt-1 text-gray-600">
          Regional community forums, events, and feedback
        </p>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/community/forums" className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 hover:border-pod-green-300 transition-colors text-center">
          <MessageSquare className="mx-auto text-purple-500 mb-2" size={24} />
          <span className="font-medium text-gray-900">Forums</span>
        </Link>
        <Link href="/community/events" className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 hover:border-pod-green-300 transition-colors text-center">
          <Calendar className="mx-auto text-blue-500 mb-2" size={24} />
          <span className="font-medium text-gray-900">Events</span>
        </Link>
        <Link href="/community/feedback" className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 hover:border-pod-green-300 transition-colors text-center">
          <ClipboardList className="mx-auto text-pod-green-500 mb-2" size={24} />
          <span className="font-medium text-gray-900">Feedback</span>
        </Link>
        <Link href="/help" className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 hover:border-pod-green-300 transition-colors text-center">
          <HelpCircle className="mx-auto text-amber-500 mb-2" size={24} />
          <span className="font-medium text-gray-900">Help</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Forum Topics */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader action={
              <Link href="/community/forums" className="text-sm text-pod-green-600 hover:text-pod-green-700">
                View all
              </Link>
            }>
              <CardTitle>Forum Topics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockForumTopics.map((topic) => (
                  <Link
                    key={topic.id}
                    href={`/community/forums/${topic.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{topic.name}</p>
                      <p className="text-sm text-gray-500">{topic.description}</p>
                    </div>
                    <span className="text-sm text-gray-400">{topic.postCount} posts</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Posts */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent Discussions</h2>
              <Link href="/community/forums" className="text-sm text-pod-green-600 hover:text-pod-green-700">
                View all
              </Link>
            </div>
            <div className="space-y-4">
              {recentPosts.map((post) => (
                <ForumPost key={post.id} post={post} showContent />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Upcoming Events */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Upcoming Events</h2>
              <Link href="/community/events" className="text-sm text-pod-green-600 hover:text-pod-green-700">
                View all
              </Link>
            </div>
            <div className="space-y-4">
              {upcomingEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </div>

          {/* Community Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Community Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Active Members</span>
                  <span className="font-medium">2,847</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Posts This Week</span>
                  <span className="font-medium">156</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Events This Month</span>
                  <span className="font-medium">8</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
