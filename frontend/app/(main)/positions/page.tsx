'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPositionMatches, searchPositions } from '@/lib/data/positions';
import { personDetailHref } from '@/lib/routes';
import { parseJSON, type Position, type Match } from '@/lib/types';
import { PositionForm } from '@/components/forms/position-form';

const DOMAINS = ['大模型', '多模态', 'AI Infra'];

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [selected, setSelected] = useState<Position | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [domain, setDomain] = useState('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    searchPositions().then((result) => setPositions(domain ? result.data.filter((p) => p.primary_domain === domain) : result.data)).finally(() => setLoading(false));
  }, [domain]);

  async function runMatch(pos: Position) {
    setSelected(pos);
    setMatching(true);
    setMatches([]);
    try {
      const result = await getPositionMatches(pos.id);
      setMatches(result.data);
    } finally {
      setMatching(false);
    }
  }

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-warm-600">岗位管理</h1>
          <p className="text-sm text-warm-400 mt-0.5">客户岗位与人才匹配 · 匹配结果由 AI 规则生成，仅作参考</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-lg bg-forest-600 px-4 py-2 text-sm text-white">新建岗位</button>
      </header>

      <div className="flex gap-4">
        {/* 岗位列表 */}
        <div className="w-80 shrink-0">
          <select value={domain} onChange={(e) => setDomain(e.target.value)} className="w-full mb-3 px-3 py-2 border border-warm-200 rounded-lg text-sm bg-white">
            <option value="">全部方向</option>
            {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="space-y-2">
            {loading ? <div className="text-warm-400 text-sm">加载中…</div> : positions.map((p) => (
              <button key={p.id} onClick={() => setSelected(p)}
                className={`w-full text-left surface p-4 transition ${selected?.id === p.id ? 'ring-1 ring-forest-500' : 'hover:border-forest-300'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-warm-600">{p.title}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-forest-50 text-forest-700">{p.primary_domain}</span>
                </div>
                <div className="text-xs text-warm-400 mt-1">{p.company_name} · {p.location} · {p.level}级</div>
                <div className="text-xs text-warm-500 mt-1">{p.salary_min}-{p.salary_max}万</div>
              </button>
            ))}
          </div>
        </div>

        {/* 岗位详情 + 匹配 */}
        <div className="flex-1">
          {!selected ? (
            <div className="surface h-64 flex items-center justify-center text-warm-400 text-sm">请选择左侧岗位查看详情</div>
          ) : (
            <div className="space-y-4">
              <div className="surface p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-warm-600">{selected.title}</h2>
                  <button onClick={() => runMatch(selected)} disabled={matching}
                    className="px-4 py-2 bg-forest-600 text-white text-sm rounded-lg hover:bg-forest-700 disabled:opacity-50">
                    {matching ? '加载中…' : '查看匹配人才'}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <Field label="客户公司" value={selected.company_name} />
                  <Field label="核心方向" value={selected.primary_domain} />
                  <Field label="级别" value={`${selected.level} 级`} />
                  <Field label="工作地点" value={selected.location} />
                  <Field label="薪资范围" value={`${selected.salary_min}-${selected.salary_max}万`} />
                  <Field label="负责人" value={selected.owner_name} />
                </div>
                {selected.requirements && (
                  <div className="mb-3">
                    <div className="text-xs text-warm-400 mb-1">必要条件</div>
                    <div className="text-sm text-warm-600">{selected.requirements}</div>
                  </div>
                )}
                {selected.preferred_conditions && (
                  <div>
                    <div className="text-xs text-warm-400 mb-1">加分条件</div>
                    <div className="text-sm text-warm-600">{selected.preferred_conditions}</div>
                  </div>
                )}
              </div>

              {matches.length > 0 && (
                <div className="surface p-5">
                  <h3 className="text-sm font-medium text-warm-600 mb-3">匹配人才（{matches.length}）</h3>
                  <div className="space-y-2">
                    {matches.map((m) => (
                      <div key={m.id} className="border border-warm-200 rounded-lg p-3 flex items-center">
                        <div className="w-12 text-center">
                          <div className="text-xl font-semibold text-forest-700">{m.match_score}</div>
                          <div className="text-[10px] text-warm-400">匹配分</div>
                        </div>
                        <div className="ml-4 flex-1">
                          <Link href={personDetailHref(m.person_id)} className="text-sm font-medium text-forest-700 hover:underline">{m.person_name || m.chinese_name || m.english_name}</Link>
                          {m.match_reasons && (
                            <div className="text-xs text-warm-500 mt-0.5">{parseJSON<string[]>(m.match_reasons)?.join('；') || m.match_reasons}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {showForm && <PositionForm onClose={() => setShowForm(false)} onSaved={(position) => { setPositions((items) => [position, ...items]); setSelected(position); setShowForm(false); }} />}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return <div><div className="text-xs text-warm-400 mb-1">{label}</div><div className="text-sm text-warm-600">{value || '—'}</div></div>;
}
