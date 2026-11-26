import { describe, expect, it } from 'vitest';
import { addDays, createSprintInput, daysBetween, parseIsoDate, sortSprints, sprintEndDate, updateSprintInput } from './index';

describe('calendar dates', () => {
  it('accepts real dates only', () => {
    expect(parseIsoDate('2026-11-26')).not.toBeNull();
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('26-11-2026')).toBeNull();
  });
  it('adds days across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(daysBetween('2026-11-26', '2026-12-09')).toBe(13);
  });
  it('a 2-week sprint starting Monday ends the second Sunday', () => {
    expect(sprintEndDate('2026-11-30', 2)).toBe('2026-12-13');
  });
});

describe('sprint inputs', () => {
  const ok = { name: 'Sprint 1', startDate: '2026-12-01', endDate: '2026-12-14' };
  it('defaults the goal', () => {
    expect(createSprintInput.parse(ok)).toEqual({ ...ok, goal: '' });
  });
  it('rejects an end before the start, and sprints longer than 8 weeks', () => {
    const before = createSprintInput.safeParse({ ...ok, endDate: '2026-11-30' });
    expect(before.success).toBe(false);
    expect(before.error?.issues[0]?.path).toEqual(['endDate']);
    expect(createSprintInput.safeParse({ ...ok, endDate: '2027-02-01' }).success).toBe(false);
  });
  it('update needs at least one field and checks dates only when both are given', () => {
    expect(updateSprintInput.safeParse({}).success).toBe(false);
    expect(updateSprintInput.safeParse({ endDate: '2026-12-20' }).success).toBe(true);
    expect(updateSprintInput.safeParse({ startDate: '2026-12-20', endDate: '2026-12-01' }).success).toBe(false);
  });
});

describe('sortSprints', () => {
  it('orders active, then planned by start, then completed newest first', () => {
    const s = (name: string, status: 'planned' | 'active' | 'completed', startDate: string, endDate: string) => ({ name, status, startDate, endDate });
    const sorted = sortSprints([
      s('old', 'completed', '2026-10-01', '2026-10-14'),
      s('later', 'planned', '2026-12-15', '2026-12-28'),
      s('now', 'active', '2026-11-20', '2026-12-03'),
      s('recent', 'completed', '2026-11-01', '2026-11-14'),
      s('next', 'planned', '2026-12-04', '2026-12-14'),
    ]);
    expect(sorted.map((x) => x.name)).toEqual(['now', 'next', 'later', 'recent', 'old']);
  });
});
