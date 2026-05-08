'use client';

import { forwardRef } from 'react';
import Image from 'next/image';
import { Play } from 'lucide-react';
import type { Video } from '@/lib/types';
import { formatDuration, cn } from '@/lib/utils';
import { KeywordDropdown } from './KeywordDropdown';

interface Props {
  video: Video;
  playlistId: string;
  highlighted: boolean;
}

export const VideoRow = forwardRef<HTMLDivElement, Props>(
  ({ video, playlistId, highlighted }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl border border-slate-200 mb-3 transition-colors duration-700',
          highlighted ? 'bg-yellow-100' : 'bg-white'
        )}
      >
        <div className="flex items-center gap-4 p-4">
          {/* Position number */}
          <span className="text-2xl font-bold text-slate-300 w-8 text-center flex-shrink-0">
            {video.position}
          </span>

          {/* Thumbnail */}
          <a
            href={`https://youtube.com/watch?v=${video.youtube_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 relative group"
          >
            <Image
              src={video.thumbnail_url}
              alt={video.title}
              width={160}
              height={90}
              className="rounded-md object-cover hover:opacity-90 transition-opacity"
            />
            {/* Play icon overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="bg-black/50 rounded-full p-2">
                <Play className="w-4 h-4 text-white fill-white" />
              </div>
            </div>
          </a>

          {/* Title and duration */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 text-sm leading-snug">
              {video.title}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              {formatDuration(video.duration_seconds)}
            </p>
          </div>

          {/* Keywords dropdown */}
          {video.keywords.length > 0 && (
            <KeywordDropdown video={video} playlistId={playlistId} />
          )}
        </div>
      </div>
    );
  }
);

VideoRow.displayName = 'VideoRow';
