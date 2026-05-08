'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, ChevronDown, ExternalLink } from 'lucide-react';
import type { Playlist, GlossaryTerm, GlossaryTermDetail, ChunkSnippet } from '@/lib/types';
import { fetchGlossaryTermDetail } from '@/lib/api';
import { groupBy, scoreToPoints, scoreToTier, buildYoutubeUrl, cn } from '@/lib/utils';
import { PedagogyBadge } from '@/components/PedagogyBadge';

interface Props {
  playlist: Playlist;
  terms: GlossaryTerm[];
  videoMap: Record<string, { youtube_id: string; title: string }>;
}

export function GlossaryClient({ playlist, terms, videoMap }: Props) {
  const [filterQuery, setFilterQuery] = useState('');
  const [expandedTermId, setExpandedTermId] = useState<string | null>(null);
  const [detailedTerms, setDetailedTerms] = useState<Record<string, GlossaryTermDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const filtered = terms.filter(
    (t) =>
      t.term.toLowerCase().includes(filterQuery.toLowerCase()) ||
      t.definition.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const grouped = groupBy(filtered, (term) => term.term[0].toUpperCase());
  const letters = Object.keys(grouped).sort();

  const handleTermExpand = async (termId: string, termName: string) => {
    // Toggle expansion
    if (expandedTermId === termId) {
      setExpandedTermId(null);
      return;
    }

    setExpandedTermId(termId);

    // Fetch detailed term data if not cached
    if (!detailedTerms[termId]) {
      setDetailLoading(termId);
      try {
        const detailData = await fetchGlossaryTermDetail(playlist.id, termName);
        setDetailedTerms((prev) => ({ ...prev, [termId]: detailData }));
      } catch {
        // Silent fail
      }
      setDetailLoading(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
      {/* Header */}
      <Link
        href={`/playlist/${playlist.id}`}
        className="text-sm text-blue-600 hover:underline mb-6 inline-block"
      >
        ← Back to {playlist.title}
      </Link>
      <h1 className="text-3xl font-bold text-slate-900 mb-1">Glossary</h1>
      <p className="text-slate-500 mb-6">
        {playlist.title} · {terms.length} terms
      </p>

      {/* Filter */}
      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Filter terms…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      {/* Alphabetical groups */}
      {letters.map((letter) => (
        <div key={letter} className="mb-10">
          {/* Letter heading */}
          <div className="sticky top-14 bg-white py-2 mb-4 border-b border-slate-100">
            <h2 className="text-xl font-bold text-slate-300">{letter}</h2>
          </div>

          {/* Terms */}
          <div className="space-y-6">
            {grouped[letter].map((term) => {
              const points = scoreToPoints(term.importance_score);
              const tier = scoreToTier(term.importance_score);
              const firstVideo = videoMap[term.first_video_id];
              const firstVideoUrl = firstVideo
                ? buildYoutubeUrl(firstVideo.youtube_id, term.first_timestamp)
                : null;

              return (
                <div
                  key={term.id}
                  className="bg-white rounded-2xl border border-slate-200 p-6"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-slate-900">{term.term}</h3>
                        <button
                          onClick={() => handleTermExpand(term.id, term.term)}
                          className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                          aria-label="Toggle details"
                        >
                          <ChevronDown
                            className={cn(
                              'w-4 h-4 text-slate-400 transition-transform',
                              expandedTermId === term.id && 'rotate-180'
                            )}
                          />
                        </button>
                      </div>
                    </div>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${tier.bgColor} flex-shrink-0`}>
                      <span className={`text-sm font-bold ${tier.color}`}>
                        {points}
                      </span>
                      <span className={`text-xs font-medium ${tier.color}`}>
                        {tier.label}
                      </span>
                    </div>
                  </div>

                  {/* Definition */}
                  <p className="mt-3 text-slate-700 leading-relaxed text-sm">
                    {term.definition}
                  </p>

                  {/* Related terms */}
                  {term.related_terms.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">
                        Related
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {term.related_terms.map((rel) => (
                          <button
                            key={rel}
                            onClick={() => setFilterQuery(rel)}
                            className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700 text-xs transition-colors"
                          >
                            {rel}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* First introduced */}
                  {firstVideoUrl && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <a
                        href={firstVideoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        ▶ First introduced: {firstVideo?.title || 'Video'}
                      </a>
                    </div>
                  )}

                  {/* Expanded content - Best Explanations */}
                  {expandedTermId === term.id && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      {detailLoading === term.id ? (
                        <div className="space-y-2">
                          <div className="animate-pulse bg-slate-200 rounded h-16 w-full" />
                          <div className="animate-pulse bg-slate-200 rounded h-16 w-full" />
                        </div>
                      ) : (
                        detailedTerms[term.id] && (
                          <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-3 font-semibold">
                              Best Explanations
                            </p>
                            <div className="space-y-2">
                              {detailedTerms[term.id].best_intro_chunk && (
                                <ChunkLinkCard chunk={detailedTerms[term.id].best_intro_chunk!} />
                              )}
                              {detailedTerms[term.id].best_deriv_chunk && (
                                <ChunkLinkCard chunk={detailedTerms[term.id].best_deriv_chunk!} />
                              )}
                              {detailedTerms[term.id].best_expl_chunk && (
                                <ChunkLinkCard chunk={detailedTerms[term.id].best_expl_chunk!} />
                              )}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Empty filter state */}
      {filtered.length === 0 && filterQuery && (
        <p className="text-center text-slate-500 py-12">
          No terms matching &ldquo;{filterQuery}&rdquo;
        </p>
      )}
    </div>
  );
}

// Helper component to render a chunk link card with pedagogy badge
function ChunkLinkCard({ chunk }: { chunk: ChunkSnippet }) {
  const youtubeUrl = buildYoutubeUrl(chunk.video_youtube_id, chunk.start_time);
  const snippetPreview = chunk.text.length > 150 
    ? chunk.text.substring(0, 150) + '...' 
    : chunk.text;

  return (
    <a
      href={youtubeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <PedagogyBadge role={chunk.pedagogy_role} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-600 leading-relaxed group-hover:text-slate-900">
            {snippetPreview}
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
            <span className="truncate">{chunk.video_title}</span>
            <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>
    </a>
  );
}
