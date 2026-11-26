import { describe, expect, it } from 'vitest';
import { fieldErrors, loginInput, registerInput } from './index';

describe('registerInput', () => {
  it('normalises email to trimmed lowercase', () => {
    const r = registerInput.parse({ name: '  Arjun Mehta ', email: '  Arjun@TaskFlow.dev ', password: 'secret123' });
    expect(r.email).toBe('arjun@taskflow.dev');
    expect(r.name).toBe('Arjun Mehta');
  });

  it('reports one message per invalid field', () => {
    const r = registerInput.safeParse({ name: 'A', email: 'nope', password: 'short' });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(fieldErrors(r.error)).toEqual({
      name: 'Enter your full name',
      email: 'Enter a valid email address',
      password: 'Use at least 8 characters',
    });
  });

  it('rejects passwords longer than 72 bytes instead of truncating them', () => {
    const r = registerInput.safeParse({ name: 'Arjun', email: 'a@b.co', password: 'é'.repeat(37) }); // 74 bytes
    expect(r.success).toBe(false);
  });
});

describe('loginInput', () => {
  it('requires a password', () => {
    const r = loginInput.safeParse({ email: 'a@b.co', password: '' });
    expect(r.success).toBe(false);
  });
});
