import type { ReactNode } from 'react';
import {
  PERMISSION_LABELS,
  ROLE_NAMES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  taskPrioritySchema,
  taskStatusSchema,
  taskTypeSchema,
  type ActivityEvent,
  type ActivityType,
  type TaskChangeField,
} from '@taskflow/core';
import type { IconName } from '../../app/icons';
import { formatDay } from '../../lib/dates';

/** Icon per event group (prototype). */
export const ACTIVITY_ICONS: Record<ActivityType, IconName> = { task: 'list', sprint: 'sprint', project: 'folder', comment: 'msg', user: 'users' };

const FIELD_LABELS: Record<TaskChangeField, string> = {
  status: 'status',
  priority: 'priority',
  type: 'type',
  points: 'story points',
  assignee: 'assignee',
  sprint: 'sprint',
  dueDate: 'due date',
};
const SPRINT_FIELD_LABELS = { name: 'name', goal: 'goal', startDate: 'start date', endDate: 'end date' } as const;
const PROJECT_FIELD_LABELS = { name: 'name', description: 'description', color: 'colour' } as const;

/** A recorded value as people read it ("In Progress", "Unassigned", "Dec 10"). */
function shown(field: TaskChangeField, value: string | null): string {
  if (value === null) {
    return { assignee: 'Unassigned', sprint: 'Backlog', points: 'no estimate', dueDate: 'no due date', status: '—', priority: '—', type: '—' }[field];
  }
  switch (field) {
    case 'status': {
      const s = taskStatusSchema.safeParse(value);
      return s.success ? TASK_STATUS_LABELS[s.data] : value;
    }
    case 'priority': {
      const p = taskPrioritySchema.safeParse(value);
      return p.success ? TASK_PRIORITY_LABELS[p.data] : value;
    }
    case 'type': {
      const t = taskTypeSchema.safeParse(value);
      return t.success ? TASK_TYPE_LABELS[t.data] : value;
    }
    case 'dueDate':
      return formatDay(value, false);
    case 'points':
    case 'assignee':
    case 'sprint':
      return value;
  }
}

const list = (items: readonly string[]) => items.join(', ');

/**
 * What happened, as a sentence after the person's name: "moved **TF-107** from To Do to In Progress".
 * Every event kind has a case; a new kind that is not handled fails to compile.
 */
export function describeActivity(e: ActivityEvent): ReactNode {
  switch (e.action) {
    case 'task.created':
      return <>created <b>{e.task.key}</b> {e.task.title}</>;
    case 'task.renamed':
      return <>renamed <b>{e.task.key}</b> to "{e.task.title}"</>;
    case 'task.changed':
      return <>changed {FIELD_LABELS[e.field]} of <b>{e.task.key}</b> from {shown(e.field, e.from)} to {shown(e.field, e.to)}</>;
    case 'task.description_updated':
      return <>updated the description of <b>{e.task.key}</b></>;
    case 'task.moved':
      return <>moved <b>{e.task.key}</b> from {TASK_STATUS_LABELS[e.from]} to {TASK_STATUS_LABELS[e.to]}</>;
    case 'task.deleted':
      return <>deleted <b>{e.task.key}</b> {e.task.title}</>;
    case 'subtask.added':
      return <>added subtask "{e.subtask}" to <b>{e.task.key}</b></>;
    case 'subtask.completed':
      return <>completed subtask "{e.subtask}" on <b>{e.task.key}</b></>;
    case 'subtask.reopened':
      return <>reopened subtask "{e.subtask}" on <b>{e.task.key}</b></>;
    case 'subtask.renamed':
      return <>renamed subtask "{e.from}" to "{e.subtask}" on <b>{e.task.key}</b></>;
    case 'subtask.removed':
      return <>removed subtask "{e.subtask}" from <b>{e.task.key}</b></>;
    case 'comment.added':
      return <>commented on <b>{e.task.key}</b>{e.mentions.length > 0 && <> and mentioned {list(e.mentions)}</>}</>;
    case 'comment.deleted':
      return <>deleted a comment on <b>{e.task.key}</b></>;
    case 'sprint.created':
      return <>created <b>{e.sprint.name}</b></>;
    case 'sprint.updated':
      return <>edited <b>{e.sprint.name}</b> ({list(e.fields.map((f) => SPRINT_FIELD_LABELS[f]))})</>;
    case 'sprint.started':
      return <>started <b>{e.sprint.name}</b></>;
    case 'sprint.completed':
      return (
        <>
          completed <b>{e.sprint.name}</b> — {e.done} of {e.total} tasks done
          {e.done < e.total && <>, the rest moved to {e.movedTo ?? 'the backlog'}</>}
        </>
      );
    case 'sprint.deleted':
      return <>deleted <b>{e.sprint.name}</b></>;
    case 'project.created':
      return <>created project <b>{e.project.name}</b></>;
    case 'project.updated':
      return <>edited project <b>{e.project.name}</b> ({list(e.fields.map((f) => PROJECT_FIELD_LABELS[f]))})</>;
    case 'project.deleted':
      return <>deleted project <b>{e.project.name}</b> ({e.project.key})</>;
    case 'project.member_added':
      return <>added <b>{e.member}</b> to <b>{e.project.name}</b></>;
    case 'project.member_removed':
      return <>removed <b>{e.member}</b> from <b>{e.project.name}</b></>;
    case 'user.role_changed':
      return <>changed <b>{e.member}</b>'s role from {ROLE_NAMES[e.from]} to {ROLE_NAMES[e.to]}</>;
    case 'user.permission_changed':
      return (
        <>
          {e.granted ? 'granted' : 'revoked'} <code title={PERMISSION_LABELS[e.permission]}>{e.permission}</code> {e.granted ? 'to' : 'from'} {ROLE_NAMES[e.role]}
        </>
      );
    case 'user.invited':
      return <>invited <b>{e.email}</b> as {ROLE_NAMES[e.role]}</>;
    case 'user.invite_resent':
      return <>resent the invite to <b>{e.email}</b></>;
    case 'user.invite_revoked':
      return <>cancelled the invite to <b>{e.email}</b></>;
    case 'user.joined':
      return <>joined TaskFlow{e.via === 'invite' ? ' from an invite' : ''} as {ROLE_NAMES[e.role]}</>;
  }
}
