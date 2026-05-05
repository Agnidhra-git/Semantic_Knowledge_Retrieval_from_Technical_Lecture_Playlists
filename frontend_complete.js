/**
 * ============================================================================
 * AEROSPACE LECTURE PLATFORM — COMPLETE FRONTEND DOCUMENTATION
 * ============================================================================
 *
 * This file is a complete, end-to-end description of the frontend system.
 * It is written as a JavaScript documentation file — every component,
 * page, hook, API function, data flow, design decision, and implementation
 * detail is described here with annotated pseudocode/real code patterns.
 *
 * Stack:
 *   Framework       : Next.js 14 (App Router)
 *   Language        : TypeScript
 *   Styling         : Tailwind CSS
 *   UI Components   : shadcn/ui
 *   Animations      : Framer Motion
 *   Font            : Inter (Google Fonts)
 *   Hosting         : Vercel (free tier)
 *   Backend API     : FastAPI at NEXT_PUBLIC_API_URL (default http://localhost:8000)
 *
 * ============================================================================
 */


// ============================================================================
// SECTION 1 — PROJECT STRUCTURE
// ============================================================================

/**
 * frontend/
 * ├── app/
 * │   ├── layout.tsx                  Root layout — Inter font, nav bar, global providers
 * │   ├── page.tsx                    Home page — hero + global search + playlist grid
 * │   ├── globals.css                 Tailwind base, CSS variables for shadcn theme
 * │   ├── playlist/
 * │   │   └── [id]/
 * │   │       ├── page.tsx            Playlist detail — video list + glossary sidebar
 * │   │       └── loading.tsx         Skeleton loading state for playlist page
 * │   └── glossary/
 * │       └── [id]/
 * │           └── page.tsx            Full-page glossary viewer for a playlist
 * │
 * ├── components/
 * │   ├── PlaylistCard.tsx            Card shown in home page grid
 * │   ├── VideoRow.tsx                Single video row in playlist detail
 * │   ├── KeywordDropdown.tsx         Collapsible keyword pills under a video
 * │   ├── SearchBar.tsx               Reusable search input (global + scoped)
 * │   ├── SearchResults.tsx           Renders list of SearchResultCard items
 * │   ├── SearchResultCard.tsx        Single search result (thumbnail, snippet, badges)
 * │   ├── HeatmapViz.tsx              Div-based horizontal intensity bar chart
 * │   ├── GlossaryPanel.tsx           Sticky sidebar panel (playlist detail page)
 * │   ├── PedagogyBadge.tsx           Small colored pill for pedagogy role
 * │   └── ConceptHeatmapChart.tsx     Mini heatmap shown inline in GlossaryPanel
 * │
 * ├── lib/
 * │   ├── api.ts                      All typed API fetch functions
 * │   └── types.ts                    All TypeScript interfaces
 * │
 * ├── hooks/
 * │   ├── useSearch.ts                Debounced search hook with loading/error state
 * │   └── usePlaylists.ts             Client-side playlist fetching hook (fallback)
 * │
 * ├── public/                         Static assets (favicon, og-image, etc.)
 * ├── next.config.ts                  Next.js configuration (image domains, env)
 * ├── tailwind.config.ts              Tailwind config (content paths, theme extension)
 * ├── tsconfig.json                   TypeScript config (strict, path aliases)
 * ├── components.json                 shadcn/ui config
 * └── package.json
 */


// ============================================================================
// SECTION 2 — ENVIRONMENT VARIABLES
// ============================================================================

/**
 * File: .env.local  (local development)
 * File: Vercel dashboard → Environment Variables (production)
 *
 *   NEXT_PUBLIC_API_URL=http://localhost:8000
 *
 * NOTES:
 *   - NEXT_PUBLIC_ prefix exposes the variable to the browser bundle.
 *   - In production, set this to the Render backend URL:
 *     https://your-render-app.onrender.com
 *   - The API URL must NOT have a trailing slash.
 *   - This is the only required env var. All other config is in source.
 *
 * Access pattern (lib/api.ts):
 *   const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
 */


// ============================================================================
// SECTION 3 — TYPESCRIPT TYPES (lib/types.ts)
// ============================================================================

/**
 * This file defines every data shape used in the app.
 * These types are derived directly from the backend API response schemas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * // Represents one YouTube playlist (course)
 * export interface Playlist {
 *   id: string               // Supabase UUID
 *   youtube_id: string       // YouTube playlist ID (e.g. "PLxyz123")
 *   title: string            // Full playlist title
 *   subject: string          // e.g. "Rocket Propulsion", "Aerodynamics"
 *   description: string      // LLM-generated 3-sentence academic description
 *   thumbnail_url: string    // YouTube thumbnail URL
 *   video_count: number      // Total number of lectures in playlist
 *   processed: boolean       // True only after full pipeline completes
 * }
 *
 * // Keyword associated with a video (from video_keywords table)
 * export interface VideoKeyword {
 *   keyword: string            // The domain term (e.g. "isentropic flow")
 *   importance_score: number   // 0–1, how central this term is to the lecture
 *   frequency: number          // Approximate count of mentions
 *   pedagogy_context: string   // Best pedagogy role for this keyword
 * }
 *
 * // One lecture video inside a playlist
 * export interface Video {
 *   id: string                 // Supabase UUID
 *   youtube_id: string         // YouTube video ID (e.g. "dQw4w9WgXcQ")
 *   title: string              // Video title
 *   position: number           // 1-indexed order in playlist
 *   duration_seconds: number   // Total length in seconds
 *   thumbnail_url: string      // YouTube thumbnail URL
 *   keywords: VideoKeyword[]   // Top 8–15 domain keywords, sorted by importance
 * }
 *
 * // The 8 pedagogical roles a transcript chunk can be classified as
 * export type PedagogyRole =
 *   | 'introduction'  // First formal presentation of a concept
 *   | 'derivation'    // Mathematical or logical derivation
 *   | 'explanation'   // Intuitive explanation or analogy
 *   | 'application'   // Real-world use or worked example
 *   | 'comparison'    // Comparing two concepts or approaches
 *   | 'tangential'    // Mentioned but not central
 *   | 'example'       // A concrete illustrative example
 *   | 'summary'       // Recap or conclusion
 *
 * // One semantic search result (from /search endpoint)
 * export interface SearchResult {
 *   video_id: string            // Supabase UUID of the video
 *   video_title: string         // Title of the video containing this chunk
 *   playlist_id: string         // Supabase UUID of the playlist
 *   timestamp_seconds: number   // Start time (seconds) of the matching chunk
 *   youtube_url: string         // Full YouTube deep-link with &t= parameter
 *   snippet_text: string        // First 400 chars of the matching chunk text
 *   pedagogy_role: PedagogyRole // Role of the matching chunk
 *   confidence_score: number    // 0–1 composite relevance score
 *   relevance_reason: string    // Gemini-generated explanation (≤15 words)
 * }
 *
 * // One term in the playlist glossary
 * export interface GlossaryTerm {
 *   id: string                  // Supabase UUID
 *   term: string                // The technical term (e.g. "Mach number")
 *   definition: string          // 2–3 sentence Gemini-generated definition
 *   importance_score: number    // 0–1 composite importance
 *   first_video_id: string      // UUID of the video where term was first introduced
 *   first_timestamp: number     // Seconds into first_video where term appears
 *   related_terms: string[]     // Top 5 co-occurring terms (array of strings)
 * }
 *
 * // One point in the concept intensity heatmap
 * export interface HeatmapPoint {
 *   video_id: string    // Supabase UUID of the video
 *   position: number    // 1-indexed position of the video in the playlist
 *   intensity: number   // 0–1 composite intensity score
 *   timestamp: number   // Best timestamp for this term in this video (seconds)
 * }
 *
 * // Internal UI state type used in useSearch hook
 * export type SearchState =
 *   | { status: 'idle' }
 *   | { status: 'loading' }
 *   | { status: 'success'; results: SearchResult[]; query: string }
 *   | { status: 'error'; message: string }
 */


// ============================================================================
// SECTION 4 — API LAYER (lib/api.ts)
// ============================================================================

/**
 * All network calls are made from this single file.
 * Every function is async, typed, and throws on non-2xx responses.
 * All functions prepend BASE_URL via a shared apiFetch helper.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BASE FETCH HELPER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
 *
 *   async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
 *     const url = `${BASE_URL}${path}`
 *     const res = await fetch(url, {
 *       headers: { 'Content-Type': 'application/json' },
 *       ...init,
 *     })
 *     if (!res.ok) {
 *       const body = await res.text().catch(() => 'Unknown error')
 *       throw new Error(`API error ${res.status} on ${path}: ${body}`)
 *     }
 *     return res.json() as Promise<T>
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPORTED FUNCTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   // Fetch all playlists (sorted by subject on backend)
 *   export async function fetchPlaylists(): Promise<Playlist[]> {
 *     return apiFetch<Playlist[]>('/playlists')
 *   }
 *
 *   // Fetch a single playlist by its Supabase UUID
 *   export async function fetchPlaylist(id: string): Promise<Playlist> {
 *     return apiFetch<Playlist>(`/playlists/${id}`)
 *   }
 *
 *   // Fetch all videos in a playlist, each with nested keywords array
 *   export async function fetchPlaylistVideos(id: string): Promise<Video[]> {
 *     return apiFetch<Video[]>(`/playlists/${id}/videos`)
 *   }
 *
 *   // Run semantic search
 *   //   scope: 'global' to search all playlists, or a playlist UUID for scoped
 *   //   topK: number of results to return (default 5, backend max 10)
 *   export async function search(
 *     query: string,
 *     scope: 'global' | string = 'global',
 *     topK: number = 5
 *   ): Promise<SearchResult[]> {
 *     const params = new URLSearchParams({
 *       q: query,
 *       scope,
 *       top_k: String(topK),
 *     })
 *     return apiFetch<SearchResult[]>(`/search?${params}`)
 *   }
 *
 *   // Fetch the full glossary for a playlist
 *   export async function fetchGlossary(playlistId: string): Promise<GlossaryTerm[]> {
 *     return apiFetch<GlossaryTerm[]>(`/glossary/${playlistId}`)
 *   }
 *
 *   // Fetch heatmap data for a specific term within a playlist
 *   export async function fetchHeatmap(
 *     term: string,
 *     playlistId: string
 *   ): Promise<HeatmapPoint[]> {
 *     const params = new URLSearchParams({ term, playlist_id: playlistId })
 *     return apiFetch<HeatmapPoint[]>(`/search/heatmap?${params}`)
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CACHING NOTES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   fetchPlaylists() — Used in Server Component (app/page.tsx).
 *     Add { next: { revalidate: 60 } } to RequestInit to revalidate every 60s.
 *     This means the home page is statically cached and refreshed every minute.
 *
 *   fetchPlaylistVideos() — Used in Server Component (app/playlist/[id]/page.tsx).
 *     Add { next: { revalidate: 300 } } — video data changes infrequently.
 *
 *   search() — Never cached on the frontend (backend has its own 7-day cache).
 *     Called from Client Components only. No { next: { revalidate } } needed.
 *
 *   fetchGlossary() — Used in Server Component for glossary page.
 *     Add { next: { revalidate: 300 } }.
 *
 *   fetchHeatmap() — Called on demand from Client Component when user clicks a
 *     glossary term. No caching — fast enough from backend cache.
 */


// ============================================================================
// SECTION 5 — CUSTOM HOOKS (hooks/)
// ============================================================================

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * hooks/useSearch.ts
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Handles the full search lifecycle: debouncing, loading state, error state,
 * results. Used by SearchBar + SearchResults to coordinate state.
 *
 *   'use client'
 *
 *   import { useState, useCallback, useRef } from 'react'
 *   import { search } from '@/lib/api'
 *   import type { SearchResult, SearchState } from '@/lib/types'
 *
 *   export function useSearch(scope: string = 'global') {
 *     const [state, setState] = useState<SearchState>({ status: 'idle' })
 *     const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
 *
 *     const runSearch = useCallback((query: string) => {
 *       // Clear previous debounce timer
 *       if (debounceRef.current) clearTimeout(debounceRef.current)
 *
 *       // Reset to idle if query is empty
 *       if (!query.trim()) {
 *         setState({ status: 'idle' })
 *         return
 *       }
 *
 *       // Debounce 400ms
 *       debounceRef.current = setTimeout(async () => {
 *         setState({ status: 'loading' })
 *         try {
 *           const results = await search(query.trim(), scope, 5)
 *           setState({ status: 'success', results, query: query.trim() })
 *         } catch (err) {
 *           setState({ status: 'error', message: 'Search unavailable — please try again' })
 *         }
 *       }, 400)
 *     }, [scope])
 *
 *     const clearSearch = useCallback(() => {
 *       if (debounceRef.current) clearTimeout(debounceRef.current)
 *       setState({ status: 'idle' })
 *     }, [])
 *
 *     return { state, runSearch, clearSearch }
 *   }
 *
 *   USAGE:
 *     const { state, runSearch, clearSearch } = useSearch('global')
 *     // OR for scoped:
 *     const { state, runSearch, clearSearch } = useSearch(playlistId)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * hooks/usePlaylists.ts
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Client-side playlist fetch hook. Not used on the home page (which uses
 * Server Components), but available for components that need it dynamically.
 *
 *   'use client'
 *
 *   import { useState, useEffect } from 'react'
 *   import { fetchPlaylists } from '@/lib/api'
 *   import type { Playlist } from '@/lib/types'
 *
 *   export function usePlaylists() {
 *     const [playlists, setPlaylists]   = useState<Playlist[]>([])
 *     const [loading, setLoading]       = useState(true)
 *     const [error, setError]           = useState<string | null>(null)
 *
 *     useEffect(() => {
 *       fetchPlaylists()
 *         .then(setPlaylists)
 *         .catch(() => setError('Failed to load playlists'))
 *         .finally(() => setLoading(false))
 *     }, [])
 *
 *     return { playlists, loading, error }
 *   }
 */


// ============================================================================
// SECTION 6 — ROOT LAYOUT (app/layout.tsx)
// ============================================================================

/**
 * Server Component. Wraps all pages with a consistent shell.
 *
 * RESPONSIBILITIES:
 *   1. Import Inter from 'next/font/google' and apply as className to <html>
 *   2. Set global metadata (title, description, og:image)
 *   3. Render a top navigation bar
 *   4. Render {children} in a <main> tag
 *
 * NAVIGATION BAR:
 *   - Fixed at top, height 56px (h-14)
 *   - Background: white with bottom border (border-b border-slate-200)
 *   - Left: Logo — a small rocket emoji + "AeroLearn" in bold
 *     Clicking logo navigates to /
 *   - Right: Link to GitHub (optional, opens new tab)
 *   - Does NOT contain search bar — search is page-specific
 *   - On mobile: logo only (no right-side links)
 *   - Uses Next.js <Link> component for client-side navigation
 *
 * FONTS:
 *   import { Inter } from 'next/font/google'
 *   const inter = Inter({ subsets: ['latin'] })
 *   // Apply: <html lang="en" className={inter.className}>
 *
 * METADATA:
 *   export const metadata: Metadata = {
 *     title: 'AeroLearn — Aerospace Lecture Search',
 *     description: 'Semantic search across NPTEL aerospace engineering lectures',
 *     openGraph: {
 *       title: 'AeroLearn',
 *       description: 'Search NPTEL aerospace lecture content semantically',
 *     },
 *   }
 *
 * FULL MARKUP STRUCTURE:
 *   <html lang="en" className={inter.className}>
 *     <body className="min-h-screen bg-white text-slate-900 antialiased">
 *       <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-white border-b
 *                        border-slate-200 flex items-center px-4 md:px-8">
 *         <Link href="/">
 *           <span className="text-lg font-bold">🚀 AeroLearn</span>
 *         </Link>
 *       </nav>
 *       <main className="pt-14">
 *         {children}
 *       </main>
 *     </body>
 *   </html>
 */


// ============================================================================
// SECTION 7 — HOME PAGE (app/page.tsx)
// ============================================================================

/**
 * Server Component. Fetches playlists at build/request time. Passes data
 * as props to Client Components for interactivity.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DATA FETCHING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   export default async function HomePage() {
 *     const playlists = await fetchPlaylists()
 *     return (
 *       <>
 *         <HeroSection />            // Client Component — contains SearchBar
 *         <PlaylistGrid playlists={playlists} />   // Client Component
 *       </>
 *     )
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HERO SECTION (inline in page.tsx or extracted to HeroSection.tsx)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Marks as 'use client' to use useSearch hook.
 *
 *   Background: bg-[#0f172a] (dark navy)
 *   Padding: py-20 px-4 md:px-8
 *   Max width: max-w-3xl mx-auto text-center
 *
 *   Contents (top to bottom):
 *     1. Small eyebrow text: "NPTEL Aerospace Engineering" (text-blue-400,
 *        text-sm, uppercase tracking-widest)
 *     2. H1 title: "Aerospace Knowledge Explorer"
 *        (text-white, text-4xl md:text-5xl font-bold, mt-3)
 *     3. Subtitle: "Semantic search across NPTEL lecture playlists"
 *        (text-slate-400, text-lg, mt-3)
 *     4. SearchBar component (mt-8, max-w-2xl mx-auto)
 *        - scope = 'global'
 *        - placeholder = "Search across all subjects…"
 *        - size = 'lg' prop for large variant
 *     5. SearchResults rendered below the bar if state.status !== 'idle'
 *        - Container: mt-4 max-w-2xl mx-auto rounded-xl bg-white shadow-2xl
 *          overflow-hidden (appears to float over dark background)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PLAYLIST GRID SECTION (inline in page.tsx or PlaylistGrid.tsx)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Container: max-w-7xl mx-auto px-4 md:px-8 py-12
 *
 *   Section heading: "Subjects" (text-2xl font-bold text-slate-900, mb-6)
 *   Subtitle under heading: "{playlists.length} playlists available"
 *   (text-sm text-slate-500)
 *
 *   Grid: grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6
 *
 *   Each item: <PlaylistCard key={p.id} playlist={p} />
 *
 *   Empty state (if playlists.length === 0):
 *     A centered message: "No playlists available yet."
 *     (text-slate-500 text-center py-20)
 */


// ============================================================================
// SECTION 8 — PLAYLISTCARD COMPONENT (components/PlaylistCard.tsx)
// ============================================================================

/**
 * 'use client'
 *
 * Client Component. Used in the home page grid.
 * Renders a single playlist as a card with thumbnail, metadata, and hover effects.
 *
 * PROPS:
 *   interface Props {
 *     playlist: Playlist
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SUBJECT COLOR SYSTEM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Deterministically pick one of 8 Tailwind color classes based on subject string.
 *   This ensures the same subject always gets the same color, even across renders.
 *
 *   const SUBJECT_COLORS = [
 *     'bg-blue-100 text-blue-800',
 *     'bg-purple-100 text-purple-800',
 *     'bg-teal-100 text-teal-800',
 *     'bg-green-100 text-green-800',
 *     'bg-orange-100 text-orange-800',
 *     'bg-pink-100 text-pink-800',
 *     'bg-indigo-100 text-indigo-800',
 *     'bg-yellow-100 text-yellow-800',
 *   ]
 *
 *   function getSubjectColor(subject: string): string {
 *     let hash = 0
 *     for (let i = 0; i < subject.length; i++) {
 *       hash = (hash * 31 + subject.charCodeAt(i)) & 0xffffffff
 *     }
 *     return SUBJECT_COLORS[Math.abs(hash) % SUBJECT_COLORS.length]
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FRAMER MOTION HOVER ANIMATION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Use motion.div (from framer-motion) as the card wrapper.
 *   whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}
 *   transition={{ type: 'spring', stiffness: 400, damping: 25 }}
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CARD STRUCTURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <Link href={`/playlist/${playlist.id}`}>
 *     <motion.div
 *       className="bg-white rounded-2xl border border-slate-200 overflow-hidden
 *                  cursor-pointer"
 *       whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}
 *       transition={{ type: 'spring', stiffness: 400, damping: 25 }}
 *     >
 *       {/* Thumbnail — 16:9 aspect ratio */}
 *       <div className="relative aspect-video w-full bg-slate-100">
 *         <Image
 *           src={playlist.thumbnail_url}
 *           alt={playlist.title}
 *           fill
 *           className="object-cover"
 *           sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
 *         />
 *         {/* Processing shimmer badge — shown if !playlist.processed */}
 *         {!playlist.processed && (
 *           <div className="absolute top-2 right-2 px-2 py-1 bg-yellow-100
 *                            text-yellow-800 text-xs rounded-full animate-pulse">
 *             Processing…
 *           </div>
 *         )}
 *       </div>
 *
 *       {/* Card body */}
 *       <div className="p-4">
 *         {/* Subject badge */}
 *         <span className={`inline-block px-2 py-0.5 rounded-full text-xs
 *                           font-medium mb-2 ${getSubjectColor(playlist.subject)}`}>
 *           {playlist.subject}
 *         </span>
 *
 *         {/* Title — single line with truncation */}
 *         <h3 className="font-bold text-slate-900 text-sm leading-snug
 *                         line-clamp-1 mb-1">
 *           {playlist.title}
 *         </h3>
 *
 *         {/* Description — 2 line clamp */}
 *         <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed">
 *           {playlist.description || 'Lecture series on aerospace engineering.'}
 *         </p>
 *
 *         {/* Footer row */}
 *         <div className="flex items-center justify-between">
 *           <span className="text-xs text-slate-400">
 *             📹 {playlist.video_count} lectures
 *           </span>
 *         </div>
 *       </div>
 *     </motion.div>
 *   </Link>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMAGE DOMAIN CONFIG (next.config.ts)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   YouTube thumbnails are at i.ytimg.com. Add to next.config.ts:
 *
 *   const nextConfig = {
 *     images: {
 *       remotePatterns: [
 *         { protocol: 'https', hostname: 'i.ytimg.com' },
 *         { protocol: 'https', hostname: 'img.youtube.com' },
 *       ],
 *     },
 *   }
 */


// ============================================================================
// SECTION 9 — SEARCHBAR COMPONENT (components/SearchBar.tsx)
// ============================================================================

/**
 * 'use client'
 *
 * Reusable search input. Used in:
 *   1. Home page hero (size='lg', scope='global')
 *   2. Playlist detail page top bar (size='md', scope=playlistId)
 *
 * PROPS:
 *   interface Props {
 *     scope: 'global' | string      // 'global' or playlist UUID
 *     placeholder?: string           // Input placeholder text
 *     size?: 'sm' | 'md' | 'lg'    // Controls input height and text size
 *     onResults?: (state: SearchState) => void  // Callback for parent
 *     autoFocus?: boolean
 *   }
 *
 * INTERNAL STATE:
 *   - inputValue: string            // Controlled input value
 *   - Uses useSearch(scope) hook for search state management
 *
 * BEHAVIOR:
 *   - Controlled input: value={inputValue} onChange updates inputValue
 *   - On every inputValue change, call runSearch(inputValue)
 *     (debouncing is handled inside useSearch)
 *   - On form submit (Enter key or submit button): call runSearch immediately,
 *     bypassing the debounce by calling clearTimeout and running at once
 *   - X button (shown when inputValue is non-empty): clears input and calls clearSearch()
 *   - Passes state back to parent via onResults callback on every state change
 *
 * SIZE VARIANTS:
 *   sm : h-9  text-sm  px-3   — used in small contexts
 *   md : h-10 text-sm  px-4   — used in playlist page top bar
 *   lg : h-14 text-base px-6  — used in home hero
 *
 * MARKUP STRUCTURE:
 *   <div className="relative w-full">
 *     <Search className="absolute left-3 top-1/2 -translate-y-1/2
 *                         w-4 h-4 text-slate-400" />
 *     <input
 *       type="text"
 *       value={inputValue}
 *       onChange={...}
 *       placeholder={placeholder}
 *       className="w-full rounded-xl border border-slate-200 bg-white
 *                  pl-10 pr-10 focus:outline-none focus:ring-2
 *                  focus:ring-blue-500 text-slate-900 placeholder:text-slate-400
 *                  [size-classes]"
 *     />
 *     {inputValue && (
 *       <button onClick={clearAll}
 *         className="absolute right-3 top-1/2 -translate-y-1/2
 *                    text-slate-400 hover:text-slate-600">
 *         <X className="w-4 h-4" />
 *       </button>
 *     )}
 *   </div>
 *
 * ICON: Use lucide-react icons (Search, X)
 * Import: import { Search, X } from 'lucide-react'
 */


// ============================================================================
// SECTION 10 — SEARCHRESULTS COMPONENT (components/SearchResults.tsx)
// ============================================================================

/**
 * 'use client'
 *
 * Renders the full search result panel: loading skeletons, empty state,
 * error state, or a list of SearchResultCard items.
 *
 * PROPS:
 *   interface Props {
 *     state: SearchState
 *     showPlaylistName?: boolean   // true for global search, false for scoped
 *     onClose?: () => void         // optional close button callback
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOADING STATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Show 3 skeleton cards when state.status === 'loading'.
 *   Each skeleton:
 *     <div className="p-4 flex gap-3 animate-pulse">
 *       <Skeleton className="h-16 w-24 rounded-lg flex-shrink-0" />
 *       <div className="flex-1 space-y-2">
 *         <Skeleton className="h-4 w-3/4" />
 *         <Skeleton className="h-3 w-full" />
 *         <Skeleton className="h-3 w-1/2" />
 *       </div>
 *     </div>
 *   Use shadcn Skeleton component.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SUCCESS STATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Header row:
 *     Left: "{results.length} results for '{query}'" (text-sm text-slate-500 px-4 pt-3)
 *     Right (if onClose): X button
 *
 *   Empty results within success:
 *     <div className="py-8 text-center px-4">
 *       <p className="text-sm text-slate-500">
 *         No results found — try rephrasing as a concept
 *         (e.g. "what is drag divergence")
 *       </p>
 *     </div>
 *
 *   Non-empty: map results to <SearchResultCard> with dividers between
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ERROR STATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <div className="p-6 text-center">
 *     <p className="text-sm text-red-500">
 *       Search unavailable — please try again
 *     </p>
 *   </div>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IDLE STATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Render nothing (return null).
 */


// ============================================================================
// SECTION 11 — SEARCHRESULTCARD COMPONENT (components/SearchResultCard.tsx)
// ============================================================================

/**
 * 'use client'
 *
 * Renders one search result row.
 *
 * PROPS:
 *   interface Props {
 *     result: SearchResult
 *     showPlaylistName?: boolean
 *     query?: string   // for bolding matching terms in snippet
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SNIPPET TERM HIGHLIGHTING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   function highlightTerms(text: string, query: string): JSX.Element {
 *     if (!query) return <>{text}</>
 *     const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
 *     // Build a regex that matches any term, case-insensitive
 *     const pattern = new RegExp(`(${terms.map(escapeRegex).join('|')})`, 'gi')
 *     const parts = text.split(pattern)
 *     return (
 *       <>
 *         {parts.map((part, i) =>
 *           pattern.test(part)
 *             ? <strong key={i} className="font-semibold text-slate-900">{part}</strong>
 *             : <span key={i}>{part}</span>
 *         )}
 *       </>
 *     )
 *   }
 *
 *   // Reset lastIndex after test
 *   function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONFIDENCE BAR COLOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   The thin progress bar under the snippet uses a color that transitions
 *   from green (high confidence) → orange → red (low confidence):
 *
 *   function confidenceColor(score: number): string {
 *     if (score >= 0.7) return 'bg-green-500'
 *     if (score >= 0.4) return 'bg-orange-400'
 *     return 'bg-red-400'
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * YOUTUBE DEEP LINK
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   The result.youtube_url is already constructed with &t= on the backend.
 *   Just render it as-is in an anchor tag with target="_blank".
 *   Format timestamp for display: formatTimestamp(result.timestamp_seconds)
 *
 *   function formatTimestamp(seconds: number): string {
 *     const m = Math.floor(seconds / 60)
 *     const s = Math.floor(seconds % 60)
 *     return `${m}:${s.toString().padStart(2, '0')}`
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MARKUP STRUCTURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <div className="p-4 flex gap-3 hover:bg-slate-50 transition-colors">
 *
 *     {/* Left: YouTube thumbnail (small 80×45) */}
 *     <div className="flex-shrink-0">
 *       <Image
 *         src={`https://i.ytimg.com/vi/${extractYoutubeId(result.youtube_url)}/mqdefault.jpg`}
 *         alt={result.video_title}
 *         width={80}
 *         height={45}
 *         className="rounded-md object-cover"
 *       />
 *     </div>
 *
 *     {/* Right: metadata */}
 *     <div className="flex-1 min-w-0">
 *
 *       {/* Title row */}
 *       <div className="flex items-start justify-between gap-2">
 *         <p className="text-sm font-semibold text-slate-900 line-clamp-1">
 *           {result.video_title}
 *         </p>
 *         {/* Timestamp deep link */}
 *         <a href={result.youtube_url} target="_blank" rel="noopener noreferrer"
 *            className="flex-shrink-0 flex items-center gap-1 text-xs
 *                        text-blue-600 hover:text-blue-800 font-mono">
 *           ▶ {formatTimestamp(result.timestamp_seconds)}
 *         </a>
 *       </div>
 *
 *       {/* Playlist name (global search only) */}
 *       {showPlaylistName && (
 *         <p className="text-xs text-slate-400 mt-0.5">
 *           {result.playlist_id}  {/* ideally resolved to playlist title */}
 *         </p>
 *       )}
 *
 *       {/* Snippet with highlighted terms, 2-line clamp */}
 *       <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
 *         {highlightTerms(result.snippet_text, query ?? '')}
 *       </p>
 *
 *       {/* Footer row: badges + relevance */}
 *       <div className="mt-2 flex items-center gap-2 flex-wrap">
 *         <PedagogyBadge role={result.pedagogy_role} />
 *         <p className="text-xs text-slate-400 italic line-clamp-1 flex-1">
 *           {result.relevance_reason}
 *         </p>
 *       </div>
 *
 *       {/* Confidence bar */}
 *       <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
 *         <div
 *           className={`h-full rounded-full transition-all ${confidenceColor(result.confidence_score)}`}
 *           style={{ width: `${result.confidence_score * 100}%` }}
 *         />
 *       </div>
 *     </div>
 *   </div>
 *
 * NOTE: extractYoutubeId(url) parses the video ID from the youtube_url string.
 *   function extractYoutubeId(url: string): string {
 *     const match = url.match(/[?&]v=([^&]+)/)
 *     return match?.[1] ?? ''
 *   }
 */


// ============================================================================
// SECTION 12 — PEDAGOGYBADGE COMPONENT (components/PedagogyBadge.tsx)
// ============================================================================

/**
 * A tiny colored pill badge mapping pedagogy roles to colors and labels.
 * Used in KeywordDropdown, SearchResultCard, GlossaryPanel.
 *
 * PROPS:
 *   interface Props {
 *     role: PedagogyRole
 *     className?: string
 *   }
 *
 * ROLE → COLOR + LABEL MAPPING:
 *
 *   const ROLE_CONFIG: Record<PedagogyRole, { label: string; className: string }> = {
 *     introduction: { label: 'Intro',    className: 'bg-blue-100 text-blue-700' },
 *     derivation:   { label: 'Derived',  className: 'bg-purple-100 text-purple-700' },
 *     explanation:  { label: 'Explained',className: 'bg-teal-100 text-teal-700' },
 *     application:  { label: 'Applied',  className: 'bg-green-100 text-green-700' },
 *     comparison:   { label: 'Compared', className: 'bg-orange-100 text-orange-700' },
 *     tangential:   { label: 'Mentioned',className: 'bg-slate-100 text-slate-600' },
 *     example:      { label: 'Example',  className: 'bg-yellow-100 text-yellow-700' },
 *     summary:      { label: 'Summary',  className: 'bg-slate-200 text-slate-700' },
 *   }
 *
 * MARKUP:
 *   const config = ROLE_CONFIG[role]
 *   <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px]
 *                     font-medium ${config.className} ${className}`}>
 *     {config.label}
 *   </span>
 */


// ============================================================================
// SECTION 13 — PLAYLIST DETAIL PAGE (app/playlist/[id]/page.tsx)
// ============================================================================

/**
 * Server Component for initial data fetch. Passes data to Client Components.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DATA FETCHING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   export default async function PlaylistDetailPage({
 *     params,
 *   }: {
 *     params: { id: string }
 *   }) {
 *     const [playlist, videos] = await Promise.all([
 *       fetchPlaylist(params.id),
 *       fetchPlaylistVideos(params.id),
 *     ])
 *
 *     // If playlist is not yet processed, show a friendly message
 *     if (!playlist.processed) {
 *       return <NotYetProcessed playlist={playlist} />
 *     }
 *
 *     return (
 *       <PlaylistDetailClient playlist={playlist} initialVideos={videos} />
 *     )
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOT YET PROCESSED STATE (inline component)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <div className="max-w-2xl mx-auto text-center py-24 px-4">
 *     <div className="text-6xl mb-4">⏳</div>
 *     <h1 className="text-2xl font-bold text-slate-900">{playlist.title}</h1>
 *     <p className="mt-3 text-slate-500">
 *       This playlist is still being indexed. Check back shortly.
 *     </p>
 *     <p className="mt-1 text-sm text-slate-400">
 *       Processing {playlist.video_count} lectures…
 *     </p>
 *     <Link href="/" className="mt-6 inline-block text-blue-600 hover:underline text-sm">
 *       ← Back to all playlists
 *     </Link>
 *   </div>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PlaylistDetailClient (Client Component — receives pre-fetched data)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   'use client'
 *
 *   Props: { playlist: Playlist; initialVideos: Video[] }
 *
 *   State:
 *     - highlightedVideoId: string | null   (for heatmap bar click scroll)
 *     - sheetOpen: boolean                  (scoped search results sheet)
 *     - videoRefs: Map<string, RefObject>   (for scroll-to-video)
 *
 *   Layout:
 *     <div className="flex flex-col h-screen">
 *
 *       {/* Sticky top bar */}
 *       <div className="sticky top-14 z-40 bg-white border-b border-slate-200
 *                        px-4 md:px-8 py-3 flex items-center gap-4">
 *         <Link href="/" className="text-slate-500 hover:text-slate-900">
 *           <ArrowLeft className="w-5 h-5" />
 *         </Link>
 *         <div className="flex-1 min-w-0">
 *           <h1 className="font-bold text-slate-900 truncate text-sm md:text-base">
 *             {playlist.title}
 *           </h1>
 *           <SubjectBadge subject={playlist.subject} />
 *         </div>
 *         {/* Scoped search bar — right aligned */}
 *         <div className="w-64 flex-shrink-0">
 *           <SearchBar
 *             scope={playlist.id}
 *             placeholder={`Search in ${playlist.title}…`}
 *             size="md"
 *             onResults={(state) => {
 *               setScopedSearchState(state)
 *               if (state.status === 'success' || state.status === 'loading') {
 *                 setSheetOpen(true)
 *               }
 *             }}
 *           />
 *         </div>
 *       </div>
 *
 *       {/* Two-column main layout */}
 *       <div className="flex flex-1 overflow-hidden">
 *
 *         {/* Left: video list (scrollable) */}
 *         <div className="flex-1 overflow-y-auto py-6 px-4 md:px-8">
 *           {videos.map((video) => (
 *             <VideoRow
 *               key={video.id}
 *               video={video}
 *               playlistId={playlist.id}
 *               highlighted={highlightedVideoId === video.id}
 *               ref={videoRefs.get(video.id)}
 *             />
 *           ))}
 *         </div>
 *
 *         {/* Right: glossary sidebar (sticky, desktop only) */}
 *         <div className="hidden lg:block w-80 xl:w-96 border-l border-slate-200
 *                          overflow-y-auto flex-shrink-0">
 *           <GlossaryPanel
 *             playlistId={playlist.id}
 *             onTermClick={(termName) => {
 *               // Run a scoped search for this term
 *               // Also triggers scroll to relevant video if heatmap bar clicked
 *             }}
 *             onHeatmapBarClick={(videoId) => {
 *               setHighlightedVideoId(videoId)
 *               videoRefs.get(videoId)?.current?.scrollIntoView({
 *                 behavior: 'smooth', block: 'center'
 *               })
 *               // Flash yellow animation — see VideoRow
 *               setTimeout(() => setHighlightedVideoId(null), 2000)
 *             }}
 *           />
 *         </div>
 *       </div>
 *
 *       {/* Scoped search results sheet (slides in from right) */}
 *       <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
 *         <SheetContent side="right" className="w-[420px] sm:w-[480px] p-0">
 *           <div className="p-4 border-b">
 *             <h2 className="font-semibold text-sm text-slate-900">
 *               Search Results
 *             </h2>
 *           </div>
 *           <div className="overflow-y-auto h-full pb-20">
 *             <SearchResults
 *               state={scopedSearchState}
 *               showPlaylistName={false}
 *             />
 *           </div>
 *         </SheetContent>
 *       </Sheet>
 *     </div>
 */


// ============================================================================
// SECTION 14 — LOADING STATE (app/playlist/[id]/loading.tsx)
// ============================================================================

/**
 * Next.js automatic loading UI. Shown while the Server Component fetches data.
 *
 *   export default function PlaylistLoading() {
 *     return (
 *       <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
 *
 *         {/* Top bar skeleton */}
 *         <div className="flex items-center gap-4 mb-6">
 *           <Skeleton className="h-8 w-8 rounded" />
 *           <Skeleton className="h-6 w-64" />
 *           <Skeleton className="h-9 w-48 ml-auto" />
 *         </div>
 *
 *         {/* Two-column skeleton */}
 *         <div className="flex gap-6">
 *           <div className="flex-1 space-y-4">
 *             {Array.from({ length: 6 }).map((_, i) => (
 *               <div key={i} className="flex gap-4 p-4 bg-white rounded-xl border
 *                                        border-slate-200 animate-pulse">
 *                 <Skeleton className="h-4 w-6" />
 *                 <Skeleton className="h-16 w-28 rounded-md" />
 *                 <div className="flex-1 space-y-2">
 *                   <Skeleton className="h-4 w-3/4" />
 *                   <Skeleton className="h-3 w-1/4" />
 *                 </div>
 *               </div>
 *             ))}
 *           </div>
 *           <div className="hidden lg:block w-80">
 *             <Skeleton className="h-8 w-32 mb-4" />
 *             {Array.from({ length: 8 }).map((_, i) => (
 *               <Skeleton key={i} className="h-16 w-full mb-3 rounded-xl" />
 *             ))}
 *           </div>
 *         </div>
 *       </div>
 *     )
 *   }
 */


// ============================================================================
// SECTION 15 — VIDEOROW COMPONENT (components/VideoRow.tsx)
// ============================================================================

/**
 * 'use client'
 *
 * Renders one lecture video in the playlist detail page.
 * Uses React.forwardRef to expose a DOM ref for scroll-to behavior.
 *
 * PROPS:
 *   interface Props {
 *     video: Video
 *     playlistId: string
 *     highlighted: boolean    // When true, flash yellow background animation
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DURATION FORMATTING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   function formatDuration(seconds: number): string {
 *     const h = Math.floor(seconds / 3600)
 *     const m = Math.floor((seconds % 3600) / 60)
 *     const s = Math.floor(seconds % 60)
 *     if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
 *     return `${m}:${s.toString().padStart(2, '0')}`
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * YELLOW FLASH ANIMATION (on highlighted prop)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   When highlighted becomes true, animate a yellow background that fades out.
 *   Use Framer Motion animate prop:
 *   <motion.div
 *     animate={{ backgroundColor: highlighted ? '#fef08a' : '#ffffff' }}
 *     transition={{ duration: 0.3 }}
 *     // ... rest of card
 *   >
 *   Or equivalently use a CSS transition with a dynamic className:
 *   className={cn(
 *     "transition-colors duration-700",
 *     highlighted ? "bg-yellow-100" : "bg-white"
 *   )}
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MARKUP STRUCTURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <div ref={ref} className={cn("rounded-xl border border-slate-200 mb-3 overflow-hidden",
 *                                highlighted ? "bg-yellow-100" : "bg-white")}>
 *
 *     {/* Main row */}
 *     <div className="flex items-center gap-4 p-4">
 *
 *       {/* Position number */}
 *       <span className="text-2xl font-bold text-slate-300 w-8 text-center flex-shrink-0">
 *         {video.position}
 *       </span>
 *
 *       {/* Thumbnail — click opens YouTube in new tab */}
 *       <a
 *         href={`https://youtube.com/watch?v=${video.youtube_id}`}
 *         target="_blank"
 *         rel="noopener noreferrer"
 *         className="flex-shrink-0 relative"
 *       >
 *         <Image
 *           src={video.thumbnail_url}
 *           alt={video.title}
 *           width={160}
 *           height={90}
 *           className="rounded-md object-cover hover:opacity-90 transition-opacity"
 *         />
 *         {/* Play icon overlay */}
 *         <div className="absolute inset-0 flex items-center justify-center
 *                          opacity-0 hover:opacity-100 transition-opacity">
 *           <div className="bg-black/50 rounded-full p-2">
 *             <Play className="w-4 h-4 text-white fill-white" />
 *           </div>
 *         </div>
 *       </a>
 *
 *       {/* Title and duration */}
 *       <div className="flex-1 min-w-0">
 *         <p className="font-semibold text-slate-900 text-sm leading-snug">
 *           {video.title}
 *         </p>
 *         <p className="text-xs text-slate-400 mt-0.5 font-mono">
 *           {formatDuration(video.duration_seconds)}
 *         </p>
 *       </div>
 *
 *       {/* Keywords dropdown toggle */}
 *       {video.keywords.length > 0 && (
 *         <KeywordDropdown
 *           video={video}
 *           playlistId={playlistId}
 *         />
 *       )}
 *     </div>
 *
 *     {/* Keyword dropdown expansion — rendered below the main row */}
 *     {/* (KeywordDropdown manages its own open/close state internally) */}
 *   </div>
 */


// ============================================================================
// SECTION 16 — KEYWORDDROPDOWN COMPONENT (components/KeywordDropdown.tsx)
// ============================================================================

/**
 * 'use client'
 *
 * A collapsible section showing keywords for a video.
 * Uses shadcn Collapsible component.
 * Clicking a keyword runs a scoped search.
 *
 * PROPS:
 *   interface Props {
 *     video: Video
 *     playlistId: string
 *   }
 *
 * INTERNAL STATE:
 *   - open: boolean                  // Whether the dropdown is expanded
 *   - clickedKeyword: string | null  // Which keyword was clicked for inline results
 *   - searchState: SearchState       // Result of searching the clicked keyword
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * KEYWORD LIST RENDERING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Keywords are sorted descending by importance_score before rendering.
 *   const sorted = [...video.keywords].sort((a, b) => b.importance_score - a.importance_score)
 *
 *   Each keyword pill:
 *   <button
 *     key={kw.keyword}
 *     onClick={() => handleKeywordClick(kw.keyword)}
 *     className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
 *                border border-slate-200 hover:border-blue-300
 *                hover:bg-blue-50 transition-colors text-xs"
 *   >
 *     {/* Keyword text */}
 *     <span className="text-slate-700 font-medium">{kw.keyword}</span>
 *
 *     {/* Pedagogy badge */}
 *     <PedagogyBadge role={kw.pedagogy_context as PedagogyRole} />
 *
 *     {/* Importance bar — thin colored bar, width = score × 100% */}
 *     {/* Show as a visual indicator inside the pill */}
 *   </button>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANCE BAR INSIDE KEYWORD PILL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   A small "meter" bar that shows how important the keyword is:
 *   <div className="relative h-1 w-12 bg-slate-200 rounded-full overflow-hidden">
 *     <div
 *       className="absolute inset-y-0 left-0 bg-blue-400 rounded-full"
 *       style={{ width: `${kw.importance_score * 100}%` }}
 *     />
 *   </div>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * KEYWORD CLICK → INLINE SEARCH RESULTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   async function handleKeywordClick(keyword: string) {
 *     setClickedKeyword(keyword)
 *     setSearchState({ status: 'loading' })
 *     try {
 *       const results = await search(keyword, playlistId, 5)
 *       setSearchState({ status: 'success', results, query: keyword })
 *     } catch {
 *       setSearchState({ status: 'error', message: 'Search unavailable' })
 *     }
 *   }
 *
 *   Below the keyword pills, render inline SearchResults:
 *   {clickedKeyword && (
 *     <div className="mt-3 border-t border-slate-100 pt-3">
 *       <div className="flex items-center justify-between mb-2">
 *         <p className="text-xs text-slate-500">
 *           Results for "{clickedKeyword}"
 *         </p>
 *         <button onClick={() => setClickedKeyword(null)}
 *                 className="text-xs text-slate-400 hover:text-slate-600">
 *           Close
 *         </button>
 *       </div>
 *       <SearchResults state={searchState} showPlaylistName={false} />
 *     </div>
 *   )}
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COLLAPSIBLE TOGGLE BUTTON
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Rendered in the VideoRow's right section:
 *   <CollapsibleTrigger asChild>
 *     <button className="flex items-center gap-1 text-xs text-slate-500
 *                         hover:text-slate-900 border border-slate-200
 *                         rounded-lg px-3 py-1.5 flex-shrink-0">
 *       Keywords
 *       <ChevronDown className={cn("w-3 h-3 transition-transform",
 *                                   open && "rotate-180")} />
 *     </button>
 *   </CollapsibleTrigger>
 */


// ============================================================================
// SECTION 17 — GLOSSARYPANEL COMPONENT (components/GlossaryPanel.tsx)
// ============================================================================

/**
 * 'use client'
 *
 * Sticky sidebar panel on the playlist detail page.
 * Fetches the glossary client-side when the panel first mounts (lazy load).
 * This avoids blocking the SSR data fetch on the page.
 *
 * PROPS:
 *   interface Props {
 *     playlistId: string
 *     onTermClick: (term: string) => void        // Run scoped search
 *     onHeatmapBarClick: (videoId: string) => void  // Scroll to video
 *   }
 *
 * INTERNAL STATE:
 *   - terms: GlossaryTerm[]                      // All glossary terms
 *   - loading: boolean
 *   - expandedTermId: string | null              // Which term shows heatmap
 *   - heatmapData: Record<string, HeatmapPoint[]> // Cached heatmap per term
 *   - heatmapLoading: string | null              // Term name being loaded
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INITIAL DATA FETCH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   useEffect(() => {
 *     fetchGlossary(playlistId)
 *       .then(data => setTerms(data.sort((a, b) => b.importance_score - a.importance_score)))
 *       .finally(() => setLoading(false))
 *   }, [playlistId])
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TERM CLICK BEHAVIOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   async function handleTermClick(term: GlossaryTerm) {
 *     onTermClick(term.term)   // triggers scoped search in parent
 *
 *     // Toggle heatmap visibility
 *     if (expandedTermId === term.id) {
 *       setExpandedTermId(null)
 *       return
 *     }
 *
 *     setExpandedTermId(term.id)
 *
 *     // Fetch heatmap if not already cached
 *     if (!heatmapData[term.term]) {
 *       setHeatmapLoading(term.term)
 *       try {
 *         const data = await fetchHeatmap(term.term, playlistId)
 *         setHeatmapData(prev => ({ ...prev, [term.term]: data }))
 *       } catch { /* silently fail */ }
 *       setHeatmapLoading(null)
 *     }
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MARKUP STRUCTURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <div className="p-4">
 *
 *     {/* Header */}
 *     <div className="flex items-center justify-between mb-4">
 *       <h2 className="font-bold text-slate-900">
 *         Glossary {!loading && <span className="text-slate-400 font-normal">({terms.length})</span>}
 *       </h2>
 *       <Link href={`/glossary/${playlistId}`}
 *             className="text-xs text-blue-600 hover:underline">
 *         View full →
 *       </Link>
 *     </div>
 *
 *     {/* Loading skeleton */}
 *     {loading && (
 *       <div className="space-y-3">
 *         {Array.from({ length: 6 }).map((_, i) => (
 *           <Skeleton key={i} className="h-14 w-full rounded-lg" />
 *         ))}
 *       </div>
 *     )}
 *
 *     {/* Term list */}
 *     {!loading && terms.map(term => (
 *       <div key={term.id} className="mb-1">
 *
 *         {/* Term row — clickable */}
 *         <button
 *           onClick={() => handleTermClick(term)}
 *           className="w-full text-left p-3 rounded-xl hover:bg-slate-50
 *                       transition-colors group"
 *         >
 *           <div className="flex items-center justify-between">
 *             <span className="font-semibold text-sm text-slate-900">
 *               {term.term}
 *             </span>
 *             <ChevronDown className={cn("w-3 h-3 text-slate-400 transition-transform",
 *                                        expandedTermId === term.id && "rotate-180")} />
 *           </div>
 *
 *           {/* Definition (1 line truncated) */}
 *           <p className="text-xs text-slate-500 truncate mt-0.5">
 *             {term.definition}
 *           </p>
 *
 *           {/* Importance bar */}
 *           <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
 *             <div className="h-full bg-blue-400 rounded-full"
 *                  style={{ width: `${term.importance_score * 100}%` }} />
 *           </div>
 *         </button>
 *
 *         {/* Related terms pills — shown always or on expand */}
 *         {term.related_terms.length > 0 && (
 *           <div className="flex flex-wrap gap-1 px-3 pb-2">
 *             {term.related_terms.slice(0, 4).map(rel => (
 *               <button
 *                 key={rel}
 *                 onClick={() => onTermClick(rel)}
 *                 className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100
 *                             text-slate-600 hover:bg-blue-100 hover:text-blue-700
 *                             transition-colors"
 *               >
 *                 {rel}
 *               </button>
 *             ))}
 *           </div>
 *         )}
 *
 *         {/* Heatmap — shown when this term is expanded */}
 *         {expandedTermId === term.id && (
 *           <div className="px-3 pb-3">
 *             {heatmapLoading === term.term ? (
 *               <Skeleton className="h-8 w-full rounded" />
 *             ) : (
 *               <ConceptHeatmapChart
 *                 data={heatmapData[term.term] ?? []}
 *                 onBarClick={onHeatmapBarClick}
 *               />
 *             )}
 *           </div>
 *         )}
 *       </div>
 *     ))}
 *   </div>
 */


// ============================================================================
// SECTION 18 — CONCEPTHEATMAPCHART COMPONENT (components/ConceptHeatmapChart.tsx)
// ============================================================================

/**
 * 'use client'
 *
 * A div-based horizontal heatmap chart.
 * X-axis = video position in playlist.
 * Color = intensity (green → yellow → red).
 * No external chart library — pure CSS/div.
 *
 * PROPS:
 *   interface Props {
 *     data: HeatmapPoint[]
 *     onBarClick: (videoId: string) => void
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTENSITY → COLOR MAPPING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Use CSS linear-interpolation between green (0) → yellow (0.5) → red (1).
 *   Approach: use inline style with a computed HSL value.
 *
 *   function intensityToColor(intensity: number): string {
 *     // Hue: 120 (green) at 0 → 60 (yellow) at 0.5 → 0 (red) at 1
 *     const hue = Math.round(120 - intensity * 120)
 *     const saturation = 70
 *     const lightness = 45 + (1 - intensity) * 10  // slightly lighter at low intensity
 *     return `hsl(${hue}, ${saturation}%, ${lightness}%)`
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MARKUP STRUCTURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   If data.length === 0:
 *     <p className="text-xs text-slate-400 italic">No data for this term</p>
 *
 *   Otherwise:
 *
 *   <div>
 *     <p className="text-[10px] text-slate-400 mb-1">
 *       Coverage across {data.length} lectures
 *     </p>
 *     <div className="flex gap-0.5 h-8 items-end">
 *       {data.map((point) => (
 *         <button
 *           key={point.video_id}
 *           title={`Lecture ${point.position} — intensity ${(point.intensity * 100).toFixed(0)}%`}
 *           onClick={() => onBarClick(point.video_id)}
 *           className="flex-1 min-w-[4px] rounded-sm hover:opacity-80
 *                       transition-opacity cursor-pointer"
 *           style={{
 *             backgroundColor: intensityToColor(point.intensity),
 *             height: `${Math.max(20, point.intensity * 100)}%`,
 *           }}
 *         />
 *       ))}
 *     </div>
 *     {/* X-axis labels: show every 5th video number */}
 *     <div className="flex gap-0.5 mt-1">
 *       {data.map((point, i) => (
 *         <div key={point.video_id} className="flex-1 text-center">
 *           {(i + 1) % 5 === 0 || i === 0 ? (
 *             <span className="text-[8px] text-slate-400">{point.position}</span>
 *           ) : null}
 *         </div>
 *       ))}
 *     </div>
 *   </div>
 *
 * CLICK BEHAVIOR:
 *   Clicking a bar calls onBarClick(point.video_id).
 *   The parent (PlaylistDetailClient) handles scroll + yellow flash.
 *   The tooltip (title attribute) shows the lecture number and intensity.
 */


// ============================================================================
// SECTION 19 — GLOSSARY PAGE (app/glossary/[id]/page.tsx)
// ============================================================================

/**
 * Server Component for initial data. Passes terms to Client Component for
 * filtering and interaction.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DATA FETCHING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   export default async function GlossaryPage({ params }: { params: { id: string } }) {
 *     const [playlist, terms] = await Promise.all([
 *       fetchPlaylist(params.id),
 *       fetchGlossary(params.id),
 *     ])
 *     return <GlossaryClient playlist={playlist} terms={terms} />
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GlossaryClient (Client Component)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   'use client'
 *
 *   Props: { playlist: Playlist; terms: GlossaryTerm[] }
 *
 *   STATE:
 *     filterQuery: string   // Client-side filter input value
 *
 *   FILTERING LOGIC:
 *     const filtered = terms.filter(t =>
 *       t.term.toLowerCase().includes(filterQuery.toLowerCase()) ||
 *       t.definition.toLowerCase().includes(filterQuery.toLowerCase())
 *     )
 *
 *   ALPHABETICAL GROUPING:
 *     Group filtered terms by first letter:
 *     const grouped = filtered.reduce((acc, term) => {
 *       const letter = term.term[0].toUpperCase()
 *       if (!acc[letter]) acc[letter] = []
 *       acc[letter].push(term)
 *       return acc
 *     }, {} as Record<string, GlossaryTerm[]>)
 *
 *     const letters = Object.keys(grouped).sort()
 *
 *   ─────────────────────────────────────────────────────────────────────────
 *   PAGE STRUCTURE
 *   ─────────────────────────────────────────────────────────────────────────
 *
 *   <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
 *
 *     {/* Back link + heading */}
 *     <Link href={`/playlist/${playlist.id}`}
 *           className="text-sm text-blue-600 hover:underline mb-6 inline-block">
 *       ← Back to {playlist.title}
 *     </Link>
 *     <h1 className="text-3xl font-bold text-slate-900 mb-1">Glossary</h1>
 *     <p className="text-slate-500 mb-6">{playlist.title} · {terms.length} terms</p>
 *
 *     {/* Filter search bar */}
 *     <div className="relative mb-8">
 *       <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
 *       <input
 *         type="text"
 *         value={filterQuery}
 *         onChange={(e) => setFilterQuery(e.target.value)}
 *         placeholder="Filter terms…"
 *         className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200
 *                     focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
 *       />
 *     </div>
 *
 *     {/* Alphabetical groups */}
 *     {letters.map(letter => (
 *       <div key={letter} className="mb-10">
 *         {/* Letter heading */}
 *         <div className="sticky top-14 bg-white py-2 mb-4 border-b border-slate-100">
 *           <h2 className="text-xl font-bold text-slate-300">{letter}</h2>
 *         </div>
 *
 *         {/* Terms in this group */}
 *         <div className="space-y-6">
 *           {grouped[letter].map(term => (
 *             <GlossaryTermCard key={term.id} term={term} playlistId={playlist.id} />
 *           ))}
 *         </div>
 *       </div>
 *     ))}
 *
 *     {/* Empty filter state */}
 *     {filtered.length === 0 && filterQuery && (
 *       <p className="text-center text-slate-500 py-12">
 *         No terms matching "{filterQuery}"
 *       </p>
 *     )}
 *   </div>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GlossaryTermCard (inline component used in GlossaryClient)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Props: { term: GlossaryTerm; playlistId: string }
 *
 *   STAR RATING: importance_score (0–1) mapped to 1–5 stars.
 *     const stars = Math.round(term.importance_score * 5)
 *     Render: Array.from({length: 5}).map((_, i) =>
 *       <Star key={i} className={i < stars ? "fill-yellow-400 text-yellow-400" : "text-slate-200"} />
 *     )
 *
 *   FIRST INTRODUCED LINK:
 *     Links to YouTube at the exact timestamp.
 *     URL: https://youtube.com/watch?v={first_video_youtube_id}&t={first_timestamp}
 *     BUT: we only have first_video_id (UUID), not youtube_id.
 *     Strategy: pass the videos list down as a prop or look up in a context.
 *     SIMPLER APPROACH: Since GlossaryPage pre-fetches videos too:
 *       Add fetchPlaylistVideos(params.id) to the GlossaryPage data fetch.
 *       Pass a videoMap: Record<string, Video> to GlossaryClient.
 *
 *   RELATED TERMS BADGES:
 *     {term.related_terms.map(rel => (
 *       <button key={rel} onClick={() => setFilterQuery(rel)}
 *               className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600
 *                           hover:bg-blue-100 hover:text-blue-700 text-xs transition-colors">
 *         {rel}
 *       </button>
 *     ))}
 *
 *   FULL MARKUP:
 *     <div className="bg-white rounded-2xl border border-slate-200 p-6">
 *
 *       {/* Term name + star rating header */}
 *       <div className="flex items-start justify-between">
 *         <h3 className="text-xl font-bold text-slate-900">{term.term}</h3>
 *         <div className="flex gap-0.5">
 *           {starIcons}
 *         </div>
 *       </div>
 *
 *       {/* Definition */}
 *       <p className="mt-3 text-slate-700 leading-relaxed text-sm">
 *         {term.definition}
 *       </p>
 *
 *       {/* Related terms */}
 *       {term.related_terms.length > 0 && (
 *         <div className="mt-4">
 *           <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">
 *             Related
 *           </p>
 *           <div className="flex flex-wrap gap-1.5">
 *             {relatedBadges}
 *           </div>
 *         </div>
 *       )}
 *
 *       {/* First introduced / deep links */}
 *       <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-3">
 *         {firstIntroLink}      {/* "First introduced: Lecture N at 12:34" */}
 *         {bestExplLink}        {/* "Best explanation" if chunk data available */}
 *         {bestDerivLink}       {/* "Full derivation" if chunk data available */}
 *       </div>
 *     </div>
 *
 *   DEEP LINK FORMAT:
 *     Each link is an anchor:
 *     <a href={youtubeUrl} target="_blank" rel="noopener noreferrer"
 *        className="inline-flex items-center gap-1 text-xs text-blue-600
 *                    hover:text-blue-800">
 *       ▶ {label}
 *     </a>
 *
 *     NOTE: The backend's /glossary/{playlist_id}/{term} endpoint returns
 *     intro_snippet, deriv_snippet, expl_snippet with youtube_url fields.
 *     The GlossaryPage can either:
 *       a) Use the /glossary/{id} bulk endpoint (what we've been using) — no snippets
 *       b) OR lazily fetch /glossary/{id}/{term} on demand when a card expands
 *     Recommended: Start with (a) and add lazy snippet fetch as an enhancement.
 *     For the MVP, derive the first-introduced YouTube URL from:
 *       videoMap[term.first_video_id]?.youtube_id
 *       URL: https://youtube.com/watch?v={youtube_id}&t={term.first_timestamp}
 */


// ============================================================================
// SECTION 20 — GLOBALS CSS (app/globals.css)
// ============================================================================

/**
 * @tailwind base;
 * @tailwind components;
 * @tailwind utilities;
 *
 * CSS VARIABLES (shadcn/ui theme tokens — light mode only for this project):
 *
 * @layer base {
 *   :root {
 *     --background: 0 0% 100%;
 *     --foreground: 222.2 84% 4.9%;
 *     --card: 0 0% 100%;
 *     --card-foreground: 222.2 84% 4.9%;
 *     --popover: 0 0% 100%;
 *     --popover-foreground: 222.2 84% 4.9%;
 *     --primary: 221.2 83.2% 53.3%;
 *     --primary-foreground: 210 40% 98%;
 *     --secondary: 210 40% 96.1%;
 *     --secondary-foreground: 222.2 47.4% 11.2%;
 *     --muted: 210 40% 96.1%;
 *     --muted-foreground: 215.4 16.3% 46.9%;
 *     --accent: 210 40% 96.1%;
 *     --accent-foreground: 222.2 47.4% 11.2%;
 *     --destructive: 0 84.2% 60.2%;
 *     --destructive-foreground: 210 40% 98%;
 *     --border: 214.3 31.8% 91.4%;
 *     --input: 214.3 31.8% 91.4%;
 *     --ring: 221.2 83.2% 53.3%;
 *     --radius: 0.5rem;
 *   }
 * }
 *
 * CUSTOM GLOBAL STYLES:
 *
 * @layer base {
 *   * { @apply border-border; }
 *   body { @apply bg-background text-foreground; }
 *   /* Smooth scrolling for heatmap bar clicks */
 *   html { scroll-behavior: smooth; }
 * }
 *
 * CUSTOM UTILITIES:
 *
 * @layer utilities {
 *   /* Hero gradient overlay (optional decorative element) */
 *   .hero-gradient {
 *     background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
 *   }
 *
 *   /* Line clamp utilities (in case Tailwind version doesn't include them) */
 *   .line-clamp-1 { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
 *   .line-clamp-2 { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
 * }
 */


// ============================================================================
// SECTION 21 — NEXT.JS CONFIGURATION (next.config.ts)
// ============================================================================

/**
 * import type { NextConfig } from 'next'
 *
 * const nextConfig: NextConfig = {
 *
 *   // Allow Next.js Image component to serve images from YouTube CDN
 *   images: {
 *     remotePatterns: [
 *       { protocol: 'https', hostname: 'i.ytimg.com', pathname: '/**' },
 *       { protocol: 'https', hostname: 'img.youtube.com', pathname: '/**' },
 *     ],
 *   },
 *
 *   // Explicitly expose the env var to be safe (already NEXT_PUBLIC_ prefixed)
 *   env: {
 *     NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
 *   },
 *
 *   // Strict TypeScript and ESLint in CI
 *   typescript: { ignoreBuildErrors: false },
 *   eslint:     { ignoreDuringBuilds: false },
 * }
 *
 * export default nextConfig
 */


// ============================================================================
// SECTION 22 — TAILWIND CONFIGURATION (tailwind.config.ts)
// ============================================================================

/**
 * import type { Config } from 'tailwindcss'
 *
 * const config: Config = {
 *   darkMode: ['class'],   // shadcn/ui uses class-based dark mode
 *   content: [
 *     './pages/**\/*.{ts,tsx}',
 *     './components/**\/*.{ts,tsx}',
 *     './app/**\/*.{ts,tsx}',
 *     './src/**\/*.{ts,tsx}',
 *   ],
 *   theme: {
 *     extend: {
 *       // shadcn/ui CSS variable colors
 *       colors: {
 *         border:     'hsl(var(--border))',
 *         input:      'hsl(var(--input))',
 *         ring:       'hsl(var(--ring))',
 *         background: 'hsl(var(--background))',
 *         foreground: 'hsl(var(--foreground))',
 *         primary: {
 *           DEFAULT:    'hsl(var(--primary))',
 *           foreground: 'hsl(var(--primary-foreground))',
 *         },
 *         // ... (standard shadcn/ui color tokens)
 *       },
 *       // Border radius using CSS variable
 *       borderRadius: {
 *         lg: 'var(--radius)',
 *         md: 'calc(var(--radius) - 2px)',
 *         sm: 'calc(var(--radius) - 4px)',
 *       },
 *       // Font family to match Google Fonts import
 *       fontFamily: {
 *         sans: ['Inter', 'system-ui', 'sans-serif'],
 *       },
 *       // Custom animation for the Processing shimmer badge
 *       keyframes: {
 *         shimmer: {
 *           '0%':   { opacity: '1' },
 *           '50%':  { opacity: '0.4' },
 *           '100%': { opacity: '1' },
 *         },
 *       },
 *       animation: {
 *         shimmer: 'shimmer 1.5s ease-in-out infinite',
 *       },
 *     },
 *   },
 *   plugins: [require('tailwindcss-animate')],
 * }
 *
 * export default config
 */


// ============================================================================
// SECTION 23 — PACKAGE.JSON DEPENDENCIES
// ============================================================================

/**
 * {
 *   "name": "aerospace-lecture-frontend",
 *   "version": "0.1.0",
 *   "private": true,
 *   "scripts": {
 *     "dev":   "next dev",
 *     "build": "next build",
 *     "start": "next start",
 *     "lint":  "next lint"
 *   },
 *   "dependencies": {
 *     "next":          "14.2.x",
 *     "react":         "18.x",
 *     "react-dom":     "18.x",
 *     "framer-motion": "^11.x",
 *
 *     // shadcn/ui peer packages
 *     "@radix-ui/react-collapsible":  "^1.0.x",
 *     "@radix-ui/react-dialog":       "^1.0.x",   // Sheet uses Dialog underneath
 *     "@radix-ui/react-progress":     "^1.0.x",
 *     "@radix-ui/react-slot":         "^1.0.x",
 *     "class-variance-authority":     "^0.7.x",
 *     "clsx":                         "^2.1.x",
 *     "tailwind-merge":               "^2.x",
 *     "tailwindcss-animate":          "^1.0.x",
 *     "lucide-react":                 "^0.383.x"
 *   },
 *   "devDependencies": {
 *     "typescript":              "^5.x",
 *     "@types/node":             "^20.x",
 *     "@types/react":            "^18.x",
 *     "@types/react-dom":        "^18.x",
 *     "tailwindcss":             "^3.4.x",
 *     "autoprefixer":            "^10.x",
 *     "postcss":                 "^8.x",
 *     "eslint":                  "^8.x",
 *     "eslint-config-next":      "14.x"
 *   }
 * }
 *
 * SHADCN/UI COMPONENTS TO INSTALL:
 *   Run: npx shadcn@latest init
 *   Then install each component used:
 *     npx shadcn@latest add button
 *     npx shadcn@latest add badge
 *     npx shadcn@latest add sheet
 *     npx shadcn@latest add collapsible
 *     npx shadcn@latest add skeleton
 *     npx shadcn@latest add progress
 *     npx shadcn@latest add input
 *     npx shadcn@latest add card
 *
 *   These commands create files in components/ui/:
 *     components/ui/button.tsx
 *     components/ui/badge.tsx
 *     components/ui/sheet.tsx
 *     components/ui/collapsible.tsx
 *     components/ui/skeleton.tsx
 *     components/ui/progress.tsx
 *     components/ui/input.tsx
 *     components/ui/card.tsx
 *
 * CN UTILITY (lib/utils.ts — auto-created by shadcn init):
 *   import { type ClassValue, clsx } from 'clsx'
 *   import { twMerge } from 'tailwind-merge'
 *   export function cn(...inputs: ClassValue[]) {
 *     return twMerge(clsx(inputs))
 *   }
 */


// ============================================================================
// SECTION 24 — SHADCN/UI COMPONENT USAGE REFERENCE
// ============================================================================

/**
 * This section documents exactly how each shadcn/ui component is used
 * in this project, with import paths and props.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Sheet (components/ui/sheet.tsx)
 * ─────────────────────────────────────────────────────────────────────────────
 *   Used in: PlaylistDetailClient (scoped search results)
 *
 *   import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
 *
 *   <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
 *     <SheetContent side="right" className="w-[420px] sm:w-[480px] p-0">
 *       {/* content */}
 *     </SheetContent>
 *   </Sheet>
 *
 *   The Sheet slides in from the right using a Framer Motion animation
 *   built into the shadcn/ui implementation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Collapsible (components/ui/collapsible.tsx)
 * ─────────────────────────────────────────────────────────────────────────────
 *   Used in: KeywordDropdown
 *
 *   import {
 *     Collapsible,
 *     CollapsibleContent,
 *     CollapsibleTrigger,
 *   } from '@/components/ui/collapsible'
 *
 *   <Collapsible open={open} onOpenChange={setOpen}>
 *     <CollapsibleTrigger asChild>
 *       <button>Keywords ▾</button>
 *     </CollapsibleTrigger>
 *     <CollapsibleContent>
 *       {/* keyword pills */}
 *     </CollapsibleContent>
 *   </Collapsible>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Skeleton (components/ui/skeleton.tsx)
 * ─────────────────────────────────────────────────────────────────────────────
 *   Used in: SearchResults (loading state), PlaylistLoading, GlossaryPanel
 *
 *   import { Skeleton } from '@/components/ui/skeleton'
 *
 *   <Skeleton className="h-4 w-3/4" />
 *   // Renders a gray animated pulse block
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Badge (components/ui/badge.tsx)
 * ─────────────────────────────────────────────────────────────────────────────
 *   NOT directly used — replaced by custom colored pills for more flexibility.
 *   PedagogyBadge is custom (see Section 12).
 *   Subject badge on PlaylistCard is custom.
 *   Use shadcn Badge only if a generic styled badge is needed without custom colors.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Progress (components/ui/progress.tsx)
 * ─────────────────────────────────────────────────────────────────────────────
 *   NOT used as shadcn Progress — confidence bars are custom div-based
 *   for finer color control (green/orange/red gradient).
 *   shadcn Progress is available if needed but our implementation is simpler.
 */


// ============================================================================
// SECTION 25 — DATA FLOW DIAGRAM
// ============================================================================

/**
 * This section documents how data flows through the app from backend to UI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOME PAGE DATA FLOW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   [Vercel Edge] → [app/page.tsx Server Component]
 *                   → fetchPlaylists()  →  GET /playlists
 *                   → render PlaylistGrid (passes playlists as prop)
 *
 *   [User types in SearchBar] → useSearch('global')
 *     → debounce 400ms
 *     → search(query, 'global', 5)  →  GET /search?q=...&scope=global
 *     → SearchResults renders cards below hero
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PLAYLIST DETAIL DATA FLOW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   [Vercel Edge] → [app/playlist/[id]/page.tsx Server Component]
 *                   → fetchPlaylist(id) + fetchPlaylistVideos(id) in parallel
 *                   → if !processed → NotYetProcessed
 *                   → else → PlaylistDetailClient (videos passed as prop)
 *
 *   [User types in top bar SearchBar] → useSearch(playlistId)
 *     → debounce 400ms
 *     → search(query, playlistId, 5)  →  GET /search?q=...&scope={playlistId}
 *     → Sheet opens with SearchResults
 *
 *   [User expands KeywordDropdown] → render keyword pills (from pre-fetched videos)
 *   [User clicks keyword pill] → search(keyword, playlistId, 5) (no debounce needed)
 *     → inline SearchResults below the VideoRow
 *
 *   [GlossaryPanel mounts] → fetchGlossary(playlistId)  →  GET /glossary/{id}
 *     → terms sorted by importance, rendered as scrollable list
 *
 *   [User clicks glossary term] → onTermClick(term) → scoped search opens sheet
 *     → fetchHeatmap(term, playlistId)  →  GET /search/heatmap?term=...
 *     → ConceptHeatmapChart renders below the term row
 *
 *   [User clicks heatmap bar] → onHeatmapBarClick(videoId)
 *     → scroll video into view
 *     → yellow flash animation for 2 seconds
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GLOSSARY PAGE DATA FLOW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   [Vercel Edge] → [app/glossary/[id]/page.tsx Server Component]
 *                   → fetchPlaylist(id) + fetchGlossary(id) + fetchPlaylistVideos(id)
 *                   → GlossaryClient (all data passed as props)
 *
 *   [User types in filter bar] → filterQuery state update
 *     → terms filtered client-side, no network call
 *     → re-grouped and re-rendered instantly
 *
 *   [User clicks related term badge] → setFilterQuery(relatedTerm)
 *     → view jumps to that term in the filtered list
 */


// ============================================================================
// SECTION 26 — RESPONSIVE DESIGN BREAKPOINTS
// ============================================================================

/**
 * The app uses Tailwind's mobile-first breakpoints:
 *   sm:  640px  — 2-column playlist grid
 *   md:  768px  — larger padding, medium search bar
 *   lg:  1024px — 3-column grid, glossary sidebar visible
 *   xl:  1280px — glossary sidebar wider (w-96 instead of w-80)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 375px (mobile)
 * ─────────────────────────────────────────────────────────────────────────────
 *   Home: 1-column grid, full-width hero, large search bar stacked
 *   Playlist: top bar collapses (no search bar, only back + title)
 *             search accessible via a floating search icon button
 *   VideoRow: thumbnail + title only (no keywords button — tap to expand)
 *   GlossaryPanel: hidden (accessible via link at bottom of page)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 768px (tablet)
 * ─────────────────────────────────────────────────────────────────────────────
 *   Home: 2-column grid
 *   Playlist: top bar shows search bar, video list full width
 *   GlossaryPanel: still hidden, accessible via "View Glossary" link
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1024px+ (desktop)
 * ─────────────────────────────────────────────────────────────────────────────
 *   Home: 3-column grid
 *   Playlist: two-column layout (70% video list, 30% glossary sidebar)
 *   GlossaryPanel: visible and sticky
 *
 * MOBILE-SPECIFIC ADJUSTMENTS:
 *   - PlaylistCard thumbnail: uses smaller sizes="100vw" on mobile
 *   - VideoRow: keywords hidden on mobile under a separate tap-to-expand
 *   - SearchResults: full-width overlay on mobile (not floating)
 *   - Sheet: full-screen on mobile (SheetContent className="w-full")
 *   - Hero H1: text-4xl → text-3xl on very small screens
 */


// ============================================================================
// SECTION 27 — FRAMER MOTION USAGE
// ============================================================================

/**
 * Framer Motion is used sparingly — only for card hover lifts and the
 * Sheet slide-in (which is handled by shadcn/Radix internally).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PlaylistCard hover lift
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   import { motion } from 'framer-motion'
 *
 *   <motion.div
 *     whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}
 *     transition={{ type: 'spring', stiffness: 400, damping: 25 }}
 *   >
 *     {/* card content */}
 *   </motion.div>
 *
 *   The spring animation gives a natural bounce when lifting.
 *   stiffness: 400 = fairly stiff (snappy)
 *   damping: 25 = moderate — small overshoot at lift, clean return
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VideoRow yellow flash
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Two approaches — use whichever is simpler:
 *
 *   APPROACH A (Framer Motion):
 *     <motion.div
 *       animate={{ backgroundColor: highlighted ? '#fef9c3' : '#ffffff' }}
 *       transition={{ duration: 0.3, ease: 'easeOut' }}
 *     >
 *     When highlighted becomes false after 2s:
 *       animate={{ backgroundColor: '#ffffff' }}
 *       transition={{ duration: 1.5, ease: 'easeOut' }}  // slow fade back
 *
 *   APPROACH B (Tailwind CSS transition — simpler, no import needed):
 *     className={cn(
 *       "transition-colors duration-1000",
 *       highlighted ? "bg-yellow-100" : "bg-white"
 *     )}
 *     Tailwind handles the fade automatically via CSS transition.
 *     Choose this unless Framer Motion is already imported in VideoRow.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SearchResults appearance
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   When results appear on the home page, animate them in with:
 *   <motion.div
 *     initial={{ opacity: 0, y: 8 }}
 *     animate={{ opacity: 1, y: 0 }}
 *     transition={{ duration: 0.2 }}
 *   >
 *     {/* SearchResults content */}
 *   </motion.div>
 *
 *   This gives a subtle fade+slide-up feel as results appear.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT: DO NOT use Framer Motion for:
 * ─────────────────────────────────────────────────────────────────────────────
 *   - Layout animations (too expensive, causes jank)
 *   - AnimatePresence in the search bar (debounce handles this)
 *   - Staggered list animations (not needed, adds complexity)
 *   Keep Framer Motion usage minimal.
 */


// ============================================================================
// SECTION 28 — UTILITY FUNCTIONS (inline helpers across components)
// ============================================================================

/**
 * These small utility functions are used across multiple components.
 * Define them in lib/utils.ts (alongside the cn() function from shadcn).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   // Format seconds to M:SS or H:MM:SS display string
 *   export function formatDuration(seconds: number): string {
 *     const h = Math.floor(seconds / 3600)
 *     const m = Math.floor((seconds % 3600) / 60)
 *     const s = Math.floor(seconds % 60)
 *     if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
 *     return `${m}:${String(s).padStart(2, '0')}`
 *   }
 *
 *   // Format seconds to MM:SS (for search result timestamps)
 *   export function formatTimestamp(seconds: number): string {
 *     const m = Math.floor(seconds / 60)
 *     const s = Math.floor(seconds % 60)
 *     return `${m}:${String(s).padStart(2, '0')}`
 *   }
 *
 *   // Extract YouTube video ID from a URL string
 *   export function extractYoutubeId(url: string): string {
 *     const match = url.match(/[?&]v=([^&]+)/)
 *     return match?.[1] ?? ''
 *   }
 *
 *   // Build a YouTube deep-link URL with timestamp
 *   export function buildYoutubeUrl(youtubeId: string, seconds: number): string {
 *     return `https://youtube.com/watch?v=${youtubeId}&t=${Math.floor(seconds)}`
 *   }
 *
 *   // Deterministic subject color (used in PlaylistCard)
 *   const SUBJECT_COLORS = [
 *     'bg-blue-100 text-blue-800',
 *     'bg-purple-100 text-purple-800',
 *     'bg-teal-100 text-teal-800',
 *     'bg-green-100 text-green-800',
 *     'bg-orange-100 text-orange-800',
 *     'bg-pink-100 text-pink-800',
 *     'bg-indigo-100 text-indigo-800',
 *     'bg-yellow-100 text-yellow-800',
 *   ]
 *   export function getSubjectColor(subject: string): string {
 *     let hash = 0
 *     for (let i = 0; i < subject.length; i++) {
 *       hash = ((hash << 5) - hash + subject.charCodeAt(i)) | 0
 *     }
 *     return SUBJECT_COLORS[Math.abs(hash) % SUBJECT_COLORS.length]
 *   }
 *
 *   // Intensity 0–1 to HSL color string (used in ConceptHeatmapChart)
 *   export function intensityToHsl(intensity: number): string {
 *     const hue = Math.round(120 - intensity * 120)  // 120=green, 0=red
 *     const sat = 70
 *     const lig = 45 + (1 - intensity) * 10
 *     return `hsl(${hue}, ${sat}%, ${lig}%)`
 *   }
 *
 *   // Confidence score 0–1 to Tailwind bg class
 *   export function confidenceColor(score: number): string {
 *     if (score >= 0.7) return 'bg-green-500'
 *     if (score >= 0.4) return 'bg-orange-400'
 *     return 'bg-red-400'
 *   }
 *
 *   // Star count from importance_score 0–1 → 1–5 stars
 *   export function importanceToStars(score: number): number {
 *     return Math.max(1, Math.round(score * 5))
 *   }
 *
 *   // Escape special regex characters (used in search snippet highlight)
 *   export function escapeRegex(s: string): string {
 *     return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
 *   }
 *
 *   // Group array by key function → Record<string, T[]>
 *   export function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
 *     return arr.reduce((acc, item) => {
 *       const k = key(item)
 *       if (!acc[k]) acc[k] = []
 *       acc[k].push(item)
 *       return acc
 *     }, {} as Record<string, T[]>)
 *   }
 */


// ============================================================================
// SECTION 29 — ERROR HANDLING STRATEGY
// ============================================================================

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SERVER COMPONENT ERRORS (pages that use async data fetching)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Add error.tsx siblings alongside page.tsx for each route:
 *
 *   app/error.tsx              — root error boundary
 *   app/playlist/[id]/error.tsx — playlist-specific error
 *   app/glossary/[id]/error.tsx — glossary-specific error
 *
 *   Each error.tsx is a Client Component:
 *   'use client'
 *   export default function Error({
 *     error,
 *     reset,
 *   }: {
 *     error: Error
 *     reset: () => void
 *   }) {
 *     return (
 *       <div className="flex flex-col items-center justify-center min-h-[60vh]
 *                        gap-4 text-center px-4">
 *         <p className="text-5xl">⚠️</p>
 *         <h2 className="text-xl font-bold text-slate-900">
 *           Something went wrong
 *         </h2>
 *         <p className="text-slate-500 text-sm max-w-sm">
 *           {error.message || 'Failed to load data. Please try again.'}
 *         </p>
 *         <button
 *           onClick={reset}
 *           className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm
 *                       hover:bg-blue-700 transition-colors"
 *         >
 *           Try Again
 *         </button>
 *       </div>
 *     )
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLIENT COMPONENT ERRORS (search, heatmap, glossary panel)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   All async operations in Client Components wrap in try/catch.
 *   Errors update local state (e.g. SearchState { status: 'error' }).
 *   Error states render inline non-destructive messages (red text, no crash).
 *
 *   For GlossaryPanel fetch failure:
 *     Show: "Couldn't load glossary" with a "Retry" button.
 *
 *   For heatmap fetch failure:
 *     Show: "No heatmap data available" (silent, no user action needed).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BACKEND COLD START HANDLING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   The Render free tier spins down after 15 min idle → first request ~30s.
 *   Strategy for search: the 400ms debounce gives time, but if the backend
 *   is waking up, the search call may take 30s+. Handle gracefully:
 *
 *   1. No client-side timeout — let the request complete.
 *   2. While in 'loading' state, show skeleton cards (indefinitely until resolved).
 *   3. If the request takes > 5 seconds, show an additional hint:
 *      "Backend is waking up, please wait…" (use setTimeout to show after 5s)
 *
 *   Implementation in useSearch:
 *     const wakeUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
 *
 *     // When loading begins:
 *     wakeUpTimerRef.current = setTimeout(() => {
 *       setWakeUpMessage('Backend is waking up, please wait a moment…')
 *     }, 5000)
 *
 *     // Clear on success or error:
 *     clearTimeout(wakeUpTimerRef.current)
 *     setWakeUpMessage(null)
 */


// ============================================================================
// SECTION 30 — COMPLETE CURSOR PROMPT TO BUILD THIS FRONTEND
// ============================================================================

/**
 * USE THIS PROMPT IN CURSOR TO BUILD THE ENTIRE FRONTEND FROM SCRATCH.
 * Paste the entire prompt below as a single Cursor Agent prompt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Build the complete frontend for an aerospace engineering lecture search
 * platform. Follow EVERY specification below exactly. Do not skip any file.
 *
 * TECH STACK:
 *   Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui,
 *   Framer Motion, Inter font (Google Fonts)
 *
 * BACKEND API:
 *   Base URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
 *   All routes and response shapes are documented in this file.
 *
 * ── FILE: .env.local ─────────────────────────────────────────────────────────
 *   NEXT_PUBLIC_API_URL=http://localhost:8000
 *
 * ── FILE: next.config.ts ─────────────────────────────────────────────────────
 *   Configure remote image domains: i.ytimg.com and img.youtube.com
 *
 * ── FILE: lib/types.ts ───────────────────────────────────────────────────────
 *   Export all interfaces: Playlist, Video, VideoKeyword, SearchResult,
 *   GlossaryTerm, HeatmapPoint, PedagogyRole, SearchState.
 *   Use exact field names matching backend JSON responses (snake_case).
 *
 * ── FILE: lib/api.ts ─────────────────────────────────────────────────────────
 *   Central apiFetch helper. Export: fetchPlaylists, fetchPlaylist,
 *   fetchPlaylistVideos, search, fetchGlossary, fetchHeatmap.
 *   All async, typed, throw descriptive errors on non-2xx.
 *   Add { next: { revalidate: 60 } } to fetchPlaylists request.
 *   Add { next: { revalidate: 300 } } to fetchPlaylistVideos and fetchGlossary.
 *
 * ── FILE: lib/utils.ts ───────────────────────────────────────────────────────
 *   Export: cn, formatDuration, formatTimestamp, extractYoutubeId,
 *   buildYoutubeUrl, getSubjectColor, intensityToHsl, confidenceColor,
 *   importanceToStars, escapeRegex, groupBy.
 *
 * ── FILE: hooks/useSearch.ts ─────────────────────────────────────────────────
 *   Client hook: useSearch(scope). Manages SearchState.
 *   Debounces 400ms. Exposes: state, runSearch, clearSearch.
 *   Add 5-second cold start warning: wakeUpMessage string state.
 *
 * ── FILE: hooks/usePlaylists.ts ──────────────────────────────────────────────
 *   Client hook: usePlaylists(). Fetches playlists client-side.
 *   Exposes: playlists, loading, error.
 *
 * ── FILE: app/globals.css ────────────────────────────────────────────────────
 *   Tailwind directives. shadcn/ui CSS variables for light mode.
 *   Custom: hero-gradient, scroll-behavior: smooth.
 *
 * ── FILE: app/layout.tsx ─────────────────────────────────────────────────────
 *   Server Component. Inter font. Metadata. Fixed nav bar (h-14, z-50).
 *   Nav: logo (🚀 AeroLearn) links to /. Main has pt-14 for nav offset.
 *
 * ── FILE: app/page.tsx ───────────────────────────────────────────────────────
 *   Server Component. fetchPlaylists(). Renders HeroSection + PlaylistGrid.
 *
 * ── FILE: app/error.tsx ──────────────────────────────────────────────────────
 *   Root error boundary (Client Component). Shows error + reset button.
 *
 * ── FILE: components/PlaylistCard.tsx ────────────────────────────────────────
 *   Client Component. Props: { playlist: Playlist }.
 *   Framer Motion whileHover lift. 16:9 thumbnail with Next.js Image.
 *   Subject badge with deterministic color. Processing shimmer if !processed.
 *   Title (line-clamp-1). Description (line-clamp-2). Video count.
 *   Full card is a Link to /playlist/[id].
 *
 * ── FILE: components/PedagogyBadge.tsx ───────────────────────────────────────
 *   Pure component. Props: { role: PedagogyRole; className?: string }.
 *   Maps 8 roles to labels and Tailwind color classes. Small pill badge.
 *
 * ── FILE: components/SearchBar.tsx ───────────────────────────────────────────
 *   Client Component. Props: { scope, placeholder, size, onResults, autoFocus }.
 *   Controlled input. Calls useSearch(scope).runSearch on every change.
 *   Search icon (lucide-react). X clear button. Three size variants (sm/md/lg).
 *
 * ── FILE: components/SearchResultCard.tsx ────────────────────────────────────
 *   Client Component. Props: { result: SearchResult; showPlaylistName?: boolean; query?: string }.
 *   YouTube thumbnail (80×45). Title. Timestamp deep-link (▶ MM:SS).
 *   Snippet with highlighted query terms. PedagogyBadge. Relevance reason.
 *   Confidence bar (green/orange/red).
 *
 * ── FILE: components/SearchResults.tsx ───────────────────────────────────────
 *   Client Component. Props: { state: SearchState; showPlaylistName?: boolean; onClose?: () => void }.
 *   Renders: idle→null, loading→3 skeletons, success→result cards or empty state,
 *   error→error message. Wraps results in motion.div fade-in animation.
 *
 * ── FILE: app/playlist/[id]/loading.tsx ──────────────────────────────────────
 *   Next.js automatic loading UI. Skeleton for top bar + video list + sidebar.
 *
 * ── FILE: app/playlist/[id]/error.tsx ────────────────────────────────────────
 *   Playlist-specific error boundary. Client Component.
 *
 * ── FILE: app/playlist/[id]/page.tsx ─────────────────────────────────────────
 *   Server Component. fetchPlaylist + fetchPlaylistVideos in parallel.
 *   If !playlist.processed → NotYetProcessed inline component.
 *   Else → PlaylistDetailClient with pre-fetched data.
 *
 *   PlaylistDetailClient (inline 'use client' component or extracted file):
 *   - Sticky top bar: back arrow, title, subject badge, scoped SearchBar
 *   - Two-column layout (70/30) on lg+, full-width below lg
 *   - Left: scrollable VideoRow list with video refs for scroll-to
 *   - Right: sticky GlossaryPanel
 *   - Sheet for scoped search results (slides from right)
 *   - highlightedVideoId state → yellow flash on VideoRow
 *
 * ── FILE: components/VideoRow.tsx ────────────────────────────────────────────
 *   Client Component, React.forwardRef for scroll-to.
 *   Props: { video: Video; playlistId: string; highlighted: boolean }.
 *   Position number. Thumbnail (160×90, click→YouTube new tab, play overlay).
 *   Title + formatted duration. KeywordDropdown trigger + content.
 *   Yellow flash on highlighted via Tailwind transition-colors.
 *
 * ── FILE: components/KeywordDropdown.tsx ─────────────────────────────────────
 *   Client Component. Props: { video: Video; playlistId: string }.
 *   Uses shadcn Collapsible. Keywords sorted by importance_score desc.
 *   Each keyword: pill button with keyword text + PedagogyBadge + importance bar.
 *   Click keyword → search(keyword, playlistId) → inline SearchResults below pills.
 *   "Close" button to dismiss inline results.
 *
 * ── FILE: components/GlossaryPanel.tsx ───────────────────────────────────────
 *   Client Component. Props: { playlistId; onTermClick; onHeatmapBarClick }.
 *   useEffect: fetchGlossary on mount. Loading skeletons (6 items).
 *   Terms sorted by importance_score desc.
 *   Term row: name, 1-line truncated definition, importance bar, chevron.
 *   Related term pills (max 4, click triggers onTermClick).
 *   Expanded term: ConceptHeatmapChart (lazy-fetched heatmap data).
 *   Footer: "View full glossary →" link.
 *
 * ── FILE: components/ConceptHeatmapChart.tsx ─────────────────────────────────
 *   Client Component. Props: { data: HeatmapPoint[]; onBarClick: (videoId) => void }.
 *   Div-based horizontal bar chart. No chart library.
 *   intensityToHsl() for bar colors (green→yellow→red).
 *   Bar height proportional to intensity. Click bar → onBarClick(video_id).
 *   X-axis labels: every 5th position. tooltip via title attribute.
 *   Empty state: "No data for this term".
 *
 * ── FILE: app/glossary/[id]/page.tsx ─────────────────────────────────────────
 *   Server Component. fetchPlaylist + fetchGlossary + fetchPlaylistVideos.
 *   Builds videoMap: Record<string, Video> for deep links.
 *   Passes all to GlossaryClient.
 *
 *   GlossaryClient (inline 'use client' component):
 *   - Back link to /playlist/[id]
 *   - H1 "Glossary" + subtitle
 *   - Filter search input (client-side, no API call)
 *   - Alphabetical groups (sticky letter heading, border-b)
 *   - GlossaryTermCard per term:
 *       - Term name (text-xl bold) + star rating (1–5, importanceToStars)
 *       - Definition paragraph
 *       - Related term badges (click → setFilterQuery)
 *       - Deep links: first introduced, best explanation, best derivation
 *         (each is an <a> opening YouTube in new tab at timestamp)
 *   - Empty filter state message
 *
 * ── FILE: app/glossary/[id]/error.tsx ────────────────────────────────────────
 *   Glossary-specific error boundary.
 *
 * ── CRITICAL IMPLEMENTATION RULES ────────────────────────────────────────────
 *   1. ALL YouTube links must use target="_blank" rel="noopener noreferrer".
 *   2. ALL data fetching in Server Components uses apiFetch with revalidate.
 *   3. NEVER call the API directly in Client Components except for:
 *        search(), fetchGlossary() in GlossaryPanel, fetchHeatmap() in GlossaryPanel.
 *   4. Use Next.js <Image> component for ALL thumbnail images.
 *      Configure remotePatterns in next.config.ts for i.ytimg.com.
 *   5. Use Next.js <Link> for ALL internal navigation.
 *   6. Debounce is handled ONLY in useSearch — do not add it elsewhere.
 *   7. The VideoRow ref system must use React.forwardRef + useRef in parent
 *      to enable scroll-to-video from heatmap clicks.
 *   8. GlossaryPanel data is fetched CLIENT-SIDE on mount, not server-side,
 *      to keep the playlist page SSR fast.
 *   9. Do NOT use any external chart library for the heatmap — divs only.
 *  10. All search results open YouTube in new tab — the app is read-only.
 *  11. Confidence bars use custom div implementation (not shadcn Progress)
 *      for green/orange/red color control.
 *  12. The Sheet component (scoped search results) must keep the video list
 *      visible behind it — use side="right" and do not use a full overlay.
 *  13. Server Components throw errors — add error.tsx boundaries per route.
 *  14. Mark components 'use client' ONLY when they use useState, useEffect,
 *      event handlers, or browser-only APIs. Keep as many Server as possible.
 *  15. All times and scores are numbers (float), never strings.
 */
