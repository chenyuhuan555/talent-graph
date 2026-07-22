import type { Outreach } from '@/lib/types';
import { requireData } from './errors';
import { boundedPage, boundedPageSize, defaultClient, type DataClient, type PageResult } from './shared';

export async function getOutreachQueue(page = 1, pageSize = 50, client: DataClient = defaultClient()): Promise<PageResult<Outreach>> {
  return requireData(await client.rpc('outreach_queue', { page_number: boundedPage(page), page_size: boundedPageSize(pageSize) })) as unknown as PageResult<Outreach>;
}

export async function addOutreach(input: Omit<Outreach, 'id'>, client: DataClient = defaultClient()): Promise<Outreach> {
  return requireData(await client.from('outreach_records').insert(input).select().single()) as Outreach;
}

export async function getPersonOutreach(personId: string, client: DataClient = defaultClient()): Promise<Outreach[]> {
  const result = await client.from('outreach_records').select('*').eq('person_id', personId).order('outreach_at', { ascending: false });
  return requireData(result) as Outreach[];
}
