'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getOrganizationPeople, searchOrganizations } from '@/lib/data/organizations';
import { personDetailHref } from '@/lib/routes';
import { displayOrganizationName } from '@/lib/display';
import type { Organization, Person } from '@/lib/types';

const TYPE_LABEL: Record<string, string> = { university: '高校', company: '公司', lab: '实验室', institute: '研究院', team: '团队' };

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selected, setSelected] = useState<Organization | null>(null);
  const [persons, setPersons] = useState<Person[]>([]);
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    searchOrganizations('', type).then((result) => setOrgs(result.data)).finally(() => setLoading(false));
  }, [type]);

  async function selectOrg(o: Organization) {
    setSelected(o);
    const result = await getOrganizationPeople(o.id);
    setPersons(result.data);
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-warm-600">学校与公司</h1>
        <p className="text-sm text-warm-400 mt-0.5">机构人才分布 · 学校 / 公司 / 实验室统一管理</p>
      </header>

      <div className="flex gap-4">
        <div className="w-80 shrink-0">
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full mb-3 px-3 py-2 border border-warm-200 rounded-lg text-sm bg-white">
            <option value="">全部类型</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
            {loading ? <div className="text-warm-400 text-sm">加载中…</div> : orgs.map((o) => (
              <button key={o.id} onClick={() => selectOrg(o)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition ${selected?.id === o.id ? 'border-forest-500 bg-forest-50' : 'border-warm-200 hover:bg-warm-50'}`}>
                <div className="text-sm font-medium text-warm-600">{displayOrganizationName(o)}</div>
                <div className="text-xs text-warm-400">{TYPE_LABEL[o.organization_type]} · {o.city || '—'}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1">
          {!selected ? (
            <div className="surface h-64 flex items-center justify-center text-warm-400 text-sm">请选择左侧机构</div>
          ) : (
            <div className="space-y-4">
              <div className="surface p-6">
                <h2 className="text-lg font-semibold text-warm-600 mb-1">{displayOrganizationName(selected)}</h2>
                {selected.name_zh?.trim() && selected.name?.trim() && selected.name_zh.trim() !== selected.name.trim() && (
                  <div className="text-sm text-warm-400">原文：{selected.name}</div>
                )}
                {selected.english_name && <div className="text-sm text-warm-400 mb-3">{selected.english_name}</div>}
                <div className="grid grid-cols-3 gap-4">
                  <div><div className="text-xs text-warm-400">类型</div><div className="text-sm text-warm-600">{TYPE_LABEL[selected.organization_type]}</div></div>
                  <div><div className="text-xs text-warm-400">城市</div><div className="text-sm text-warm-600">{selected.city || '—'}</div></div>
                  <div><div className="text-xs text-warm-400">国家</div><div className="text-sm text-warm-600">{selected.country || '—'}</div></div>
                </div>
                {selected.description && <div className="mt-3 text-sm text-warm-500">{selected.description}</div>}
              </div>
              <div className="surface p-5">
                <h3 className="text-sm font-medium text-warm-600 mb-3">在职/在读人才（{persons.length}）</h3>
                <div className="grid grid-cols-2 gap-2">
                  {persons.length === 0 ? <div className="text-sm text-warm-400">暂无</div> : persons.map((p) => (
                    <Link key={p.id} href={personDetailHref(p.id)} className="flex items-center px-3 py-2 border border-warm-200 rounded-lg hover:bg-warm-50">
                      <div className="w-8 h-8 rounded-full bg-forest-100 text-forest-700 flex items-center justify-center text-xs mr-3">{(p.chinese_name || p.english_name || '?')[0]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-warm-600 truncate">{p.chinese_name || p.english_name}</div>
                        <div className="text-xs text-warm-400 truncate">{p.current_position} · {p.primary_domain}</div>
                      </div>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-warm-100 text-warm-500">{p.talent_level}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
