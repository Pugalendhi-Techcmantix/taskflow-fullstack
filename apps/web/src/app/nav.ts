import type { IconName } from './icons';

/** Sidebar items. `module` is the PLAN.md module that brings the page to life; `built` once it exists. */
export const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'dashboard', module: 10, section: 'main', built: true },
  { path: '/projects', label: 'Projects', icon: 'folder', module: 3, section: 'main', built: true },
  { path: '/board', label: 'Board', icon: 'board', module: 6, section: 'main', built: true },
  { path: '/sprints', label: 'Sprints', icon: 'sprint', module: 4, section: 'main', built: true },
  { path: '/tasks', label: 'Tasks & issues', icon: 'list', module: 5, section: 'main', built: true },
  { path: '/team', label: 'Team & roles', icon: 'shield', module: 2, section: 'workspace', built: true },
  { path: '/activity', label: 'Activity history', icon: 'clock', module: 8, section: 'workspace', built: true },
] as const satisfies ReadonlyArray<{ path: string; label: string; icon: IconName; module: number; section: 'main' | 'workspace'; built: boolean }>;
