'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { searchPersons } from '@/lib/data/persons';
import { personDetailHref } from '@/lib/routes';
import { LEVEL_COLOR, type Person } from '@/lib/types';
import { PersonForm } from '@/components/forms/person-form';

const DOMAINS = ['大模型', '多模态', 'AI Infra'];
const LEVELS = ['S', 'A', 'B', 'C'];

export default function PersonsPage() {
  const router = useRouter();
  const [persons, setPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [domain, setDomain] = useState('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const pageSize = 15;

  useEffect(() => {
    setLoading(true);
    searchPersons({ page, pageSize, searchTerm: keyword, domain, level }).then((result) => {
      setPersons(result.data);
      setTotal(result.pagination.totalCount);
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, domain, level, page]);

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-warm-600">人才库</h1>
          <p className="text-sm text-warm-400 mt-0.5">人工智能人才基础库 · {persons.length} 条结果</p>
        </div>
        <button type="button" onClick={() => setShowForm(true)} className="px-4 py-2 bg-forest-600 text-white text-sm rounded-lg hover:bg-forest-700 transition flex items-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新建人才
        </button>
      </header>

      {/* 筛选器 */}
      <div className="surface p-4 mb-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8C887E" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
            placeholder="搜索姓名、职位…"
            className="w-full pl-9 pr-3 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:border-forest-500"
          />
        </div>
        <select value={domain} onChange={(e) => { setDomain(e.target.value); setPage(1); }} className="px-3 py-2 border border-warm-200 rounded-lg text-sm bg-white focus:outline-none focus:border-forest-500">
          <option value="">全部方向</option>
          {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }} className="px-3 py-2 border border-warm-200 rounded-lg text-sm bg-white focus:outline-none focus:border-forest-500">
          <option value="">全部级别</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l} 级</option>)}
        </select>
      </div>

      {/* 表格 */}
      <div className="surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-warm-200 bg-warm-50">
              {['姓名', '当前机构', '职位', '方向', '级别', '论文', '关系', '触达状态', '来源', '完整度'].map((h) => (
                <th key={h} className="text-left font-medium text-warm-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center py-10 text-warm-400">加载中…</td></tr>
            ) : persons.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-10 text-warm-400">暂无数据</td></tr>
            ) : persons.map((p) => (
              <tr key={p.id} className="border-b border-warm-100 hover:bg-warm-50 transition cursor-pointer" onClick={() => router.push(personDetailHref(p.id))}>
                <td className="px-4 py-3">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-forest-100 text-forest-700 flex items-center justify-center text-xs font-medium mr-2.5">
                      {(p.chinese_name || p.english_name || '?')[0]}
                    </div>
                    <div>
                      <div className="font-medium text-warm-600">{p.chinese_name || p.english_name}</div>
                      {p.english_name && p.chinese_name && <div className="text-xs text-warm-400">{p.english_name}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-warm-600">{p.organization_name || '—'}</td>
                <td className="px-4 py-3 text-warm-600">{p.current_position || '—'}</td>
                <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded bg-forest-50 text-forest-700">{p.primary_domain || '—'}</span></td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${LEVEL_COLOR[p.talent_level || ''] || 'bg-warm-100 text-warm-500'}`}>{p.talent_level || '—'}</span></td>
                <td className="px-4 py-3 text-warm-500">{p.paper_count || 0}</td>
                <td className="px-4 py-3 text-warm-500">{p.relationship_count || 0}</td>
                <td className="px-4 py-3"><span className="text-xs text-warm-500">{p.outreach_status || '未触达'}</span></td>
                <td className="px-4 py-3"><span className="text-xs px-1.5 py-0.5 rounded bg-warm-100 text-warm-500">{p.source_type || '—'}</span></td>
                <td className="px-4 py-3">
                  <div className="flex items-center">
                    <div className="w-12 h-1.5 bg-warm-200 rounded-full mr-2"><div className="h-full bg-forest-500 rounded-full" style={{ width: `${p.data_completeness || 0}%` }} /></div>
                    <span className="text-xs text-warm-400">{Math.round(p.data_completeness || 0)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* 分页 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-warm-200">
          <span className="text-xs text-warm-400">共 {total} 条 · 第 {page} 页</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-sm border border-warm-200 rounded-lg disabled:opacity-40 hover:bg-warm-50">上一页</button>
            <button disabled={persons.length < pageSize} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-sm border border-warm-200 rounded-lg disabled:opacity-40 hover:bg-warm-50">下一页</button>
          </div>
        </div>
      </div>
      {showForm && <PersonForm onClose={() => setShowForm(false)} onSaved={(person) => { setPersons((items) => [person, ...items]); setTotal((value) => value + 1); setShowForm(false); }} />}
    </div>
  );
}
