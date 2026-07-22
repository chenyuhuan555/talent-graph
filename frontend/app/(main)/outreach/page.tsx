'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Outreach } from '@/lib/api';

const TABS = [
  { key: 'today', label: '今日待跟进' },
  { key: 'overdue', label: '逾期跟进' },
  { key: 'willing-refer', label: '可引荐人才' },
];

const statusLabel: Record<string, string> = { pending: '待回复', replied: '已回复', no_reply: '未回复' };

export default function OutreachPage() {
  const [tab, setTab] = useState('today');
  const [data, setData] = useState<Outreach[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<Outreach[]>(`/api/outreach/${tab}`).then(setData).finally(() => setLoading(false));
  }, [tab]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-warm-600">触达工作台</h1>
        <p className="text-sm text-warm-400 mt-0.5">顾问触达跟进管理 · 避免重复触达 · 沉淀真实关系</p>
      </header>

      <div className="border-b border-warm-200 mb-4 flex gap-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm border-b-2 transition ${tab === t.key ? 'border-forest-600 text-forest-700 font-medium' : 'border-transparent text-warm-500 hover:text-warm-600'}`}>
            {t.label}
            <span className="ml-1.5 text-xs text-warm-400">{tab === t.key ? data.length : ''}</span>
          </button>
        ))}
      </div>

      <div className="surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-warm-200 bg-warm-50">
              {['人才', '渠道', '触达时间', '触达摘要', '回复状态', '意向', '下次跟进', '顾问'].map((h) => (
                <th key={h} className="text-left font-medium text-warm-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-warm-400">加载中…</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-warm-400">暂无记录</td></tr>
            ) : data.map((o) => (
              <tr key={o.id} className="border-b border-warm-100 hover:bg-warm-50 transition">
                <td className="px-4 py-3">
                  <Link href={`/persons/${o.person_id}`} className="text-forest-700 hover:underline">{o.position_title}</Link>
                </td>
                <td className="px-4 py-3 text-warm-500">{o.outreach_channel || '—'}</td>
                <td className="px-4 py-3 text-warm-500">{o.outreach_at ? new Date(o.outreach_at).toLocaleDateString('zh-CN') : '—'}</td>
                <td className="px-4 py-3 text-warm-500 max-w-xs truncate">{o.content_summary || '—'}</td>
                <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded bg-warm-100 text-warm-500">{statusLabel[o.response_status || ''] || o.response_status}</span></td>
                <td className="px-4 py-3"><span className={`text-xs ${o.intention_level === 'high' ? 'text-forest-600' : 'text-warm-500'}`}>{o.intention_level}</span></td>
                <td className="px-4 py-3 text-warm-500">{o.next_follow_up_at ? new Date(o.next_follow_up_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="px-4 py-3 text-warm-500">{o.consultant_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
