'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { api, type Dashboard, LEVEL_COLOR } from '@/lib/api';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface SyncStatus {
  openalex: { count: number; last_sync: string | null };
  arxiv: { count: number; last_sync: string | null };
  github: { count: number; last_sync: string | null };
  huggingface: { count: number; last_sync: string | null };
  totals: { persons: number; papers: number; organizations: number; relationships: number; source_records: number };
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Dashboard>('/api/dashboard'),
      api.get<SyncStatus>('/api/data-sync/status'),
    ]).then(([d, s]) => { setData(d); setSync(s); }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-warm-400">加载中…</div>;
  if (!data) return <div className="text-red-500">加载失败</div>;

  const stats = [
    { label: '人才总量', value: data.total_persons, color: 'text-forest-700' },
    { label: '本周新增', value: data.new_this_week, color: 'text-forest-600' },
    { label: '可联系人才', value: data.with_contact, color: 'text-forest-600' },
    { label: '本月触达', value: data.outreach_this_month, color: 'text-warm-600' },
    { label: '有效回复', value: data.replied, color: 'text-forest-600' },
    { label: '人工确认关系', value: data.verified_relations, color: 'text-forest-700' },
  ];

  const domainOption = {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#6B685F', fontSize: 12 } },
    series: [{
      type: 'pie', radius: ['45%', '70%'], center: ['50%', '42%'],
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      data: data.domain_distribution.map((d, i) => ({
        name: d.name, value: d.value,
        itemStyle: { color: ['#2D6A4F', '#3D8A68', '#8FC6A8'][i % 3] },
      })),
    }],
  };

  const barOption = (title: string, d: { name: string; value: number }[]) => ({
    grid: { left: 80, right: 20, top: 10, bottom: 20 },
    xAxis: { type: 'value', axisLabel: { color: '#8C887E' }, splitLine: { lineStyle: { color: '#EAE8E3' } } },
    yAxis: { type: 'category', data: d.map((x) => x.name), axisLabel: { color: '#6B685F', fontSize: 12 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: 'bar', data: d.map((x) => x.value), barWidth: 14,
      itemStyle: { color: '#3D8A68', borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: '#6B685F', fontSize: 11 },
    }],
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-warm-600">首页看板</h1>
        <p className="text-sm text-warm-400 mt-0.5">人工智能人才库整体情况 · 首期覆盖大模型 / 多模态 / AI Infra</p>
      </header>

      {/* 核心指标 */}
      <div className="grid grid-cols-6 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="surface p-5">
            <div className="text-xs text-warm-400 mb-2">{s.label}</div>
            <div className={`text-2xl font-semibold ${s.color}`}>{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* 分布图 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="surface p-5">
          <h3 className="text-sm font-medium text-warm-600 mb-2">方向人才分布</h3>
          <ReactECharts option={domainOption} style={{ height: 240 }} />
        </div>
        <div className="surface p-5">
          <h3 className="text-sm font-medium text-warm-600 mb-3">学校人才排名</h3>
          <ReactECharts option={barOption('学校', data.top_schools.slice(0, 6))} style={{ height: 240 }} />
        </div>
        <div className="surface p-5">
          <h3 className="text-sm font-medium text-warm-600 mb-3">公司人才排名</h3>
          <ReactECharts option={barOption('公司', data.top_companies.slice(0, 6))} style={{ height: 240 }} />
        </div>
      </div>

      {/* 高潜人才 + 数据来源 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="surface p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-warm-600">新增高潜人才</h3>
            <Link href="/discovery" className="text-xs text-forest-600 hover:underline">人才发现 →</Link>
          </div>
          <div className="space-y-2">
            {data.high_potential.slice(0, 6).map((p) => (
              <Link key={p.id} href={`/persons/${p.id}`} className="flex items-center px-3 py-2 rounded-lg hover:bg-warm-50 transition">
                <div className="w-8 h-8 rounded-full bg-forest-100 text-forest-700 flex items-center justify-center text-xs font-medium mr-3">
                  {p.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-warm-600 truncate">{p.name}</div>
                  <div className="text-xs text-warm-400 truncate">{p.position} · {p.domain}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${LEVEL_COLOR[p.level] || 'bg-warm-100 text-warm-500'}`}>{p.level}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="surface p-5">
          <h3 className="text-sm font-medium text-warm-600 mb-3">数据来源状态</h3>
          {sync ? (
            <div className="space-y-2">
              {[
                ['OpenAlex', sync.openalex],
                ['arXiv', sync.arxiv],
                ['GitHub', sync.github],
                ['HuggingFace', sync.huggingface],
              ].map(([name, s]: any) => (
                <div key={name} className="flex items-center px-3 py-2 border border-warm-200 rounded-lg">
                  <span className="text-sm font-medium text-warm-600 w-24">{name}</span>
                  <span className="text-sm text-forest-600">{s.count.toLocaleString()} 条</span>
                  <span className="ml-auto text-xs text-warm-400">{s.last_sync ? new Date(s.last_sync).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未同步'}</span>
                </div>
              ))}
              <div className="mt-3 pt-3 border-t border-warm-200 grid grid-cols-3 gap-2 text-center">
                <div><div className="text-lg font-semibold text-forest-700">{sync.totals.persons.toLocaleString()}</div><div className="text-[10px] text-warm-400">人才</div></div>
                <div><div className="text-lg font-semibold text-forest-700">{sync.totals.papers.toLocaleString()}</div><div className="text-[10px] text-warm-400">论文</div></div>
                <div><div className="text-lg font-semibold text-forest-700">{sync.totals.relationships.toLocaleString()}</div><div className="text-[10px] text-warm-400">关系</div></div>
              </div>
            </div>
          ) : <div className="text-sm text-warm-400">加载中…</div>}
        </div>
      </div>
    </div>
  );
}
