import type { ScalarTypeName, Type } from './ast'

export type ScalarValue = number | string | boolean

export interface BstNode {
  id: number
  value: ScalarValue
  left: BstNode | null
  right: BstNode | null
}

export type Cell =
  | { kind: 'scalar'; type: ScalarTypeName; value: ScalarValue | null }
  | { kind: 'array'; elemType: Type; size: number; cells: Cell[] }
  | { kind: 'vector'; elemType: Type; cells: Cell[] }
  | { kind: 'stack'; elemType: Type; items: Cell[] }
  | { kind: 'queue'; elemType: Type; items: Cell[] }
  | { kind: 'pqueue'; elemType: Type; items: Cell[]; minHeap: boolean }
  | { kind: 'tree'; elemType: Type; size: number; nodes: Cell[] }
  | { kind: 'bst'; elemType: Type; root: BstNode | null; count: number; nextId: number }
  | { kind: 'set'; elemType: Type; items: Cell[] }
  | { kind: 'map'; keyType: Type; valueType: Type; entries: { key: Cell; value: Cell }[] }
  | { kind: 'umap'; keyType: Type; valueType: Type; entries: { key: Cell; value: Cell }[] }
  | { kind: 'pair'; firstType: Type; secondType: Type; first: Cell; second: Cell }
  | { kind: 'deque'; elemType: Type; items: Cell[] }
  | { kind: 'struct'; structName: string; members: { name: string; cell: Cell }[] }
  // origin：这个 ref 是谁产生的——参数（引用/数组形参）还是 range-for 的循环变量。
  // 「参数（别名）」徽章只认 param，不然循环变量会被误标成参数。
  | { kind: 'ref'; origin?: 'param' | 'loop'; target: { mem: Memory; name: string; path: number[] } }

/**
 * array / vector 的子格子。**只含可以下標的容器**：stack / queue / set 這些刻意不算 ——
 * C++ 也不允許 s[0]，要讓它報錯而不是靜默取到元素。
 * array 的 cells.length 永遠等於 size（配置時就填滿），所以呼叫端不用再分支。
 * 不是 array/vector 就回 null —— 讓「型別契約被打破」變成 tsc 的錯，而不是 undefined 的崩潰。
 */
export function asIndexable(cell: Cell): Cell[] | null {
  if (cell.kind === 'array' || cell.kind === 'vector') return cell.cells
  return null
}

/** 序列型（array/vector/stack/queue/pqueue/deque/set/tree）的元素型別；其他回 null。 */
export function elemTypeOf(cell: Cell): Type | null {
  switch (cell.kind) {
    case 'array':
    case 'vector':
    case 'stack':
    case 'queue':
    case 'pqueue':
    case 'deque':
    case 'set':
    case 'tree':
      return cell.elemType
    default:
      return null
  }
}

export interface CellRef {
  name: string
  path: number[]
}

export interface VarView {
  name: string
  cell: Cell
  scope: 'global' | 'local'
  // 这个变量是「引用参数 / 数组参数」（原来是一个 ref cell，dump 时已被解引用）。
  // 面板靠它给卡片打「参数（别名）」徽章——学生才知道 a 既是一个名字、也是别名的。
  alias?: boolean
}

// 结构共享（写时复制）核心：按路径定位 / 不可变更新，只复制改动路径、共享未改子树。
export function getAtPath(cell: Cell, path: number[]): Cell {
  let cur = cell
  for (const i of path) {
    if (cur.kind === 'array' || cur.kind === 'vector') cur = cur.cells[i]
    else if (cur.kind === 'stack' || cur.kind === 'queue' || cur.kind === 'pqueue' || cur.kind === 'deque') cur = cur.items[i]
    else if (cur.kind === 'tree') cur = cur.nodes[i]
    else if (cur.kind === 'map' || cur.kind === 'umap') cur = cur.entries[i].value
    else if (cur.kind === 'pair') cur = i === 0 ? cur.first : cur.second
    else if (cur.kind === 'struct') cur = cur.members[i].cell
    else throw new Error('getAtPath: 路径深入了 ' + cur.kind)
  }
  return cur
}

export function setAtPath(cell: Cell, path: number[], newLeaf: Cell): Cell {
  if (path.length === 0) return newLeaf
  const i = path[0]
  const rest = path.slice(1)
  if (cell.kind === 'array' || cell.kind === 'vector') {
    const cells = cell.cells.slice()
    cells[i] = setAtPath(cells[i], rest, newLeaf)
    return { ...cell, cells }
  }
  if (cell.kind === 'stack' || cell.kind === 'queue' || cell.kind === 'pqueue' || cell.kind === 'deque') {
    const items = cell.items.slice()
    items[i] = setAtPath(items[i], rest, newLeaf)
    return { ...cell, items }
  }
  if (cell.kind === 'tree') {
    const nodes = cell.nodes.slice()
    nodes[i] = setAtPath(nodes[i], rest, newLeaf)
    return { ...cell, nodes }
  }
  if (cell.kind === 'map' || cell.kind === 'umap') {
    const entries = cell.entries.slice()
    entries[i] = { ...entries[i], value: setAtPath(entries[i].value, rest, newLeaf) }
    return { ...cell, entries }
  }
  if (cell.kind === 'pair') {
    if (i === 0) return { ...cell, first: setAtPath(cell.first, rest, newLeaf) }
    return { ...cell, second: setAtPath(cell.second, rest, newLeaf) }
  }
  if (cell.kind === 'struct') {
    const members = cell.members.slice()
    members[i] = { ...members[i], cell: setAtPath(members[i].cell, rest, newLeaf) }
    return { ...cell, members }
  }
  throw new Error('setAtPath: 不支持的类型 ' + cell.kind)
}

function samePath(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export class Memory {
  vars = new Map<string, Cell>()
  order: string[] = []
  reads: CellRef[] = []
  writes: CellRef[] = []

  declare(name: string, cell: Cell): void {
    if (!this.vars.has(name)) this.order.push(name)
    this.vars.set(name, cell)
  }

  get(name: string): Cell {
    const c = this.vars.get(name)
    if (!c) throw new Error('未定义的变量 "' + name + '"')
    return c
  }

  clearAccess(): void {
    this.reads = []
    this.writes = []
  }

  logRead(name: string, path: number[] = []): void {
    if (!this.reads.some((r) => r.name === name && samePath(r.path, path))) {
      this.reads.push({ name, path })
    }
  }

  logWrite(name: string, path: number[] = []): void {
    if (!this.writes.some((r) => r.name === name && samePath(r.path, path))) {
      this.writes.push({ name, path })
    }
  }

  // 写时复制：把 name 的 path 处标量值替换为 value（只复制路径，共享其余）。
  setScalar(name: string, path: number[], value: ScalarValue): void {
    const root = this.vars.get(name)!
    const leaf = getAtPath(root, path)
    if (leaf.kind !== 'scalar') throw new Error('setScalar: 目标不是标量')
    this.vars.set(name, setAtPath(root, path, { ...leaf, value }))
  }

  // 写时复制：对 name 的 path 处容器套用 fn，返回新容器。
  updateAt(name: string, path: number[], fn: (c: Cell) => Cell): Cell {
    const root = this.vars.get(name)!
    const neu = fn(getAtPath(root, path))
    this.vars.set(name, setAtPath(root, path, neu))
    return neu
  }

  // 写时复制：把 string 的第 idx 个字符替换为 value 的首字符。
  setStringChar(name: string, path: number[], idx: number, value: ScalarValue): void {
    const root = this.vars.get(name)!
    const leaf = getAtPath(root, path)
    if (leaf.kind !== 'scalar' || leaf.type !== 'string') throw new Error('setStringChar: 目标不是 string')
    const s = (leaf.value ?? '') as string
    const ch = String(value).charAt(0)
    const ns = s.slice(0, idx) + ch + s.slice(idx + 1)
    this.vars.set(name, setAtPath(root, path, { ...leaf, value: ns }))
  }

  dump(): VarView[] {
    return this.order.map((name) => ({ name, cell: structuredClone(this.vars.get(name)!), scope: 'local' }))
  }
}
