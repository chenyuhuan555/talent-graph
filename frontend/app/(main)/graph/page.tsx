'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { searchPersons } from '@/lib/data/persons';
import { getRelationshipEvidence, getRelationshipGraph } from '@/lib/data/relationships';
import { STRENGTH_LABEL, REL_TYPE_LABEL, type GraphData, type GraphNode, type GraphEdge, type RelationshipEvidence, type Person } from '@/lib/types';
import { externalHttpHref } from '@/lib/routes';
import { useDomain } from '@/components/domain-context';
import { getDomainByIndustry } from '@/lib/domains';

interface SimNode extends GraphNode {
  x: number; y: number; vx: number; vy: number; fx?: number; fy?: number;
}

const SHAPE_PATH: Record<string, (s: number) => string> = {
  circle: (s) => `M ${-s} 0 a ${s} ${s} 0 1 0 ${s * 2} 0 a ${s} ${s} 0 1 0 ${-s * 2} 0`,
  rect: (s) => `M ${-s} ${-s * 0.75} h ${s * 2} v ${s * 1.5} h ${-s * 2} z`,
  diamond: (s) => `M 0 ${-s} L ${s} 0 L 0 ${s} L ${-s} 0 z`,
  triangle: (s) => `M 0 ${-s} L ${s * 0.9} ${s * 0.6} L ${-s * 0.9} ${s * 0.6} z`,
  star: (s) => {
    let p = '';
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? s : s * 0.45;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      p += `${i === 0 ? 'M' : 'L'} ${Math.cos(a) * r} ${Math.sin(a) * r} `;
    }
    return p + 'z';
  },
};

const NODE_COLOR: Record<string, string> = {
  person: '#2D6A4F',
  org: '#3D8A68',
  paper: '#8C887E',
  project: '#5FA888',
  event: '#B8B4A9',
};

const EDGE_COLOR: Record<string, string> = {
  manual_introduce: '#2D6A4F',
  coauthor: '#3D8A68',
  project_mate: '#5FA888',
  colleague: '#8FC6A8',
  classmate: '#B8B4A9',
};

/** 节点颜色：人才按所属领域主题色，机构/论文/项目按固定类型色。 */
function nodeColor(n: GraphNode): string {
  if (n.node_type === 'person') return getDomainByIndustry(n.industry).palette['600'];
  return NODE_COLOR[n.node_type || 'person'] || '#8C887E';
}

export default function GraphPage() {
  const searchParams = useSearchParams();
  const initialPerson = searchParams.get('person');
  const { domain } = useDomain();
  const [personId, setPersonId] = useState(initialPerson || '');
  const [persons, setPersons] = useState<Person[]>([]);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<{ edge: GraphEdge; evidence: RelationshipEvidence[] } | null>(null);
  const [onlyVerified, setOnlyVerified] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const [tick, setTick] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    searchPersons({ pageSize: 100, industry: domain.industry }).then((result) => setPersons(result.data));
  }, [domain.industry]);

  const loadGraph = useCallback((pid: string) => {
    if (!pid) return;
    setLoading(true);
    setSelectedEdge(null);
    getRelationshipGraph(pid, 20, domain.industry).then((loaded) => {
      const g = onlyVerified ? { ...loaded, edges: loaded.edges.filter((edge) => edge.is_verified) } : loaded;
      setGraph(g);
      // 初始化节点位置：中心节点居中，其余环形分布
      const cx = 400, cy = 280;
      const simNodes: SimNode[] = g.nodes.map((n, i) => {
        if (n.id === g.center?.id) {
          return { ...n, x: cx, y: cy, vx: 0, vy: 0, fx: cx, fy: cy };
        }
        const angle = (i / g.nodes.length) * Math.PI * 2;
        const r = 180;
        return { ...n, x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, vx: 0, vy: 0 };
      });
      nodesRef.current = simNodes;
      runSimulation(g);
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyVerified, domain.industry]);

  useEffect(() => {
    if (initialPerson) loadGraph(initialPerson);
  }, [initialPerson, loadGraph]);

  function runSimulation(g: GraphData) {
    const edges = g.edges;
    let frame = 0;
    const maxFrames = 200;

    const step = () => {
      const nodes = nodesRef.current;
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      // 斥力
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 3000 / (dist * dist);
          dx = (dx / dist) * force;
          dy = (dy / dist) * force;
          if (!a.fx) { a.vx += dx; a.vy += dy; }
          if (!b.fx) { b.vx -= dx; b.vy -= dy; }
        }
      }
      // 引力（边）
      for (const e of edges) {
        if (!e.source || !e.target) continue;
        const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
        if (!a || !b) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = 140;
        const force = (dist - target) * 0.02;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        if (!a.fx) { a.vx += dx; a.vy += dy; }
        if (!b.fx) { b.vx -= dx; b.vy -= dy; }
      }
      // 中心引力 + 阻尼
      for (const n of nodes) {
        if (n.fx !== undefined) continue;
        n.vx += (400 - n.x) * 0.001;
        n.vy += (280 - n.y) * 0.001;
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
      }
      setTick((t) => t + 1);
      frame++;
      if (frame < maxFrames) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
  }

  async function handleEdgeClick(e: GraphEdge) {
    if (e.id) {
      const evidence = await getRelationshipEvidence(e.id);
      setSelectedEdge({ edge: e, evidence });
    } else {
      setSelectedEdge({ edge: e, evidence: [] });
    }
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-warm-600">关系探索</h1>
        <p className="text-sm text-warm-400 mt-0.5">以人才为中心查看关系网络 · 默认最多展示 20 个节点 · 点击关系线查看证据</p>
      </header>

      <div className="flex gap-4">
        {/* 左侧筛选 */}
        <div className="w-64 shrink-0 space-y-4">
          <div className="surface p-4">
            <label className="block text-xs font-medium text-warm-500 mb-2">中心人才</label>
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm bg-white"
            >
              <option value="">选择人才…</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>{p.chinese_name || p.english_name} · {p.primary_domain}</option>
              ))}
            </select>
            <button
              onClick={() => loadGraph(personId)}
              disabled={!personId || loading}
              className="w-full mt-3 py-2 bg-forest-600 text-white text-sm rounded-lg hover:bg-forest-700 disabled:opacity-50"
            >
              {loading ? '加载中…' : '生成关系图'}
            </button>
          </div>
          <div className="surface p-4">
            <label className="flex items-center text-sm text-warm-600 cursor-pointer">
              <input type="checkbox" checked={onlyVerified} onChange={(e) => setOnlyVerified(e.target.checked)} className="mr-2 accent-forest-600" />
              仅看人工确认关系
            </label>
          </div>
          <div className="surface p-4">
            <div className="text-xs font-medium text-warm-500 mb-2">图例</div>
            <div className="space-y-1.5 text-xs">
              <Legend shape="circle" color={NODE_COLOR.person} label="人才" />
              <Legend shape="rect" color={NODE_COLOR.org} label="机构" />
              <Legend shape="diamond" color={NODE_COLOR.paper} label="论文" />
              <Legend shape="triangle" color={NODE_COLOR.project} label="项目" />
            </div>
            <div className="border-t border-warm-200 mt-3 pt-3 space-y-1.5 text-xs">
              {Object.entries(REL_TYPE_LABEL).map(([k, v]) => (
                <div key={k} className="flex items-center"><span className="w-6 h-0.5 mr-2" style={{ background: EDGE_COLOR[k] || '#B8B4A9' }} />{v}</div>
              ))}
            </div>
          </div>
        </div>

        {/* 中间图谱 */}
        <div className="flex-1 surface p-4 relative">
          {!graph ? (
            <div className="h-[560px] flex items-center justify-center text-warm-400 text-sm">
              请在左侧选择人才后生成关系图
            </div>
          ) : (
            <svg ref={svgRef} viewBox="0 0 800 560" className="w-full h-[560px] graph-svg">
              {/* 边 */}
              {graph.edges.map((e, i) => {
                const a = nodesRef.current.find((n) => n.id === e.source);
                const b = nodesRef.current.find((n) => n.id === e.target);
                if (!a || !b) return null;
                const isSel = selectedEdge?.edge === e;
                return (
                  <g key={i} className="cursor-pointer" onClick={() => handleEdgeClick(e)}>
                    <line
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={EDGE_COLOR[e.relationship_type] || '#B8B4A9'}
                      strokeWidth={isSel ? 3 : (e.is_verified ? 2 : 1.2)}
                      strokeDasharray={e.is_inferred && !e.is_verified ? '5 3' : 'none'}
                      opacity={0.7}
                    />
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={12} />
                  </g>
                );
              })}
              {/* 节点 */}
              {nodesRef.current.map((n) => {
                const isCenter = graph.center?.id === n.id;
                const size = isCenter ? 22 : 14;
                const pathFn = SHAPE_PATH[n.shape || 'circle'] || SHAPE_PATH.circle;
                return (
                  <g key={n.id} transform={`translate(${n.x},${n.y})`} className="cursor-pointer">
                    <path d={pathFn(size)} fill={nodeColor(n)} opacity={isCenter ? 1 : 0.9} stroke="#fff" strokeWidth={2} />
                    {isCenter && <path d={pathFn(size + 5)} fill="none" stroke={nodeColor(n)} strokeWidth={1} opacity={0.3} />}
                    <text y={size + 14} textAnchor="middle" fontSize="11" fill="#4A4A45" fontWeight={isCenter ? 600 : 400}>
                      {(n.label || '').length > 8 ? (n.label || '').slice(0, 7) + '…' : n.label}
                    </text>
                    {isCenter && n.org && <text y={size + 28} textAnchor="middle" fontSize="9" fill="#8C887E">{n.org}</text>}
                  </g>
                );
              })}
            </svg>
          )}
          {graph && (
            <div className="absolute top-4 right-4 text-xs text-warm-400 bg-white/80 px-2 py-1 rounded">
              节点 {graph.nodes.length} · 边 {graph.edges.length}
            </div>
          )}
        </div>

        {/* 右侧证据抽屉 */}
        {selectedEdge && (
          <div className="w-72 shrink-0 surface p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-warm-600">关系证据</h3>
              <button onClick={() => setSelectedEdge(null)} className="text-warm-400 hover:text-warm-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-warm-400">关系类型</div>
                <div className="text-warm-600">{REL_TYPE_LABEL[selectedEdge.edge.relationship_type] || selectedEdge.edge.relationship_type}</div>
              </div>
              <div>
                <div className="text-xs text-warm-400">关系强度</div>
                <div className="text-warm-600">{STRENGTH_LABEL[selectedEdge.edge.strength || ''] || selectedEdge.edge.strength}</div>
              </div>
              <div>
                <div className="text-xs text-warm-400">关系分</div>
                <div className="text-forest-700 font-semibold">{selectedEdge.edge.score}</div>
              </div>
              <div>
                <div className="text-xs text-warm-400">确认状态</div>
                <div>{selectedEdge.edge.is_verified ? <span className="text-forest-600">✓ 人工确认</span> : <span className="text-warm-500">系统推断</span>}</div>
              </div>
              <div className="border-t border-warm-200 pt-3">
                <div className="text-xs text-warm-400 mb-2">证据明细（{selectedEdge.evidence.length}）</div>
                {selectedEdge.evidence.length === 0 ? (
                  <div className="text-xs text-warm-400">暂无证据明细</div>
                ) : selectedEdge.evidence.map((ev) => (
                  <div key={ev.id} className="bg-warm-50 rounded-lg p-2.5 mb-2">
                    <div className="text-xs text-warm-600">{ev.description}</div>
                    <div className="text-[10px] text-warm-400 mt-1">
                      基础分 {ev.base_score} · 可信度 {ev.confidence} · 时间重叠 {ev.time_overlap_score}
                    </div>
                    {externalHttpHref(ev.source_url) && <a href={externalHttpHref(ev.source_url)} target="_blank" rel="noreferrer" className="text-[10px] text-forest-600">来源链接 →</a>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ shape, color, label }: { shape: string; color: string; label: string }) {
  const fn = SHAPE_PATH[shape] || SHAPE_PATH.circle;
  return (
    <div className="flex items-center">
      <svg width="20" height="20" viewBox="-10 -10 20 20"><path d={fn(7)} fill={color} /></svg>
      <span className="ml-2 text-warm-500">{label}</span>
    </div>
  );
}
