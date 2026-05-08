'use client';

import { useState, useRef, createRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';
import type { Playlist, Video } from '@/lib/types';
import { getSubjectColor } from '@/lib/utils';
import { SearchSidebar } from '@/components/SearchSidebar';
import { VideoRow } from '@/components/VideoRow';
import { GlossaryPanel } from '@/components/GlossaryPanel';
import { QAPanel } from '@/components/QAPanel';

interface Props {
  playlist: Playlist;
  initialVideos: Video[];
}

type TabType = 'videos' | 'glossary' | 'practice';

export function PlaylistDetailClient({ playlist, initialVideos }: Props) {
  const [highlightedVideoId, setHighlightedVideoId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('videos');

  // Create refs for each video
  const videoRefs = useRef<Record<string, React.RefObject<HTMLDivElement>>>({});
  initialVideos.forEach((video) => {
    if (!videoRefs.current[video.id]) {
      videoRefs.current[video.id] = createRef<HTMLDivElement>();
    }
  });

  const handleHeatmapBarClick = (videoId: string) => {
    setHighlightedVideoId(videoId);
    videoRefs.current[videoId]?.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    setTimeout(() => setHighlightedVideoId(null), 2000);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Sticky Top Bar */}
      <div className="sticky top-14 z-40 bg-white border-b border-slate-200 px-4 md:px-8 py-3 flex items-center gap-4">
        <Link
          href="/"
          className="text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-slate-900 truncate text-sm md:text-base">
            {playlist.title}
          </h1>
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${getSubjectColor(playlist.subject)}`}
          >
            {playlist.subject}
          </span>
        </div>
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors text-sm font-medium"
        >
          <Search className="w-4 h-4" />
          <span className="hidden md:inline">Search</span>
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="sticky top-[7.25rem] z-30 bg-white border-b border-slate-200 px-4 md:px-8">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('videos')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'videos'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Videos
            <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
              {initialVideos.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('glossary')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'glossary'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Glossary
          </button>
          <button
            onClick={() => setActiveTab('practice')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'practice'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Practice Questions
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {/* Videos Tab */}
        {activeTab === 'videos' && (
          <div className="h-full overflow-y-auto py-6 px-4 md:px-8">
            {/* Processing Banner */}
            {!playlist.processed && (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">⏳</div>
                  <div className="flex-1">
                    <p className="font-semibold text-yellow-900 text-sm">
                      Processing in progress
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      This playlist is still being indexed. Showing {initialVideos.length} of {playlist.video_count} videos with available data.
                      {playlist.processing_error && (
                        <span className="block mt-1 text-red-600">
                          Error: {playlist.processing_error}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Video List */}
            {initialVideos.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <p className="text-sm">No videos available yet.</p>
                <p className="text-xs mt-1">Videos will appear here as they are processed.</p>
              </div>
            ) : (
              initialVideos.map((video) => (
                <VideoRow
                  key={video.id}
                  video={video}
                  playlistId={playlist.id}
                  highlighted={highlightedVideoId === video.id}
                  ref={videoRefs.current[video.id]}
                />
              ))
            )}
          </div>
        )}

        {/* Glossary Tab */}
        {activeTab === 'glossary' && (
          <div className="h-full">
            <GlossaryPanel
              playlistId={playlist.id}
              onTermClick={(term) => {
                // Future: Trigger search
              }}
              onHeatmapBarClick={handleHeatmapBarClick}
            />
          </div>
        )}

        {/* Practice Questions Tab */}
        {activeTab === 'practice' && (
          <div className="h-full">
            <QAPanel playlistId={playlist.id} />
          </div>
        )}
      </div>

      {/* Search Sidebar */}
      <SearchSidebar
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        scope={playlist.id}
      />
    </div>
  );
}
