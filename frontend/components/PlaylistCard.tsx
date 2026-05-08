'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import type { Playlist } from '@/lib/types';
import { getSubjectColor } from '@/lib/utils';

interface Props {
  playlist: Playlist;
}

export function PlaylistCard({ playlist }: Props) {
  return (
    <Link href={`/playlist/${playlist.id}`}>
      <motion.div
        className="bg-white rounded-2xl border border-slate-200 overflow-hidden cursor-pointer"
        whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        {/* Thumbnail */}
        <div className="relative aspect-video w-full bg-slate-100">
          {playlist.thumbnail_url ? (
            <Image
              src={playlist.thumbnail_url}
              alt={playlist.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
              No thumbnail
            </div>
          )}
          {/* Processing badge */}
          {!playlist.processed && (
            <div className="absolute top-2 right-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full animate-pulse">
              Processing…
            </div>
          )}
        </div>

        {/* Card body */}
        <div className="p-4">
          {/* Subject badge */}
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-2 ${getSubjectColor(playlist.subject)}`}
          >
            {playlist.subject}
          </span>

          {/* Title */}
          <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-1 mb-1">
            {playlist.title}
          </h3>

          {/* Description */}
          <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed">
            {playlist.description || 'Lecture series on aerospace engineering.'}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              📹 {playlist.video_count} lectures
            </span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
