import { fetchPlaylists } from '@/lib/api';
import { HomePageClient } from './HomePageClient';

export default async function Page() {
  const playlists = await fetchPlaylists().catch(() => []);
  return <HomePageClient playlists={playlists} />;
}
