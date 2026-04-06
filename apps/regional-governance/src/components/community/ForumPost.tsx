'use client';

import Link from 'next/link';
import { MessageSquare, Pin, Lock, User } from 'lucide-react';
import type { ForumPost as ForumPostType } from '@/types';
import { formatRelativeTime } from '@/lib/utils';

interface ForumPostProps {
  post: ForumPostType;
  showContent?: boolean;
}

export default function ForumPost({ post, showContent = false }: ForumPostProps) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors ${post.isPinned ? 'border-l-4 border-l-amber-400' : ''}`}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-pod-green-100 rounded-full flex items-center justify-center">
              {post.authorAvatar ? (
                <img src={post.authorAvatar} alt={post.authorName} className="w-10 h-10 rounded-full" />
              ) : (
                <User className="text-pod-green-600" size={20} />
              )}
            </div>
            <div>
              <Link href={`/community/forums/${post.topicId}/${post.id}`} className="font-medium text-gray-900 hover:text-pod-green-600">
                {post.title}
              </Link>
              <p className="text-sm text-gray-500">
                {post.authorName} · {formatRelativeTime(post.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {post.isPinned && (
              <span className="text-amber-500" title="Pinned">
                <Pin size={16} />
              </span>
            )}
            {post.isLocked && (
              <span className="text-gray-400" title="Locked">
                <Lock size={16} />
              </span>
            )}
          </div>
        </div>

        {/* Content Preview */}
        {showContent && (
          <div className="mt-3 text-gray-600 text-sm line-clamp-3">
            {post.content}
          </div>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {post.tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer Stats */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center text-sm text-gray-500">
          <div className="flex items-center">
            <MessageSquare size={14} className="mr-1" />
            {post.replies} replies
          </div>
        </div>
      </div>
    </div>
  );
}
