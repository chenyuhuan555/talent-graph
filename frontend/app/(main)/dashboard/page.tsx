'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getDashboard } from '@/lib/data/dashboard';
import { exportBusinessSnapshot } from '@/lib/data/exports';
import { getActiveSession } from '@/lib/auth/session';
import { personDetailHref } from '@/lib/routes';
import { useDomain } from '@/components/domain-context';
import { type AppRole, type Dashboard, LEVEL_COLOR } from '@/lib/types';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export default function DashboardPage() {
  const { domain } = useDomain();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    getDashboard(domain.industry).then(setData).finally(() => setLoading(false));
    getActiveSession().then((active) => setRole(active?.profile.role || null));
  }, [domain.industry]);

  async function downloadExport() {
    if (!role) return;
    setExportError('');
    try {
      const snapshot = await exportBusinessSnapshot(role);
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `talent-graph-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      URL.revokeObjectURL(url);
    } catch (reason) { setExportError(reason instanceof Error ? reason.message : '导出失败'); }
  }

  if (loading) return <div className="text-warm-400">加载中…</div>;
  if (!data) return <div className="text-red-500">加载失败</div>;

  const stats = [
    { label: '人才总量', value: data.total_persons, color: 'text-forest-700' },
    { label: '机构总量', value: data.total_organizations || 0, color: 'text-forest-600' },
    { label: '开放岗位', value: data.open_positions || 0, color: 'text-forest-600' },
    { label: '待跟进', value: data.pending_followups || 0, color: 'text-warm-600' },
    { label: '关系总量', value: data.verified_relations, color: 'text-forest-600' },
    { label: '业务状态', value: 1, color: 'text-forest-700' },
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
      <header className="mb-6 flex items-center justify-between">
        <div><h1 className="text-xl font-semibold text-warm-600">首页看板</h1>
        <p className="text-sm text-warm-400 mt-0.5">{domain.industry}人才库整体情况 · 关键词：{domain.keywords}</p></div>
        {(role === 'admin' || role === 'leader') && <button onClick={() => void downloadExport()} className="rounded-lg border border-forest-200 px-4 py-2 text-sm text-forest-700 hover:bg-forest-50">导出业务数据</button>}
      </header>
      {exportError && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{exportError}</div>}

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
              <Link key={p.id} href={personDetailHref(p.id)} className="flex items-center px-3 py-2 rounded-lg hover:bg-warm-50 transition">
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
          <h3 className="text-sm font-medium text-warm-600 mb-3">在线数据状态</h3>
          <div className="rounded-lg border border-forest-100 bg-forest-50 p-4">
            <div className="text-sm font-medium text-forest-700">Supabase 已连接</div>
            <div className="mt-1 text-xs text-warm-500">页面只读取当前账号有权访问的在线业务数据。</div>
          </div>
        </div>
      </div>
    </div>
  );
}
