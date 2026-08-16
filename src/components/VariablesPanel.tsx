import { useEffect, useState } from 'react'
import type { Snapshot, CallNode } from '../interpreter/interpreter'
import type { VarView, Cell, ScalarValue, BstNode } from '../interpreter/memory'
import type { Type } from '../interpreter/ast'

const WIN_1D = 10
const WIN_2D = 5

function formatScalar(type: string, value: ScalarValue | null): string {
  if (value === null) return '?'
  if (type === 'char') return "'" + value + "'"
  if (type === 'string') return '"' + value + '"'
  if (type === 'bool') return value ? 'true' : 'false'
  return String(value)
}

function formatCellShort(cell: Cell): string {
  if (cell.kind === 'scalar') return formatScalar(cell.type, cell.value)
  if (cell.kind === 'pair') {
    const a = cell.first.kind === 'scalar' ? formatScalar(cell.first.type, cell.first.value) : '?'
    const b = cell.second.kind === 'scalar' ? formatScalar(cell.second.type, cell.second.value) : '?'
    return a + ',' + b
  }
  if (cell.kind === 'struct') {
    return '{' + cell.members.map((m) => m.name + ':' + (m.cell.kind === 'scalar' ? formatScalar(m.cell.type, m.cell.value) : '?')).join(',') + '}'
  }
  return '?'
}

function isHit(set: Set<string>, name: string, path: number[]): boolean {
  if (set.has(name)) return true
  for (let k = 1; k <= path.length; k++) {
    if (set.has(name + '@' + path.slice(0, k).join(','))) return true
  }
  return false
}

function exactHit(set: Set<string>, name: string, path: number[]): boolean {
  return set.has(name + '@' + path.join(','))
}

// 形状优先级：方形大块（图/树/堆/栈）靠前，横长（数组/队列/set/map）靠后
function kindPriority(cell: Cell): number {
  const k = cell.kind
  if ((k === 'array' || k === 'vector') && cell.elemType.kind === 'vector') return 0 // 图（邻接表）
  if (k === 'tree' || k === 'bst' || k === 'pqueue' || k === 'stack') return 1 // 树/堆/栈
  return 2 // 数组/vector/队列/set/map
}

// 形状分类：大矩形 / 竖长条 / 横长条
function shapeClass(cell: Cell): string {
  const k = cell.kind
  if (k === 'queue' || k === 'deque' || k === 'set' || k === 'map' || k === 'umap') return 'shape-horizontal'
  if (k === 'array' || k === 'vector') {
    return cell.elemType.kind === 'scalar' ? 'shape-horizontal' : 'shape-square'
  }
  return 'shape-square' // tree/bst/pqueue/stack/pair
}

type PanelItem = { kind: 'calltree' } | { kind: 'container'; v: VarView }
function itemKey(item: PanelItem): string {
  return item.kind === 'calltree' ? '@calltree' : item.v.name
}
function arrange<T>(list: T[], order: string[], keyOf: (t: T) => string): T[] {
  if (!order.length) return list
  const result = [...list]
  result.sort((a, b) => {
    const ia = order.indexOf(keyOf(a))
    const ib = order.indexOf(keyOf(b))
    if (ia < 0 && ib < 0) return 0
    if (ia < 0) return 1
    if (ib < 0) return -1
    return ia - ib
  })
  return result
}

// 找到与图同尺寸、名字像"距离"的伴随数组（用于把节点值画进圆圈）
function companionArray(name: string, N: number, vars: VarView[]): Cell | null {
  const re = /^(dist|dis|distance|shortest|d|f|dp)$/i
  for (const v of vars) {
    if (v.name === name) continue
    const c = v.cell
    if ((c.kind === 'array' || c.kind === 'vector') && c.elemType.kind === 'scalar') {
      const len = c.kind === 'array' ? c.size : c.cells.length
      if (len === N && re.test(v.name)) return c
    }
  }
  return null
}

function typeShape(t: Type): string {
  if (t.kind === 'scalar') return t.name
  if (t.kind === 'array') return typeShape(t.elem) + '[]'
  if (t.kind === 'vector') return 'vector<' + typeShape(t.elem) + '>'
  if (t.kind === 'stack') return 'stack<' + typeShape(t.elem) + '>'
  if (t.kind === 'queue') return 'queue<' + typeShape(t.elem) + '>'
  if (t.kind === 'tree') return 'tree<' + typeShape(t.elem) + '>'
  if (t.kind === 'bst') return 'bst<' + typeShape(t.elem) + '>'
  if (t.kind === 'set') return 'set<' + typeShape(t.elem) + '>'
  if (t.kind === 'map') return 'map<' + typeShape(t.key) + ',' + typeShape(t.value) + '>'
  if (t.kind === 'umap') return 'unordered_map<' + typeShape(t.key) + ',' + typeShape(t.value) + '>'
  if (t.kind === 'pair') return 'pair<' + typeShape(t.first) + ',' + typeShape(t.second) + '>'
  if (t.kind === 'deque') return 'deque<' + typeShape(t.elem) + '>'
  if (t.kind === 'struct') return t.name
  return 'priority_queue<' + typeShape(t.elem) + '>'
}

function cellLabel(cell: Cell): string {
  if (cell.kind === 'scalar') return cell.type
  if (cell.kind === 'array') {
    let c: Cell | undefined = cell
    const dims: number[] = []
    while (c && c.kind === 'array') {
      dims.push(c.size)
      c = c.cells[0]
    }
    const leaf = c && c.kind === 'scalar' ? c.type : c && c.kind === 'vector' ? 'vector<' + typeShape(c.elemType) + '>' : typeShape(cell.elemType)
    return leaf + dims.map((d) => '[' + d + ']').join('')
  }
  if (cell.kind === 'stack') return 'stack<' + typeShape(cell.elemType) + '> · 长度 ' + cell.items.length
  if (cell.kind === 'queue') return 'queue<' + typeShape(cell.elemType) + '> · 长度 ' + cell.items.length
  if (cell.kind === 'pqueue') {
    return 'priority_queue<' + typeShape(cell.elemType) + '>' + (cell.minHeap ? ' · 小根堆' : ' · 大根堆') + ' · 长度 ' + cell.items.length
  }
  if (cell.kind === 'tree') return 'tree<' + typeShape(cell.elemType) + '> · 节点 ' + cell.size
  if (cell.kind === 'bst') return 'bst<' + typeShape(cell.elemType) + '> · 节点 ' + cell.count
  if (cell.kind === 'set') return 'set<' + typeShape(cell.elemType) + '> · 元素 ' + cell.items.length
  if (cell.kind === 'map') return 'map<' + typeShape(cell.keyType) + ',' + typeShape(cell.valueType) + '> · 元素 ' + cell.entries.length
  if (cell.kind === 'umap') return 'unordered_map<' + typeShape(cell.keyType) + ',' + typeShape(cell.valueType) + '> · 元素 ' + cell.entries.length
  if (cell.kind === 'pair') return 'pair<' + typeShape(cell.firstType) + ',' + typeShape(cell.secondType) + '>'
  if (cell.kind === 'deque') return 'deque<' + typeShape(cell.elemType) + '> · 长度 ' + cell.items.length
  if (cell.kind === 'struct') return cell.structName + ' · 成员 ' + cell.members.length
  return 'vector<' + typeShape(cell.elemType) + '> · 长度 ' + cell.cells.length
}

function rowLen(row: Cell): number {
  if (row.kind === 'scalar') return 0
  if (row.kind === 'array') return row.size
  if (row.kind === 'vector') return row.cells.length
  return 0
}

interface Props {
  snapshot: Snapshot | null
}

export default function VariablesPanel({ snapshot }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [order, setOrder] = useState<string[]>([])

  function toggleCollapse(name: string) {
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  if (!snapshot) {
    return (
      <div className="viz-body">
        <div className="viz-empty">
          点击上方「运行」或「单步」开始。<br />
          支持：int / long long / char / bool / string / double 变量、数组、二维数组、vector、
          for / while / if、四则运算、cout 输出。
        </div>
      </div>
    )
  }

  const reads = new Set<string>()
  const writes = new Set<string>()
  const judges = new Set<string>()
  snapshot.reads.forEach((r) => reads.add(r.name + (r.path.length ? '@' + r.path.join(',') : '')))
  snapshot.writes.forEach((r) => writes.add(r.name + (r.path.length ? '@' + r.path.join(',') : '')))
  if (snapshot.judges) {
    snapshot.judges.forEach((r) => judges.add(r.name + (r.path.length ? '@' + r.path.join(',') : '')))
  }

  const focusMap: Record<string, number[]> = {}
  const focusSeq = (snapshot.writes as { name: string; path: number[] }[]).concat(snapshot.reads, snapshot.judges ?? [])
  for (const r of focusSeq) {
    if (r.path.length >= 1 && !focusMap[r.name]) focusMap[r.name] = r.path
  }

  const containers = snapshot.vars.filter((v) => v.cell.kind !== 'scalar')
  const scalars = snapshot.vars.filter((v) => v.cell.kind === 'scalar')
  const hasCallTree = !!(snapshot.callTree && snapshot.callTree.children.length > 0)
  const defaultItems: PanelItem[] = []
  if (hasCallTree) defaultItems.push({ kind: 'calltree' })
  for (const v of containers) defaultItems.push({ kind: 'container', v })
  defaultItems.sort((a, b) => {
    const pa = a.kind === 'calltree' ? 1 : kindPriority(a.v.cell)
    const pb = b.kind === 'calltree' ? 1 : kindPriority(b.v.cell)
    return pa - pb
  })
  const items = arrange(defaultItems, order, itemKey)

  function moveItem(key: string, dir: -1 | 1) {
    setOrder((prev) => {
      const keys = items.map(itemKey)
      const i = keys.indexOf(key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= keys.length) return prev
      const next = keys.slice()
      const t = next[i]
      next[i] = next[j]
      next[j] = t
      return next
    })
  }

  return (
    <div className="viz-body">
      {snapshot.condition && (
        <div className="cond-banner">
          <span className="cond-label">判断</span>
          <span className="cond-expr">{snapshot.condition.text}</span>
          <span className={'cond-result ' + (snapshot.condition.result ? 'true' : 'false')}>
            {snapshot.condition.result ? '✓ 为真 · 继续' : '✗ 为假 · 退出'}
          </span>
        </div>
      )}
      {snapshot.vars.length === 0 && !(snapshot.callTree && snapshot.callTree.children.length > 0) ? (
        <div className="viz-empty">还没有变量。</div>
      ) : (
        <div className="viz-split">
          <div className="viz-main">
            {items.map((item) => {
              if (item.kind === 'calltree') {
                return (
                  <div className="calltree-section shape-square" key="calltree">
                    <div className="calltree-title" onClick={() => setTreeCollapsed((t) => !t)}>
                      <span className="caret">{treeCollapsed ? '▸' : '▾'}</span>
                      递归树 / 调用树
                      <span className="reorder-btns">
                        <button className="reorder-btn" title="上移" onClick={(e) => { e.stopPropagation(); moveItem('@calltree', -1) }}>↑</button>
                        <button className="reorder-btn" title="下移" onClick={(e) => { e.stopPropagation(); moveItem('@calltree', 1) }}>↓</button>
                      </span>
                    </div>
                    {!treeCollapsed && <CallTreeGraph root={snapshot.callTree!} activeCallId={snapshot.activeCallId ?? 0} />}
                  </div>
                )
              }
              return (
                <VarItem
                  key={item.v.name}
                  v={item.v}
                  reads={reads}
                  writes={writes}
                  judges={judges}
                  focus={focusMap[item.v.name]}
                  collapsed={!!collapsed[item.v.name]}
                  onToggle={() => toggleCollapse(item.v.name)}
                  vars={snapshot.vars}
                  shape={shapeClass(item.v.cell)}
                  onMove={(dir) => moveItem(item.v.name, dir)}
                />
              )
            })}
            {items.length === 0 && (
              <div className="viz-empty" style={{ padding: '8px 0' }}>
                （无数组/容器）
              </div>
            )}
          </div>
          <div className="viz-scalars">
            {scalars.map((v) => (
              <ScalarVar key={v.name} v={v} reads={reads} writes={writes} judges={judges} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ScalarVar({
  v,
  reads,
  writes,
  judges,
}: {
  v: VarView
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const cell = v.cell
  if (cell.kind !== 'scalar') return null
  const cls =
    'scalar-var' +
    (cell.value === null ? ' uninit' : '') +
    (isHit(judges, v.name, []) ? ' judge' : isHit(writes, v.name, []) ? ' write' : isHit(reads, v.name, []) ? ' read' : '')
  return (
    <div className={cls} title={cell.type}>
      <div className="sv-name">
        {v.name}
        <span className={'scope-badge ' + (v.scope === 'global' ? 'scope-global' : 'scope-local')}>{v.scope}</span>
      </div>
      <div className="sv-value">{formatScalar(cell.type, cell.value)}</div>
    </div>
  )
}

function VarItem({
  v,
  reads,
  writes,
  judges,
  focus,
  collapsed,
  onToggle,
  vars,
  shape,
  onMove,
}: {
  v: VarView
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
  focus: number[] | undefined
  collapsed: boolean
  onToggle: () => void
  vars: VarView[]
  shape: string
  onMove: (dir: -1 | 1) => void
}) {
  return (
    <div className={'var ' + shape}>
      <div className="var-name" onClick={onToggle}>
        <span className="caret">{collapsed ? '▸' : '▾'}</span>
        {v.name}
        <span className={'scope-badge ' + (v.scope === 'global' ? 'scope-global' : 'scope-local')}>{v.scope}</span>
        <span className="var-type">{cellLabel(v.cell)}</span>
        <span className="reorder-btns">
          <button className="reorder-btn" title="上移" onClick={(e) => { e.stopPropagation(); onMove(-1) }}>↑</button>
          <button className="reorder-btn" title="下移" onClick={(e) => { e.stopPropagation(); onMove(1) }}>↓</button>
        </span>
      </div>
      {!collapsed && <CellNode name={v.name} path={[]} cell={v.cell} reads={reads} writes={writes} judges={judges} focus={focus} vars={vars} />}
    </div>
  )
}

function CellNode({
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
  if (cell.kind === 'scalar') {
    const cls =
      'cell scalar' +
      (cell.value === null ? ' uninit' : '') +
      (isHit(judges, name, path) ? ' judge' : isHit(writes, name, path) ? ' write' : isHit(reads, name, path) ? ' read' : '')
    return <div className={cls}>{formatScalar(cell.type, cell.value)}</div>
  }

  if (cell.kind === 'stack') return <StackView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} />
  if (cell.kind === 'queue') return <QueueView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} />
  if (cell.kind === 'deque') return <DequeView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} />
  if (cell.kind === 'pqueue') return <PQueueView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} />
  if (cell.kind === 'tree') return <TreeView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} />
  if (cell.kind === 'bst') return <BstView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} />
  if (cell.kind === 'set') return <SetView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} />
  if (cell.kind === 'map' || cell.kind === 'umap') return <MapView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} />
  if (cell.kind === 'pair') return <PairView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} />
  if (cell.kind === 'struct') return <StructView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} />

  const len = cell.kind === 'array' ? cell.size : cell.cells.length
  if (len === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }

  if (cell.elemType.kind === 'vector') {
    return <AdjListView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} focus={focus} vars={vars} />
  }

  if (cell.elemType.kind === 'struct') {
    return <StructArrayView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} focus={focus} />
  }

  if (cell.elemType.kind === 'scalar') {
    return <Windowed1D name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} focus={focus} />
  }
  return <Windowed2D name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} focus={focus} />
}

function cellCls(
  sub: Cell,
  name: string,
  p: number[],
  judges: Set<string>,
  writes: Set<string>,
  reads: Set<string>,
): string {
  return (
    'cell' +
    (sub.kind === 'scalar' && sub.value === null ? ' uninit' : '') +
    (isHit(judges, name, p) ? ' judge' : isHit(writes, name, p) ? ' write' : isHit(reads, name, p) ? ' read' : '')
  )
}

function StackView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const items = cell.kind === 'stack' ? cell.items : []
  if (items.length === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  return (
    <div className="stack-view">
      {items.slice().reverse().map((item, k) => {
        const i = items.length - 1 - k
        const p = path.concat(i)
        return (
          <div className="stack-row" key={i}>
            <span className="stack-marker">{k === 0 ? 'top' : ''}</span>
            <div className={cellCls(item, name, p, judges, writes, reads)}>{item.kind === 'scalar' ? formatScalar(item.type, item.value) : '?'}</div>
          </div>
        )
      })}
    </div>
  )
}

function QueueView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const items = cell.kind === 'queue' ? cell.items : []
  if (items.length === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  return (
    <div className="queue-view">
      <span className="queue-marker">front</span>
      {items.map((item, i) => {
        const p = path.concat(i)
        return (
          <div className="cell-wrap" key={i}>
            <div className={cellCls(item, name, p, judges, writes, reads)}>{item.kind === 'scalar' ? formatScalar(item.type, item.value) : '?'}</div>
            <div className="idx">[{i}]</div>
          </div>
        )
      })}
      <span className="queue-marker">back</span>
    </div>
  )
}

function DequeView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const items = cell.kind === 'deque' ? cell.items : []
  if (items.length === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  return (
    <div className="queue-view">
      <span className="queue-marker">front</span>
      {items.map((item, i) => {
        const p = path.concat(i)
        return (
          <div className="cell-wrap" key={i}>
            <div className={cellCls(item, name, p, judges, writes, reads)}>{item.kind === 'scalar' ? formatScalar(item.type, item.value) : '?'}</div>
            <div className="idx">[{i}]</div>
          </div>
        )
      })}
      <span className="queue-marker">back</span>
    </div>
  )
}

function SetView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const items = cell.kind === 'set' ? cell.items : []
  if (items.length === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  return (
    <div className="queue-view">
      {items.map((item, i) => {
        const p = path.concat(i)
        return (
          <div className="cell-wrap" key={i}>
            <div className={cellCls(item, name, p, judges, writes, reads)}>{item.kind === 'scalar' ? formatScalar(item.type, item.value) : '?'}</div>
            <div className="idx">[{i}]</div>
          </div>
        )
      })}
    </div>
  )
}

function MapView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const entries = cell.kind === 'map' || cell.kind === 'umap' ? cell.entries : []
  if (entries.length === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  return (
    <div className="map-view">
      {entries.map((e, i) => {
        const p = path.concat(i)
        return (
          <div className="map-row" key={i}>
            <span className="cell map-key">{e.key.kind === 'scalar' ? formatScalar(e.key.type, e.key.value) : '?'}</span>
            <span className="map-arrow">→</span>
            <span className={cellCls(e.value, name, p, judges, writes, reads)}>{e.value.kind === 'scalar' ? formatScalar(e.value.type, e.value.value) : '?'}</span>
          </div>
        )
      })}
    </div>
  )
}

function StructArrayView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
  focus,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
  focus: number[] | undefined
}) {
  const cells = cell.kind === 'array' || cell.kind === 'vector' ? cell.cells : []
  const rows = cells.length
  const maxCols = rows > 0 && cells[0].kind === 'struct' ? cells[0].members.length : 0

  const maxRowOff = Math.max(0, rows - WIN_2D)
  const maxColOff = Math.max(0, maxCols - WIN_2D)
  const [off, setOff] = useState({ r: 0, c: 0 })

  useEffect(() => {
    if (!focus || focus.length < 2) return
    const fr = focus[0]
    const fc = focus[1]
    setOff((prev) => {
      let r = Math.min(prev.r, maxRowOff)
      let c = Math.min(prev.c, maxColOff)
      let changed = false
      if (fr < r || fr >= r + WIN_2D) {
        r = Math.max(0, Math.min(fr - Math.floor(WIN_2D / 2), maxRowOff))
        changed = true
      }
      if (fc < c || fc >= c + WIN_2D) {
        c = Math.max(0, Math.min(fc - Math.floor(WIN_2D / 2), maxColOff))
        changed = true
      }
      return changed ? { r, c } : prev
    })
  }, [focus, maxRowOff, maxColOff, rows, maxCols])

  if (rows === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }

  const rStart = Math.min(off.r, maxRowOff)
  const cStart = Math.min(off.c, maxColOff)
  const rowIdxs: number[] = []
  for (let i = rStart; i < Math.min(rStart + WIN_2D, rows); i++) rowIdxs.push(i)
  const colIdxs: number[] = []
  for (let j = cStart; j < Math.min(cStart + WIN_2D, Math.max(maxCols, 1)); j++) colIdxs.push(j)

  return (
    <div>
      <div className="grid2d-row">
        {rows > WIN_2D && (
          <div className="row-slider-wrap">
            <span className="window-dim">行</span>
            <input
              type="range"
              min={0}
              max={maxRowOff}
              value={rStart}
              onChange={(e) => setOff((o) => ({ ...o, r: Number(e.target.value) }))}
              className="slider-vertical"
            />
          </div>
        )}
        <div className="nested">
          {rowIdxs.map((i) => {
            const row = cells[i]
            return (
              <div className="nested-row" key={i}>
                <div className="nested-label">[{i}]</div>
                <div className="cells">
                  {colIdxs.map((j) => {
                    if (row.kind !== 'struct' || j >= row.members.length) {
                      return (
                        <div className="cell-wrap" key={j}>
                          <div className="cell cell-empty" />
                          <div className="idx">[{j}]</div>
                        </div>
                      )
                    }
                    const m = row.members[j]
                    const p = path.concat(i, j)
                    return (
                      <div className="cell-wrap" key={j}>
                        <div className={cellCls(m.cell, name, p, judges, writes, reads)}>
                          {m.cell.kind === 'scalar' ? formatScalar(m.cell.type, m.cell.value) : '?'}
                        </div>
                        <div className="idx">[{m.name}]</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {maxCols > WIN_2D && (
        <div className="window-control">
          <span className="window-dim">列</span>
          <input type="range" min={0} max={maxColOff} value={cStart} onChange={(e) => setOff((o) => ({ ...o, c: Number(e.target.value) }))} className="cell-slider" />
          <span className="window-range">[{cStart}..{Math.min(cStart + WIN_2D, maxCols) - 1}] / 共 {maxCols}</span>
        </div>
      )}
    </div>
  )
}

function StructView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const c = cell.kind === 'struct' ? cell : null
  if (!c) return null
  return (
    <div className="map-view">
      {c.members.map((m, i) => {
        const p = path.concat(i)
        return (
          <div className="map-row" key={m.name}>
            <span className="cell map-key">{m.name}</span>
            <span className="map-arrow">=</span>
            <span className={cellCls(m.cell, name, p, judges, writes, reads)}>{m.cell.kind === 'scalar' ? formatScalar(m.cell.type, m.cell.value) : '?'}</span>
          </div>
        )
      })}
    </div>
  )
}

function PairView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const c = cell.kind === 'pair' ? cell : null
  if (!c) return null
  return (
    <div className="pair-view">
      <span className="pair-paren">(</span>
      <span className={cellCls(c.first, name, path.concat(0), judges, writes, reads)}>{c.first.kind === 'scalar' ? formatScalar(c.first.type, c.first.value) : '?'}</span>
      <span className="pair-comma">,</span>
      <span className={cellCls(c.second, name, path.concat(1), judges, writes, reads)}>{c.second.kind === 'scalar' ? formatScalar(c.second.type, c.second.value) : '?'}</span>
      <span className="pair-paren">)</span>
    </div>
  )
}

function GraphView({
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
  const N = cell.kind === 'array' ? cell.size : cell.cells.length
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
    const row = cell.cells[i]
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
      <svg className="graph-svg" width={size} height={size}>
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
          const val = companion && companion.cells[i].kind === 'scalar' ? formatScalar(companion.cells[i].type, companion.cells[i].value) : String(i)
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

function AdjListView({
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
  const [showTable, setShowTable] = useState(false)
  return (
    <div>
      <button className="adj-toggle" onClick={() => setShowTable((s) => !s)}>
        {showTable ? '查看图' : '查看表格'}
      </button>
      {showTable ? (
        <Windowed2D name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} focus={focus} />
      ) : (
        <GraphView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} vars={vars} />
      )}
    </div>
  )
}

interface TreeNode {
  key: string
  value: string
  path: number[]
  uninit: boolean
  left: TreeNode | null
  right: TreeNode | null
}

function layoutTree(root: TreeNode) {
  const nodes: { col: number; depth: number; node: TreeNode }[] = []
  const pos = new Map<string, { col: number; depth: number }>()
  const edges: { from: string; to: string }[] = []
  let col = 0
  let maxDepth = 0
  function walk(n: TreeNode, depth: number) {
    maxDepth = Math.max(maxDepth, depth)
    if (n.left) walk(n.left, depth + 1)
    const c = col++
    pos.set(n.key, { col: c, depth })
    nodes.push({ col: c, depth, node: n })
    if (n.right) walk(n.right, depth + 1)
  }
  walk(root, 0)
  for (const n of nodes) {
    if (n.node.left) edges.push({ from: n.node.key, to: n.node.left.key })
    if (n.node.right) edges.push({ from: n.node.key, to: n.node.right.key })
  }
  return { nodes, edges, pos, colCount: col, maxDepth }
}

function buildHeapTree(items: Cell[], typeName: string): TreeNode | null {
  if (items.length === 0) return null
  function build(i: number): TreeNode | null {
    if (i >= items.length) return null
    const item = items[i]
    return {
      key: 'n' + i,
      value: formatCellShort(item),
      path: [i],
      uninit: item.kind === 'scalar' && item.value === null,
      left: build(2 * i + 1),
      right: build(2 * i + 2),
    }
  }
  return build(0)
}

function buildTreeNodes(nodes: Cell[], size: number, typeName: string): TreeNode | null {
  if (size === 0) return null
  function build(i: number): TreeNode | null {
    if (i > size) return null
    const item = nodes[i]
    return {
      key: 'n' + i,
      value: formatCellShort(item),
      path: [i],
      uninit: item.kind === 'scalar' && item.value === null,
      left: build(2 * i),
      right: build(2 * i + 1),
    }
  }
  return build(1)
}

function buildBstNode(node: BstNode | null, typeName: string): TreeNode | null {
  if (!node) return null
  return {
    key: 'n' + node.id,
    value: formatScalar(typeName, node.value),
    path: [node.id],
    uninit: false,
    left: buildBstNode(node.left, typeName),
    right: buildBstNode(node.right, typeName),
  }
}

function layoutCallTree(root: CallNode) {
  const nodes: { col: number; depth: number; node: CallNode }[] = []
  const pos = new Map<number, { col: number; depth: number }>()
  const edges: { from: number; to: number }[] = []
  let leafCol = 0
  let maxDepth = 0
  function dfs(n: CallNode, depth: number) {
    maxDepth = Math.max(maxDepth, depth)
    if (n.children.length === 0) {
      const col = leafCol++
      pos.set(n.id, { col, depth })
      nodes.push({ col, depth, node: n })
    } else {
      for (const c of n.children) dfs(c, depth + 1)
      const first = pos.get(n.children[0].id)!.col
      const last = pos.get(n.children[n.children.length - 1].id)!.col
      const col = (first + last) / 2
      pos.set(n.id, { col, depth })
      nodes.push({ col, depth, node: n })
    }
  }
  dfs(root, 0)
  for (const n of nodes) {
    for (const c of n.node.children) edges.push({ from: n.node.id, to: c.id })
  }
  return { nodes, edges, pos, leafCol, maxDepth }
}

function CallTreeGraph({ root, activeCallId }: { root: CallNode; activeCallId: number }) {
  const { nodes, edges, pos, leafCol, maxDepth } = layoutCallTree(root)
  const SLOT = 130
  const DH = 76
  const NW = 110
  const NH = 40
  const px = (c: number) => c * SLOT
  const py = (d: number) => d * DH
  const width = Math.max(1, leafCol) * SLOT + 180
  const height = (maxDepth + 1) * DH + NH

  return (
    <div className="tree-scroll">
      <div className="tree-graph" style={{ width, height }}>
        <svg className="tree-svg" width={width} height={height}>
          {edges.map((ed, i) => {
            const a = pos.get(ed.from)!
            const b = pos.get(ed.to)!
            return <line key={i} x1={px(a.col) + NW / 2} y1={py(a.depth) + NH} x2={px(b.col) + NW / 2} y2={py(b.depth)} />
          })}
        </svg>
        {nodes.map(({ col, depth, node }) => {
          const active = node.id === activeCallId
          const cls = 'call-node' + (active ? ' active' : '') + (node.returned ? ' returned' : '')
          return (
            <div className="call-node-wrap" style={{ left: px(col), top: py(depth), minWidth: NW, minHeight: NH }} key={node.id}>
              <div className={cls}>
                <div className="call-label">{node.label}</div>
                {node.locals.length > 0 && (
                  <div className="call-locals">
                    {node.locals.map((l, i) => (
                      <div key={i}>
                        {l.name} = {l.value}
                      </div>
                    ))}
                  </div>
                )}
                {node.returned && node.returnValue !== null && <div className="call-return">return {node.returnValue}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TreeGraph({
  name,
  root,
  reads,
  writes,
  judges,
  rootLabel,
}: {
  name: string
  root: TreeNode
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
  rootLabel?: string
}) {
  const { nodes, edges, pos, colCount, maxDepth } = layoutTree(root)
  const maxValLen = nodes.reduce((m, n) => Math.max(m, n.node.value.length), 0)
  const W = Math.max(44, maxValLen * 8 + 20)
  const H = 34
  const HG = 14
  const VG = 26
  const px = (c: number) => c * (W + HG)
  const py = (d: number) => d * (H + VG)
  const width = colCount * (W + HG) + W
  const height = (maxDepth + 1) * (H + VG)

  return (
    <div className="tree-scroll">
      <div className="tree-graph" style={{ width, height }}>
        <svg className="tree-svg" width={width} height={height}>
          {edges.map((ed, i) => {
            const a = pos.get(ed.from)!
            const b = pos.get(ed.to)!
            return <line key={i} x1={px(a.col) + W / 2} y1={py(a.depth) + H} x2={px(b.col) + W / 2} y2={py(b.depth)} />
          })}
        </svg>
        {nodes.map(({ col, depth, node }) => {
          const cls =
            'cell tree-node' +
            (node.uninit ? ' uninit' : '') +
            (isHit(judges, name, node.path) ? ' judge' : isHit(writes, name, node.path) ? ' write' : isHit(reads, name, node.path) ? ' read' : '')
          return (
            <div className="tree-node-wrap" style={{ left: px(col), top: py(depth) }} key={node.key}>
              {depth === 0 && rootLabel && <div className="tree-root-label">{rootLabel}</div>}
              <div className={cls} style={{ width: W, minWidth: W, whiteSpace: 'nowrap' }}>{node.value}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TreeView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const c = cell.kind === 'tree' ? cell : null
  if (!c || c.size === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  const typeName = c.elemType.kind === 'scalar' ? c.elemType.name : 'int'
  const root = buildTreeNodes(c.nodes, c.size, typeName)
  if (!root) return null
  return <TreeGraph name={name} root={root} reads={reads} writes={writes} judges={judges} />
}

function BstView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const c = cell.kind === 'bst' ? cell : null
  if (!c || c.count === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  const typeName = c.elemType.kind === 'scalar' ? c.elemType.name : 'int'
  const root = buildBstNode(c.root, typeName)
  if (!root) return null
  return <TreeGraph name={name} root={root} reads={reads} writes={writes} judges={judges} />
}

function PQueueView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const c = cell.kind === 'pqueue' ? cell : null
  if (!c || c.items.length === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  const typeName = c.elemType.kind === 'scalar' ? c.elemType.name : 'int'
  const root = buildHeapTree(c.items, typeName)
  if (!root) return null
  return <TreeGraph name={name} root={root} reads={reads} writes={writes} judges={judges} rootLabel="top" />
}

function Windowed1D({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
  focus,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
  focus: number[] | undefined
}) {
  const len = cell.kind === 'array' ? cell.size : cell.cells.length
  const maxOff = Math.max(0, len - WIN_1D)
  const [off, setOff] = useState(0)

  useEffect(() => {
    if (!focus || focus.length < 1) return
    const f = focus[0]
    setOff((prev) => {
      const cur = Math.min(prev, maxOff)
      if (f < cur || f >= cur + WIN_1D) {
        return Math.max(0, Math.min(f - Math.floor(WIN_1D / 2), maxOff))
      }
      return cur
    })
  }, [focus, maxOff, len])

  const start = Math.min(off, maxOff)
  const end = Math.min(start + WIN_1D, len)
  const idxs: number[] = []
  for (let i = start; i < end; i++) idxs.push(i)

  return (
    <div>
      <div className="cells">
        {idxs.map((i) => {
          const sub = cell.cells[i]
          const p = path.concat(i)
          return (
            <div className="cell-wrap" key={i}>
              <div className={cellCls(sub, name, p, judges, writes, reads)}>{sub.kind === 'scalar' ? formatScalar(sub.type, sub.value) : '?'}</div>
              <div className="idx">[{i}]</div>
            </div>
          )
        })}
      </div>
      {len > WIN_1D && (
        <div className="window-control">
          <input type="range" min={0} max={maxOff} value={start} onChange={(e) => setOff(Number(e.target.value))} className="cell-slider" />
          <span className="window-range">[{start}..{end - 1}] / 共 {len}</span>
        </div>
      )}
    </div>
  )
}

function Windowed2D({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
  focus,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
  focus: number[] | undefined
}) {
  const rows = cell.kind === 'array' ? cell.size : cell.cells.length
  let maxCols = 0
  for (let i = 0; i < cell.cells.length; i++) maxCols = Math.max(maxCols, rowLen(cell.cells[i]))

  const maxRowOff = Math.max(0, rows - WIN_2D)
  const maxColOff = Math.max(0, maxCols - WIN_2D)
  const [off, setOff] = useState({ r: 0, c: 0 })

  useEffect(() => {
    if (!focus || focus.length < 2) return
    const fr = focus[0]
    const fc = focus[1]
    setOff((prev) => {
      let r = Math.min(prev.r, maxRowOff)
      let c = Math.min(prev.c, maxColOff)
      let changed = false
      if (fr < r || fr >= r + WIN_2D) {
        r = Math.max(0, Math.min(fr - Math.floor(WIN_2D / 2), maxRowOff))
        changed = true
      }
      if (fc < c || fc >= c + WIN_2D) {
        c = Math.max(0, Math.min(fc - Math.floor(WIN_2D / 2), maxColOff))
        changed = true
      }
      return changed ? { r, c } : prev
    })
  }, [focus, maxRowOff, maxColOff, rows, maxCols])

  const rStart = Math.min(off.r, maxRowOff)
  const cStart = Math.min(off.c, maxColOff)
  const rowIdxs: number[] = []
  for (let i = rStart; i < Math.min(rStart + WIN_2D, rows); i++) rowIdxs.push(i)
  const colIdxs: number[] = []
  for (let j = cStart; j < Math.min(cStart + WIN_2D, Math.max(maxCols, 1)); j++) colIdxs.push(j)

  return (
    <div>
      <div className="grid2d-row">
        {rows > WIN_2D && (
          <div className="row-slider-wrap">
            <span className="window-dim">行</span>
            <input
              type="range"
              min={0}
              max={maxRowOff}
              value={rStart}
              onChange={(e) => setOff((o) => ({ ...o, r: Number(e.target.value) }))}
              className="slider-vertical"
            />
          </div>
        )}
        <div className="nested">
          {rowIdxs.map((i) => {
            const row = cell.cells[i]
            const rl = rowLen(row)
            if (maxCols === 0) {
              return (
                <div className="nested-row" key={i}>
                  <div className="nested-label">[{i}]</div>
                  <div className="viz-empty" style={{ padding: '4px 0' }}>
                    (空)
                  </div>
                </div>
              )
            }
            return (
              <div className="nested-row" key={i}>
                <div className="nested-label">[{i}]</div>
                <div className="cells">
                  {colIdxs.map((j) => {
                    if (j >= rl) {
                      return (
                        <div className="cell-wrap" key={j}>
                          <div className="cell cell-empty" />
                          <div className="idx">[{j}]</div>
                        </div>
                      )
                    }
                    const sub = row.cells[j]
                    const p = path.concat(i, j)
                    return (
                      <div className="cell-wrap" key={j}>
                        <div className={cellCls(sub, name, p, judges, writes, reads)}>{sub.kind === 'scalar' ? formatScalar(sub.type, sub.value) : '?'}</div>
                        <div className="idx">[{j}]</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {maxCols > WIN_2D && (
        <div className="window-control">
          <span className="window-dim">列</span>
          <input type="range" min={0} max={maxColOff} value={cStart} onChange={(e) => setOff((o) => ({ ...o, c: Number(e.target.value) }))} className="cell-slider" />
          <span className="window-range">[{cStart}..{Math.min(cStart + WIN_2D, maxCols) - 1}] / 共 {maxCols}</span>
        </div>
      )}
    </div>
  )
}
