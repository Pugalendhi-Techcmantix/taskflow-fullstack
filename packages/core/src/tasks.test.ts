import { describe, expect, it } from 'vitest';
import { createTaskInput, isOverdue, parseTaskKey, taskKey, updateTaskInput } from './index';

describe('task keys', () => {
  it('builds and parses keys like TF-107', () => {
    expect(taskKey('TF', 107)).toBe('TF-107');
    expect(parseTaskKey(' tf-107 ')).toEqual({ projectKey: 'TF', number: 107 });
    expect(parseTaskKey('TF107')).toBeNull();
    expect(parseTaskKey('T-1')).toBeNull();
  });
});

describe('createTaskInput', () => {
  it('fills sensible defaults', () => {
    expect(createTaskInput.parse({ title: '  Login page ' })).toEqual({
      title: 'Login page', description: '', type: 'task', status: 'todo', priority: 'medium',
      points: null, assigneeId: null, sprintId: null, dueDate: null,
    });
  });
  it('rejects bad values with field names', () => {
    const r = createTaskInput.safeParse({ title: 'ab', type: 'epic', points: 4, assigneeId: 'x', dueDate: '2026-13-01' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0]).sort()).toEqual(['assigneeId', 'dueDate', 'points', 'title', 'type']);
  });
});

describe('updateTaskInput', () => {
  it('allows clearing optional fields and needs at least one field', () => {
    expect(updateTaskInput.parse({ assigneeId: null, sprintId: null, dueDate: null, points: null })).toEqual({ assigneeId: null, sprintId: null, dueDate: null, points: null });
    expect(updateTaskInput.safeParse({}).success).toBe(false);
  });
});

describe('isOverdue', () => {
  it('is overdue only when past due and not done', () => {
    expect(isOverdue({ dueDate: '2026-11-20', status: 'todo' }, '2026-11-26')).toBe(true);
    expect(isOverdue({ dueDate: '2026-11-20', status: 'done' }, '2026-11-26')).toBe(false);
    expect(isOverdue({ dueDate: '2026-11-26', status: 'todo' }, '2026-11-26')).toBe(false);
    expect(isOverdue({ dueDate: null, status: 'todo' }, '2026-11-26')).toBe(false);
  });
});

import { findMentions } from './index';

describe('findMentions', () => {
  const members = [
    { id: 'a', name: 'Dana Dev' },
    { id: 'b', name: 'Pat Manager' },
    { id: 'c', name: 'Dana Smith' },
  ];
  it('finds full names and first names, ignoring case', () => {
    expect(findMentions('Thanks @pat manager and @Dana Smith!', members).map((m) => m.id).sort()).toEqual(['b', 'c']);
    expect(findMentions('@Pat can you check?', members).map((m) => m.id)).toEqual(['b']);
  });
  it('needs a word boundary after the name', () => {
    expect(findMentions('@Patrick please', members)).toEqual([]);
    expect(findMentions('email me at pat@example.com', members)).toEqual([]);
  });
  it('a shared first name mentions everyone with it', () => {
    expect(findMentions('@Dana look', members).map((m) => m.id).sort()).toEqual(['a', 'c']);
  });
});
