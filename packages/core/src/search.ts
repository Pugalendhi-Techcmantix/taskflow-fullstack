import { z } from 'zod';
import { projectColorSchema } from './projects';
import { searchTextSchema, taskSummary } from './tasks';

/** Global search (top bar): tasks by key or title, projects by name or key. Only projects you can see. */
export const searchQuery = z.object({
  q: searchTextSchema.pipe(z.string().min(1, 'Type something to search')),
});

/** How many results of each kind the search box shows. */
export const SEARCH_LIMITS = { tasks: 7, projects: 3 } as const;

export const projectHit = z.object({ id: z.string(), key: z.string(), name: z.string(), color: projectColorSchema });
export type ProjectHit = z.infer<typeof projectHit>;

export const searchResponse = z.object({ tasks: z.array(taskSummary), projects: z.array(projectHit) });
export type SearchResults = z.infer<typeof searchResponse>;

/** Escapes `%`, `_` and `\` so user text is matched literally inside a SQL LIKE pattern. */
export const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
