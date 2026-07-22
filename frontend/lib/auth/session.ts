import type { SupabaseClient } from '@supabase/supabase-js';

import { usernameToInternalEmail } from '@/lib/auth/identity';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { ActiveSession, AppProfile } from '@/lib/types';


export class AuthError extends Error {
  readonly code = 'auth_error';
}

async function loadActiveProfile(
  client: SupabaseClient,
  userId: string,
): Promise<AppProfile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('id,display_name,role,department,status,created_at,updated_at')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data || data.status !== 'active') return null;
  return data as AppProfile;
}

export async function loginWithUsername(
  username: string,
  password: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<ActiveSession> {
  const email = await usernameToInternalEmail(username);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    throw new AuthError('用户名或密码错误');
  }
  const profile = await loadActiveProfile(client, data.user.id);
  if (!profile) {
    await client.auth.signOut();
    throw new AuthError('用户名或密码错误');
  }
  return { session: data.session, profile } as ActiveSession;
}

export async function getActiveSession(
  client: SupabaseClient = getSupabaseClient(),
): Promise<ActiveSession | null> {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) return null;
  const profile = await loadActiveProfile(client, data.session.user.id);
  if (!profile) {
    await client.auth.signOut();
    return null;
  }
  return { session: data.session, profile } as ActiveSession;
}

export async function logout(client: SupabaseClient = getSupabaseClient()): Promise<void> {
  await client.auth.signOut();
}

export function subscribeToAuthChanges(
  onChange: () => void,
  client: SupabaseClient = getSupabaseClient(),
): () => void {
  const { data } = client.auth.onAuthStateChange(() => queueMicrotask(onChange));
  return () => data.subscription.unsubscribe();
}
