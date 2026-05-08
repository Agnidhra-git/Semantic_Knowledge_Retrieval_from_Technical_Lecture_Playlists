import { fetchPlaylist, fetchPlaylistVideos } from '@/lib/api';
import { PlaylistDetailClient } from './PlaylistDetailClient';
import Link from 'next/link';

export default async function PlaylistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [playlist, videos] = await Promise.all([
    fetchPlaylist(id).catch(() => null),
    fetchPlaylistVideos(id).catch(() => []),
  ]);

  if (!playlist) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24 px-4">
        <div className="text-6xl mb-4">❌</div>
        <h1 className="text-2xl font-bold text-slate-900">Playlist not found</h1>
        <p className="mt-3 text-slate-500">
          The playlist you're looking for doesn't exist or has been removed.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-blue-600 hover:underline text-sm"
        >
          ← Back to all playlists
        </Link>
      </div>
    );
  }

  // Show available videos even if playlist is not fully processed
  return <PlaylistDetailClient playlist={playlist} initialVideos={videos} />;
}
