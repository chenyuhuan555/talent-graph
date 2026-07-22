import { createClient, type SupabaseClient } from '@supabase/supabase-js';


type PublicEnvironment = Record<string, string | undefined>;

let browserClient: SupabaseClient | null = null;

export function createBrowserClient(environment: PublicEnvironment = process.env): SupabaseClient {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error('Supabase 公共配置缺失');
  }
  return createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

export function getSupabaseClient(): SupabaseClient {
  if (!browserClient) browserClient = createBrowserClient();
  return browserClient;
}
