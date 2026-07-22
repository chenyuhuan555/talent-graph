import type { Dashboard } from '@/lib/types';
import { requireData } from './errors';
import { defaultClient, type DataClient } from './shared';

export async function getDashboard(client: DataClient = defaultClient()): Promise<Dashboard> {
  const raw = requireData(await client.rpc('dashboard_summary')) as Record<string, number>;
  return {
    total_persons: raw.persons || 0, new_this_week: 0, with_contact: 0,
    outreach_this_month: 0, replied: 0, verified_relations: raw.relationships || 0,
    domain_distribution: [], top_schools: [], top_companies: [], high_potential: [], today_followups: [],
    total_organizations: raw.organizations || 0, open_positions: raw.positions || 0,
    pending_followups: raw.pendingFollowUps || 0,
  };
}
