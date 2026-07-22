import type { MergeTask, Person } from '@/lib/types';
import { requireData } from './errors';
import { boundedPage, boundedPageSize, defaultClient, type DataClient, type PageResult } from './shared';

export async function getMergeTasks(status = 'pending', page = 1, pageSize = 50, client: DataClient = defaultClient()): Promise<PageResult<MergeTask>> {
  return requireData(await client.rpc('merge_task_list', { status_filter: status || null, page_number: boundedPage(page), page_size: boundedPageSize(pageSize) })) as unknown as PageResult<MergeTask>;
}

export async function mergePeople(primaryId: string, duplicateId: string, client: DataClient = defaultClient()): Promise<Person> {
  return requireData(await client.rpc('merge_people', { target_primary_person_id: primaryId, target_duplicate_person_id: duplicateId })) as Person;
}
