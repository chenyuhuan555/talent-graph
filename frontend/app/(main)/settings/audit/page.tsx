'use client';

import { useEffect, useState } from 'react';
import { getActiveSession } from '@/lib/auth/session';
import { getAuditPage, type AuditEntry } from '@/lib/data/audit';

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]); const [page, setPage] = useState(1); const [total, setTotal] = useState(0); const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => { getActiveSession().then(async (active) => { const ok = active?.profile.role === 'admin'; setAllowed(ok); if (ok) { const result = await getAuditPage({ role: 'admin', page, pageSize: 25 }); setEntries(result.data); setTotal(result.pagination.totalCount); } }); }, [page]);
  if (allowed === null) return <div className="text-warm-400">加载中…</div>; if (!allowed) return <div className="text-warm-500">仅管理员可以查看审计记录。</div>;
  return <div><header className="mb-6"><h1 className="text-xl font-semibold text-warm-600">审计记录</h1><p className="mt-1 text-sm text-warm-400">仅展示业务事件，不展示令牌、请求正文或联系方式</p></header><div className="surface overflow-hidden"><table className="w-full text-sm"><thead><tr className="border-b bg-warm-50">{['事件','操作成员','对象类型','对象 ID','时间'].map((label) => <th key={label} className="px-4 py-3 text-left font-medium text-warm-500">{label}</th>)}</tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-b border-warm-100"><td className="px-4 py-3">{entry.action}</td><td className="px-4 py-3">{entry.actor?.display_name || '系统'}</td><td className="px-4 py-3">{entry.entity_type || '—'}</td><td className="px-4 py-3 font-mono text-xs">{entry.entity_id || '—'}</td><td className="px-4 py-3">{new Date(entry.created_at).toLocaleString('zh-CN')}</td></tr>)}</tbody></table><div className="flex items-center justify-between border-t p-3 text-xs text-warm-400"><span>共 {total} 条</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded border px-3 py-1 disabled:opacity-40">上一页</button><button disabled={page * 25 >= total} onClick={() => setPage((value) => value + 1)} className="rounded border px-3 py-1 disabled:opacity-40">下一页</button></div></div></div></div>;
}
