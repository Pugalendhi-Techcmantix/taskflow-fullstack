import { useId, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SEARCH_TEXT_MAX, type ProjectHit, type TaskSummary } from '@taskflow/core';
import { errorMessage } from '../../app/feedback';
import { Icon } from '../../app/icons';
import { TYPING_DEBOUNCE_MS, wait } from '../../lib/wait';
import { StatusBadge, TypeIcon } from '../tasks/badges';
import { fetchSearch, searchKeys } from './search-api';

/** The id of the search box, so the "/" shortcut can focus it. */
export const GLOBAL_SEARCH_ID = 'global-search';

type Hit = { kind: 'task'; task: TaskSummary } | { kind: 'project'; project: ProjectHit };

/**
 * Top-bar search (prototype): tasks by key or title, projects by name or key, across the projects you can see.
 * It waits for a pause in typing, and an older request is aborted as soon as the text changes.
 * Keyboard: ↑/↓ move through results, Enter opens one, Escape closes.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = text.trim();

  const results = useQuery({
    queryKey: searchKeys.results(q),
    queryFn: async ({ signal }) => {
      await wait(TYPING_DEBOUNCE_MS, signal);
      return fetchSearch(q, signal);
    },
    enabled: q !== '',
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const hits: Hit[] = q !== '' && results.data
    ? [...results.data.tasks.map((task): Hit => ({ kind: 'task', task })), ...results.data.projects.map((project): Hit => ({ kind: 'project', project }))]
    : [];
  const activeIndex = Math.min(active, hits.length - 1);
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const close = () => {
    setOpen(false);
    setActive(0);
  };
  const choose = (hit: Hit) => {
    close();
    setText('');
    if (hit.kind === 'task') navigate(`/projects/${hit.task.projectKey}/tasks?task=${hit.task.key}`);
    else navigate(`/projects/${hit.project.key}/board`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      e.currentTarget.blur();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (hits.length) setActive((activeIndex + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      const hit = hits[activeIndex];
      if (open && hit) {
        e.preventDefault();
        choose(hit);
      }
    }
  };

  const taskHits = hits.flatMap((h, i) => (h.kind === 'task' ? [{ task: h.task, i }] : []));
  const projectHits = hits.flatMap((h, i) => (h.kind === 'project' ? [{ project: h.project, i }] : []));
  const searching = q !== '' && (results.status === 'pending' || results.isPlaceholderData);
  const showList = open && hits.length > 0;

  return (
    <div className="search-wrap">
      <span className="si"><Icon name="search" size={16} /></span>
      <input
        id={GLOBAL_SEARCH_ID}
        className="input"
        type="search"
        role="combobox"
        aria-label="Search tasks and projects"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        placeholder="Search tasks and projects…   press /"
        autoComplete="off"
        maxLength={SEARCH_TEXT_MAX}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className="search-pop">
          {q === '' && (
            <>
              <div className="sr-sec">Tip</div>
              <div className="sr-item muted">Type a task key (TF-107), a title or a project name</div>
            </>
          )}
          {q !== '' && results.status === 'error' && (
            <div className="sr-item" role="alert">
              <span className="muted">{errorMessage(results.error)}</span>
              {/* onMouseDown keeps the focus in the box, so the list stays open */}
              <button type="button" className="btn sm" onMouseDown={(e) => e.preventDefault()} onClick={() => void results.refetch()}>Retry</button>
            </div>
          )}
          {q !== '' && results.status === 'pending' && <div className="sr-item muted" role="status">Searching…</div>}
          {q !== '' && results.status === 'success' && hits.length === 0 && !searching && (
            <div className="sr-item muted" role="status">No results for "{q}"</div>
          )}
          <div id={listId} role="listbox" aria-label="Search results" aria-busy={searching || undefined}>
            {taskHits.length > 0 && (
              <div role="group" aria-label="Tasks">
                <div className="sr-sec" aria-hidden="true">Tasks</div>
                {taskHits.map(({ task, i }) => (
                  <div key={task.id} id={optionId(i)} role="option" aria-selected={i === activeIndex}
                    className={`sr-item ${i === activeIndex ? 'active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose({ kind: 'task', task })}>
                    <TypeIcon type={task.type} />
                    <span className="key">{task.key}</span>
                    <span className="sr-title">{task.title}</span>
                    <StatusBadge status={task.status} />
                  </div>
                ))}
              </div>
            )}
            {projectHits.length > 0 && (
              <div role="group" aria-label="Projects">
                <div className="sr-sec" aria-hidden="true">Projects</div>
                {projectHits.map(({ project, i }) => (
                  <div key={project.id} id={optionId(i)} role="option" aria-selected={i === activeIndex}
                    className={`sr-item ${i === activeIndex ? 'active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose({ kind: 'project', project })}>
                    <span className="proj-key sm" style={{ background: project.color }} aria-hidden="true">{project.key}</span>
                    <span className="sr-title">{project.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
