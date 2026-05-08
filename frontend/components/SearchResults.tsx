'use client';

import { SearchResultCard } from './SearchResultCard';
import type { SearchState } from '@/lib/types';

interface Props {
  state: SearchState;
  showPlaylistName?: boolean;
  onClose?: () => void;
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className}`} />;
}

export function SearchResults({ state, showPlaylistName = false, onClose }: Props) {
  if (state.status === 'idle') {
    return null;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden relative z-10">
      {/* Loading State */}
      {state.status === 'loading' && (
        <div className="p-4 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <Skeleton className="h-16 w-24 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Success State */}
      {state.status === 'success' && (
        <>
          <div className="px-4 pt-3 pb-2 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {state.results.length} results for &ldquo;{state.query}&rdquo;
            </p>
            {onClose && (
              <button
                onClick={onClose}
                type="button"
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full p-1.5 transition-colors cursor-pointer flex items-center justify-center"
                aria-label="Close search results"
              >
                <span className="text-lg leading-none">✕</span>
              </button>
            )}
          </div>
          {state.results.length === 0 ? (
            <div className="py-8 text-center px-4">
              <p className="text-sm text-slate-500">
                No results found — try rephrasing as a concept
                <br />
                (e.g. &ldquo;what is drag divergence&rdquo;)
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {state.results.map((result, i) => (
                <SearchResultCard
                  key={i}
                  result={result}
                  showPlaylistName={showPlaylistName}
                  query={state.query}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Error State */}
      {state.status === 'error' && (
        <div className="p-6 text-center">
          <p className="text-sm text-red-500">{state.message}</p>
        </div>
      )}
    </div>
  );
}
