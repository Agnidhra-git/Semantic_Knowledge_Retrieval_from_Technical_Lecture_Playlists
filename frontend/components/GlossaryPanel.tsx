'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, Search, ExternalLink } from 'lucide-react';
import type { GlossaryTerm, GlossaryTermDetail, HeatmapPoint, ChunkSnippet } from '@/lib/types';
import { fetchGlossary, fetchGlossaryTermDetail, fetchHeatmap } from '@/lib/api';
import { ConceptHeatmapChart } from './ConceptHeatmapChart';
import { PedagogyBadge } from './PedagogyBadge';
import { cn, scoreToPoints, scoreToTier, buildYoutubeUrl } from '@/lib/utils';

interface Props {
  playlistId: string;
  onTermClick: (term: string) => void;
  onHeatmapBarClick: (videoId: string) => void;
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className}`} />;
}

export function GlossaryPanel({ playlistId, onTermClick, onHeatmapBarClick }: Props) {
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTermId, setExpandedTermId] = useState<string | null>(null);
  const [detailedTerms, setDetailedTerms] = useState<Record<string, GlossaryTermDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [heatmapData, setHeatmapData] = useState<Record<string, HeatmapPoint[]>>({});
  const [heatmapLoading, setHeatmapLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchGlossary(playlistId)
      .then((data) => {
        const sorted = data.sort((a, b) => a.term.localeCompare(b.term));
        setTerms(sorted);
      })
      .finally(() => setLoading(false));
  }, [playlistId]);

  const handleTermClick = async (term: GlossaryTerm) => {
    onTermClick(term.term);

    // Toggle expansion
    if (expandedTermId === term.id) {
      setExpandedTermId(null);
      return;
    }

    setExpandedTermId(term.id);

    // Fetch detailed term data if not cached
    if (!detailedTerms[term.id]) {
      setDetailLoading(term.id);
      try {
        const detailData = await fetchGlossaryTermDetail(playlistId, term.term);
        setDetailedTerms((prev) => ({ ...prev, [term.id]: detailData }));
      } catch {
        // Silent fail
      }
      setDetailLoading(null);
    }

    // Fetch heatmap if not cached
    if (!heatmapData[term.term]) {
      setHeatmapLoading(term.term);
      try {
        const data = await fetchHeatmap(term.term, playlistId);
        setHeatmapData((prev) => ({ ...prev, [term.term]: data }));
      } catch {
        // Silent fail
      }
      setHeatmapLoading(null);
    }
  };

  // Filter terms by search query
  const filteredTerms = terms.filter(term => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      term.term.toLowerCase().includes(query) ||
      term.definition.toLowerCase().includes(query)
    );
  });

  // Group terms by first letter for alphabetical sections
  const groupedTerms: Record<string, GlossaryTerm[]> = {};
  filteredTerms.forEach(term => {
    const firstLetter = term.term.charAt(0).toUpperCase();
    if (!groupedTerms[firstLetter]) {
      groupedTerms[firstLetter] = [];
    }
    groupedTerms[firstLetter].push(term);
  });
  const sortedLetters = Object.keys(groupedTerms).sort();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-4">
        <h2 className="font-bold text-slate-900 mb-3">
          Glossary{' '}
          {!loading && (
            <span className="text-slate-400 font-normal">
              ({filteredTerms.length}{searchQuery && ` of ${terms.length}`})
            </span>
          )}
        </h2>
        
        {/* Search Bar */}
        {!loading && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search glossary terms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}
      </div>

      {/* Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto px-4">
        {/* Loading */}
        {loading && (
          <div className="space-y-3 py-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* No results message */}
        {!loading && filteredTerms.length === 0 && searchQuery && (
          <div className="text-center py-12">
            <p className="text-sm text-slate-500">No glossary terms match "{searchQuery}"</p>
          </div>
        )}

        {/* Term list with alphabetical sections */}
        {!loading && sortedLetters.map((letter) => (
          <div key={letter} className="mb-6">
            {/* Alphabetical Header */}
            <div className="sticky top-0 bg-white py-2 mb-2 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">{letter}</h3>
            </div>
            
            {/* Terms in this section */}
            {groupedTerms[letter].map((term) => {
          const points = scoreToPoints(term.importance_score);
          const tier = scoreToTier(term.importance_score);
          
          return (
          <div key={term.id} className="mb-1">
            {/* Term row */}
            <button
              onClick={() => handleTermClick(term)}
              className="w-full text-left p-3 rounded-xl hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-slate-900 flex-1">
                  {term.term}
                </span>
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${tier.bgColor} flex-shrink-0`}>
                  <span className={`text-xs font-bold ${tier.color}`}>
                    {points}
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    'w-3 h-3 text-slate-400 transition-transform flex-shrink-0',
                    expandedTermId === term.id && 'rotate-180'
                  )}
                />
              </div>

              {/* Definition - truncated when collapsed, full when expanded */}
              <p className={cn(
                "text-xs text-slate-500 mt-1",
                expandedTermId !== term.id && "truncate"
              )}>
                {term.definition}
              </p>
            </button>

            {/* Related terms */}
            {term.related_terms.length > 0 && (
              <div className="flex flex-wrap gap-1 px-3 pb-2">
                {term.related_terms.slice(0, 4).map((rel) => (
                  <button
                    key={rel}
                    onClick={() => onTermClick(rel)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                  >
                    {rel}
                  </button>
                ))}
              </div>
            )}

            {/* Expanded content */}
            {expandedTermId === term.id && (
              <div className="px-3 pb-3 space-y-3">
                {/* Loading state */}
                {detailLoading === term.id && (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full rounded" />
                    <Skeleton className="h-16 w-full rounded" />
                  </div>
                )}

                {/* Best Explanations - Chunk Links */}
                {!detailLoading && detailedTerms[term.id] && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Best Explanations</p>
                    <div className="space-y-1.5">
                      {detailedTerms[term.id].best_intro_chunk && (
                        <ChunkLink chunk={detailedTerms[term.id].best_intro_chunk!} />
                      )}
                      {detailedTerms[term.id].best_deriv_chunk && (
                        <ChunkLink chunk={detailedTerms[term.id].best_deriv_chunk!} />
                      )}
                      {detailedTerms[term.id].best_expl_chunk && (
                        <ChunkLink chunk={detailedTerms[term.id].best_expl_chunk!} />
                      )}
                    </div>
                  </div>
                )}

                {/* Heatmap */}
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Coverage Across Lectures</p>
                  {heatmapLoading === term.term ? (
                    <Skeleton className="h-8 w-full rounded" />
                  ) : (
                    <ConceptHeatmapChart
                      data={heatmapData[term.term] ?? []}
                      onBarClick={onHeatmapBarClick}
                    />
                  )}
                </div>
              </div>
            )}
              </div>
            );
          })}
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper component to render a chunk link with pedagogy badge
function ChunkLink({ chunk }: { chunk: ChunkSnippet }) {
  const youtubeUrl = buildYoutubeUrl(chunk.video_youtube_id, chunk.start_time);
  const snippetPreview = chunk.text.length > 100 
    ? chunk.text.substring(0, 100) + '...' 
    : chunk.text;

  return (
    <a
      href={youtubeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-2 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-colors group"
    >
      <div className="flex items-start gap-2">
        <PedagogyBadge role={chunk.pedagogy_role} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate-600 line-clamp-2 group-hover:text-slate-900">
            {snippetPreview}
          </p>
          <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
            <span className="truncate">{chunk.video_title}</span>
            <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>
    </a>
  );
}
