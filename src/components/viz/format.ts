// 面板的「純顯示」工具：格式化、命中判斷、型別標籤。
// 從 VariablesPanel.tsx 抽出來（v0.10.0）—— 這些是純函式，可以直接被測試匯入，
// 不需要為了測 formatCellShort 而 import 一整個 React 元件。
import type { Cell, ScalarValue, BstNode } from '../../interpreter/memory'
import type { Type } from '../../interpreter/ast'
import { tf } from '../../i18n'

export const WIN_1D = 10
export const WIN_2D = 5
// 一次最多画几个元素。stack/queue/deque/set/map 这些「逐项列出」的视图没有窗口机制
// （数组/2D 有 WIN_1D/WIN_2D 的滑动窗口），元素一多就会一次产生上万个 DOM 节点 → 页面卡死。
// 所以这里硬性截断并说明还有多少没显示。
export const VIEW_MAX_ITEMS = 300

export function formatScalar(type: string, value: ScalarValue | null): string {
  if (value === null) return '?'
  if (type === 'char') return "'" + value + "'"
  if (type === 'string') return '"' + value + '"'
  if (type === 'bool') return value ? 'true' : 'false'
  return String(value)
}

// 容器的「一行摘要」。用在「不是纯量但必须显示」的位置：set 元素、map 的键/值、
// struct 成员、pair 成员、stack/queue/deque 的元素、数组窗口里的格子……
// 递归但有深度上限、长度上限，避免出现超长字串。
export function formatListShort(cells: Cell[], depth: number): string {
  const MAX = 8
  const parts = cells.slice(0, MAX).map((c) => formatCellShort(c, depth + 1))
  if (cells.length > MAX) parts.push('…')
  return '[' + parts.join(', ') + ']'
}

export function collectBstShorts(node: BstNode | null, elemType: Type, out: Cell[]): void {
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

export function isHit(set: Set<string>, name: string, path: number[]): boolean {
  if (set.has(name)) return true
  for (let k = 1; k <= path.length; k++) {
    if (set.has(name + '@' + path.slice(0, k).join(','))) return true
  }
  return false
}

export function exactHit(set: Set<string>, name: string, path: number[]): boolean {
  return set.has(name + '@' + path.join(','))
}

// 形状优先级：方形大块（图/树/堆/栈）靠前，横长（数组/队列/set/map）靠后
export function typeShape(t: Type): string {
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

export function cellLabel(cell: Cell): string {
  if (cell.kind === 'scalar' && cell.type === 'string') return tf('string · 长度 {0}', String(cell.value ?? '').length)
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
  if (cell.kind === 'stack') return tf('stack<{0}> · 长度 {1}', typeShape(cell.elemType), cell.items.length)
  if (cell.kind === 'queue') return tf('queue<{0}> · 长度 {1}', typeShape(cell.elemType), cell.items.length)
  if (cell.kind === 'pqueue') {
    return cell.minHeap
      ? tf('priority_queue<{0}> · 小根堆 · 长度 {1}', typeShape(cell.elemType), cell.items.length)
      : tf('priority_queue<{0}> · 大根堆 · 长度 {1}', typeShape(cell.elemType), cell.items.length)
  }
  if (cell.kind === 'tree') return tf('tree<{0}> · 节点 {1}', typeShape(cell.elemType), cell.size)
  if (cell.kind === 'bst') return tf('bst<{0}> · 节点 {1}', typeShape(cell.elemType), cell.count)
  if (cell.kind === 'set') return tf('set<{0}> · 元素 {1}', typeShape(cell.elemType), cell.items.length)
  if (cell.kind === 'map') return tf('map<{0},{1}> · 元素 {2}', typeShape(cell.keyType), typeShape(cell.valueType), cell.entries.length)
  if (cell.kind === 'umap') return tf('unordered_map<{0},{1}> · 元素 {2}', typeShape(cell.keyType), typeShape(cell.valueType), cell.entries.length)
  if (cell.kind === 'pair') return 'pair<' + typeShape(cell.firstType) + ',' + typeShape(cell.secondType) + '>'
  if (cell.kind === 'deque') return tf('deque<{0}> · 长度 {1}', typeShape(cell.elemType), cell.items.length)
  if (cell.kind === 'struct') return tf('{0} · 成员 {1}', cell.structName, cell.members.length)
  // 同 VariablesPanel：ref 應該在 dumpAll 就解引用完了
  if (cell.kind === 'ref') return tf('引用 → {0}', cell.target.name)
  return tf('vector<{0}> · 长度 {1}', typeShape(cell.elemType), cell.cells.length)
}

export function rowLen(row: Cell): number {
  if (row.kind === 'scalar') return 0
  if (row.kind === 'array') return row.size
  if (row.kind === 'vector') return row.cells.length
  return 0
}

export function cellCls(
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

