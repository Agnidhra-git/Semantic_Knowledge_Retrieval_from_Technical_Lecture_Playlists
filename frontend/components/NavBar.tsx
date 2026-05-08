'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { SearchSidebar } from '@/components/SearchSidebar';

export function NavBar() {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-bold text-slate-900">
            🚀 AeroLearn
          </span>
        </Link>

        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors text-sm font-medium"
          aria-label="Open search"
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">Search</span>
        </button>
      </nav>

      <SearchSidebar
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        scope="global"
      />
    </>
  );
}
