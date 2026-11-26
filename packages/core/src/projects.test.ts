import { describe, expect, it } from 'vitest';
import { createProjectInput, projectKeySchema, suggestProjectKey, updateProjectInput } from './index';

describe('projectKeySchema', () => {
  it('uppercases and trims', () => {
    expect(projectKeySchema.parse(' tf ')).toBe('TF');
  });
  it.each(['T', 'TOOLONG', 'T1', 'T-F', ''])('rejects %j', (k) => {
    expect(projectKeySchema.safeParse(k).success).toBe(false);
  });
});

describe('suggestProjectKey', () => {
  it.each([
    ['Customer Portal', 'CP'],
    ['TaskFlow Web App', 'TWA'],
    ['Marketing', 'MAR'],
    ['  mobile   app 2.0 ', 'MA'],
    ['A', 'A'], // too short to be valid; the form then asks the user to type a key
    ['', ''],
  ])('%j → %j', (name, key) => {
    expect(suggestProjectKey(name)).toBe(key);
  });
});

describe('createProjectInput / updateProjectInput', () => {
  it('defaults the description and rejects unknown colours', () => {
    expect(createProjectInput.parse({ name: 'Web App', key: 'wa', color: '#4f46e5' })).toEqual({ name: 'Web App', key: 'WA', description: '', color: '#4f46e5' });
    expect(createProjectInput.safeParse({ name: 'Web App', key: 'WA', color: '#000000' }).success).toBe(false);
  });
  it('requires at least one field to update and never accepts a key', () => {
    expect(updateProjectInput.safeParse({}).success).toBe(false);
    expect(updateProjectInput.parse({ name: 'New name', key: 'XX' })).toEqual({ name: 'New name' });
  });
});
