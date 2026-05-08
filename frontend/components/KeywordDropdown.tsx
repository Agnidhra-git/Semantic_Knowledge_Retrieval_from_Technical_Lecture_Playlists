'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Video, SearchState } from '@/lib/types';
import { PedagogyBadge } from './PedagogyBadge';
import { SearchResults } from './SearchResults';
import { search } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  video: Video;
  playlistId: string;
}

export function KeywordDropdown({ video, playlistId }: Props) {
  const [open, setOpen] = useState(false);
  const [clickedKeyword, setClickedKeyword] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sorted = [...video.keywords].sort(
    (a, b) => b.importance_score - a.importance_score
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
        setClickedKeyword(null);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const handleKeywordClick = async (keyword: string) => {
    setClickedKeyword(keyword);
    setSearchState({ status: 'loading' });
    try {
      const results = await search(keyword, playlistId, 5);
      setSearchState({ status: 'success', results, query: keyword });
    } catch {
      setSearchState({
        status: 'error',
        message: 'Search unavailable',
      });
    }
  };

  return (
    <div className="flex-shrink-0 relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors"
      >
        Keywords
        <ChevronDown
          className={cn('w-3 h-3 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-[600px] max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-[500px] overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Keywords ({sorted.length})
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {sorted.map((kw) => (
                <button
                  key={kw.keyword}
                  onClick={() => handleKeywordClick(kw.keyword)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-xs bg-white"
                >
                  <span className="text-slate-700 font-medium">{kw.keyword}</span>
                  <PedagogyBadge role={kw.pedagogy_context as any} />
                  <div className="relative h-1 w-12 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-blue-400 rounded-full"
                      style={{ width: `${kw.importance_score * 100}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>

            {clickedKeyword && (
              <div className="mt-4 border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-500">
                    Results for &ldquo;{clickedKeyword}&rdquo;
                  </p>
                  <button
                    onClick={() => setClickedKeyword(null)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Close
                  </button>
                </div>
                <SearchResults state={searchState} showPlaylistName={false} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
