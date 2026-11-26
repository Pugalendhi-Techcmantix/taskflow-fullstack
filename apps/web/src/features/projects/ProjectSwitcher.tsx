import { useId } from 'react';
import { useMatch, useNavigate } from 'react-router';
import { lastProject, rememberProject, useProjects } from './projects-api';

/** Sidebar "Project" picker. Shows the project in the URL, or the last one opened. */
export function ProjectSwitcher({ onNavigate }: { onNavigate: () => void }) {
  const id = useId();
  const navigate = useNavigate();
  const projects = useProjects();
  const match = useMatch('/projects/:key/*');
  if (projects.status !== 'success' || projects.data.projects.length === 0) return null;

  const keys = projects.data.projects.map((p) => p.key);
  const fromUrl = match?.params.key?.toUpperCase();
  const remembered = lastProject();
  const current = fromUrl && keys.includes(fromUrl) ? fromUrl : remembered && keys.includes(remembered) ? remembered : '';

  return (
    <div className="proj-switch">
      <label htmlFor={id}>Project</label>
      <select
        id={id}
        className="input"
        value={current}
        onChange={(e) => {
          const key = e.target.value;
          if (!key) return;
          rememberProject(key);
          onNavigate();
          void navigate(`/projects/${key}`);
        }}
      >
        {!current && <option value="">Choose a project…</option>}
        {projects.data.projects.map((p) => <option key={p.id} value={p.key}>{p.name} ({p.key})</option>)}
      </select>
    </div>
  );
}
