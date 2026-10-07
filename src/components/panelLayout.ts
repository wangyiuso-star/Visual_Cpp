// 右侧面板的「卡片布局」：顺序 / 单卡缩放 / 全宽。
// 拖动与 localStorage 这类行为在 node 端测不到（需要真浏览器的 DOM 事件），
// 所以把「顺序怎么算、缩放怎么夹、存档怎么读」抽成纯函数放这里，可以精确断言。

export interface CardLayout {
  order: string[]
  zoom: Record<string, number>
  wide: Record<string, boolean>
}

export const ZOOM_MIN = 0.7
export const ZOOM_MAX = 1.6
export const ZOOM_STEP = 0.1
export const LAYOUT_STORAGE_KEY = 'cpp-viz.panel-layout'

export const EMPTY_LAYOUT: CardLayout = { order: [], zoom: {}, wide: {} }

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1
  const snapped = Math.round(z * 100) / 100
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, snapped))
}

export function zoomOf(layout: CardLayout, key: string): number {
  const z = layout.zoom[key]
  return z === undefined ? 1 : clampZoom(z)
}

// 面板窄于这个宽度时，树/调用树这种「横向层级布局」的卡片占整行；
// 面板够宽（右边比例拉大 / 屏幕够大）就让它们只占一栏，好跟别的卡片并排。
// 800px ≈ 两个 400px 的栏位，所以并排之后每张树卡片还有 ~390px 可以画（配合它的「适应」按钮）。
// 使用者随时可以按卡片上的 ⤢/⤡ 手动覆盖（手动选过之后就以手动为准）。
export const TREE_PACK_MIN = 800

/**
 * 樹 / 呼叫樹這種「橫向層級佈局」在窄面板時要占整行（半寬會被擠到看不清）。
 *   panelW >= TREE_PACK_MIN → 可以跟別的卡片並排（回 false）
 *   panelW <  TREE_PACK_MIN → 占整行（回 true）
 *   panelW <= 0（還沒量到寬度：第一帧或 SSR）→ 保守地先占整行，量到之後就會自動改成並排。
 *
 * 注意：這個「量到寬度」是靠 VariablesPanel 的 callback ref 觀測 .viz-body 得來的；
 * 以前寫成 useEffect([]) + ref，而「還沒跑」那一帧走的是另一棵沒有掛 ref 的子樹，
 * 於是 panelW 永遠停在 0 → 樹永遠占整行（使用者回報的「沒辦法並排」）。見該處註解。
 */
export function treeAutoWideOf(panelW: number): boolean {
  return panelW <= 0 || panelW < TREE_PACK_MIN
}

// ---- 「自動並排」用的常數與算式（v0.11.2）----
// 卡片區（.viz-main）是 CSS 的 repeat(auto-fill, minmax(L, 1fr))：
//   寬螢幕 L=360 / gap=12；@media (max-width:1440px) 時 L=300 / gap=10（見 index.css）。
// 兩欄就需要 2L+gap：732px（寬螢幕）/ 610px（窄螢幕）。
export const EDITOR_PCT_MIN = 15
export const EDITOR_PCT_MAX = 80

export function gridMinCol(viewportW: number): number {
  return viewportW <= 1440 ? 300 : 360
}

export function gridGap(viewportW: number): number {
  return viewportW <= 1440 ? 10 : 12
}

/** 卡片區要放得下「兩欄」至少要多寬（px）。「自動並排」按鈕用它算右側面板要多大。 */
export function twoColumnMinWidth(viewportW: number): number {
  return gridMinCol(viewportW) * 2 + gridGap(viewportW)
}

// 这张卡片要不要占整行：
//   1. 使用者手动按过 ⤢ / ⤡ → 以手动为准；
//   2. 没手动过 → 看 auto（树/调用树在窄面板时才占整行）；
//   3. 另外「放大超过 100%」一律占整行 —— 放大的卡片需要空间，
//      半宽的格子扣掉 zoom 的宽度补偿后会比内容还窄，固定尺寸的内容就会撑出横向卷轴。
export function isWide(layout: CardLayout, key: string, auto = false): boolean {
  const explicit = layout.wide[key]
  const base = explicit === undefined ? auto : explicit
  return base || zoomOf(layout, key) > 1
}

// 拖动排序的语义：拖到谁身上，就占谁的位置（其余的顺移）。
export function moveKeyTo(keys: string[], key: string, target: string): string[] {
  const from = keys.indexOf(key)
  const to = keys.indexOf(target)
  if (from < 0 || to < 0 || from === to) return keys
  const next = keys.slice()
  next.splice(from, 1)
  next.splice(to, 0, key)
  return next
}

// ↑ / ↓ 按钮：与相邻卡片交换（拖动的精确版，也方便键盘用户）。
export function moveKeyBy(keys: string[], key: string, dir: -1 | 1): string[] {
  const i = keys.indexOf(key)
  const j = i + dir
  if (i < 0 || j < 0 || j >= keys.length) return keys
  const next = keys.slice()
  const t = next[i]
  next[i] = next[j]
  next[j] = t
  return next
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function isNumberRecord(v: unknown): v is Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  return Object.values(v as Record<string, unknown>).every((x) => typeof x === 'number' && Number.isFinite(x))
}

function isBoolRecord(v: unknown): v is Record<string, boolean> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  return Object.values(v as Record<string, unknown>).every((x) => typeof x === 'boolean')
}

// 读存档：坏掉的内容一律当空布局（不要让一份旧存档把面板弄坏）
export function loadLayout(raw: string | null | undefined): CardLayout {
  if (!raw) return EMPTY_LAYOUT
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const order = isStringArray(o.order) ? o.order : []
    const zoom = isNumberRecord(o.zoom) ? o.zoom : {}
    const wide = isBoolRecord(o.wide) ? o.wide : {}
    const zoomClamped: Record<string, number> = {}
    for (const k of Object.keys(zoom)) zoomClamped[k] = clampZoom(zoom[k])
    return { order, zoom: zoomClamped, wide }
  } catch {
    return EMPTY_LAYOUT
  }
}

export function serializeLayout(layout: CardLayout): string {
  return JSON.stringify({ order: layout.order, zoom: layout.zoom, wide: layout.wide })
}
