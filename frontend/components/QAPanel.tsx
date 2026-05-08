'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Link2, Filter } from 'lucide-react';
import type { QAPair } from '@/lib/types';
import { fetchQAPairs } from '@/lib/api';

interface Props {
  playlistId: string;
}

type DifficultyFilter = 'all' | 'basic' | 'intermediate' | 'advanced';

const difficultyColors = {
  basic: 'bg-green-100 text-green-800 border-green-200',
  intermediate: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  advanced: 'bg-red-100 text-red-800 border-red-200',
};

const difficultyLabels = {
  basic: '🟢 Basic',
  intermediate: '🟡 Intermediate',
  advanced: '🔴 Advanced',
};

export function QAPanel({ playlistId }: Props) {
  const [qaPairs, setQaPairs] = useState<QAPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DifficultyFilter>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadQAPairs() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchQAPairs(playlistId, undefined, 100);
        setQaPairs(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load questions');
        console.error('Failed to load QA pairs:', err);
      } finally {
        setLoading(false);
      }
    }

    loadQAPairs();
  }, [playlistId]);

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const filteredPairs = filter === 'all'
    ? qaPairs
    : qaPairs.filter(qa => qa.difficulty === filter);

  const countsByDifficulty = {
    all: qaPairs.length,
    basic: qaPairs.filter(qa => qa.difficulty === 'basic').length,
    intermediate: qaPairs.filter(qa => qa.difficulty === 'intermediate').length,
    advanced: qaPairs.filter(qa => qa.difficulty === 'advanced').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-slate-600">Loading practice questions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-500 mb-2">⚠️</div>
        <p className="text-sm text-slate-600">{error}</p>
      </div>
    );
  }

  if (qaPairs.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-slate-400 text-4xl mb-4">📝</div>
        <p className="text-sm text-slate-600 mb-2">No practice questions available yet</p>
        <p className="text-xs text-slate-500">Questions will be generated during playlist processing</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-4 z-10">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-900 text-sm md:text-base">
            Practice Questions
          </h2>
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
            {filteredPairs.length}
          </span>
        </div>

        {/* Filter Dropdown */}
        <div className="relative">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as DifficultyFilter)}
            className="pl-3 pr-8 py-1.5 text-sm border border-slate-300 rounded-lg bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer appearance-none"
          >
            <option value="all">All Levels ({countsByDifficulty.all})</option>
            <option value="basic">🟢 Basic ({countsByDifficulty.basic})</option>
            <option value="intermediate">🟡 Intermediate ({countsByDifficulty.intermediate})</option>
            <option value="advanced">🔴 Advanced ({countsByDifficulty.advanced})</option>
          </select>
          <Filter className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Question List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredPairs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-slate-500">No questions match this difficulty level</p>
          </div>
        ) : (
          filteredPairs.map((qa) => {
            const isExpanded = expandedIds.has(qa.id);
            const difficultyColor = difficultyColors[qa.difficulty as keyof typeof difficultyColors];
            const difficultyLabel = difficultyLabels[qa.difficulty as keyof typeof difficultyLabels];

            return (
              <div
                key={qa.id}
                className="bg-white border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Question Card */}
                <div className="p-4">
                  {/* Badges Row */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-md border ${difficultyColor}`}>
                      {difficultyLabel}
                    </span>
                    {qa.cross_video && (
                      <span className="px-2 py-1 text-xs font-medium rounded-md bg-purple-100 text-purple-700 border border-purple-200 flex items-center gap-1">
                        <Link2 className="w-3 h-3" />
                        Cross-Video
                      </span>
                    )}
                  </div>

                  {/* Question Text */}
                  <div className="text-sm text-slate-900 leading-relaxed mb-3 font-medium">
                    {qa.question}
                  </div>

                  {/* Show/Hide Answer Button */}
                  <button
                    onClick={() => toggleExpanded(qa.id)}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        Hide Answer
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Show Answer
                      </>
                    )}
                  </button>
                </div>

                {/* Answer (Collapsible) */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50">
                    <div className="pt-4">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                        Answer
                      </p>
                      <div className="text-sm text-slate-700 leading-relaxed space-y-2">
                        {qa.answer.split('\n\n').map((paragraph, idx) => (
                          <p key={idx} className="text-slate-700">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
