import { fetchPlaylist, fetchGlossary, fetchPlaylistVideos } from '@/lib/api';
import { GlossaryClient } from './GlossaryClient';
import Link from 'next/link';

export default async function GlossaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [playlist, terms, videos] = await Promise.all([
    fetchPlaylist(id).catch(() => null),
    fetchGlossary(id).catch(() => []),
    fetchPlaylistVideos(id).catch(() => []),
  ]);

  if (!playlist) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24 px-4">
        <div className="text-6xl mb-4">❌</div>
        <h1 className="text-2xl font-bold text-slate-900">Playlist not found</h1>
        <Link
          href="/"
          className="mt-6 inline-block text-blue-600 hover:underline text-sm"
        >
          ← Back to all playlists
        </Link>
      </div>
    );
  }

  const videoMap: Record<string, { youtube_id: string; title: string }> = {};
  videos.forEach((v) => {
    videoMap[v.id] = { youtube_id: v.youtube_id, title: v.title };
  });

  return <GlossaryClient playlist={playlist} terms={terms} videoMap={videoMap} />;
}
