import { SEARCH_LIMITS, type SearchResults } from '@taskflow/core';
import type { Repositories } from '../../repositories';
import { isAdmin, type Actor } from '../access/actor';
import { toTaskSummary } from '../tasks/tasks.service';

export type SearchService = ReturnType<typeof createSearchService>;

/** Global search. Visibility matches the projects list: your own projects, or every project for Admins. */
export function createSearchService(repos: Pick<Repositories, 'search'>) {
  async function search(actor: Actor, text: string): Promise<SearchResults> {
    const scope = { userId: actor.user.id, all: isAdmin(actor) };
    const [tasks, projects] = await Promise.all([
      repos.search.tasks(text, scope, SEARCH_LIMITS.tasks),
      repos.search.projects(text, scope, SEARCH_LIMITS.projects),
    ]);
    return { tasks: tasks.map(toTaskSummary), projects };
  }
  return { search };
}
