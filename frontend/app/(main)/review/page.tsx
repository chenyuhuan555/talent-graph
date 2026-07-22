'use client';

import { useEffect, useState } from 'react';
import { getMergeTasks, mergePeople } from '@/lib/data/review';
import { parseJSON, type MergeTask } from '@/lib/types';

const TABS = [
  { key: 'merge', label: '待合并人才' },
  { key: 'contact', label: '失效联系方式' },
  { key: 'conflict', label: '冲突经历' },
];

export default function ReviewPage() {
  const [tab, setTab] = useState('merge');
  const [tasks, setTasks] = useState<MergeTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setLoading(true);
    getMergeTasks().then((result) => setTasks(result.data)).finally(() => setLoading(false));
  }, [tab]);

  async function doMerge(task: MergeTask) {
    try {
      await mergePeople(task.primary_person_id, task.duplicate_person_id);
      setMsg('合并成功');
      setTasks((items) => items.filter((item) => item.id !== task.id));
      setTimeout(() => setMsg(''), 2000);
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-warm-600">数据审核</h1>
        <p className="text-sm text-warm-400 mt-0.5">待审核人才 · 重复人才合并 · 冲突经历 · 失效联系方式</p>
      </header>

      <div className="border-b border-warm-200 mb-4 flex gap-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm border-b-2 transition ${tab === t.key ? 'border-forest-600 text-forest-700 font-medium' : 'border-transparent text-warm-500 hover:text-warm-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && <div className="mb-3 text-sm text-forest-700 bg-forest-50 px-3 py-2 rounded-lg">{msg}</div>}

      <div className="surface overflow-hidden">
        {tab === 'merge' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-warm-200 bg-warm-50">
                {['主人才', '疑似重复', '相似度', '匹配依据', '冲突字段', '状态', '操作'].map((h) => (
                  <th key={h} className="text-left font-medium text-warm-500 px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="text-center py-8 text-warm-400">加载中…</td></tr> :
                tasks.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-warm-400">暂无待合并任务</td></tr> :
                tasks.map((t) => (
                  <tr key={t.id} className="border-b border-warm-100">
                    <td className="px-4 py-3 text-warm-600">{t.primary_name}</td>
                    <td className="px-4 py-3 text-warm-600">{t.duplicate_name}</td>
                    <td className="px-4 py-3"><span className="text-forest-700 font-medium">{Math.round((t.similarity_score || 0) * 100)}%</span></td>
                    <td className="px-4 py-3 text-xs text-warm-500">{parseJSON<string[]>(t.matching_evidence)?.join('、')}</td>
                    <td className="px-4 py-3 text-xs text-warm-500">{parseJSON<string[]>(t.conflict_fields)?.join('、') || '—'}</td>
                    <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded bg-warm-100 text-warm-500">{t.status}</span></td>
                    <td className="px-4 py-3">
                      {t.status === 'pending' ? (
                        <button onClick={() => doMerge(t)} className="text-xs px-3 py-1 bg-forest-600 text-white rounded hover:bg-forest-700">确认合并</button>
                      ) : <span className="text-xs text-warm-400">{t.status}</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
        {tab !== 'merge' && (
          <div className="text-center py-16 text-sm text-warm-400">该模块即将支持</div>
        )}
      </div>
      <div className="mt-3 text-xs text-warm-400">⚠ 低置信度数据不会自动合并，所有合并均需人工审核确认</div>
    </div>
  );
}
