'use client';

import { useState, useCallback } from 'react';
import { search } from '@/lib/api';
import type { SearchResult, SearchState, PedagogyRole } from '@/lib/types';

export function useSearch(scope: string = 'global') {
  const [state, setState] = useState<SearchState>({ status: 'idle' });

  const runSearch = useCallback(
    async (query: string, filters?: PedagogyRole[]) => {
      // Reset to idle if query is empty
      if (!query.trim()) {
        setState({ status: 'idle' });
        return;
      }

      setState({ status: 'loading' });
      try {
        const results = await search(query.trim(), scope, 20, filters);
        setState({ status: 'success', results, query: query.trim() });
      } catch (err) {
        setState({
          status: 'error',
          message: 'Search unavailable — please try again',
        });
      }
    },
    [scope]
  );

  const clearSearch = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  return { state, runSearch, clearSearch };
}
