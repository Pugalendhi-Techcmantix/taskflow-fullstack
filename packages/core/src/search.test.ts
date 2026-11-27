import { describe, expect, it } from 'vitest';
import { likePattern, pageCount, pageItems, searchQuery, taskListQuery } from './index';

describe('taskListQuery (query string of the Tasks table)', () => {
  it('fills defaults: page 1, 25 rows, sorted by key ascending', () => {
    expect(taskListQuery.parse({})).toEqual({ q: '', sort: 'key', dir: 'asc', page: 1, size: 25 });
  });

  it('coerces text from the URL into numbers and trims the search text', () => {
    expect(taskListQuery.parse({ q: '  login ', page: '3', size: '50', status: 'done', assignee: 'none', sprint: 'backlog' }))
      .toMatchObject({ q: 'login', page: 3, size: 50, status: 'done', assignee: 'none', sprint: 'backlog' });
  });

  it('only accepts the offered page sizes and whole pages from 1', () => {
    for (const bad of [{ size: '7' }, { size: '1000' }, { page: '0' }, { page: '-2' }, { page: '2.5' }, { page: 'x' }]) {
      expect(taskListQuery.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    for (const size of ['10', '25', '50', '100']) expect(taskListQuery.parse({ size }).size).toBe(Number(size));
  });

  it('refuses unknown sort columns, directions and filter values', () => {
    for (const bad of [{ sort: 'password_hash' }, { dir: 'sideways' }, { status: 'blocked' }, { assignee: 'bob' }, { sprint: 'next' }, { q: 'x'.repeat(101) }]) {
      expect(taskListQuery.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('searchQuery (global search)', () => {
  it('needs some text after trimming', () => {
    expect(searchQuery.parse({ q: ' tf-1 ' })).toEqual({ q: 'tf-1' });
    expect(searchQuery.safeParse({ q: '   ' }).success).toBe(false);
    expect(searchQuery.safeParse({}).success).toBe(false);
  });
});

describe('likePattern', () => {
  it('wraps the text and escapes LIKE wildcards', () => {
    expect(likePattern('login')).toBe('%login%');
    expect(likePattern('100%_\\')).toBe('%100\\%\\_\\\\%');
  });
});

describe('pager helpers', () => {
  it('counts pages, with at least one', () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });

  it('lists every page when there are few, otherwise first, last and neighbours with gaps', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20]);
    expect(pageItems(6, 20)).toEqual([1, 'gap', 5, 6, 7, 'gap', 20]);
    expect(pageItems(20, 20)).toEqual([1, 'gap', 16, 17, 18, 19, 20]);
    expect(pageItems(5, 9)).toEqual([1, 'gap', 4, 5, 6, 'gap', 9]);
  });
});
