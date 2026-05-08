'use client';

import Image from 'next/image';
import { PedagogyBadge } from './PedagogyBadge';
import type { SearchResult } from '@/lib/types';
import { formatTimestamp, extractYoutubeId, escapeRegex, confidenceColor } from '@/lib/utils';

interface Props {
  result: SearchResult;
  showPlaylistName?: boolean;
  query?: string;
}

export function SearchResultCard({ result, showPlaylistName = false, query = '' }: Props) {
  const thumbnailUrl = `https://i.ytimg.com/vi/${extractYoutubeId(result.youtube_url)}/mqdefault.jpg`;

  const highlightTerms = (text: string, searchQuery: string) => {
    if (!searchQuery) return <>{text}</>;
    const terms = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const pattern = new RegExp(`(${terms.map(escapeRegex).join('|')})`, 'gi');
    const parts = text.split(pattern);

    return (
      <>
        {parts.map((part, i) =>
          pattern.test(part) ? (
            <strong key={i} className="font-semibold text-slate-900">
              {part}
            </strong>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  };

  return (
    <div className="p-4 flex gap-3 hover:bg-slate-50 transition-colors">
      {/* Thumbnail */}
      <div className="flex-shrink-0">
        <Image
          src={thumbnailUrl}
          alt={result.video_title}
          width={80}
          height={45}
          className="rounded-md object-cover"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title + Timestamp */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900 line-clamp-1">
            {result.video_title}
          </p>
          <a
            href={result.youtube_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-mono"
          >
            ▶ {formatTimestamp(result.timestamp_seconds)}
          </a>
        </div>

        {/* Snippet */}
        <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
          {highlightTerms(result.snippet_text, query)}
        </p>

        {/* Footer */}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <PedagogyBadge role={result.pedagogy_role} />
          <p className="text-xs text-slate-400 italic line-clamp-1 flex-1">
            {result.relevance_reason}
          </p>
        </div>

        {/* Confidence bar */}
        <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${confidenceColor(result.confidence_score)}`}
            style={{ width: `${result.confidence_score * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
