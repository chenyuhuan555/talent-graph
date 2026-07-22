import type { AppRole } from '@/lib/types';
import { PermissionError, requireData } from './errors';
import { boundedPage, boundedPageSize, defaultClient, type DataClient, type PageResult } from './shared';

export interface AuditEntry { id: string; action: string; entity_type: string | null; entity_id: string | null; user_id: string | null; created_at: string; actor?: { display_name?: string } | null }

export async function getAuditPage(options: { role: AppRole; page: number; pageSize: number }, client: DataClient = defaultClient()): Promise<PageResult<AuditEntry>> {
  if (options.role !== 'admin') throw new PermissionError('仅管理员可以查看审计记录');
  const page = boundedPage(options.page); const size = boundedPageSize(options.pageSize);
  const result = await client.from('audit_logs').select('id,action,entity_type,entity_id,user_id,created_at,actor:profiles!audit_logs_user_id_fkey(display_name)', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * size, page * size - 1);
  const data = requireData({ data: result.data, error: result.error }) as AuditEntry[];
  return { data, pagination: { pageNumber: page, pageSize: size, totalCount: result.count || 0, totalPages: Math.ceil((result.count || 0) / size) } };
}
