import { describe, expect, it } from 'vitest';
import { activityCursor, activityEvent, activityQuery, activityTypeOf } from './index';

describe('activity events', () => {
  it('groups actions into the five filter types (subtasks are task events)', () => {
    expect(activityTypeOf('task.moved')).toBe('task');
    expect(activityTypeOf('subtask.completed')).toBe('task');
    expect(activityTypeOf('comment.added')).toBe('comment');
    expect(activityTypeOf('sprint.completed')).toBe('sprint');
    expect(activityTypeOf('project.member_added')).toBe('project');
    expect(activityTypeOf('user.invited')).toBe('user');
  });

  it('accepts well-formed events and refuses malformed ones', () => {
    expect(activityEvent.safeParse({ action: 'task.moved', task: { key: 'TF-1', title: 'A' }, from: 'todo', to: 'done' }).success).toBe(true);
    expect(activityEvent.safeParse({ action: 'task.moved', task: { key: 'TF-1', title: 'A' }, from: 'todo', to: 'shipped' }).success).toBe(false);
    expect(activityEvent.safeParse({ action: 'task.exploded', task: { key: 'TF-1', title: 'A' } }).success).toBe(false);
    expect(activityEvent.safeParse({ action: 'user.role_changed', member: 'Dev', from: 'developer', to: 'god' }).success).toBe(false);
  });
});

describe('activityQuery', () => {
  it('accepts a cursor made by activityCursor and refuses anything else', () => {
    const cursor = activityCursor('2026-11-27T10:00:00.000Z', '01a21cf4-34fe-7489-aa97-2bc22dee74b3');
    expect(activityQuery.parse({ cursor, type: 'task' })).toEqual({ cursor, type: 'task' });
    expect(activityQuery.safeParse({ cursor: 'yesterday' }).success).toBe(false);
    expect(activityQuery.safeParse({ cursor: `${cursor}; DROP TABLE users` }).success).toBe(false);
    expect(activityQuery.safeParse({ user: 'bob' }).success).toBe(false);
  });
});
