'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, ArrowLeft, Filter } from 'lucide-react';
import { useSearch } from '@/hooks/useSearch';
import { SearchResults } from './SearchResults';
import type { SearchState, PedagogyRole } from '@/lib/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  scope?: 'global' | string;
  initialQuery?: string;
}

const PEDAGOGY_FILTERS: { value: PedagogyRole; label: string; color: string }[] = [
  { value: 'introduction', label: 'Intro', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'explanation', label: 'Explained', color: 'bg-teal-100 text-teal-700 border-teal-300' },
  { value: 'derivation', label: 'Derived', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'application', label: 'Applied', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'comparison', label: 'Compared', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'example', label: 'Example', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'summary', label: 'Summary', color: 'bg-slate-200 text-slate-700 border-slate-400' },
  { value: 'tangential', label: 'Mentioned', color: 'bg-slate-100 text-slate-600 border-slate-300' },
];

export function SearchSidebar({ isOpen, onClose, scope = 'global', initialQuery = '' }: Props) {
  const [inputValue, setInputValue] = useState(initialQuery);
  const [selectedFilters, setSelectedFilters] = useState<PedagogyRole[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const { state, runSearch, clearSearch } = useSearch(scope);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when sidebar opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Update input if initial query changes
  useEffect(() => {
    setInputValue(initialQuery);
    if (initialQuery) {
      runSearch(initialQuery, selectedFilters.length > 0 ? selectedFilters : undefined);
    }
  }, [initialQuery]);

  const handleSearch = () => {
    if (inputValue.trim()) {
      runSearch(inputValue, selectedFilters.length > 0 ? selectedFilters : undefined);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const toggleFilter = (filter: PedagogyRole) => {
    setSelectedFilters(prev =>
      prev.includes(filter)
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
  };

  const clearAllFilters = () => {
    setSelectedFilters([]);
  };

  const handleClear = () => {
    setInputValue('');
    clearSearch();
  };

  const handleClose = () => {
    handleClear();
    setSelectedFilters([]);
    setShowFilters(false);
    onClose();
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity duration-300"
          onClick={handleClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[500px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-200 bg-slate-50">
            <button
              onClick={handleClose}
              className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-slate-200 transition-colors text-slate-600"
              aria-label="Close search"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold text-slate-900">
              {scope === 'global' ? 'Search All Lectures' : 'Search This Playlist'}
            </h2>
          </div>

          {/* Search Input */}
          <div className="px-4 py-4 border-b border-slate-200 space-y-3">
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none z-10" />
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={scope === 'global' ? 'Search across all subjects...' : 'Search in this playlist...'}
                  className="w-full h-12 pl-11 pr-11 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900 placeholder:text-slate-400 relative"
                />
                {inputValue && (
                  <button
                    onClick={handleClear}
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full p-1.5 transition-colors z-20 cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                onClick={handleSearch}
                disabled={!inputValue.trim()}
                className="px-5 h-12 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center gap-2"
                aria-label="Search"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Search</span>
              </button>
            </div>

            {/* Filter Toggle Button */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors text-sm text-slate-700"
              >
                <Filter className="w-4 h-4" />
                <span>Filters</span>
                {selectedFilters.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-blue-500 text-white rounded-full text-xs font-medium">
                    {selectedFilters.length}
                  </span>
                )}
              </button>
              {selectedFilters.length > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Filter Chips */}
            {showFilters && (
              <div className="flex flex-wrap gap-2 pt-2">
                {PEDAGOGY_FILTERS.map(filter => (
                  <button
                    key={filter.value}
                    onClick={() => toggleFilter(filter.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      selectedFilters.includes(filter.value)
                        ? filter.color
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            )}

            {/* Search Info */}
            <div className="text-xs text-slate-500">
              {state.status === 'idle' && 'Enter a query and click Search'}
              {state.status === 'loading' && 'Searching...'}
              {state.status === 'success' && `${state.results.length} results found`}
              {state.status === 'error' && 'Search failed. Please try again.'}
            </div>
          </div>

          {/* Results Container */}
          <div className="flex-1 overflow-y-auto">
            {state.status === 'idle' && (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Search Lectures</h3>
                <p className="text-sm text-slate-500 max-w-sm">
                  Use semantic search to find concepts, explanations, examples, and more across all video transcripts.
                </p>
              </div>
            )}

            {state.status !== 'idle' && (
              <div className="p-4">
                <SearchResults
                  state={state}
                  showPlaylistName={scope === 'global'}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
