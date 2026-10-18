// 圖（鄰接表）與它的表格切換。
import { useState } from 'react'
import { asIndexable } from '../../interpreter/memory'
import type { Cell, VarView } from '../../interpreter/memory'
import { cellCls, formatCellShort, formatScalar, isHit } from './format'
import { Windowed2D } from './window'
import { GRAPH_MAX_NODES, graphTooBigReason } from '../graphLimit'
import { t } from '../../i18n'

/** 找同時顯示、長度相同的「距離陣列」（dist / d / dp…），圖上的節點標籤要顯示它的值。 */
export function companionArray(name: string, N: number, vars: VarView[]): Cell[] | null {
  const re = /^(dist|dis|distance|shortest|d|f|dp)$/i
  for (const v of vars) {
    if (v.name === name) continue
    const c = v.cell
    if ((c.kind === 'array' || c.kind === 'vector') && c.elemType.kind === 'scalar') {
      const cells = asIndexable(c)
      if (cells && cells.length === N && re.test(v.name)) return cells
    }
  }
  return null
}

export function GraphView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
  vars,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
  vars: VarView[]
}) {
  // 呼叫端（VariablesPanel）已經限定這裡是 array / vector；不是就畫成空，不猜。
  const cells = asIndexable(cell) ?? []
  const N = cells.length
  const companion = companionArray(name, N, vars)
  if (N === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  const edges: { from: number; to: number; weight: number | null }[] = []
  for (let i = 0; i < N; i++) {
    const row = cells[i]
    if (row && row.kind === 'vector') {
      for (const nb of row.cells) {
        if (nb.kind === 'scalar' && typeof nb.value === 'number') {
          edges.push({ from: i, to: nb.value, weight: null })
        } else if (nb.kind === 'pair' && nb.first.kind === 'scalar' && typeof nb.first.value === 'number') {
          const w = nb.second.kind === 'scalar' && typeof nb.second.value === 'number' ? nb.second.value : null
          edges.push({ from: i, to: nb.first.value, weight: w })
        }
      }
    }
  }
  const edgeSet = new Set<string>()
  for (const ed of edges) edgeSet.add(ed.from + '>' + ed.to)
  // 规模检查要在画 SVG 之前：这张表若被当成完全图（251k 条边），画下去浏览器就卡死了。
  const tooBig = graphTooBigReason(N, edges.length)
  if (tooBig) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        不画成图：{tooBig}。
        <br />
        已自动切成「查看表格」的 5×5 视窗（可用滑桿移动），这样才不会卡住。
      </div>
    )
  }

  const directed = edges.some((ed) => !edgeSet.has(ed.to + '>' + ed.from))
  const arrowId = 'arrow-' + name.replace(/[^a-zA-Z0-9]/g, '')

  const R = Math.max(110, N * 13)
  const nodeR = 15
  const cx = R + 40
  const cy = R + 40
  const size = 2 * R + 80
  const pos = (i: number) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / N
    return { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) }
  }
  const hasPrefix = (s: Set<string>, prefix: string) => {
    for (const k of s) if (k === prefix || k.startsWith(prefix + ',')) return true
    return false
  }
  const nodeHit = (i: number) => {
    const p = name + '@' + path.concat(i).join(',')
    return hasPrefix(judges, p) ? 'judge' : hasPrefix(writes, p) ? 'write' : hasPrefix(reads, p) ? 'read' : ''
  }
  const edgeHit = (i: number, j: number) => {
    const base = path.concat(i, j)
    const bare = name + '@' + base.join(',')
    const inSet = (s: Set<string>) => s.has(bare) || s.has(name + '@' + base.concat(0).join(',')) || s.has(name + '@' + base.concat(1).join(','))
    return inSet(judges) ? 'judge' : inSet(writes) ? 'write' : inSet(reads) ? 'read' : ''
  }

  return (
    <div className="graph-scroll">
      {/* viewBox + CSS 的 max-width:100%：卡片放大（zoom）或變窄時，圖會自己縮到卡片寬度內，
          而不是固定 size px 硬撐出去（那會讓 .graph-scroll 長出橫向捲軸、把後面的節點裁掉）。 */}
      <svg className="graph-svg" width={size} height={size} viewBox={'0 0 ' + size + ' ' + size}>
        {directed && (
          <defs>
            <marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
          </defs>
        )}
        {edges.map((ed, i) => {
          const a = pos(ed.from)
          const b = pos(ed.to)
          let x2 = b.x
          let y2 = b.y
          if (directed) {
            const dx = b.x - a.x
            const dy = b.y - a.y
            const len = Math.hypot(dx, dy) || 1
            x2 = b.x - (dx / len) * (nodeR + 4)
            y2 = b.y - (dy / len) * (nodeR + 4)
          }
          const cls = edgeHit(ed.from, ed.to)
          const mx = (a.x + x2) / 2
          const my = (a.y + y2) / 2
          return (
            <g key={i}>
              <line className={'graph-edge' + (cls ? ' ' + cls : '')} x1={a.x} y1={a.y} x2={x2} y2={y2} markerEnd={directed ? 'url(#' + arrowId + ')' : undefined} />
              {ed.weight !== null && (
                <text className="graph-weight" x={mx} y={my} textAnchor="middle" dominantBaseline="central">
                  {ed.weight}
                </text>
              )}
            </g>
          )
        })}
        {Array.from({ length: N }, (_, i) => {
          const p = pos(i)
          const cls = nodeHit(i)
          const cv = companion ? companion[i] : null
          const val = cv && cv.kind === 'scalar' ? formatScalar(cv.type, cv.value) : String(i)
          return (
            <g key={i}>
              <circle className={'graph-node' + (cls ? ' ' + cls : '')} cx={p.x} cy={p.y} r={nodeR} />
              <text className="graph-label" x={p.x} y={p.y} dominantBaseline="central" textAnchor="middle">{val}</text>
              <text className="graph-idx" x={p.x} y={p.y - nodeR - 6} textAnchor="middle">{i}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function AdjListView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
  focus,
  vars,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
  focus: number[] | undefined
  vars: VarView[]
}) {
  // 预设就用表格：节点数已经超标的（例如 501×501 的 DP 表）不要一开始就画图。
  // 使用者仍可按「查看图」，那时 GraphView 会说明为什么不画，而不是把浏览器卡死。
  const rows = (asIndexable(cell) ?? []).length
  const [showTable, setShowTable] = useState(rows > GRAPH_MAX_NODES)
  return (
    <div>
      <button className="adj-toggle" onClick={() => setShowTable((s) => !s)}>
        {t(showTable ? '查看图' : '查看表格')}
      </button>
      {showTable ? (
        <Windowed2D name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} focus={focus} />
      ) : (
        <GraphView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} vars={vars} />
      )}
    </div>
  )
}

