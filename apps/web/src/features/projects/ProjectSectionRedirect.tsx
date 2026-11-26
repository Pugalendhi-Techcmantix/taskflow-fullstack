import { Link, Navigate } from 'react-router';
import { LoadError, SkeletonRows } from '../../app/feedback';
import { lastProject, rememberProject, useProjects } from './projects-api';

type Section = 'sprints';
const TITLES: Record<Section, string> = { sprints: 'Sprints' };

/**
 * Sidebar shortcut such as "/sprints": opens that section of the last project you used,
 * or of your only project; otherwise asks which project.
 */
export function ProjectSectionRedirect({ section }: { section: Section }) {
  const projects = useProjects();
  if (projects.status === 'pending') return <div className="card"><SkeletonRows rows={3} label="Loading projects" /></div>;
  if (projects.status === 'error') return <LoadError error={projects.error} onRetry={() => void projects.refetch()} />;

  const list = projects.data.projects;
  const remembered = lastProject();
  const target = list.find((p) => p.key === remembered) ?? (list.length === 1 ? list[0] : undefined);
  if (target) return <Navigate to={`/projects/${target.key}/${section}`} replace />;

  return (
    <>
      <div className="page-head"><div><h1>{TITLES[section]}</h1><p className="sub">Choose a project</p></div></div>
      {list.length === 0 ? (
        <div className="card empty-state">
          <h2>No projects yet</h2>
          <p className="muted">{TITLES[section]} belong to a project. Create or join a project first.</p>
          <Link className="btn primary" to="/projects">Go to projects</Link>
        </div>
      ) : (
        <ul className="pick-list card">
          {list.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.key}/${section}`} onClick={() => rememberProject(p.key)}>
                <span className="proj-key sm" style={{ background: p.color }} aria-hidden="true">{p.key}</span>
                <b>{p.name}</b>
                <span className="muted small">{p.key}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
