# Frontend - Aerospace Lecture Search Platform

Modern Next.js web application for searching and exploring aerospace engineering lecture content with semantic search, concept navigation, and educational analytics.

## 🏗️ Architecture

Built with Next.js 16 App Router and TypeScript:

```
frontend/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Home page
│   ├── layout.tsx         # Root layout
│   ├── globals.css        # Global styles
│   ├── glossary/          # Glossary pages
│   │   └── [id]/
│   │       └── page.tsx
│   └── playlist/          # Playlist detail pages
│       └── [id]/
│           └── page.tsx
├── components/            # React components
│   ├── SearchBar.tsx
│   ├── SearchResults.tsx
│   ├── PlaylistCard.tsx
│   ├── VideoRow.tsx
│   ├── GlossaryPanel.tsx
│   ├── QAPanel.tsx
│   ├── ConceptHeatmapChart.tsx
│   └── ui/               # shadcn/ui components
├── hooks/                # Custom React hooks
│   └── useSearch.ts
├── lib/                  # Utilities
│   ├── api.ts           # API client
│   ├── types.ts         # TypeScript types
│   └── utils.ts         # Helper functions
└── public/              # Static assets
```

## 🚀 Setup & Installation

### 1. Install Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 2. Environment Configuration

Create a `.env.local` file in the frontend directory:

```env
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000

# Optional: Analytics
NEXT_PUBLIC_GA_ID=your_google_analytics_id
```

### 3. Run Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📦 Build for Production

```bash
# Create optimized production build
npm run build

# Start production server
npm run start
```

## 🎨 Features

### Search Interface
- **Semantic Search**: Natural language queries with vector similarity
- **Filter Options**: Filter by playlist, pedagogy type, topic
- **Real-time Results**: Instant search as you type
- **Keyword Highlighting**: Visual emphasis on matched terms

### Playlist Explorer
- Browse aerospace lecture playlists
- View video details with timestamps
- Concept distribution heatmaps
- Pedagogy analysis charts

### Glossary
- Technical terminology database
- Context-aware definitions
- Related concepts linking
- Search and filter capabilities

### Q&A Panel
- AI-generated questions from video content
- Expandable answers with explanations
- Difficulty level indicators
- Timestamp references

### Concept Journey
- Prerequisite concept mapping
- Learning path visualization
- Interactive concept graph
- Related video recommendations

## 🎯 Key Components

### SearchBar Component
Primary search interface with autocomplete and filters.

```typescript
<SearchBar onSearch={handleSearch} />
```

### PlaylistCard Component
Displays playlist information with video count and metadata.

```typescript
<PlaylistCard playlist={playlistData} />
```

### VideoRow Component
Video entry with thumbnail, title, duration, and pedagogy badges.

```typescript
<VideoRow video={videoData} onSelect={handleSelect} />
```

### GlossaryPanel Component
Sidebar displaying relevant terminology definitions.

```typescript
<GlossaryPanel terms={glossaryTerms} />
```

## 🎨 Styling

The application uses:
- **Tailwind CSS 4** for utility-first styling
- **shadcn/ui** for accessible component primitives
- **Framer Motion** for smooth animations
- **Lucide React** for icons

### Theme Configuration

Colors and design tokens are configured in `globals.css` using CSS variables.

## 🔌 API Integration

The frontend communicates with the FastAPI backend via `lib/api.ts`:

```typescript
// Example API call
import { searchVideos } from '@/lib/api';

const results = await searchVideos({
  query: 'aerodynamics',
  limit: 10
});
```

### API Client Functions
- `fetchPlaylists()` - Get all playlists
- `fetchPlaylistById(id)` - Get playlist details
- `searchVideos(query)` - Semantic search
- `fetchGlossary()` - Get glossary terms
- `fetchQA(videoId)` - Get Q&A pairs
- `fetchConceptJourney(concept)` - Get learning path

## 🧪 Development

### Code Quality

```bash
# Run ESLint
npm run lint

# Type checking
npx tsc --noEmit
```

### Component Development

The project uses a client-server component split:
- Server Components for data fetching
- Client Components for interactivity
- Proper use of `'use client'` directive

## 📱 Responsive Design

The application is fully responsive with breakpoints:
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

## ⚡ Performance Optimization

- **Next.js Image Optimization**: Automatic image optimization
- **Code Splitting**: Automatic route-based splitting
- **Lazy Loading**: Components loaded on demand
- **Caching**: API response caching
- **Static Generation**: Pages pre-rendered where possible

## 🔍 SEO & Metadata

Each page includes proper metadata for SEO:

```typescript
export const metadata = {
  title: 'Aerospace Lecture Search',
  description: 'Search and explore aerospace engineering lectures'
};
```

## 🐛 Troubleshooting

### API Connection Issues
- Verify `NEXT_PUBLIC_API_URL` in `.env.local`
- Ensure backend server is running on the specified port
- Check CORS configuration in the backend

### Build Errors
- Clear `.next` folder: `rm -rf .next`
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Verify TypeScript types: `npx tsc --noEmit`

### Hydration Errors
- Ensure server and client rendering match
- Check for browser-only code in server components
- Verify `'use client'` directives are properly placed

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables

Ensure all `NEXT_PUBLIC_*` variables are set in your deployment platform.

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui Components](https://ui.shadcn.com)
- [Tailwind CSS](https://tailwindcss.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)

## 🤝 Contributing

This is a Bachelor's Thesis Project. For questions or suggestions:
- Review the code structure
- Follow existing patterns
- Test thoroughly before committing

## 📝 Notes

- The application requires the backend API to be running
- Some features may require authentication (future enhancement)
- Vector search quality depends on embedding model performance
