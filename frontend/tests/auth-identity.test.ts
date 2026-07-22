import { describe, expect, it } from 'vitest';

import { normalizeUsername, usernameToInternalEmail } from '@/lib/auth/identity';


describe('username identity mapping', () => {
  it.each([
    [' Alice ', 'alice'],
    ['ＡＤＭＩＮ', 'admin'],
    ['顾问01', '顾问01'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeUsername(input)).toBe(expected);
  });

  it('uses a lowercase SHA-256 local part and fixed invalid suffix', async () => {
    const internalEmail = await usernameToInternalEmail(' Alice ');
    expect(internalEmail).toMatch(/^[0-9a-f]{64}@talent-graph\.invalid$/);
  });

  it('rejects an empty normalized username', async () => {
    await expect(usernameToInternalEmail('　 ')).rejects.toThrow('用户名不能为空');
  });
});
