'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { PlaylistCard } from '@/components/PlaylistCard';
import { SearchSidebar } from '@/components/SearchSidebar';
import type { Playlist } from '@/lib/types';

interface Props {
  playlists: Playlist[];
}

export function HomePageClient({ playlists }: Props) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="hero-gradient py-20 px-4 md:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-blue-400 text-sm uppercase tracking-widest mb-3">
            NPTEL Aerospace Engineering
          </p>
          <h1 className="text-white text-4xl md:text-5xl font-bold mb-3">
            Aerospace Knowledge Explorer
          </h1>
          <p className="text-slate-400 text-lg mt-3">
            Semantic search across NPTEL lecture playlists
          </p>

          {/* Search Button */}
          <div className="mt-8 max-w-2xl mx-auto">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full h-14 px-6 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg flex items-center gap-3 text-left hover:bg-white/15 transition-all group"
            >
              <Search className="w-5 h-5 text-slate-400 group-hover:text-slate-300" />
              <span className="text-slate-400 group-hover:text-slate-300">
                Search across all subjects...
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Playlists Section */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 py-12">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Subjects</h2>
        <p className="text-sm text-slate-500 mb-6">
          {playlists.length} playlists available
        </p>

        {playlists.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            No playlists available yet. Check backend connection.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {playlists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        )}
      </section>

      {/* Search Sidebar */}
      <SearchSidebar
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        scope="global"
      />
    </div>
  );
}
