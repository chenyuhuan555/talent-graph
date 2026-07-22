'use client';

import { useState } from 'react';
import { getActiveSession } from '@/lib/auth/session';
import { addOutreach } from '@/lib/data/outreach';
import type { Outreach } from '@/lib/types';

export function OutreachForm({ personId, onSaved, onClose }: { personId: string; onSaved: (record: Outreach) => void; onClose: () => void }) {
  const [channel, setChannel] = useState('微信'); const [summary, setSummary] = useState(''); const [nextAt, setNextAt] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(''); try { const active = await getActiveSession(); if (!active) throw new Error('登录已失效'); onSaved(await addOutreach({ person_id: personId, user_id: active.profile.id, outreach_channel: channel, content_summary: summary, next_follow_up_at: nextAt ? new Date(nextAt).toISOString() : undefined })); } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); } finally { setSaving(false); } }
  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><form onSubmit={submit} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"><h2 className="text-lg font-semibold text-warm-600">创建触达</h2><label className="mt-4 block text-xs text-warm-500">渠道<input required value={channel} onChange={(e) => setChannel(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label><label className="mt-3 block text-xs text-warm-500">内容摘要<textarea required value={summary} onChange={(e) => setSummary(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label><label className="mt-3 block text-xs text-warm-500">下次跟进<input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>{error && <div className="mt-3 text-sm text-red-600">{error}</div>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">取消</button><button disabled={saving} className="rounded-lg bg-forest-600 px-4 py-2 text-sm text-white">保存</button></div></form></div>;
}
