import { useId } from 'react';
import { useMatch, useNavigate, useSearchParams } from 'react-router';
import { lastProject, rememberProject, useProjects } from './projects-api';

/** Sidebar "Project" picker. Shows the project in the URL, or the last one opened. */
export function ProjectSwitcher({ onNavigate }: { onNavigate: () => void }) {
  const id = useId();
  const navigate = useNavigate();
  const projects = useProjects();
  const match = useMatch('/projects/:key/*');
  const onDashboard = useMatch('/') !== null;
  const [params] = useSearchParams();
  if (projects.status !== 'success' || projects.data.projects.length === 0) return null;

  const keys = projects.data.projects.map((p) => p.key);
  const fromUrl = (onDashboard ? params.get('project') : match?.params.key)?.toUpperCase();
  const remembered = lastProject();
  // Same choice as the dashboard: URL, else last opened, else (on the dashboard) the first project.
  const current = fromUrl && keys.includes(fromUrl) ? fromUrl
    : remembered && keys.includes(remembered) ? remembered
      : onDashboard ? (keys[0] ?? '') : '';

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
          // On the dashboard, show the other project's dashboard.
          if (onDashboard) {
            void navigate(`/?project=${key}`);
            return;
          }
          // Stay in the same section (Overview, Sprints…) when switching project.
          const section = match?.params['*'];
          void navigate(`/projects/${key}${section ? `/${section}` : ''}`);
        }}
      >
        {!current && <option value="">Choose a project…</option>}
        {projects.data.projects.map((p) => <option key={p.id} value={p.key}>{p.name}</option>)}
      </select>
    </div>
  );
}
