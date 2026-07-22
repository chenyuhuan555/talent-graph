export class PermissionError extends Error { readonly code = 'permission_denied'; }
export class ConflictError extends Error { readonly code = 'record_conflict'; }
export class NetworkError extends Error { readonly code = 'network_error'; }
export class DataError extends Error { readonly code = 'data_error'; }

export function mapSupabaseError(error: { code?: string; message: string }): Error {
  if (error.code === '42501' || error.message.includes('not_authorized')) {
    return new PermissionError('当前账号没有执行此操作的权限');
  }
  if (error.code === 'P0001' && error.message.includes('record_conflict')) {
    return new ConflictError('记录已被其他成员修改，请刷新后重试');
  }
  if (error.message.toLowerCase().includes('fetch') || error.message.toLowerCase().includes('network')) {
    return new NetworkError('网络连接失败，请检查网络后重试');
  }
  return new DataError('数据请求失败，请稍后重试');
}

export function requireData<T>(result: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (result.error) throw mapSupabaseError(result.error);
  if (result.data === null) throw new DataError('未找到所需数据');
  return result.data;
}
