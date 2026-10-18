// 樹 / BST / 堆與呼叫樹（含共用縮放視口、放大到整屏）。
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Snapshot, CallNode } from '../../interpreter/interpreter'
import type { Cell, VarView, BstNode } from '../../interpreter/memory'
import type { Type } from '../../interpreter/ast'
import { cellCls, formatCellShort, formatScalar, isHit } from './format'
import { t, tf } from '../../i18n'

export const TREE_Z_MIN = 0.3
export const TREE_Z_MAX = 2

export interface TreeNode {
  key: string
  value: string
  path: number[]
  uninit: boolean
  left: TreeNode | null
  right: TreeNode | null
}

export function layoutTree(root: TreeNode) {
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

export function buildHeapTree(items: Cell[], typeName: string): TreeNode | null {
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

export function buildTreeNodes(nodes: Cell[], size: number, typeName: string): TreeNode | null {
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

export function buildBstNode(node: BstNode | null, typeName: string): TreeNode | null {
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

export function layoutCallTree(root: CallNode) {
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
export function useTreeViewport(baseWidth: number, baseHeight: number) {
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

export function TreeViewport({
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
      <button className="mini-btn" onClick={() => bump(-0.1)} title={t('缩小')}>−</button>
      <span className="tree-zoom-label">{Math.round(z * 100)}%</span>
      <button className="mini-btn" onClick={() => bump(0.1)} title={t('放大')}>＋</button>
      <button className={'mini-btn' + (auto ? ' on' : '')} onClick={() => setAuto((a) => !a)} title={t('自动缩放到能放下整棵树')}>
        适应
      </button>
      <button className="mini-btn" onClick={reset} title={t('恢复 100%')}>1:1</button>
      <span className="spacer" />
      <button className="mini-btn" onClick={() => setMagnified((m) => !m)} title={t('放大到整屏（Esc 退出）')}>
        {t(magnified ? '还原' : '放大')}
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
          <button className="mini-btn" onClick={() => setMagnified(false)}>{t('关闭 (Esc)')}</button>
        </div>
        {bar}
        {body}
      </div>
    </div>,
    document.body,
  )
}

// 从根到指定调用节点的路径（用于「调用栈」视图）
export function pathToNode(root: CallNode, id: number): CallNode[] {
  if (root.id === id) return [root]
  for (const c of root.children) {
    const p = pathToNode(c, id)
    if (p.length > 0) return [root, ...p]
  }
  return []
}

export function CallTreeGraph({ root, activeCallId }: { root: CallNode; activeCallId: number }) {
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
      title={tf('调用树 · {0}', mode === 'stack' ? t('当前调用栈') : t('完整树'))}
      follow={follow}
      extra={
        <button
          className="mini-btn"
          onClick={() => setMode((m) => (m === 'stack' ? 'tree' : 'stack'))}
          title={t('完整树 / 仅当前调用路径')}
        >
          {t(mode === 'stack' ? '调用栈' : '完整树')}
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

export function TreeGraph({
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

export function TreeView({
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

export function BstView({
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

export function PQueueView({
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
