'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { discoverTalent } from '@/lib/data/persons';
import { personDetailHref } from '@/lib/routes';
import { LEVEL_COLOR } from '@/lib/types';

interface DiscoveryCard {
  id: string;
  name: string;
  english_name?: string;
  org?: string;
  position?: string;
  domain?: string;
  level?: string;
  talent_score?: number;
  paper_count?: number;
  project_count?: number;
  relationship_count?: number;
  source_type?: string;
  reason?: string;
}

interface DiscoveryData {
  new_today: DiscoveryCard[];
  high_potential: DiscoveryCard[];
  paper_growth: DiscoveryCard[];
  open_source: DiscoveryCard[];
  hot_domains: { name: string; value: number }[];
}

const SOURCE_COLORS: Record<string, string> = {
  OpenAlex: 'bg-forest-50 text-forest-700',
  arXiv: 'bg-blue-50 text-blue-700',
  GitHub: 'bg-purple-50 text-purple-700',
  HuggingFace: 'bg-amber-50 text-amber-700',
  manual: 'bg-warm-100 text-warm-500',
};

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const cls = SOURCE_COLORS[source] || 'bg-warm-100 text-warm-500';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{source}</span>;
}

export default function DiscoveryPage() {
  const [data, setData] = useState<DiscoveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'high' | 'new' | 'growth' | 'opensource'>('high');

  useEffect(() => {
    discoverTalent({ pageSize: 24 }).then((result) => {
      const cards = result.data.map((person) => ({
        id: person.id, name: person.chinese_name || person.english_name || '未命名', english_name: person.english_name,
        org: person.organization_name, position: person.current_position, domain: person.primary_domain,
        level: person.talent_level, paper_count: person.paper_count, project_count: person.project_count,
        relationship_count: person.relationship_count, source_type: person.source_type,
      }));
      setData({ new_today: cards, high_potential: cards, paper_growth: cards, open_source: cards, hot_domains: [] });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-warm-400">加载真实数据中…</div>;
  if (!data) return <div className="text-red-500">加载失败</div>;

  const cards = tab === 'high' ? data.high_potential : tab === 'new' ? data.new_today : tab === 'growth' ? data.paper_growth : data.open_source;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-warm-600">人才发现</h1>
        <p className="text-sm text-warm-400 mt-0.5">
          基于真实公开数据源（OpenAlex / arXiv / GitHub / HuggingFace）· 每日自动更新 · 每个人才展示数据来源
        </p>
      </header>

      {/* 热门研究方向 */}
      <div className="surface p-5 mb-5">
        <h3 className="text-sm font-medium text-warm-600 mb-3">热门研究方向</h3>
        <div className="flex gap-3 flex-wrap">
          {data.hot_domains.map((d) => (
            <div key={d.name} className="flex items-center px-4 py-2 bg-warm-50 rounded-lg">
              <span className="text-sm font-medium text-warm-600">{d.name}</span>
              <span className="ml-2 text-xs text-warm-400">{d.value} 人</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tab */}
      <div className="border-b border-warm-200 mb-5 flex gap-1">
        {[
          { key: 'high', label: '🔥 高潜人才', count: data.high_potential.length },
          { key: 'new', label: '今日新增', count: data.new_today.length },
          { key: 'growth', label: '📈 论文增长', count: data.paper_growth.length },
          { key: 'opensource', label: '开源贡献', count: data.open_source.length },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-2.5 text-sm border-b-2 transition ${tab === t.key ? 'border-forest-600 text-forest-700 font-medium' : 'border-transparent text-warm-500 hover:text-warm-600'}`}>
            {t.label} <span className="text-xs text-warm-400">{t.count}</span>
          </button>
        ))}
      </div>

      {/* 人才卡片 */}
      <div className="grid grid-cols-3 gap-4">
        {cards.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-warm-400 text-sm">暂无数据</div>
        ) : cards.map((p) => (
          <Link key={p.id} href={personDetailHref(p.id)} className="surface p-5 hover:border-forest-300 transition">
            <div className="flex items-start mb-3">
              <div className="w-11 h-11 rounded-xl bg-forest-100 text-forest-700 flex items-center justify-center text-base font-semibold mr-3 shrink-0">
                {(p.name || '?')[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-warm-600 truncate">{p.name}</span>
                  {p.level && <span className={`text-xs px-1.5 py-0.5 rounded ${LEVEL_COLOR[p.level] || 'bg-warm-100 text-warm-500'}`}>{p.level}</span>}
                  <SourceBadge source={p.source_type} />
                </div>
                <div className="text-xs text-warm-400 truncate">{p.position || '—'} · {p.org || '—'}</div>
                {p.talent_score != null && (
                  <div className="text-xs text-forest-600 mt-0.5">评分 <b>{p.talent_score}</b></div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {p.domain && <span className="text-xs px-2 py-0.5 rounded bg-forest-50 text-forest-700">{p.domain}</span>}
              {p.paper_count != null && <span className="text-xs text-warm-400">论文 {p.paper_count}</span>}
              {p.project_count != null && <span className="text-xs text-warm-400">项目 {p.project_count}</span>}
              {p.relationship_count != null && <span className="text-xs text-warm-400">关系 {p.relationship_count}</span>}
            </div>
            {p.reason && (
              <div className="bg-warm-50 rounded-lg p-2.5 text-xs text-warm-500">
                <span className="font-medium text-warm-600">推荐原因：</span>{p.reason}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
