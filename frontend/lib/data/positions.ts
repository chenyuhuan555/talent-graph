import type { Match, Position } from '@/lib/types';
import { requireData } from './errors';
import { boundedPage, boundedPageSize, defaultClient, type DataClient, type PageResult } from './shared';

export async function searchPositions(search = '', status = '', page = 1, pageSize = 50, client: DataClient = defaultClient()): Promise<PageResult<Position>> {
  return requireData(await client.rpc('positions_search', {
    search_term: search || null, status_filter: status || null, owner_filter: null,
    page_number: boundedPage(page), page_size: boundedPageSize(pageSize),
  })) as unknown as PageResult<Position>;
}

export async function getPositionMatches(id: string, client: DataClient = defaultClient()): Promise<PageResult<Match>> {
  return requireData(await client.rpc('position_matches', { target_position_id: id, page_number: 1, page_size: 100 })) as unknown as PageResult<Match>;
}

export async function savePosition(input: Partial<Position> & Pick<Position, 'title'>, id?: string, client: DataClient = defaultClient()): Promise<Position> {
  const query = id ? client.from('positions').update(input).eq('id', id) : client.from('positions').insert(input);
  return requireData(await query.select().single()) as Position;
}
