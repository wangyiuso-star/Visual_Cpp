import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { Snapshot } from '../interpreter/interpreter'
import type { VarView, Cell } from '../interpreter/memory'
import {
  LAYOUT_STORAGE_KEY,
  ZOOM_STEP,
  clampZoom,
  isWide,
  loadLayout,
  moveKeyBy,
  moveKeyTo,
  serializeLayout,
  treeAutoWideOf,
  zoomOf,
} from './panelLayout'
import type { CardLayout } from './panelLayout'
import { GRAPH_MAX_NODES } from './graphLimit'
import { cellCls, cellLabel, exactHit, formatCellShort, formatScalar, isHit, rowLen, typeShape } from './viz/format'
import { HiddenNote, StructArrayView, Windowed1D, Windowed2D, useFit } from './viz/window'
import { DequeView, MapView, PairView, QueueView, SetView, StackView, StringView, StructView } from './viz/containers'
import { AdjListView } from './viz/graph'
import { CallTreeGraph, TreeGraph, BstView, PQueueView, TreeView } from './viz/tree'

function kindPriority(cell: Cell): number {
  const k = cell.kind
  if ((k === 'array' || k === 'vector') && cell.elemType.kind === 'vector') return 0 // 图（邻接表）
  if (k === 'tree' || k === 'bst' || k === 'pqueue' || k === 'stack') return 1 // 树/堆/栈
  return 2 // 数组/vector/队列/set/map
}

// 卡片占几栏现在完全由 isWide()（使用者选择 ∥ 树在窄面板时占整行 ∥ 放大）决定，
// 不再看容器种类 —— 二维视窗固定 5×5 之后，连 DP 表卡片也不需要整行了。
// 这里只留「树/堆（含调用树）算不算横向层级布局」的判断，给 isWide 的 auto 用。
function isTreeLike(cell: Cell): boolean {
  return cell.kind === 'tree' || cell.kind === 'bst' || cell.kind === 'pqueue'
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
interface Props {
  snapshot: Snapshot | null
}

export default function VariablesPanel({ snapshot }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  // 卡片布局（顺序 / 单卡缩放 / 全宽）持久化在 localStorage：老师排一次就固定下来。
  const [layout, setLayout] = useState<CardLayout>(() => readStoredLayout())
  // 面板宽度：树/调用树这种横向层级布局，只有面板够宽（≥ TREE_PACK_MIN）时才让它跟别的卡片并排。
  // 0 = 还没量到（第一帧 / SSR）→ 当作窄面板，先占整行，量到之后自然会并排。
  const [panelW, setPanelW] = useState(0)
  const roRef = useRef<ResizeObserver | null>(null)
  // 這裡刻意用 callback ref，而不是 useEffect([]) + ref：
  // 「還沒跑」（snapshot === null）時走的是另一棵子樹，舊寫法在那一帧 panelRef.current 是 null
  // 就直接 return 了 —— 之後跑起來也不會再掛回 observer，panelW 永遠停在 0，
  // 於是樹 / BST / 堆 / 呼叫樹永遠占整行，看起來就是「沒辦法並排」。
  // callback ref 在節點被換掉或重新掛載時都會再被呼叫一次，所以兩條分支都量得到寬度。
  const panelRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      setPanelW((prev) => (prev === w ? prev : w))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    roRef.current = new ResizeObserver(measure)
    roRef.current.observe(el)
  }, [])
  const treeAutoWide = treeAutoWideOf(panelW)
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
      // 這條分支也一定要掛 panelRef：它是最初一帧的 .viz-body（見上面 callback ref 的說明）
      <div className="viz-body" ref={panelRef}>
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
  function cardView(key: string, autoWide = false): CardView {
    return {
      zoom: zoomOf(layout, key),
      wide: isWide(layout, key, autoWide),
      dragging: dragKey === key,
      over: !!dragKey && dragKey !== key && overKey === key,
      onZoom: (steps) =>
        setLayout((prev) => ({ ...prev, zoom: { ...prev.zoom, [key]: clampZoom(zoomOf(prev, key) + steps * ZOOM_STEP) } })),
      onResetZoom: () => setLayout((prev) => ({ ...prev, zoom: { ...prev.zoom, [key]: 1 } })),
      // 放大超過 100% 時卡片會自動佔整行（見 panelLayout.isWide）。這時按 ⤡ 若只把 wide 設回 false
      // 畫面不會有任何變化（因為 zoom 還是 >1），會讓人以為按鈕壞了 —— 所以這一按順便把縮放回到 100%。
      onToggleWide: () =>
        setLayout((prev) => {
          // 放大时卡片本来就占整行（见 isWide）：这一按顺便回到 100%，否则按了看不出变化
          if (zoomOf(prev, key) > 1) {
            return { ...prev, zoom: { ...prev.zoom, [key]: 1 }, wide: { ...prev.wide, [key]: false } }
          }
          // 以「目前看起来是整行还是半宽」为准来翻，才不会出现「按了没反应」
          return { ...prev, wide: { ...prev.wide, [key]: !isWide(prev, key, autoWide) } }
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
    <div className="viz-body" ref={panelRef}>
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
                    className={cardClass('calltree-section', cardView('@calltree', treeAutoWide))}
                    key="calltree"
                    {...cardDragProps(cardView('@calltree', treeAutoWide))}
                  >
                    <div className="calltree-title" onClick={() => setTreeCollapsed((t) => !t)}>
                      <span className="caret">{treeCollapsed ? '▸' : '▾'}</span>
                      递归树 / 调用树
                      <CardControls card={cardView('@calltree', treeAutoWide)} onMove={(dir) => moveItem('@calltree', dir)} />
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
                  onMove={(dir) => moveItem(item.v.name, dir)}
                  card={cardView(item.v.name, isTreeLike(item.v.cell) && treeAutoWide)}
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
  onMove: (dir: -1 | 1) => void
  card: CardView
}) {
  return (
    <div className={cardClass('var', card)} {...cardDragProps(card)}>
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

  // ref（引用）在 dumpAll 就已經解引用，不該走到這裡；真的出現就明講，不要靜默畫成空容器
  if (cell.kind === 'ref') {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        （未解析的引用 {cell.target.name}）
      </div>
    )
  }

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

