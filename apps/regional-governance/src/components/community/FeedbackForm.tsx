'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import type { FeedbackItem } from '@/types';

interface FeedbackFormProps {
  podId: string;
  onSubmit: (feedback: Partial<FeedbackItem>) => Promise<void>;
}

const feedbackTypes = [
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'question', label: 'Question' },
  { value: 'praise', label: 'Praise' },
] as const;

export default function FeedbackForm({ podId, onSubmit }: FeedbackFormProps) {
  const [type, setType] = useState<FeedbackItem['type']>('suggestion');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        type,
        subject,
        content,
        podId,
        status: 'submitted',
      });
      setSuccess(true);
      setSubject('');
      setContent('');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Feedback Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Type of Feedback
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {feedbackTypes.map((ft) => (
            <button
              key={ft.value}
              type="button"
              onClick={() => setType(ft.value)}
              className={`flex items-center justify-center p-3 border rounded-lg transition-colors ${
                type === ft.value
                  ? 'border-pod-green-500 bg-pod-green-50 text-pod-green-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-600'
              }`}
            >
              <span className="text-sm font-medium">{ft.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-pod-green-500 focus:border-pod-green-500"
          placeholder="Brief summary of your feedback..."
          required
        />
      </div>

      {/* Content */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Details
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-pod-green-500 focus:border-pod-green-500"
          placeholder="Please provide details about your feedback..."
          required
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Success */}
      {success && (
        <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
          Thank you for your feedback! We'll review it soon.
        </div>
      )}

      {/* Submit */}
      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Submit Feedback
      </Button>
    </form>
  );
}
