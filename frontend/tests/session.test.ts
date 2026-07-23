import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { createBrowserClient } from '@/lib/supabase/client';
import {
  AuthError,
  getActiveSession,
  loginWithUsername,
  logout,
} from '@/lib/auth/session';
import { usernameToInternalEmail } from '@/lib/auth/identity';


function fakeClient(profile: { status: string; role?: string } | null = { status: 'active', role: 'admin' }) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' }, session: { access_token: 'token' } },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1' }, access_token: 'token' } },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue({ select }),
  };
}


describe('Supabase session boundary', () => {
  it('reads public Supabase settings directly so static builds embed them', () => {
    const source = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../lib/supabase/client.ts'),
      'utf8',
    );

    expect(source).toContain('process.env.NEXT_PUBLIC_SUPABASE_URL');
    expect(source).toContain('process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  });

  it('refuses missing public configuration', () => {
    expect(() => createBrowserClient({})).toThrow('Supabase 公共配置缺失');
  });

  it('derives the internal email and validates a live profile on login', async () => {
    const client = fakeClient();
    const result = await loginWithUsername(' Alice ', 'password-value', client as never);

    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: await usernameToInternalEmail(' Alice '),
      password: 'password-value',
    });
    expect(client.from).toHaveBeenCalledWith('profiles');
    expect(result.profile.status).toBe('active');
  });

  it('signs out and returns a generic error for a disabled profile', async () => {
    const client = fakeClient({ status: 'disabled', role: 'admin' });

    await expect(loginWithUsername('alice', 'password-value', client as never))
      .rejects.toBeInstanceOf(AuthError);
    expect(client.auth.signOut).toHaveBeenCalledOnce();
  });

  it('rechecks the live profile whenever the app bootstraps', async () => {
    const client = fakeClient({ status: 'active', role: 'consultant' });
    const result = await getActiveSession(client as never);

    expect(client.auth.getSession).toHaveBeenCalledOnce();
    expect(client.from).toHaveBeenCalledWith('profiles');
    expect(result?.profile.role).toBe('consultant');
  });

  it('logs out through Supabase Auth', async () => {
    const client = fakeClient();
    await logout(client as never);
    expect(client.auth.signOut).toHaveBeenCalledOnce();
  });
});
