import { useState } from 'react';
import { useMatch } from 'react-router';
import { useCan } from '../auth/session';
import { lastProject, useProjects } from '../projects/projects-api';
import { NewTaskDialog } from './NewTaskDialog';

/** Top-bar "+ New task" (prototype). Uses the project in the URL, else the last one you opened, else your first project. */
export function NewTaskButton() {
  const can = useCan();
  const projects = useProjects();
  const match = useMatch('/projects/:key/*');
  const [open, setOpen] = useState<string | null>(null);
  if (!can('task:create') || projects.status !== 'success' || projects.data.projects.length === 0) return null;

  const keys = projects.data.projects.map((p) => p.key);
  const fromUrl = match?.params.key?.toUpperCase();
  const remembered = lastProject();
  const target = fromUrl && keys.includes(fromUrl) ? fromUrl : remembered && keys.includes(remembered) ? remembered : keys[0];
  if (!target) return null;

  return (
    <>
      <button className="btn primary" onClick={() => setOpen(target)} title={`New task in ${target}`}>
        + <span className="hide-sm">New task</span>
      </button>
      {open && <NewTaskDialog projectKey={open} onClose={() => setOpen(null)} />}
    </>
  );
}
