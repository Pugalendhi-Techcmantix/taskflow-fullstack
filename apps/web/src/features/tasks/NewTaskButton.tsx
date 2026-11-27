import { useMatch } from 'react-router';
import { useCan } from '../auth/session';
import { lastProject, useProjects } from '../projects/projects-api';

/**
 * Where "+ New task" (and the C shortcut) creates a task: the project in the URL, else the last one
 * you opened, else your first project. Null when you can't create tasks or have no project.
 */
export function useNewTaskTarget(): string | null {
  const can = useCan();
  const projects = useProjects();
  const match = useMatch('/projects/:key/*');
  if (!can('task:create') || projects.status !== 'success') return null;
  const keys = projects.data.projects.map((p) => p.key);
  const fromUrl = match?.params.key?.toUpperCase();
  const remembered = lastProject();
  return (fromUrl && keys.includes(fromUrl) ? fromUrl : remembered && keys.includes(remembered) ? remembered : keys[0]) ?? null;
}

/** Top-bar "+ New task" (prototype). */
export function NewTaskButton({ target, onClick }: { target: string; onClick: () => void }) {
  return (
    <button className="btn primary" onClick={onClick} title={`New task in ${target} (C)`}>
      + <span className="hide-sm">New task</span>
    </button>
  );
}
