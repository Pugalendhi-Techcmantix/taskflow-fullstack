import { describe, expect, it } from 'vitest';
import { activityCursor, activityEvent, activityQuery, activityTypeOf, computeBurndown, taskListQuery } from './index';

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

describe('computeBurndown', () => {
  const sprint = { startDate: '2026-12-01', endDate: '2026-12-05' };

  it('counts remaining points per day up to today, then leaves future days empty', () => {
    const b = computeBurndown({
      ...sprint,
      today: '2026-12-03',
      tasks: [
        { points: 5, doneDay: '2026-12-02' },
        { points: 3, doneDay: '2026-12-03' },
        { points: 8, doneDay: null },
        { points: null, doneDay: '2026-12-01' }, // no estimate: weighs nothing in points mode
      ],
    });
    expect(b.unit).toBe('points');
    expect(b.total).toBe(16);
    expect(b.remaining).toBe(8);
    expect(b.days).toEqual([
      { date: '2026-12-01', remaining: 16 },
      { date: '2026-12-02', remaining: 11 },
      { date: '2026-12-03', remaining: 8 },
      { date: '2026-12-04', remaining: null },
      { date: '2026-12-05', remaining: null },
    ]);
    expect(b.todayIndex).toBe(2);
  });

  it('counts tasks instead of points when nothing is estimated', () => {
    const b = computeBurndown({ ...sprint, today: '2026-12-05', tasks: [{ points: null, doneDay: '2026-12-04' }, { points: null, doneDay: null }] });
    expect(b).toMatchObject({ unit: 'tasks', total: 2, remaining: 1 });
    expect(b.days.map((d) => d.remaining)).toEqual([2, 2, 2, 1, 1]);
  });

  it('handles today outside the sprint and an empty sprint', () => {
    expect(computeBurndown({ ...sprint, today: '2026-11-20', tasks: [{ points: 2, doneDay: null }] })).toMatchObject({ todayIndex: null });
    expect(computeBurndown({ ...sprint, today: '2026-12-31', tasks: [] })).toMatchObject({ total: 0, remaining: 0, todayIndex: null });
    expect(computeBurndown({ ...sprint, today: '2026-12-31', tasks: [] }).days.every((d) => d.remaining === 0)).toBe(true);
  });
});

describe('Tasks status filter', () => {
  it('accepts a status or the open/overdue groups', () => {
    expect(taskListQuery.parse({ status: 'open' }).status).toBe('open');
    expect(taskListQuery.parse({ status: 'overdue' }).status).toBe('overdue');
    expect(taskListQuery.safeParse({ status: 'late' }).success).toBe(false);
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
