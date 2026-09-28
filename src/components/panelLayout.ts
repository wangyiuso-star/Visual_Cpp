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

// 这张卡片要不要占整行：使用者自己按过 ⤢，或放大超过 100%。
// 放大的卡片占整行才有足夠空間（半寬的格子扣掉 zoom 的寬度補償後會比內容量還窄，
// 固定尺寸的內容就會撐出橫向捲軸）。
export function isWide(layout: CardLayout, key: string): boolean {
  return !!layout.wide[key] || zoomOf(layout, key) > 1
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
