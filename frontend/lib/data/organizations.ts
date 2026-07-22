import type { Organization, Person } from '@/lib/types';
import { requireData } from './errors';
import { boundedPage, boundedPageSize, defaultClient, type DataClient, type PageResult } from './shared';

export async function searchOrganizations(searchTerm = '', type = '', page = 1, pageSize = 50, client: DataClient = defaultClient()): Promise<PageResult<Organization>> {
  return requireData(await client.rpc('organizations_search', {
    search_term: searchTerm || null, organization_type_filter: type || null,
    page_number: boundedPage(page), page_size: boundedPageSize(pageSize),
  })) as unknown as PageResult<Organization>;
}

export async function getOrganizationPeople(id: string, client: DataClient = defaultClient()): Promise<PageResult<Person>> {
  return requireData(await client.rpc('organization_people', {
    target_organization_id: id, page_number: 1, page_size: 100,
  })) as unknown as PageResult<Person>;
}
