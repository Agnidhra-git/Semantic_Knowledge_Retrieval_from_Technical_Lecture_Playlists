import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format seconds to M:SS or H:MM:SS display string
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Format seconds to MM:SS (for search result timestamps)
export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Extract YouTube video ID from a URL string
export function extractYoutubeId(url: string): string {
  const match = url.match(/[?&]v=([^&]+)/);
  return match?.[1] ?? '';
}

// Build a YouTube deep-link URL with timestamp
export function buildYoutubeUrl(youtubeId: string, seconds: number): string {
  return `https://youtube.com/watch?v=${youtubeId}&t=${Math.floor(seconds)}`;
}

// Deterministic subject color (used in PlaylistCard)
const SUBJECT_COLORS = [
  'bg-blue-100 text-blue-800',
  'bg-purple-100 text-purple-800',
  'bg-teal-100 text-teal-800',
  'bg-green-100 text-green-800',
  'bg-orange-100 text-orange-800',
  'bg-pink-100 text-pink-800',
  'bg-indigo-100 text-indigo-800',
  'bg-yellow-100 text-yellow-800',
];

export function getSubjectColor(subject: string): string {
  let hash = 0;
  for (let i = 0; i < subject.length; i++) {
    hash = ((hash << 5) - hash + subject.charCodeAt(i)) | 0;
  }
  return SUBJECT_COLORS[Math.abs(hash) % SUBJECT_COLORS.length];
}

// Intensity 0–1 to HSL color string (used in ConceptHeatmapChart)
export function intensityToHsl(intensity: number): string {
  const hue = Math.round(120 - intensity * 120); // 120=green, 0=red
  const sat = 70;
  const lig = 45 + (1 - intensity) * 10;
  return `hsl(${hue}, ${sat}%, ${lig}%)`;
}

// Confidence score 0–1 to Tailwind bg class
export function confidenceColor(score: number): string {
  if (score >= 0.7) return 'bg-green-500';
  if (score >= 0.4) return 'bg-orange-400';
  return 'bg-red-400';
}

// Convert importance_score (0-1) to points (0-100)
export function scoreToPoints(score: number): number {
  return Math.round(score * 100);
}

// Get tier information based on importance_score
export function scoreToTier(score: number): { 
  label: string; 
  color: string; 
  bgColor: string;
} {
  if (score >= 0.8) return { 
    label: 'Excellent', 
    color: 'text-green-700', 
    bgColor: 'bg-green-100'
  };
  if (score >= 0.6) return { 
    label: 'High', 
    color: 'text-blue-700', 
    bgColor: 'bg-blue-100'
  };
  if (score >= 0.4) return { 
    label: 'Medium', 
    color: 'text-yellow-700', 
    bgColor: 'bg-yellow-100'
  };
  return { 
    label: 'Low', 
    color: 'text-slate-600', 
    bgColor: 'bg-slate-100'
  };
}

// Escape special regex characters (used in search snippet highlight)
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Group array by key function → Record<string, T[]>
export function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
