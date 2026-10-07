import { useEffect, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import {
  LAYOUT_STORAGE_KEY,
  ZOOM_STEP,
  clampZoom,
  loadLayout,
  isWide,
  moveKeyBy,
  moveKeyTo,
  serializeLayout,
  zoomOf,
} from './panelLayout'
import type { CardLayout } from './panelLayout'
import { GRAPH_MAX_NODES, graphTooBigReason } from './graphLimit'
import { createPortal } from 'react-dom'
import type { Snapshot, CallNode } from '../interpreter/interpreter'
import type { VarView, Cell, ScalarValue, BstNode } from '../interpreter/memory'
import type { Type } from '../interpreter/ast'

const WIN_1D = 10
const WIN_2D = 5
// 一次最多画几个元素。stack/queue/deque/set/map 这些「逐项列出」的视图没有窗口机制
// （数组/2D 有 WIN_1D/WIN_2D 的滑动窗口），元素一多就会一次产生上万个 DOM 节点 → 页面卡死。
// 所以这里硬性截断并说明还有多少没显示。
const VIEW_MAX_ITEMS = 300

function HiddenNote({ hidden, total }: { hidden: number; total: number }) {
  return (
    <div className="viz-empty" style={{ padding: '4px 0' }}>
      … 还有 {hidden} 项未显示（共 {total} 项；面板一次最多画 {VIEW_MAX_ITEMS} 项，避免页面卡住）
    </div>
  )
}
// 调用树缩放范围
const TREE_Z_MIN = 0.3
const TREE_Z_MAX = 2

function formatScalar(type: string, value: ScalarValue | null): string {
  if (value === null) return '?'
  if (type === 'char') return "'" + value + "'"
  if (type === 'string') return '"' + value + '"'
  if (type === 'bool') return value ? 'true' : 'false'
  return String(value)
}

// 容器的「一行摘要」。用在「不是纯量但必须显示」的位置：set 元素、map 的键/值、
// struct 成员、pair 成员、stack/queue/deque 的元素、数组窗口里的格子……
// 递归但有深度上限、长度上限，避免出现超长字串。
function formatListShort(cells: Cell[], depth: number): string {
  const MAX = 8
  const parts = cells.slice(0, MAX).map((c) => formatCellShort(c, depth + 1))
  if (cells.length > MAX) parts.push('…')
  return '[' + parts.join(', ') + ']'
}

function collectBstShorts(node: BstNode | null, elemType: Type, out: Cell[]): void {
  if (!node) return
  collectBstShorts(node.left, elemType, out)
  out.push({ kind: 'scalar', type: elemType.kind === 'scalar' ? elemType.name : 'int', value: node.value })
  collectBstShorts(node.right, elemType, out)
}

export function formatCellShort(cell: Cell, depth = 0): string {
  if (cell.kind === 'scalar') return formatScalar(cell.type, cell.value)
  if (depth >= 3) return '…'
  if (cell.kind === 'pair') {
    return '(' + formatCellShort(cell.first, depth + 1) + ', ' + formatCellShort(cell.second, depth + 1) + ')'
  }
  if (cell.kind === 'struct') {
    return '{' + cell.members.map((m) => m.name + ':' + formatCellShort(m.cell, depth + 1)).join(', ') + '}'
  }
  if (cell.kind === 'array' || cell.kind === 'vector') return formatListShort(cell.cells, depth)
  if (cell.kind === 'deque' || cell.kind === 'stack' || cell.kind === 'queue' || cell.kind === 'pqueue') {
    return formatListShort(cell.items, depth)
  }
  if (cell.kind === 'set') return '{' + formatListShort(cell.items, depth).slice(1, -1) + '}'
  if (cell.kind === 'tree') return formatListShort(cell.nodes.slice(1), depth)
  if (cell.kind === 'bst') {
    const out: Cell[] = []
    collectBstShorts(cell.root, cell.elemType, out)
    return formatListShort(out, depth)
  }
  if (cell.kind === 'map' || cell.kind === 'umap') {
    const MAX = 8
    const parts = cell.entries
      .slice(0, MAX)
      .map((e) => formatCellShort(e.key, depth + 1) + ':' + formatCellShort(e.value, depth + 1))
    if (cell.entries.length > MAX) parts.push('…')
    return '{' + parts.join(', ') + '}'
  }
  if (cell.kind === 'ref') return '&' + cell.target.name
  // 兜底：Cell 的种类上面已经全部覆盖，这里只是「以后新增种类时不要再出现光秃秃的 '?'」的保险
  return (cell as Cell).kind
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

// 形状分类：决定这张卡片占几栏（shape-square = 一栏，shape-horizontal = 整行）。
// 原则（v0.9.6 改）：**预设一栏，让多张卡片能并排**；只有真的需要横向空间的才占整行 ——
// 树/堆（横向层级布局）与「很宽的二维表」（例如 501 列的 DP 表）。
// 一维数组/字串/set/map 这些以前占整行，结果宽屏幕上一张卡片一行、右边永远是空的；
// 它们现在都只有一栏，格子数会跟着卡片实际宽度自动调整（见 useFit），所以不会被挤成两行。
function shapeClass(cell: Cell): string {
  const k = cell.kind
  if (k === 'scalar' && cell.type === 'string') return 'shape-square'
  if (k === 'queue' || k === 'deque' || k === 'set' || k === 'map' || k === 'umap') return 'shape-square'
  if (k === 'array' || k === 'vector') {
    if (cell.elemType.kind === 'scalar') return 'shape-square'
    // 二维容器：宽的（行很长，例如 DP 表 501 列）给它整行，才拿得到宽度显示更多列；
    // 行短的（例如 3×3 或邻接表）维持半宽，好让别的变量卡片并排放在它旁边。
    let maxCols = 0
    for (const row of cell.cells) maxCols = Math.max(maxCols, row.kind === 'vector' || row.kind === 'array' ? (row.kind === 'array' ? row.size : row.cells.length) : 0)
    return maxCols > 12 ? 'shape-horizontal' : 'shape-square'
  }
  // 树 / 堆（堆也画成完全二叉树）与调用树同样占满整行，避免被半宽挤成"小窗口"
  if (k === 'tree' || k === 'bst' || k === 'pqueue') return 'shape-horizontal'
  return 'shape-square' // stack/pair
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
  if (cell.kind === 'scalar' && cell.type === 'string') return 'string · 长度 ' + String(cell.value ?? '').length
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
  // 卡片布局（顺序 / 单卡缩放 / 全宽）持久化在 localStorage：老师排一次就固定下来。
  const [layout, setLayout] = useState<CardLayout>(() => readStoredLayout())
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(layout))
    } catch {
      // 无痕模式 / 空间满：存不了也没关系，不要影响上课
    }
  }, [layout])

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

  const containers = snapshot.vars.filter((v) => v.cell.kind !== 'scalar' || (v.cell.kind === 'scalar' && v.cell.type === 'string'))
  const scalars = snapshot.vars.filter((v) => v.cell.kind === 'scalar' && v.cell.type !== 'string')
  const hasCallTree = !!(snapshot.callTree && snapshot.callTree.children.length > 0)
  const defaultItems: PanelItem[] = []
  if (hasCallTree) defaultItems.push({ kind: 'calltree' })
  for (const v of containers) defaultItems.push({ kind: 'container', v })
  defaultItems.sort((a, b) => {
    const pa = a.kind === 'calltree' ? 1 : kindPriority(a.v.cell)
    const pb = b.kind === 'calltree' ? 1 : kindPriority(b.v.cell)
    return pa - pb
  })
  const items = arrange(defaultItems, layout.order, itemKey)

  function moveItem(key: string, dir: -1 | 1) {
    setLayout((prev) => ({ ...prev, order: moveKeyBy(items.map(itemKey), key, dir) }))
  }

  function reorderTo(key: string, target: string) {
    setLayout((prev) => ({ ...prev, order: moveKeyTo(items.map(itemKey), key, target) }))
  }

  // 每张卡片的拖动 / 缩放状态与操作打包成一个对象，两种卡片（容器卡、调用树卡）共用。
  function cardView(key: string): CardView {
    return {
      zoom: zoomOf(layout, key),
      wide: isWide(layout, key),
      dragging: dragKey === key,
      over: !!dragKey && dragKey !== key && overKey === key,
      onZoom: (steps) =>
        setLayout((prev) => ({ ...prev, zoom: { ...prev.zoom, [key]: clampZoom(zoomOf(prev, key) + steps * ZOOM_STEP) } })),
      onResetZoom: () => setLayout((prev) => ({ ...prev, zoom: { ...prev.zoom, [key]: 1 } })),
      // 放大超過 100% 時卡片會自動佔整行（見 panelLayout.isWide）。這時按 ⤡ 若只把 wide 設回 false
      // 畫面不會有任何變化（因為 zoom 還是 >1），會讓人以為按鈕壞了 —— 所以這一按順便把縮放回到 100%。
      onToggleWide: () =>
        setLayout((prev) => {
          if (zoomOf(prev, key) > 1) {
            return { ...prev, zoom: { ...prev.zoom, [key]: 1 }, wide: { ...prev.wide, [key]: false } }
          }
          return { ...prev, wide: { ...prev.wide, [key]: !prev.wide[key] } }
        }),
      onDragStart: () => {
        setDragKey(key)
        setOverKey(null)
      },
      onDragEnd: () => {
        setDragKey(null)
        setOverKey(null)
      },
      onDragOverCard: () => setOverKey(key),
      onDragLeaveCard: () => setOverKey((k) => (k === key ? null : k)),
      onDropCard: () => {
        if (dragKey) reorderTo(dragKey, key)
        setDragKey(null)
        setOverKey(null)
      },
    }
  }

  return (
    <div className="viz-body">
      {snapshot.sortInfo && (
        <div className="sort-banner">
          <span className="sort-label">排序</span>
          <span className="sort-text">
            {snapshot.sortInfo.name} · 比较 {snapshot.sortInfo.comparisons} 次 · n = {snapshot.sortInfo.n}
          </span>
          {snapshot.sortInfo.warned && <span className="sort-warn">⚠ 比较函数不满足严格弱序</span>}
        </div>
      )}
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
                  <div
                    className={cardClass('calltree-section shape-horizontal', cardView('@calltree'))}
                    key="calltree"
                    {...cardDragProps(cardView('@calltree'))}
                  >
                    <div className="calltree-title" onClick={() => setTreeCollapsed((t) => !t)}>
                      <span className="caret">{treeCollapsed ? '▸' : '▾'}</span>
                      递归树 / 调用树
                      <CardControls card={cardView('@calltree')} onMove={(dir) => moveItem('@calltree', dir)} />
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
                  card={cardView(item.v.name)}
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

// 一张卡片的拖动 / 缩放状态与操作（两种卡片共用）
interface CardView {
  zoom: number
  wide: boolean
  dragging: boolean
  over: boolean
  onZoom: (steps: number) => void
  onResetZoom: () => void
  onToggleWide: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragOverCard: () => void
  onDragLeaveCard: () => void
  onDropCard: () => void
}

// 读卡片布局存档。某些隐私设定下 localStorage 连「读」都会抛 SecurityError，
// 那会让整个面板在渲染期炸掉（使用者看到的就是黑屏）——所以这里一定要守住。
function readStoredLayout(): CardLayout {
  try {
    return loadLayout(typeof localStorage === 'undefined' ? null : localStorage.getItem(LAYOUT_STORAGE_KEY))
  } catch {
    return { order: [], zoom: {}, wide: {} }
  }
}

function cardClass(base: string, card: CardView): string {
  return (
    base +
    (card.wide ? ' card-wide' : '') +
    (card.dragging ? ' card-dragging' : '') +
    (card.over ? ' card-drop' : '')
  )
}

// 卡片外层要挂的拖动事件 + 缩放变量（zoom 用 CSS 的 zoom 属性，才会连格子内距一起缩放）
function cardDragProps(card: CardView) {
  return {
    style: { '--card-zoom': String(card.zoom) } as React.CSSProperties,
    onDragOver: (e: DragEvent) => {
      if (card.dragging) return
      e.preventDefault()
      card.onDragOverCard()
    },
    onDragLeave: () => card.onDragLeaveCard(),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      card.onDropCard()
    },
  }
}

// 卡片右上角：拖动把手 / 上下移 / 缩放 − % ＋ / 整行宽
function CardControls({ card, onMove }: { card: CardView; onMove?: (dir: -1 | 1) => void }) {
  const pct = Math.round(card.zoom * 100)
  return (
    <span className="card-controls" onClick={(e) => e.stopPropagation()}>
      <span
        className="card-drag"
        draggable
        title="按住拖动这张卡片，放到别的卡片上就换位置"
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', 'card')
          card.onDragStart()
        }}
        onDragEnd={card.onDragEnd}
      >
        ⠿
      </span>
      {onMove && (
        <>
          <button className="reorder-btn" title="上移" onClick={() => onMove(-1)}>↑</button>
          <button className="reorder-btn" title="下移" onClick={() => onMove(1)}>↓</button>
        </>
      )}
      <button className="reorder-btn" title="缩小这张卡片" onClick={() => card.onZoom(-1)}>−</button>
      <button className="reorder-btn zoom-pct" title="点一下还原成 100%" onClick={card.onResetZoom}>{pct}%</button>
      <button className="reorder-btn" title="放大这张卡片（放大时卡片会自动占整行）" onClick={() => card.onZoom(1)}>＋</button>
      <button
        className="reorder-btn"
        title={card.zoom > 1 ? '放大時自動佔整行；按這裡回到 100% 半宽' : card.wide ? '改成半宽' : '改成整行宽'}
        onClick={card.onToggleWide}
      >
        {card.wide ? '⤡' : '⤢'}
      </button>
    </span>
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
        {v.alias && <span className="alias-badge" title="这是引用参数：与调用方的变量共用同一份数据">参数（别名）</span>}
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
  card,
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
  card: CardView
}) {
  return (
    <div className={cardClass('var ' + shape, card)} {...cardDragProps(card)}>
      <div className="var-name" onClick={onToggle}>
        <span className="caret">{collapsed ? '▸' : '▾'}</span>
        {v.name}
        <span className={'scope-badge ' + (v.scope === 'global' ? 'scope-global' : 'scope-local')}>{v.scope}</span>
        {v.alias && (
          <span className="alias-badge" title="这是引用/数组形参：与调用方的变量共用同一份数据">
            参数（别名）
          </span>
        )}
        <span className="var-type">{cellLabel(v.cell)}</span>
        <CardControls card={card} onMove={onMove} />
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
  if (cell.kind === 'scalar' && cell.type === 'string') {
    return <StringView name={name} path={path} cell={cell} reads={reads} writes={writes} judges={judges} />
  }

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

function StringView({
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
  const c = cell.kind === 'scalar' && cell.type === 'string' ? cell : null
  if (!c) return null
  const s = (c.value ?? '') as string
  if (s.length === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  return (
    <div className="cells">
      {s.split('').map((ch, i) => {
        const p = path.concat(i)
        const chCell: Cell = { kind: 'scalar', type: 'char', value: ch }
        return (
          <div className="cell-wrap" key={i}>
            <div className={cellCls(chCell, name, p, judges, writes, reads)}>{ch}</div>
          </div>
        )
      })}
    </div>
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
  // 从栈顶往下画，最多 VIEW_MAX_ITEMS 个
  const shown = items.slice(Math.max(0, items.length - VIEW_MAX_ITEMS)).reverse()
  return (
    <div className="stack-view">
      {items.length > VIEW_MAX_ITEMS && <HiddenNote hidden={items.length - VIEW_MAX_ITEMS} total={items.length} />}
      {shown.map((item, k) => {
        const i = items.length - 1 - k
        const p = path.concat(i)
        return (
          <div className="stack-row" key={i}>
            <span className="stack-marker">{k === 0 ? 'top' : ''}</span>
            <div className={cellCls(item, name, p, judges, writes, reads)}>{formatCellShort(item)}</div>
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
      {items.slice(0, VIEW_MAX_ITEMS).map((item, i) => {
        const p = path.concat(i)
        return (
          <div className="cell-wrap" key={i}>
            <div className={cellCls(item, name, p, judges, writes, reads)}>{formatCellShort(item)}</div>
            <div className="idx">[{i}]</div>
          </div>
        )
      })}
      {items.length > VIEW_MAX_ITEMS && <HiddenNote hidden={items.length - VIEW_MAX_ITEMS} total={items.length} />}
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
      {items.slice(0, VIEW_MAX_ITEMS).map((item, i) => {
        const p = path.concat(i)
        return (
          <div className="cell-wrap" key={i}>
            <div className={cellCls(item, name, p, judges, writes, reads)}>{formatCellShort(item)}</div>
            <div className="idx">[{i}]</div>
          </div>
        )
      })}
      {items.length > VIEW_MAX_ITEMS && <HiddenNote hidden={items.length - VIEW_MAX_ITEMS} total={items.length} />}
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
      {items.slice(0, VIEW_MAX_ITEMS).map((item, i) => {
        const p = path.concat(i)
        return (
          <div className="cell-wrap" key={i}>
            <div className={cellCls(item, name, p, judges, writes, reads)}>{formatCellShort(item)}</div>
            <div className="idx">[{i}]</div>
          </div>
        )
      })}
      {items.length > VIEW_MAX_ITEMS && <HiddenNote hidden={items.length - VIEW_MAX_ITEMS} total={items.length} />}
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
      {entries.slice(0, VIEW_MAX_ITEMS).map((e, i) => {
        const p = path.concat(i)
        return (
          <div className="map-row" key={i}>
            <span className="cell map-key">{formatCellShort(e.key)}</span>
            <span className="map-arrow">→</span>
            <span className={cellCls(e.value, name, p, judges, writes, reads)}>{formatCellShort(e.value)}</span>
          </div>
        )
      })}
      {entries.length > VIEW_MAX_ITEMS && <HiddenNote hidden={entries.length - VIEW_MAX_ITEMS} total={entries.length} />}
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
                          {formatCellShort(m.cell)}
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
            <span className={cellCls(m.cell, name, p, judges, writes, reads)}>{formatCellShort(m.cell)}</span>
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
      <span className={cellCls(c.first, name, path.concat(0), judges, writes, reads)}>{formatCellShort(c.first)}</span>
      <span className="pair-comma">,</span>
      <span className={cellCls(c.second, name, path.concat(1), judges, writes, reads)}>{formatCellShort(c.second)}</span>
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
  // 预设就用表格：节点数已经超标的（例如 501×501 的 DP 表）不要一开始就画图。
  // 使用者仍可按「查看图」，那时 GraphView 会说明为什么不画，而不是把浏览器卡死。
  const rows = cell.kind === 'array' ? cell.size : cell.cells.length
  const [showTable, setShowTable] = useState(rows > GRAPH_MAX_NODES)
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

// ===== 树形视图通用：缩放 / 自动适应 / 放大整屏 / 跟随 =====
// 量取可视区宽度，高度预算由窗口推算——刻意不测量自身高度，
// 否则会变成"量自身→改缩放→再量自身"的抖动循环。
function useTreeViewport(baseWidth: number, baseHeight: number) {
  const [zoom, setZoom] = useState(1)
  const [auto, setAuto] = useState(false)
  const [magnified, setMagnified] = useState(false)
  const [vw, setVw] = useState(0)
  const [vh, setVh] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const measure = () => {
      const el = scrollRef.current
      setVw(el ? el.clientWidth : 0)
      setVh(magnified ? Math.max(240, window.innerHeight - 200) : Math.min(Math.round(window.innerHeight * 0.62), 560))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (scrollRef.current) ro.observe(scrollRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [magnified])

  useEffect(() => {
    if (!magnified) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMagnified(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [magnified])

  // 自动适应：求能放下整棵树的缩放比，向下取 0.05 步长（避免抖动）
  const fitZoom = vw > 0 && vh > 0 ? Math.min(vw / baseWidth, vh / baseHeight) : 1
  const z = auto ? Math.max(TREE_Z_MIN, Math.min(1, Math.floor(fitZoom * 20) / 20)) : zoom
  return {
    z,
    auto,
    setAuto,
    magnified,
    setMagnified,
    scrollRef,
    bump(delta: number) {
      setAuto(false)
      setZoom(Math.max(TREE_Z_MIN, Math.min(TREE_Z_MAX, Math.round((z + delta) * 20) / 20)))
    },
    reset() {
      setAuto(false)
      setZoom(1)
    },
  }
}

function TreeViewport({
  vp,
  title,
  extra,
  follow,
  children,
}: {
  vp: ReturnType<typeof useTreeViewport>
  title: string
  extra?: ReactNode
  follow?: { x: number; y: number; w: number; h: number } | null
  children: ReactNode
}) {
  const { z, auto, setAuto, magnified, setMagnified, scrollRef, bump, reset } = vp

  // 自动跟随：仅在目标越出可视区时滚动（留 18px 边距）
  const fx = follow ? follow.x : undefined
  const fy = follow ? follow.y : undefined
  const fw = follow ? follow.w : undefined
  const fh = follow ? follow.h : undefined
  useEffect(() => {
    const el = scrollRef.current
    if (!el || fx === undefined || fy === undefined || fw === undefined || fh === undefined) return
    const M = 18
    let left = el.scrollLeft
    let top = el.scrollTop
    if (fx - M < left) left = Math.max(0, fx - M)
    else if (fx + fw + M > left + el.clientWidth) left = fx + fw + M - el.clientWidth
    if (fy - M < top) top = Math.max(0, fy - M)
    else if (fy + fh + M > top + el.clientHeight) top = fy + fh + M - el.clientHeight
    if (Math.abs(left - el.scrollLeft) > 0.5 || Math.abs(top - el.scrollTop) > 0.5) {
      el.scrollTo({ left, top, behavior: 'smooth' })
    }
  }, [fx, fy, fw, fh, magnified])

  const bar = (
    <div className="tree-bar">
      {extra}
      <button className="mini-btn" onClick={() => bump(-0.1)} title="缩小">−</button>
      <span className="tree-zoom-label">{Math.round(z * 100)}%</span>
      <button className="mini-btn" onClick={() => bump(0.1)} title="放大">＋</button>
      <button className={'mini-btn' + (auto ? ' on' : '')} onClick={() => setAuto((a) => !a)} title="自动缩放到能放下整棵树">
        适应
      </button>
      <button className="mini-btn" onClick={reset} title="恢复 100%">1:1</button>
      <span className="spacer" />
      <button className="mini-btn" onClick={() => setMagnified((m) => !m)} title="放大到整屏（Esc 退出）">
        {magnified ? '还原' : '放大'}
      </button>
    </div>
  )

  const body = (
    <div className="tree-scroll" ref={scrollRef}>
      {children}
    </div>
  )

  if (!magnified) {
    return (
      <div className="tree-wrap">
        {bar}
        {body}
      </div>
    )
  }

  // 放大：portal 到 document.body —— 既不受 .viz-body 的 overflow 裁切，
  // 也不受其 container-type 产生的 layout containment（会成为 fixed 后代的包含块）影响。
  return createPortal(
    <div className="tree-overlay">
      <div className="tree-wrap tree-overlay-card">
        <div className="tree-overlay-head">
          <span className="tree-overlay-title">{title}</span>
          <span className="spacer" />
          <button className="mini-btn" onClick={() => setMagnified(false)}>关闭 (Esc)</button>
        </div>
        {bar}
        {body}
      </div>
    </div>,
    document.body,
  )
}

// 从根到指定调用节点的路径（用于「调用栈」视图）
function pathToNode(root: CallNode, id: number): CallNode[] {
  if (root.id === id) return [root]
  for (const c of root.children) {
    const p = pathToNode(c, id)
    if (p.length > 0) return [root, ...p]
  }
  return []
}

function CallTreeGraph({ root, activeCallId }: { root: CallNode; activeCallId: number }) {
  const [mode, setMode] = useState<'tree' | 'stack'>('tree')
  // 视图模式：完整树 / 只显示当前调用路径（宽度只与深度有关，深递归也不会横向爆炸）
  const activePath = mode === 'stack' ? pathToNode(root, activeCallId) : []
  const nodes: { col: number; depth: number; node: CallNode }[] = []
  const edges: { from: number; to: number }[] = []
  let leafCol = 1
  let maxDepth = 0
  if (mode === 'stack') {
    activePath.forEach((n, d) => nodes.push({ col: 0, depth: d, node: n }))
    for (let i = 1; i < activePath.length; i++) edges.push({ from: activePath[i - 1].id, to: activePath[i].id })
    maxDepth = Math.max(0, activePath.length - 1)
  } else {
    const lay = layoutCallTree(root)
    for (const n of lay.nodes) nodes.push({ col: n.col, depth: n.depth, node: n.node })
    for (const e of lay.edges) edges.push({ from: e.from, to: e.to })
    leafCol = lay.leafCol
    maxDepth = lay.maxDepth
  }
  const pos = new Map<number, { col: number; depth: number }>()
  for (const n of nodes) pos.set(n.node.id, { col: n.col, depth: n.depth })

  // 基准几何始终按「完整内容」算（含局部变量），只用于自动适应与 100% 下的尺寸；
  // LOD 只影响实际渲染、不参与缩放求解，避免"缩小→隐藏内容→变矮→再改缩放"的抖动。
  let maxChars = 4
  let baseLines = 0
  for (const item of nodes) {
    const nd = item.node
    maxChars = Math.max(maxChars, nd.label.length)
    for (const lv of nd.locals) maxChars = Math.max(maxChars, (lv.name + " = " + lv.value).length)
    baseLines = Math.max(baseLines, nd.locals.length + (nd.returned && nd.returnValue !== null ? 1 : 0))
  }
  const baseSLOT = Math.min(300, Math.max(130, Math.round(maxChars * 7.6) + 28))
  const baseNH = 30 + baseLines * 15
  const baseDH = baseNH + 36
  const baseWidth = Math.max(1, leafCol) * baseSLOT + 180
  const baseHeight = (maxDepth + 1) * baseDH + baseNH

  const vp = useTreeViewport(baseWidth, baseHeight)
  const z = vp.z
  // LOD：缩得太小就隐藏局部变量与返回值，避免糊成一团
  const lod = z < 0.7
  const unitNH = lod ? 30 : baseNH
  const unitDH = unitNH + 36

  const SLOT = baseSLOT * z
  const NW = Math.max(40, SLOT - 20 * z)
  const NH = unitNH * z
  const DH = unitDH * z
  const px = (c: number) => c * SLOT
  const py = (d: number) => d * DH
  const width = baseWidth * z
  const height = ((maxDepth + 1) * unitDH + unitNH) * z
  const hit = nodes.find((it) => it.node.id === activeCallId)
  const follow = hit ? { x: px(hit.col), y: py(hit.depth), w: NW, h: NH } : null

  return (
    <TreeViewport
      vp={vp}
      title={'调用树 · ' + (mode === 'stack' ? '当前调用栈' : '完整树')}
      follow={follow}
      extra={
        <button
          className="mini-btn"
          onClick={() => setMode((m) => (m === 'stack' ? 'tree' : 'stack'))}
          title="完整树 / 仅当前调用路径"
        >
          {mode === 'stack' ? '调用栈' : '完整树'}
        </button>
      }
    >
      <div className="tree-graph" style={{ width, height, fontSize: 12 * z + 'px' }}>
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
                {!lod && node.locals.length > 0 && (
                  <div className="call-locals">
                    {node.locals.map((l, i) => (
                      <div key={i}>
                        {l.name} = {l.value}
                      </div>
                    ))}
                  </div>
                )}
                {!lod && node.returned && node.returnValue !== null && <div className="call-return">return {node.returnValue}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </TreeViewport>
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
  const baseW = Math.max(44, maxValLen * 8 + 20)
  const H0 = 34
  const HG0 = 14
  const VG0 = 26
  const baseWidth = colCount * (baseW + HG0) + baseW
  const baseHeight = (maxDepth + 1) * (H0 + VG0)

  const vp = useTreeViewport(baseWidth, baseHeight)
  const z = vp.z
  const W = baseW * z
  const H = H0 * z
  const HG = HG0 * z
  const VG = VG0 * z
  const px = (c: number) => c * (W + HG)
  const py = (d: number) => d * (H + VG)
  const width = baseWidth * z
  const height = baseHeight * z

  // 跟随本步被读写的节点（写优先），与调用树同一套跟随逻辑
  const followNode =
    nodes.find((n) => isHit(writes, name, n.node.path)) ??
    nodes.find((n) => isHit(reads, name, n.node.path) || isHit(judges, name, n.node.path))
  const follow = followNode ? { x: px(followNode.col), y: py(followNode.depth), w: W, h: H } : null

  return (
    <TreeViewport vp={vp} title={name} follow={follow}>
      <div className="tree-graph" style={{ width, height, fontSize: 13 * z + 'px' }}>
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
              <div className={cls} style={{ width: W, minWidth: W, height: H, minHeight: H, whiteSpace: 'nowrap' }}>{node.value}</div>
            </div>
          )
        })}
      </div>
    </TreeViewport>
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

// 量出「这个容器里一个格子实际多宽」，再据以算一行能塞几个。不用写死：
// 格子尺寸随宽度分档（@media 里 .cell 的 min-width / padding / font-size 会变）、还受卡片缩放影响，
// 写死「一行 10 个」在窄卡片里会把数组挤成两行、在宽卡片里又浪费右半边。
// offsetWidth 是布局 px，与容器 clientWidth 同一坐标系（不受卡片 zoom 影响）；量不到就退回 min。
const CELL_GAP = 4 // .cell-wrap 的 margin-right

function useFit(min: number, max: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(min)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const sample = el.querySelector('.cell-wrap') as HTMLElement | null
      const avail = el.clientWidth
      if (!sample || !avail) return
      const w = sample.offsetWidth + CELL_GAP
      if (w <= 0) return
      const n = Math.max(min, Math.min(max, Math.floor(avail / w)))
      setCols((prev) => (prev === n ? prev : n))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [min, max])
  return { ref, cols }
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
  const { ref, cols } = useFit(WIN_1D, 40)
  const len = cell.kind === 'array' ? cell.size : cell.cells.length
  const maxOff = Math.max(0, len - cols)
  const [off, setOff] = useState(0)

  useEffect(() => {
    if (!focus || focus.length < 1) return
    const f = focus[0]
    setOff((prev) => {
      const cur = Math.min(prev, maxOff)
      if (f < cur || f >= cur + cols) {
        return Math.max(0, Math.min(f - Math.floor(cols / 2), maxOff))
      }
      return cur
    })
  }, [focus, maxOff, len, cols])

  const start = Math.min(off, maxOff)
  const end = Math.min(start + cols, len)
  const idxs: number[] = []
  for (let i = start; i < end; i++) idxs.push(i)

  return (
    <div ref={ref}>
      <div className="cells">
        {idxs.map((i) => {
          const sub = cell.cells[i]
          const p = path.concat(i)
          return (
            <div className="cell-wrap" key={i}>
              <div className={cellCls(sub, name, p, judges, writes, reads)}>{formatCellShort(sub)}</div>
              <div className="idx">[{i}]</div>
            </div>
          )
        })}
      </div>
      {len > cols && (
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
  // 视窗固定 5×5（使用者要的是「固定大小 + 写入时自动跳转」，不要跟着宽度变，
  // 这样每张卡片看到的行列数是可预期的；卡住的是写入/读取的那一格会自动滚进视窗）。
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
                        <div className={cellCls(sub, name, p, judges, writes, reads)}>{formatCellShort(sub)}</div>
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
