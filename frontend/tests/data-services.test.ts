import { describe, expect, it, vi } from 'vitest';

import { exportBusinessSnapshot } from '@/lib/data/exports';
import { createMember } from '@/lib/data/members';
import { getAuditPage } from '@/lib/data/audit';
import { getOutreachQueue } from '@/lib/data/outreach';
import { getMaskedContacts, searchPersons, updatePerson } from '@/lib/data/persons';
import { getRelationshipGraph } from '@/lib/data/relationships';
import { mergePeople } from '@/lib/data/review';
import { PermissionError } from '@/lib/data/errors';

function rpcClient(data: unknown = []) {
  return { rpc: vi.fn().mockResolvedValue({ data, error: null }) };
}

describe('typed Supabase data services', () => {
  it('bounds person-search pagination and sends typed filters', async () => {
    const client = rpcClient({ data: [], pagination: { totalCount: 0 } });
    await searchPersons({ page: 2, pageSize: 500, searchTerm: '张', domain: '大模型' }, client as never);
    expect(client.rpc).toHaveBeenCalledWith('search_persons', expect.objectContaining({
      page_number: 2, page_size: 100, search_term: '张', domain_filter: '大模型',
    }));
  });

  it('bounds graph size and reads contacts only through the masking RPC', async () => {
    const graph = rpcClient({ nodes: [], edges: [] });
    await getRelationshipGraph('person-1', 999, graph as never);
    expect(graph.rpc).toHaveBeenCalledWith('relationship_graph', {
      center_person_id: 'person-1', max_nodes: 50,
    });

    const contacts = rpcClient([]);
    await getMaskedContacts('person-1', contacts as never);
    expect(contacts.rpc).toHaveBeenCalledWith('masked_contacts_for_person', { target_person_id: 'person-1' });
  });

  it('uses the original timestamp for optimistic person updates', async () => {
    const client = rpcClient({ id: 'person-1' });
    await updatePerson('person-1', '2026-07-22T00:00:00Z', { location: '上海' }, client as never);
    expect(client.rpc).toHaveBeenCalledWith('update_person_if_current', {
      target_id: 'person-1', expected_updated_at: '2026-07-22T00:00:00Z', patch: { location: '上海' },
    });
  });

  it('loads the caller-scoped outreach queue and maps merge permission errors', async () => {
    const outreach = rpcClient({ data: [] });
    await getOutreachQueue(1, 20, outreach as never);
    expect(outreach.rpc).toHaveBeenCalledWith('outreach_queue', { page_number: 1, page_size: 20 });

    const denied = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'not_authorized' } }) };
    await expect(mergePeople('a', 'b', denied as never)).rejects.toBeInstanceOf(PermissionError);
  });

  it('creates members only through the authenticated Edge Function', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    const client = { functions: { invoke } };
    await createMember({ username: 'alice', displayName: 'Alice', department: 'AI', role: 'consultant', password: 'secret123' }, client as never);
    expect(invoke).toHaveBeenCalledWith('manage-member', expect.objectContaining({ body: expect.objectContaining({ action: 'create' }) }));
  });

  it('keeps audit and exports role-gated in the client as well as RLS', async () => {
    const auditResult = { range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }) };
    const auditClient = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue(auditResult) }) }) };
    await getAuditPage({ role: 'admin', page: 2, pageSize: 25 }, auditClient as never);
    expect(auditResult.range).toHaveBeenCalledWith(25, 49);
    await expect(getAuditPage({ role: 'leader', page: 1, pageSize: 25 }, auditClient as never)).rejects.toBeInstanceOf(PermissionError);

    const exportClient = rpcClient({ persons: [] });
    await exportBusinessSnapshot('leader', exportClient as never);
    expect(exportClient.rpc).toHaveBeenCalledWith('export_business_snapshot');
    await expect(exportBusinessSnapshot('consultant', exportClient as never)).rejects.toBeInstanceOf(PermissionError);
  });
});
