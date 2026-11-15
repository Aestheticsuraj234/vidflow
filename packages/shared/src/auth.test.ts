import {describe, expect, it} from 'vitest';

import {signInSchema, signUpSchema} from './auth';

describe('signUpSchema', () => {
  it('normalizes the email', () => {
    const parsed = signUpSchema.parse({
      name: ' Suraj ',
      email: ' Suraj@Example.COM ',
      password: 'password123',
    });
    expect(parsed).toEqual({name: 'Suraj', email: 'suraj@example.com', password: 'password123'});
  });

  it('rejects a short password', () => {
    const result = signUpSchema.safeParse({name: 'A', email: 'a@b.co', password: 'short'});
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = signUpSchema.safeParse({name: 'A', email: 'nope', password: 'password123'});
    expect(result.success).toBe(false);
  });
});

describe('signInSchema', () => {
  it('requires a password', () => {
    const result = signInSchema.safeParse({email: 'a@b.co', password: ''});
    expect(result.success).toBe(false);
  });
});
