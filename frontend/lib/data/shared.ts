import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase/client';

export type DataClient = SupabaseClient;
export const defaultClient = (): SupabaseClient => getSupabaseClient();

export interface PageResult<T> {
  data: T[];
  pagination: {
    pageNumber: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export const boundedPage = (value = 1) => Math.max(1, Math.trunc(value));
export const boundedPageSize = (value = 20) => Math.min(100, Math.max(1, Math.trunc(value)));
