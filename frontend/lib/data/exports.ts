import type { AppRole } from '@/lib/types';
import { PermissionError, requireData } from './errors';
import { defaultClient, type DataClient } from './shared';

export async function exportBusinessSnapshot(role: AppRole, client: DataClient = defaultClient()): Promise<Record<string, unknown>> {
  if (role !== 'admin' && role !== 'leader') throw new PermissionError('当前账号没有导出权限');
  return requireData(await client.rpc('export_business_snapshot')) as Record<string, unknown>;
}
