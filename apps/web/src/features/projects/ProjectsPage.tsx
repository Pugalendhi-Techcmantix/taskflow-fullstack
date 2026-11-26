import { useState } from 'react';
import { Link } from 'react-router';
import type { Project } from '@taskflow/core';
import { Avatar } from '../../app/Avatar';
import { LoadError, SkeletonRows } from '../../app/feedback';
import { Icon } from '../../app/icons';
import { plural } from '../../lib/dates';
import { useCan } from '../auth/session';
import { NewProjectDialog } from './NewProjectDialog';
import { lastProject, rememberProject, useProjects } from './projects-api';

export function ProjectsPage() {
  const can = useCan();
  const projects = useProjects();
  const [creating, setCreating] = useState(false);
  const current = lastProject();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="sub">{projects.status === 'success' ? `${plural(projects.data.projects.length, 'project')} you can see` : 'Your projects'}</p>
        </div>
        {can('project:create') && <button className="btn primary" onClick={() => setCreating(true)}>+ New project</button>}
      </div>

      {projects.status === 'pending' && (
        <div className="proj-grid" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="card"><SkeletonRows rows={4} label="Loading projects" /></div>)}
        </div>
      )}
      {projects.status === 'error' && <LoadError error={projects.error} onRetry={() => void projects.refetch()} />}
      {projects.status === 'success' && projects.data.projects.length === 0 && (
        <div className="card empty-state">
          <div className="empty-icon"><Icon name="folder" size={22} /></div>
          <h2>No projects yet</h2>
          <p className="muted">
            {can('project:create') ? 'Create the first project to start planning sprints and tasks.' : 'You are not a member of any project yet. Ask a Project Manager or Admin to add you.'}
          </p>
          {can('project:create') && <button className="btn primary" onClick={() => setCreating(true)}>+ New project</button>}
        </div>
      )}
      {projects.status === 'success' && projects.data.projects.length > 0 && (
        <ul className="proj-grid">
          {projects.data.projects.map((p) => <ProjectCard key={p.id} project={p} isCurrent={p.key === current} />)}
        </ul>
      )}

      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
    </>
  );
}

/** Card layout from the prototype: key badge, name, active sprint, "Current" chip, description, members. */
function ProjectCard({ project: p, isCurrent }: { project: Project; isCurrent: boolean }) {
  return (
    <li className="card proj">
      <Link to={`/projects/${p.key}`} className="proj-link" onClick={() => rememberProject(p.key)}>
        <div className="proj-top">
          <span className={`proj-key ${p.key.length > 3 ? 'long' : ''}`} style={{ background: p.color }} aria-hidden="true">{p.key}</span>
          <div className="proj-title">
            <h2>{p.name}</h2>
            <span className="muted small">{p.activeSprint ? `${p.activeSprint.name} active` : 'No active sprint'}</span>
          </div>
          {isCurrent && <span className="badge chip-active">Current</span>}
          {!p.isMember && <span className="pill" title="You can see this project because you are an Admin">Not a member</span>}
        </div>
        <p className="muted proj-desc">{p.description || 'No description yet.'}</p>
        <div className="progress" aria-hidden="true"><span style={{ width: `${p.taskCounts.total ? (p.taskCounts.done / p.taskCounts.total) * 100 : 0}%` }} /></div>
        <div className="proj-foot">
          <span className="muted small">{p.taskCounts.done} of {plural(p.taskCounts.total, 'task')} done</span>
          <span className="stack" aria-label={`Members: ${p.members.map((m) => m.name).join(', ')}`}>
            {p.members.slice(0, 5).map((m) => <Avatar key={m.id} id={m.id} name={m.name} size="sm" title={m.name} />)}
            {p.members.length > 5 && <span className="avatar sm more">+{p.members.length - 5}</span>}
          </span>
        </div>
      </Link>
    </li>
  );
}
