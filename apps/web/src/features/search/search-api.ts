import { searchResponse } from '@taskflow/core';
import { api } from '../../lib/http';

export const searchKeys = {
  all: ['search'] as const,
  results: (text: string) => ['search', text] as const,
};

/** Tasks and projects matching `text`, only from projects the user can see. */
export const fetchSearch = (text: string, signal?: AbortSignal) =>
  api(`/api/search?q=${encodeURIComponent(text)}`, { schema: searchResponse, ...(signal ? { signal } : {}) });
