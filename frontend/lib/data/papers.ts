import type { Paper } from '@/lib/types';
import { requireData } from './errors';
import { boundedPage, boundedPageSize, defaultClient, type DataClient, type PageResult } from './shared';

// Paper search backed by the papers_search RPC. The RPC matches both the
// original title and the Chinese translation (title_zh), so a paper can be found
// by either language. Input is passed as a parameter (never string-concatenated
// into SQL) and pagination is bounded server-side and client-side.
export async function searchPapers(searchTerm = '', page = 1, pageSize = 50, client: DataClient = defaultClient()): Promise<PageResult<Paper>> {
  return requireData(await client.rpc('papers_search', {
    search_term: searchTerm || null,
    page_number: boundedPage(page), page_size: boundedPageSize(pageSize),
  })) as unknown as PageResult<Paper>;
}
