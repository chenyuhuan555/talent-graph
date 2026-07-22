import type { AppRole } from '@/lib/types';
import { requireData } from './errors';
import { defaultClient, type DataClient } from './shared';

export interface NewMember { username: string; displayName: string; department: string; role: AppRole; password: string }

export async function createMember(member: NewMember, client: DataClient = defaultClient()): Promise<unknown> {
  return requireData(await client.functions.invoke('manage-member', { body: { action: 'create', ...member } }));
}

export async function disableMember(userId: string, client: DataClient = defaultClient()): Promise<unknown> {
  return requireData(await client.functions.invoke('manage-member', { body: { action: 'disable', userId } }));
}

export async function listMembers(client: DataClient = defaultClient()): Promise<unknown[]> {
  return requireData(await client.from('profiles').select('id,display_name,role,department,status,created_at').order('created_at')) as unknown[];
}
