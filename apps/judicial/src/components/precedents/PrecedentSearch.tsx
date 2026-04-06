'use client';

import { useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import { Search, BookOpen, FileText, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { Precedent } from '@/types';

interface PrecedentSearchProps {
  precedents: Precedent[];
  categories: string[];
  onSearch: (query: string, category?: string) => void;
  isLoading?: boolean;
}

export function PrecedentSearch({ precedents, categories, onSearch, isLoading }: PrecedentSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery, selectedCategory || undefined);
  };

  return (
    <div className="space-y-6">
      <Card variant="bordered" padding="none">
        <CardHeader className="px-6 py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-judicial-primary" />
            <span>Search Precedents</span>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by keyword, case title, or citation..."
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-judicial-primary"
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-judicial-primary"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Searching...' : 'Search'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {precedents.length === 0 ? (
          <Card variant="bordered" className="text-center py-12">
            <CardContent>
              <BookOpen className="h-12 w-12 mx-auto text-gray-300 dark:text-slate-600 mb-4" />
              <p className="text-gray-500 dark:text-slate-400">
                No precedents found. Try a different search query.
              </p>
            </CardContent>
          </Card>
        ) : (
          precedents.map((precedent) => (
            <PrecedentCard key={precedent.id} precedent={precedent} />
          ))
        )}
      </div>
    </div>
  );
}

function PrecedentCard({ precedent }: { precedent: Precedent }) {
  return (
    <Card variant="bordered" padding="none">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary">{precedent.category}</Badge>
              {precedent.subcategory && (
                <Badge variant="default" size="sm">{precedent.subcategory}</Badge>
              )}
              <div className="flex items-center gap-1 text-judicial-secondary">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">{precedent.citations}</span>
              </div>
            </div>
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
              {precedent.caseTitle}
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              {precedent.id} • Ruled: {formatDate(precedent.rulingDate)}
            </p>
            <p className="text-sm text-gray-600 dark:text-slate-300 mt-2 line-clamp-2">
              {precedent.summary}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {precedent.keywords.slice(0, 5).map((keyword) => (
                <span
                  key={keyword}
                  className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
          <Link href={`/precedents/${precedent.id}`}>
            <Button variant="outline" size="sm">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
