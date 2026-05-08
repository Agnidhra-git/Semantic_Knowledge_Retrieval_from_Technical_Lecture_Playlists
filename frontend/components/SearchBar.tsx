'use client';

import { Search, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSearch } from '@/hooks/useSearch';
import type { SearchState, PedagogyRole } from '@/lib/types';

interface Props {
  scope: 'global' | string;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  onResults?: (state: SearchState) => void;
  autoFocus?: boolean;
  filters?: PedagogyRole[];
}

const SIZE_CLASSES = {
  sm: 'h-9 text-sm px-3',
  md: 'h-10 text-sm px-4',
  lg: 'h-14 text-base px-6',
};

export function SearchBar({
  scope,
  placeholder = 'Search...',
  size = 'md',
  onResults,
  autoFocus = false,
  filters,
}: Props) {
  const [inputValue, setInputValue] = useState('');
  const { state, runSearch, clearSearch } = useSearch(scope);

  useEffect(() => {
    if (onResults) {
      onResults(state);
    }
  }, [state, onResults]);

  const handleSearch = () => {
    if (inputValue.trim()) {
      runSearch(inputValue, filters);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleClear = () => {
    setInputValue('');
    clearSearch();
    if (onResults) {
      onResults({ status: 'idle' });
    }
  };

  return (
    <div className="relative w-full flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 
            focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 
            placeholder:text-slate-400 relative ${SIZE_CLASSES[size]}`}
        />
        {inputValue && (
          <button
            onClick={handleClear}
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors z-20 cursor-pointer p-1 hover:bg-slate-100 rounded-full"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <button
        onClick={handleSearch}
        disabled={!inputValue.trim()}
        className={`px-4 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center gap-2 ${SIZE_CLASSES[size]}`}
        aria-label="Search"
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">Search</span>
      </button>
    </div>
  );
}
