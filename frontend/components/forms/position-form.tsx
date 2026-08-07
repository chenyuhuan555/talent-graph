'use client';

import { useState } from 'react';
import { savePosition } from '@/lib/data/positions';
import type { Position } from '@/lib/types';

export function PositionForm({ initial, onSaved, onClose }: { initial?: Position; onSaved: (position: Position) => void; onClose: () => void }) {
  const [form, setForm] = useState({ title: initial?.title || '', primary_domain: initial?.primary_domain || '', level: initial?.level || '', location: initial?.location || '', requirements: initial?.requirements || '', preferred_conditions: initial?.preferred_conditions || '', status: initial?.status || 'open' });
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try { onSaved(await savePosition(form, initial?.id)); } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); } finally { setSaving(false); }
  }
  return <div role="dialog" aria-modal="true" aria-labelledby="position-form-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><form onSubmit={submit} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
    <h2 id="position-form-title" className="text-lg font-semibold text-warm-600">{initial ? '编辑岗位' : '新建岗位'}</h2>
    <div className="mt-4 grid grid-cols-2 gap-3">{[['title','岗位名称'],['primary_domain','主要方向'],['level','级别'],['location','工作地点']].map(([key,label]) => <label key={key} className="text-xs text-warm-500">{label}<input required={key === 'title'} value={form[key as keyof typeof form]} onChange={(e) => setForm((value) => ({ ...value, [key]: e.target.value }))} className="mt-1 w-full rounded-lg border border-warm-200 px-3 py-2 text-sm" /></label>)}</div>
    <label className="mt-3 block text-xs text-warm-500">必要条件<textarea value={form.requirements} onChange={(e) => setForm((value) => ({ ...value, requirements: e.target.value }))} className="mt-1 w-full rounded-lg border border-warm-200 px-3 py-2 text-sm" /></label>
    <label className="mt-3 block text-xs text-warm-500">加分条件<textarea value={form.preferred_conditions} onChange={(e) => setForm((value) => ({ ...value, preferred_conditions: e.target.value }))} className="mt-1 w-full rounded-lg border border-warm-200 px-3 py-2 text-sm" /></label>
    {error && <div className="mt-3 text-sm text-red-600">{error}</div>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-warm-200 px-4 py-2 text-sm">取消</button><button disabled={saving} className="rounded-lg bg-forest-600 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? '保存中…' : '保存'}</button></div>
  </form></div>;
}
