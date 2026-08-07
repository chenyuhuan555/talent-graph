'use client';

import { useState } from 'react';
import { createPerson, updatePerson } from '@/lib/data/persons';
import type { Person } from '@/lib/types';

export function PersonForm({ initial, onSaved, onClose }: { initial?: Person; onSaved: (person: Person) => void; onClose: () => void }) {
  const [form, setForm] = useState({ chinese_name: initial?.chinese_name || '', english_name: initial?.english_name || '', current_position: initial?.current_position || '', location: initial?.location || '', primary_domain: initial?.primary_domain || '', talent_level: initial?.talent_level || '' });
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const saved = initial ? await updatePerson(initial.id, initial.updated_at || '', form) : await createPerson(form);
      onSaved(saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
    finally { setSaving(false); }
  }
  return <div role="dialog" aria-modal="true" aria-labelledby="person-form-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
    <form onSubmit={submit} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
      <h2 id="person-form-title" className="text-lg font-semibold text-warm-600">{initial ? '编辑人才' : '新建人才'}</h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[['chinese_name','中文名'],['english_name','英文名'],['current_position','当前职位'],['location','所在地区'],['primary_domain','主要方向'],['talent_level','人才级别']].map(([key,label]) => <label key={key} className="text-xs text-warm-500">{label}<input value={form[key as keyof typeof form]} onChange={(e) => set(key as keyof typeof form, e.target.value)} className="mt-1 w-full rounded-lg border border-warm-200 px-3 py-2 text-sm" /></label>)}
      </div>
      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-warm-200 px-4 py-2 text-sm">取消</button><button disabled={saving} className="rounded-lg bg-forest-600 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? '保存中…' : '保存'}</button></div>
    </form>
  </div>;
}
