import { Memory, getAtPath } from './memory'
import type { Cell, ScalarValue, VarView, CellRef, BstNode } from './memory'
import type { Program, Stmt, Expr, VarDecl, Type, ScalarTypeName, InitExpr, FunctionDef, StructDef } from './ast'

export interface Snapshot {
  step: number
  line: number
  reads: CellRef[]
  writes: CellRef[]
  judges?: CellRef[]
  condition?: { kind: 'if' | 'while' | 'for'; text: string; result: boolean }
  vars: VarView[]
  output: string
  callTree?: CallNode
  activeCallId?: number
  error?: string
  done?: boolean
  // 自定义比较函数排序的统计（比较次数刻意做成可见的教学点，见建议书优先 3）
  sortInfo?: { name: string; n: number; comparisons: number; warned: boolean }
}

export interface CallNode {
  id: number
  label: string
  returned: boolean
  returnValue: string | null
  locals: { name: string; value: string }[]
  paramNames: string[]
  children: CallNode[]
}

export interface RunOptions {
  showCond?: { if: boolean; while: boolean; for: boolean }
  boolAsInt?: boolean
  input?: string
}

export class RuntimeError extends Error {
  line: number
  constructor(message: string, line: number) {
    super(message)
    this.line = line
    this.name = 'RuntimeError'
  }
}

interface RV {
  type: ScalarTypeName
  v: ScalarValue
  cell?: Cell
}

interface LValue {
  name: string
  path: number[]
  cell: Cell
  mem: Memory
  strIdx?: number
}

class BreakSignal {}
class ContinueSignal {}
class ReturnSignal {
  constructor(public value: RV | null, public cell?: Cell) {}
}

interface Frame {
  mem: Memory
  callId: number
}

interface Runtime {
  mem: Memory
  globals: Memory
  functions: Map<string, FunctionDef>
  stack: Frame[]
  callTree: CallNode
  activeCallId: number
  nextCallId: number
  out: string[]
  step: number
  lastLine: number
  showCond: { if: boolean; while: boolean; for: boolean }
  boolAsInt: boolean
  input: string[]
  inputPos: number
  structs: Map<string, StructDef>
  sortInfo: { name: string; n: number; comparisons: number; warned: boolean } | null
}

const MAX_STEPS = 20000

function isIntegral(t: ScalarTypeName): boolean {
  return t === 'int' || t === 'long long' || t === 'char' || t === 'bool'
}

function truthy(rv: RV): boolean {
  if (rv.type === 'bool') return rv.v === true
  if (typeof rv.v === 'number') return rv.v !== 0
  return (rv.v as string).length > 0
}

function defaultScalar(type: ScalarTypeName): ScalarValue {
  if (type === 'bool') return false
  if (type === 'char') return ''
  if (type === 'string') return ''
  return 0
}

function toStringVal(rv: RV, boolAsInt = false): string {
  if (rv.type === 'char') return rv.v as string
  if (rv.type === 'string') return rv.v as string
  if (rv.type === 'bool') return boolAsInt ? (rv.v ? '1' : '0') : rv.v ? 'true' : 'false'
  return String(rv.v)
}

function parseInputValue(raw: string): RV {
  if (/^[+-]?\d+$/.test(raw)) return { type: 'int', v: parseInt(raw, 10) }
  if (/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(raw)) return { type: 'double', v: Number(raw) }
  return { type: 'string', v: raw }
}

function num(rv: RV, line: number): number {
  if (typeof rv.v === 'number') return rv.v
  if (typeof rv.v === 'boolean') return rv.v ? 1 : 0
  if (typeof rv.v === 'string') {
    if (rv.v === '') return 0
    const n = Number(rv.v)
    if (!Number.isFinite(n)) throw new RuntimeError('字符串 "' + rv.v + '" 不能转为数字', line)
    return n
  }
  return 0
}

// ---- stoi / stol / stoll / stod / stof 用到的字串前缀解析 ----
function digitValue(ch: string): number {
  const c = ch.toLowerCase()
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48
  if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 87
  return -1
}

function isSpaceChar(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r'
}

// 照 C++ 的 stoi 语义：跳过前导空白、可选正负号，读到第一个不属于该进制的字符就停。
// 一个数字都没有 → 明确报错（对应 std::invalid_argument）。
function parseIntPrefix(raw: string, base: number, line: number, fnName: string): number {
  let i = 0
  while (i < raw.length && isSpaceChar(raw.charAt(i))) i++
  let sign = 1
  if (raw.charAt(i) === '+') i++
  else if (raw.charAt(i) === '-') {
    sign = -1
    i++
  }
  let any = false
  let acc = 0
  for (; i < raw.length; i++) {
    const d = digitValue(raw.charAt(i))
    if (d < 0 || d >= base) break
    acc = acc * base + d
    any = true
  }
  if (!any) throw new RuntimeError(fnName + '("' + raw + '") 没有可解析的数字', line)
  return sign * acc
}

// stod / stof：同样只解析合法前缀（可选正负号、数字、可选小数、可选指数）
function parseFloatPrefix(raw: string, line: number, fnName: string): number {
  let i = 0
  while (i < raw.length && isSpaceChar(raw.charAt(i))) i++
  let j = i
  if (raw.charAt(j) === '+' || raw.charAt(j) === '-') j++
  let digits = 0
  while (j < raw.length && raw.charAt(j) >= '0' && raw.charAt(j) <= '9') {
    j++
    digits++
  }
  if (raw.charAt(j) === '.') {
    j++
    while (j < raw.length && raw.charAt(j) >= '0' && raw.charAt(j) <= '9') {
      j++
      digits++
    }
  }
  if (digits === 0) throw new RuntimeError(fnName + '("' + raw + '") 没有可解析的数字', line)
  let k = j
  if (raw.charAt(k) === 'e' || raw.charAt(k) === 'E') {
    let m = k + 1
    if (raw.charAt(m) === '+' || raw.charAt(m) === '-') m++
    let ed = 0
    while (m < raw.length && raw.charAt(m) >= '0' && raw.charAt(m) <= '9') {
      m++
      ed++
    }
    if (ed > 0) j = m
  }
  return Number(raw.slice(i, j))
}

function toIndex(rv: RV, line: number): number {
  const n = num(rv, line)
  if (!Number.isFinite(n)) throw new RuntimeError('非法的下标', line)
  return Math.trunc(n)
}

function eq(l: RV, r: RV): boolean {
  if (typeof l.v === 'string' || typeof r.v === 'string') return String(l.v) === String(r.v)
  return Number(l.v) === Number(r.v)
}

function cmp(l: RV, r: RV): number {
  const a: string | number = typeof l.v === 'string' ? l.v : Number(l.v)
  const b: string | number = typeof r.v === 'string' ? r.v : Number(r.v)
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function coerceTo(type: ScalarTypeName, rv: RV, line: number): ScalarValue {
  if (type === 'string') return toStringVal(rv)
  if (type === 'char') {
    if (rv.type === 'char') return rv.v as string
    return String.fromCharCode(num(rv, line))
  }
  if (type === 'bool') return truthy(rv)
  if (type === 'double' || type === 'float') return num(rv, line)
  return Math.trunc(num(rv, line))
}

function applyBinary(op: string, l: RV, r: RV, line: number): RV {
  switch (op) {
    case '+':
      if (l.type === 'string' || r.type === 'string') {
        return { type: 'string', v: toStringVal(l) + toStringVal(r) }
      }
      return numeric(op, l, r, line, (a, b) => a + b)
    case '-':
      return numeric(op, l, r, line, (a, b) => a - b)
    case '*':
      return numeric(op, l, r, line, (a, b) => a * b)
    case '/': {
      const a = num(l, line)
      const b = num(r, line)
      if (b === 0) throw new RuntimeError('除数为 0', line)
      const isInt = isIntegral(l.type) && isIntegral(r.type)
      const res = isInt ? Math.trunc(a / b) : a / b
      return { type: isInt ? 'int' : 'double', v: res }
    }
    case '%': {
      const a = num(l, line)
      const b = num(r, line)
      if (b === 0) throw new RuntimeError('取模除数为 0', line)
      return { type: 'int', v: Math.trunc(a) % Math.trunc(b) }
    }
    case '==':
      return { type: 'bool', v: eq(l, r) }
    case '!=':
      return { type: 'bool', v: !eq(l, r) }
    case '<':
      return { type: 'bool', v: cmp(l, r) < 0 }
    case '<=':
      return { type: 'bool', v: cmp(l, r) <= 0 }
    case '>':
      return { type: 'bool', v: cmp(l, r) > 0 }
    case '>=':
      return { type: 'bool', v: cmp(l, r) >= 0 }
    default:
      throw new RuntimeError('不支持的操作符 "' + op + '"', line)
  }
}

function numeric(
  op: string,
  l: RV,
  r: RV,
  line: number,
  fn: (a: number, b: number) => number,
): RV {
  const a = num(l, line)
  const b = num(r, line)
  const t: ScalarTypeName =
    l.type === 'double' || l.type === 'float' || r.type === 'double' || r.type === 'float' ? 'double' : 'int'
  return { type: t, v: fn(a, b) }
}

function combineAssign(op: string, cur: RV, value: RV, line: number): RV {
  if (op === '=') return value
  return applyBinary(op.slice(0, -1), cur, value, line)
}

function formatExpr(expr: Expr): string {
  switch (expr.kind) {
    case 'literal':
      if (expr.litType === 'string') return '"' + String(expr.value) + '"'
      if (expr.litType === 'char') return "'" + String(expr.value) + "'"
      if (expr.litType === 'bool') return expr.value ? 'true' : 'false'
      return String(expr.value)
    case 'ident':
      return expr.name
    case 'index':
      return formatExpr(expr.target) + '[' + formatExpr(expr.index) + ']'
    case 'binary':
      return formatExpr(expr.left) + ' ' + expr.op + ' ' + formatExpr(expr.right)
    case 'unary':
      return expr.op === '!' ? '!' + formatExpr(expr.operand) : '-' + formatExpr(expr.operand)
    case 'assign':
      return formatExpr(expr.target) + ' ' + expr.op + ' ' + formatExpr(expr.value)
    case 'update':
      return expr.prefix ? expr.op + formatExpr(expr.target) : formatExpr(expr.target) + expr.op
    case 'call':
      return expr.name + '(' + expr.args.map(formatExpr).join(', ') + ')'
    case 'method_call':
      return formatExpr(expr.object) + '.' + expr.method + '(' + expr.args.map(formatExpr).join(', ') + ')'
    default:
      return '?'
  }
}

function scalarName(elemType: Type, line: number): ScalarTypeName {
  if (elemType.kind !== 'scalar') throw new RuntimeError('该容器暂只支持标量元素', line)
  return elemType.name
}

function scalarCmp(a: ScalarValue, b: ScalarValue): number {
  if (typeof a === 'string' || typeof b === 'string') {
    const sa = String(a)
    const sb = String(b)
    return sa < sb ? -1 : sa > sb ? 1 : 0
  }
  const na = Number(a)
  const nb = Number(b)
  return na < nb ? -1 : na > nb ? 1 : 0
}

function scalarCell(elemType: Type, rv: RV, line: number): Cell {
  if (elemType.kind !== 'scalar') throw new RuntimeError('该容器暂只支持标量元素', line)
  return { kind: 'scalar', type: elemType.name, value: coerceTo(elemType.name, rv, line) }
}

function elemCell(elemType: Type, rv: RV, line: number): Cell {
  if (rv.cell) return rv.cell
  return scalarCell(elemType, rv, line)
}

function* buildStructFromList(rt: Runtime, elemType: Type, items: Expr[], line: number): Generator<Snapshot, Cell> {
  if (elemType.kind !== 'struct') throw new RuntimeError('初始化列表只支持 struct 元素', line)
  const def = rt.structs.get(elemType.name)
  if (!def) throw new RuntimeError('未定义的结构体 ' + elemType.name, line)
  const members = []
  for (let i = 0; i < def.members.length; i++) {
    const m = def.members[i]
    if (i < items.length && m.type.kind === 'scalar') {
      const rv = yield* evalExpr(rt, items[i])
      members.push({ name: m.name, cell: { kind: 'scalar', type: m.type.name, value: coerceTo(m.type.name, rv, line) } })
    } else {
      members.push({ name: m.name, cell: allocFromType(m.type, [], false, rt.structs) })
    }
  }
  return { kind: 'struct', structName: elemType.name, members }
}

function* buildElemCell(rt: Runtime, elemType: Type, argExpr: Expr, line: number): Generator<Snapshot, Cell> {
  if (argExpr.kind === 'init_list') {
    return yield* buildStructFromList(rt, elemType, argExpr.items, line)
  }
  if (argExpr.kind === 'ident' || argExpr.kind === 'index' || argExpr.kind === 'member') {
    const lv = yield* resolveTarget(rt, argExpr)
    if (lv.cell.kind === 'scalar') {
      const rv: RV = { type: lv.cell.type, v: lv.cell.value === null ? defaultScalar(lv.cell.type) : lv.cell.value }
      return scalarCell(elemType, rv, line)
    }
    return lv.cell
  }
  const v = yield* evalExpr(rt, argExpr)
  return elemCell(elemType, v, line)
}

function cellToRV(cell: Cell, line: number): RV {
  if (cell.kind === 'scalar') return { type: cell.type, v: cell.value === null ? defaultScalar(cell.type) : cell.value }
  if (cell.kind === 'pair') return { type: 'int', v: 0, cell }
  throw new RuntimeError('内部错误：非标量元素', line)
}

function cellScalar(cell: Cell): ScalarValue {
  if (cell.kind !== 'scalar') throw new Error('cellScalar: 非标量')
  return cell.value === null ? defaultScalar(cell.type) : cell.value
}

function setInsert(items: Cell[], item: Cell): { items: Cell[]; index: number } {
  const v = cellScalar(item)
  let i = 0
  while (i < items.length && scalarCmp(cellScalar(items[i]), v) < 0) i++
  if (i < items.length && scalarCmp(cellScalar(items[i]), v) === 0) return { items, index: i }
  const arr = items.slice()
  arr.splice(i, 0, item)
  return { items: arr, index: i }
}

function setErase(items: Cell[], value: ScalarValue): { items: Cell[]; index: number } {
  const i = items.findIndex((c) => scalarCmp(cellScalar(c), value) === 0)
  if (i < 0) return { items, index: -1 }
  const arr = items.slice()
  arr.splice(i, 1)
  return { items: arr, index: i }
}

function entryIndex(entries: { key: Cell; value: Cell }[], key: ScalarValue): number {
  return entries.findIndex((e) => scalarCmp(cellScalar(e.key), key) === 0)
}

function entryInsert(entries: { key: Cell; value: Cell }[], keyCell: Cell, valueCell: Cell, sorted: boolean): { entries: { key: Cell; value: Cell }[]; index: number } {
  if (!sorted) return { entries: [...entries, { key: keyCell, value: valueCell }], index: entries.length }
  const key = cellScalar(keyCell)
  let i = 0
  while (i < entries.length && scalarCmp(cellScalar(entries[i].key), key) < 0) i++
  const arr = entries.slice()
  arr.splice(i, 0, { key: keyCell, value: valueCell })
  return { entries: arr, index: i }
}

function heapNum(c: Cell): number {
  if (c.kind === 'pair') return heapNum(c.first)
  if (c.kind !== 'scalar') return 0
  const v = c.value
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  return 0
}

function heapBetter(a: Cell, b: Cell, minHeap: boolean): boolean {
  return minHeap ? heapNum(a) < heapNum(b) : heapNum(a) > heapNum(b)
}

function heapPush(items: Cell[], minHeap: boolean, item: Cell): Cell[] {
  const arr = items.slice()
  arr.push(item)
  let i = arr.length - 1
  while (i > 0) {
    const p = Math.floor((i - 1) / 2)
    if (heapBetter(arr[i], arr[p], minHeap)) {
      const tmp = arr[i]
      arr[i] = arr[p]
      arr[p] = tmp
      i = p
    } else {
      break
    }
  }
  return arr
}

function heapPop(items: Cell[], minHeap: boolean): Cell[] {
  if (items.length === 0) return items
  const arr = items.slice()
  const last = arr.pop()!
  if (arr.length === 0) return arr
  arr[0] = last
  let i = 0
  while (true) {
    const l = 2 * i + 1
    const r = 2 * i + 2
    let best = i
    if (l < arr.length && heapBetter(arr[l], arr[best], minHeap)) best = l
    if (r < arr.length && heapBetter(arr[r], arr[best], minHeap)) best = r
    if (best === i) break
    const tmp = arr[i]
    arr[i] = arr[best]
    arr[best] = tmp
    i = best
  }
  return arr
}

function insertBst(root: BstNode | null, id: number, value: ScalarValue): BstNode {
  if (!root) return { id, value, left: null, right: null }
  if (scalarCmp(value, root.value) < 0) return { ...root, left: insertBst(root.left, id, value) }
  return { ...root, right: insertBst(root.right, id, value) }
}

function findBst(root: BstNode | null, value: ScalarValue): BstNode | null {
  let cur = root
  while (cur) {
    const c = scalarCmp(value, cur.value)
    if (c === 0) return cur
    cur = c < 0 ? cur.left : cur.right
  }
  return null
}

function allocStruct(rt: Runtime, structName: string, line: number): Cell {
  const def = rt.structs.get(structName)
  if (!def) throw new RuntimeError('未定义的结构体 ' + structName, line)
  const members = def.members.map((m) => ({
    name: m.name,
    cell: m.type.kind === 'scalar' ? { kind: 'scalar', type: m.type.name, value: null } : allocFromType(m.type, [], true, rt.structs),
  }))
  return { kind: 'struct', structName, members }
}

function* applyStructInit(rt: Runtime, cell: Cell, init: InitExpr, line: number): Generator<Snapshot> {
  if (cell.kind !== 'struct' || init.kind !== 'list') return
  const n = Math.min(cell.members.length, init.items.length)
  for (let i = 0; i < n; i++) {
    const item = init.items[i]
    if (item.kind !== 'expr') continue
    const rv = yield* evalExpr(rt, item.expr)
    const m = cell.members[i]
    if (m.cell.kind === 'scalar') {
      m.cell = { kind: 'scalar', type: m.cell.type, value: coerceTo(m.cell.type, rv, line) }
    }
  }
}

function allocFromType(type: Type, sizes: number[], defaultFill: boolean, structs?: Map<string, StructDef>): Cell {
  if (type.kind === 'scalar') {
    return { kind: 'scalar', type: type.name, value: defaultFill ? defaultScalar(type.name) : null }
  }
  if (type.kind === 'array') {
    const n = sizes[0] ?? 0
    const cells: Cell[] = []
    for (let i = 0; i < n; i++) cells.push(allocFromType(type.elem, sizes.slice(1), defaultFill, structs))
    return { kind: 'array', elemType: type.elem, size: n, cells }
  }
  if (type.kind === 'struct') {
    const def = structs?.get(type.name)
    if (!def) throw new Error('未定义的结构体 ' + type.name)
    return { kind: 'struct', structName: type.name, members: def.members.map((m) => ({ name: m.name, cell: allocFromType(m.type, [], false, structs) })) }
  }
  if (type.kind === 'stack') return { kind: 'stack', elemType: type.elem, items: [] }
  if (type.kind === 'queue') return { kind: 'queue', elemType: type.elem, items: [] }
  if (type.kind === 'pqueue') return { kind: 'pqueue', elemType: type.elem, items: [], minHeap: type.minHeap }
  if (type.kind === 'tree') return { kind: 'tree', elemType: type.elem, size: 0, nodes: [{ kind: 'scalar', type: 'int', value: null }] }
  if (type.kind === 'bst') return { kind: 'bst', elemType: type.elem, root: null, count: 0, nextId: 0 }
  if (type.kind === 'set') return { kind: 'set', elemType: type.elem, items: [] }
  if (type.kind === 'map') return { kind: 'map', keyType: type.key, valueType: type.value, entries: [] }
  if (type.kind === 'umap') return { kind: 'umap', keyType: type.key, valueType: type.value, entries: [] }
  if (type.kind === 'pair') return { kind: 'pair', firstType: type.first, secondType: type.second, first: allocFromType(type.first, [], false, structs), second: allocFromType(type.second, [], false, structs) }
  if (type.kind === 'deque') return { kind: 'deque', elemType: type.elem, items: [] }
  return { kind: 'vector', elemType: type.elem, cells: [] }
}

function allocVector(elemType: Type, n: number, fill?: ScalarValue, structs?: Map<string, StructDef>): Cell {
  const cells: Cell[] = []
  for (let i = 0; i < n; i++) {
    if (elemType.kind === 'scalar') {
      cells.push({ kind: 'scalar', type: elemType.name, value: fill !== undefined ? fill : defaultScalar(elemType.name) })
    } else {
      cells.push(allocFromType(elemType, [], true, structs))
    }
  }
  return { kind: 'vector', elemType, cells }
}

function allocTree(elemType: Type, n: number, line: number, structs?: Map<string, StructDef>): Cell {
  if (elemType.kind !== 'scalar' && elemType.kind !== 'struct') throw new RuntimeError('tree 只支持标量或 struct 元素', line)
  const mk = (): Cell => (elemType.kind === 'scalar' ? { kind: 'scalar', type: elemType.name, value: null } : allocFromType(elemType, [], false, structs))
  const nodes: Cell[] = [mk()]
  for (let i = 0; i < n; i++) nodes.push(mk())
  return { kind: 'tree', elemType, size: n, nodes }
}

function fillAllScalars(cell: Cell, rv: RV, line: number): void {
  if (cell.kind === 'scalar') {
    cell.value = coerceTo(cell.type, rv, line)
    return
  }
  if (cell.kind === 'array' || cell.kind === 'vector') {
    for (const sub of cell.cells) fillAllScalars(sub, rv, line)
  }
}

function getVar(rt: Runtime, name: string, line: number): { cell: Cell; mem: Memory; name: string; path: number[] } {
  if (rt.mem.vars.has(name)) {
    const c = rt.mem.vars.get(name)!
    if (c.kind === 'ref') return { cell: getAtPath(c.target.mem.vars.get(c.target.name)!, c.target.path), mem: c.target.mem, name: c.target.name, path: c.target.path }
    return { cell: c, mem: rt.mem, name, path: [] }
  }
  if (rt.globals.vars.has(name)) {
    const c = rt.globals.vars.get(name)!
    if (c.kind === 'ref') return { cell: getAtPath(c.target.mem.vars.get(c.target.name)!, c.target.path), mem: c.target.mem, name: c.target.name, path: c.target.path }
    return { cell: c, mem: rt.globals, name, path: [] }
  }
  throw new RuntimeError('未定义的变量 "' + name + '"', line)
}

function findCallNode(root: CallNode, id: number): CallNode | null {
  if (root.id === id) return root
  for (const c of root.children) {
    const r = findCallNode(c, id)
    if (r) return r
  }
  return null
}

function callPath(root: CallNode, id: number): number[] | null {
  if (root.id === id) return []
  for (let i = 0; i < root.children.length; i++) {
    const p = callPath(root.children[i], id)
    if (p) return [i, ...p]
  }
  return null
}

function updateCallAt(root: CallNode, path: number[], fn: (n: CallNode) => CallNode): CallNode {
  if (path.length === 0) return fn(root)
  const i = path[0]
  const children = root.children.slice()
  children[i] = updateCallAt(children[i], path.slice(1), fn)
  return { ...root, children }
}

// 调用树已不可变（写时复制），快照直接共享引用，无需深拷贝。
function cloneCallTree(root: CallNode): CallNode {
  return root
}

function dumpAll(rt: Runtime): VarView[] {
  const out: VarView[] = []
  const seen = new Set<string>()
  for (const name of rt.mem.order) {
    if (name.indexOf('__sort_') === 0) continue // 排序比较用的临时变量，不展示
    seen.add(name)
    let cell = rt.mem.vars.get(name)!
    // ref cell 只会来自「引用/数组形参」或「range-for 的 auto& 循环变量」。
    // dump 会解引用（面板显示真实数据），但要把「这是参数别名」记下来给面板打徽章——
    // 循环变量不是参数，所以只认 origin === 'param'。
    const alias = cell.kind === 'ref' && cell.origin === 'param'
    if (cell.kind === 'ref') cell = getAtPath(cell.target.mem.vars.get(cell.target.name)!, cell.target.path)
    out.push({ name, cell, scope: 'local', alias })
  }
  for (const name of rt.globals.order) {
    if (name.indexOf('__sort_') === 0) continue
    if (seen.has(name)) continue
    let cell = rt.globals.vars.get(name)!
    if (cell.kind === 'ref') cell = getAtPath(cell.target.mem.vars.get(cell.target.name)!, cell.target.path)
    out.push({ name, cell, scope: 'global' })
  }
  return out
}

function formatCellValue(cell: Cell): string {
  if (cell.kind !== 'scalar') return '<' + cell.kind + '>'
  const v = cell.value
  if (v === null) return '?'
  if (cell.type === 'char') return "'" + v + "'"
  if (cell.type === 'string') return '"' + v + '"'
  if (cell.type === 'bool') return v ? 'true' : 'false'
  return String(v)
}

function collectLocals(mem: Memory, exclude?: Set<string>): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = []
  for (const name of mem.order) {
    if (name.indexOf('__sort_') === 0) continue
    if (exclude && exclude.has(name)) continue
    const cell = mem.vars.get(name)!
    if (cell.kind === 'scalar') out.push({ name, value: formatCellValue(cell) })
  }
  return out
}

function updateActiveLocals(rt: Runtime): void {
  const path = callPath(rt.callTree, rt.activeCallId)
  if (!path) return
  rt.callTree = updateCallAt(rt.callTree, path, (n) => ({ ...n, locals: collectLocals(rt.mem, new Set(n.paramNames)) }))
}

function* mark(rt: Runtime, line: number): Generator<Snapshot> {
  rt.step++
  if (rt.step > MAX_STEPS) throw new RuntimeError('执行步数超过 ' + MAX_STEPS + '（疑似死循环或递归过深）', line)
  rt.lastLine = line
  updateActiveLocals(rt)
  const snap: Snapshot = {
    step: rt.step,
    line,
    reads: rt.mem.reads.slice(),
    writes: rt.mem.writes.slice(),
    vars: dumpAll(rt),
    output: rt.out.join(''),
    callTree: cloneCallTree(rt.callTree),
    activeCallId: rt.activeCallId,
    sortInfo: rt.sortInfo ? { ...rt.sortInfo } : undefined,
  }
  rt.mem.clearAccess()
  yield snap
}

function* markCondition(rt: Runtime, line: number, cond: Expr, result: boolean, kind: 'if' | 'while' | 'for'): Generator<Snapshot> {
  rt.step++
  if (rt.step > MAX_STEPS) throw new RuntimeError('执行步数超过 ' + MAX_STEPS + '（疑似死循环或递归过深）', line)
  rt.lastLine = line
  updateActiveLocals(rt)
  const judges: CellRef[] = []
  const seen = new Set<string>()
  for (const r of rt.mem.reads.concat(rt.mem.writes)) {
    const key = r.name + '@' + r.path.join(',')
    if (!seen.has(key)) {
      seen.add(key)
      judges.push(r)
    }
  }
  const snap: Snapshot = {
    step: rt.step,
    line,
    reads: [],
    writes: [],
    judges,
    condition: { kind, text: formatExpr(cond), result },
    sortInfo: rt.sortInfo ? { ...rt.sortInfo } : undefined,
    vars: dumpAll(rt),
    output: rt.out.join(''),
    callTree: cloneCallTree(rt.callTree),
    activeCallId: rt.activeCallId,
  }
  rt.mem.clearAccess()
  yield snap
}

// 调用用户自定义比较函数 cmp(a, b)：true 表示 a 应排在 b 前面。
// 做法是合成一个 call 表达式复用现有的函数调用机制——参数绑定、调用树、步进全部一致。
function* callComparator(
  rt: Runtime,
  fnName: string,
  a: Cell,
  b: Cell,
  line: number,
): Generator<Snapshot, boolean> {
  // 把两个待比较元素挂到当前帧的两个隐藏变量上，再合成 cmp(__sort_a, __sort_b) 调用。
  // 这样实参走的是「和手写调用完全相同」的绑定路径，标量 / struct / pair 元素都能比较
  //（若用 literal 就只能传标量，C711 那种「按关联数据排序」就做不了）。
  rt.mem.declare('__sort_a', a)
  rt.mem.declare('__sort_b', b)
  const res = yield* evalExpr(rt, {
    kind: 'call',
    line,
    name: fnName,
    args: [
      { kind: 'ident', line, name: '__sort_a' },
      { kind: 'ident', line, name: '__sort_b' },
    ],
  })
  return truthy(res)
}

// 手写自底向上归并排序：稳定（相等元素保持原顺序），比较时 yield* 调用用户 cmp。
// 刻意不用 Array.prototype.sort —— 它不保证稳定，多关键字示范会出现无法解释的顺序抖动。
function* stableSortWithCmp(
  rt: Runtime,
  cells: Cell[],
  cmpName: string,
  line: number,
  stats: { comparisons: number; warned: boolean },
  onProgress?: (arr: Cell[]) => void,
): Generator<Snapshot, Cell[]> {
  const arr = cells.slice()
  const n = arr.length
  const buf: Cell[] = new Array(n)
  for (let width = 1; width < n; width *= 2) {
    for (let lo = 0; lo < n; lo += 2 * width) {
      const mid = Math.min(lo + width, n)
      const hi = Math.min(lo + 2 * width, n)
      let i = lo
      let j = mid
      let k = lo
      while (i < mid && j < hi) {
        stats.comparisons++
        // 先比右侧：只有 cmp(arr[j], arr[i]) 为真才先取右侧 → 相等时保留左侧，因而稳定
        const takeRight = yield* callComparator(rt, cmpName, arr[j], arr[i], line)
        if (takeRight) buf[k++] = arr[j++]
        else buf[k++] = arr[i++]
      }
      while (i < mid) buf[k++] = arr[i++]
      while (j < hi) buf[k++] = arr[j++]
      for (let t = lo; t < hi; t++) arr[t] = buf[t]
      // 把当前进展写回 memory，让学生在看比较的同时看到数组逐步有序
      if (onProgress) onProgress(arr)
    }
  }
  // 严格弱序检查：排好之后，不应出现「后一个元素排在前一个前面」。
  // 这能稳稳抓到初学者最常犯的错（cmp 写成 a <= b、或恒返回 true），且不污染展示用的比较次数。
  for (let i = 0; i + 1 < n; i++) {
    if (yield* callComparator(rt, cmpName, arr[i + 1], arr[i], line)) {
      stats.warned = true
      break
    }
  }
  return arr
}

// range-for 的容器 → 元素列表 + 元素类型 + 取引用的索引基准 + 能否写回
interface RangeSeq {
  elems: Cell[]
  elemType: Type
  refBase: number
  canRef: boolean
}

function bstInOrder(root: BstNode | null, elemType: Type, out: Cell[]): void {
  if (!root) return
  bstInOrder(root.left, elemType, out)
  out.push({ kind: 'scalar', type: elemType.kind === 'scalar' ? elemType.name : 'int', value: root.value })
  bstInOrder(root.right, elemType, out)
}

// 可迭代的容器（照 C++ 的 begin/end 语义）：数组/vector/deque/set/map/string，
// 另外 tree（本项目自定义，1 基数组）与 bst（中序遍历＝升序）也顺带支持。
// stack / queue / priority_queue 在 C++ 里没有 begin/end → 明确报错。
function rangeForSequence(cell: Cell, line: number): RangeSeq {
  switch (cell.kind) {
    case 'array':
    case 'vector':
      return { elems: cell.cells, elemType: cell.elemType, refBase: 0, canRef: true }
    case 'deque':
      return { elems: cell.items, elemType: cell.elemType, refBase: 0, canRef: true }
    case 'set':
      // set 的元素是排序去重的键，C++ 里也是 const，不给 auto& 写
      return { elems: cell.items, elemType: cell.elemType, refBase: 0, canRef: false }
    case 'tree':
      // 数组式完全二叉树，1 基下标：nodes[0] 是占位，真实节点是 nodes[1..n]
      return { elems: cell.nodes.slice(1), elemType: cell.elemType, refBase: 1, canRef: true }
    case 'bst': {
      const out: Cell[] = []
      bstInOrder(cell.root, cell.elemType, out)
      return { elems: out, elemType: cell.elemType, refBase: 0, canRef: false }
    }
    case 'map':
    case 'umap': {
      const elemType: Type = { kind: 'pair', first: cell.keyType, second: cell.valueType }
      const elems: Cell[] = cell.entries.map((e) => ({
        kind: 'pair',
        firstType: cell.keyType,
        secondType: cell.valueType,
        first: e.key,
        second: e.value,
      }))
      return { elems, elemType, refBase: 0, canRef: false }
    }
    case 'scalar':
      if (cell.type === 'string') {
        const s = (cell.value ?? '') as string
        const elems: Cell[] = []
        for (let i = 0; i < s.length; i++) elems.push({ kind: 'scalar', type: 'char', value: s.charAt(i) })
        return { elems, elemType: { kind: 'scalar', name: 'char' }, refBase: 0, canRef: false }
      }
      throw new RuntimeError('range-for 不支持迭代 ' + cell.type + ' 标量', line)
    default:
      throw new RuntimeError(
        'range-for 不支持迭代 ' + cell.kind + '（stack / queue / priority_queue 在 C++ 里没有 begin/end）',
        line,
      )
  }
}

function* resolveTarget(rt: Runtime, expr: Expr, forWrite = false): Generator<Snapshot, LValue> {
  if (expr.kind === 'ident') {
    const r = getVar(rt, expr.name, expr.line)
    return { name: r.name, path: r.path, cell: r.cell, mem: r.mem }
  }
  if (expr.kind === 'index') {
    const parent = yield* resolveTarget(rt, expr.target, forWrite)
    if (parent.cell.kind === 'scalar' && parent.cell.type === 'string') {
      const idx = toIndex(yield* evalExpr(rt, expr.index), expr.line)
      const s = (parent.cell.value ?? '') as string
      if (idx < 0 || idx >= s.length) throw new RuntimeError('下标 ' + idx + ' 越界（长度 ' + s.length + '）', expr.line)
      return { name: parent.name, path: parent.path, cell: { kind: 'scalar', type: 'char', value: s[idx] }, mem: parent.mem, strIdx: idx }
    }
    if (parent.cell.kind === 'scalar') throw new RuntimeError('该变量不是容器，不能下标访问', expr.line)
    if (parent.cell.kind === 'map' || parent.cell.kind === 'umap') {
      const keyTypeName = scalarName(parent.cell.keyType, expr.line)
      const key = coerceTo(keyTypeName, yield* evalExpr(rt, expr.index), expr.line)
      let idx = entryIndex(parent.cell.entries, key)
      if (idx < 0 && forWrite) {
        const valueTypeName = scalarName(parent.cell.valueType, expr.line)
        const keyCell: Cell = { kind: 'scalar', type: keyTypeName, value: key }
        const valueCell: Cell = { kind: 'scalar', type: valueTypeName, value: null }
        const r = entryInsert(parent.cell.entries, keyCell, valueCell, parent.cell.kind === 'map')
        parent.mem.updateAt(parent.name, parent.path, (cc) => (cc.kind === 'map' || cc.kind === 'umap' ? { ...cc, entries: r.entries } : cc))
        return { name: parent.name, path: parent.path.concat(r.index), cell: r.entries[r.index].value, mem: parent.mem }
      }
      if (idx < 0) {
        const valueTypeName = scalarName(parent.cell.valueType, expr.line)
        const def: Cell = { kind: 'scalar', type: valueTypeName, value: null }
        return { name: parent.name, path: parent.path.concat(-1), cell: def, mem: parent.mem }
      }
      return { name: parent.name, path: parent.path.concat(idx), cell: parent.cell.entries[idx].value, mem: parent.mem }
    }
    const idx = toIndex(yield* evalExpr(rt, expr.index), expr.line)
    if (parent.cell.kind === 'tree') {
      if (idx < 1 || idx > parent.cell.size) throw new RuntimeError('tree 下标 ' + idx + ' 越界（范围 1..' + parent.cell.size + '）', expr.line)
      return { name: parent.name, path: parent.path.concat(idx), cell: parent.cell.nodes[idx], mem: parent.mem }
    }
    const len = parent.cell.kind === 'array' ? parent.cell.size : parent.cell.cells.length
    if (idx < 0 || idx >= len) throw new RuntimeError('下标 ' + idx + ' 越界（长度 ' + len + '）', expr.line)
    return { name: parent.name, path: parent.path.concat(idx), cell: parent.cell.cells[idx], mem: parent.mem }
  }
  if (expr.kind === 'member') {
    const obj = yield* resolveTarget(rt, expr.object, forWrite)
    if (obj.cell.kind === 'pair') {
      const idx = expr.field === 'first' ? 0 : 1
      return { name: obj.name, path: obj.path.concat(idx), cell: expr.field === 'first' ? obj.cell.first : obj.cell.second, mem: obj.mem }
    }
    if (obj.cell.kind === 'struct') {
      const idx = obj.cell.members.findIndex((m) => m.name === expr.field)
      if (idx < 0) throw new RuntimeError('struct 没有成员 "' + expr.field + '"', expr.line)
      return { name: obj.name, path: obj.path.concat(idx), cell: obj.cell.members[idx].cell, mem: obj.mem }
    }
    throw new RuntimeError('成员访问需要 pair 或 struct 类型', expr.line)
  }
  throw new RuntimeError('非法的下标访问', expr.line)
}

function* evalExpr(rt: Runtime, expr: Expr): Generator<Snapshot, RV> {
  switch (expr.kind) {
    case 'literal':
      return { type: expr.litType, v: expr.value as ScalarValue }

    case 'ident': {
      const lv = yield* resolveTarget(rt, expr)
      if (lv.cell.kind !== 'scalar') throw new RuntimeError('变量 "' + expr.name + '" 是容器，不能作为标量使用', expr.line)
      rt.mem.logRead(lv.name, lv.path)
      return { type: lv.cell.type, v: lv.cell.value === null ? defaultScalar(lv.cell.type) : lv.cell.value }
    }

    case 'index': {
      const lv = yield* resolveTarget(rt, expr)
      if (lv.cell.kind !== 'scalar') throw new RuntimeError('不能把子容器当作标量读取', expr.line)
      rt.mem.logRead(lv.name, lv.strIdx !== undefined ? lv.path.concat(lv.strIdx) : lv.path)
      return { type: lv.cell.type, v: lv.cell.value === null ? defaultScalar(lv.cell.type) : lv.cell.value }
    }

    case 'binary': {
      if (expr.op === '&&') {
        const l = yield* evalExpr(rt, expr.left)
        if (!truthy(l)) return { type: 'bool', v: false }
        const r = yield* evalExpr(rt, expr.right)
        return { type: 'bool', v: truthy(r) }
      }
      if (expr.op === '||') {
        const l = yield* evalExpr(rt, expr.left)
        if (truthy(l)) return { type: 'bool', v: true }
        const r = yield* evalExpr(rt, expr.right)
        return { type: 'bool', v: truthy(r) }
      }
      const l = yield* evalExpr(rt, expr.left)
      const r = yield* evalExpr(rt, expr.right)
      return applyBinary(expr.op, l, r, expr.line)
    }

    case 'unary': {
      const o = yield* evalExpr(rt, expr.operand)
      if (expr.op === '!') return { type: 'bool', v: !truthy(o) }
      const t: ScalarTypeName = o.type === 'double' || o.type === 'float' ? 'double' : o.type
      return { type: t, v: -num(o, expr.line) }
    }

    case 'assign':
      return yield* execAssign(rt, expr)

    case 'update':
      return yield* execUpdate(rt, expr)

    case 'call':
      return yield* execCall(rt, expr)

    case 'method_call':
      return yield* execMethodCall(rt, expr)

    case 'member': {
      if (expr.object.kind === 'call' || expr.object.kind === 'method_call') {
        const rv = yield* evalExpr(rt, expr.object)
        if (!rv.cell || rv.cell.kind !== 'pair') throw new RuntimeError('成员访问需要 pair 类型', expr.line)
        const mem = expr.field === 'first' ? rv.cell.first : rv.cell.second
        if (mem.kind !== 'scalar') throw new RuntimeError('成员不是标量', expr.line)
        return { type: mem.type, v: mem.value === null ? defaultScalar(mem.type) : mem.value }
      }
      const lv = yield* resolveTarget(rt, expr)
      if (lv.cell.kind !== 'scalar') throw new RuntimeError('成员不是标量', expr.line)
      rt.mem.logRead(lv.name, lv.path)
      return { type: lv.cell.type, v: lv.cell.value === null ? defaultScalar(lv.cell.type) : lv.cell.value }
    }

    case 'container_ctor': {
      if (expr.type.kind !== 'vector') throw new RuntimeError('暂只支持 vector 构造函数表达式', expr.line)
      const n = Math.max(0, toIndex(yield* evalExpr(rt, expr.size), expr.line))
      const elem = expr.type.elem
      let cell: Cell
      if (expr.fill && elem.kind === 'scalar') {
        const f = coerceTo(elem.name, yield* evalExpr(rt, expr.fill), expr.line)
        cell = allocVector(elem, n, f, rt.structs)
      } else if (expr.fill) {
        const frv = yield* evalExpr(rt, expr.fill)
        const template = frv.cell ?? allocFromType(elem, [], true, rt.structs)
        const cells: Cell[] = []
        for (let i = 0; i < n; i++) cells.push(template)
        cell = { kind: 'vector', elemType: elem, cells }
      } else {
        cell = allocVector(elem, n, undefined, rt.structs)
      }
      return { type: 'int', v: 0, cell }
    }

    default:
      throw new RuntimeError('未实现的表达式', expr.line)
  }
}

function* evalReturnValue(rt: Runtime, expr: Expr | undefined): Generator<Snapshot, { rv: RV | null; cell: Cell | null }> {
  if (!expr) return { rv: null, cell: null }
  if (expr.kind === 'ident' || expr.kind === 'index' || expr.kind === 'member') {
    const lv = yield* resolveTarget(rt, expr)
    if (lv.cell.kind === 'scalar') {
      return { rv: { type: lv.cell.type, v: lv.cell.value === null ? defaultScalar(lv.cell.type) : lv.cell.value }, cell: null }
    }
    return { rv: null, cell: lv.cell }
  }
  const rv = yield* evalExpr(rt, expr)
  return { rv, cell: rv.cell ?? null }
}

function* execAssign(rt: Runtime, expr: Expr): Generator<Snapshot, RV> {
  const value = yield* evalExpr(rt, expr.value)
  const lv = yield* resolveTarget(rt, expr.target, true)
  if (lv.cell.kind !== 'scalar') {
    if (value.cell) {
      lv.mem.updateAt(lv.name, lv.path, () => value.cell!)
      rt.mem.logWrite(lv.name, lv.path)
      return { type: 'int', v: 0, cell: value.cell }
    }
    throw new RuntimeError('只能给标量元素赋值', expr.line)
  }
  const cur: RV = { type: lv.cell.type, v: lv.cell.value === null ? defaultScalar(lv.cell.type) : lv.cell.value }
  const nv = combineAssign(expr.op, cur, value, expr.line)
  if (lv.strIdx !== undefined) {
    lv.mem.setStringChar(lv.name, lv.path, lv.strIdx, nv.v)
    rt.mem.logWrite(lv.name, lv.path.concat(lv.strIdx))
    return { type: lv.cell.type, v: nv.v }
  }
  lv.mem.setScalar(lv.name, lv.path, nv.v)
  rt.mem.logWrite(lv.name, lv.path)
  return { type: lv.cell.type, v: nv.v }
}

function* execUpdate(rt: Runtime, expr: Expr): Generator<Snapshot, RV> {
  const lv = yield* resolveTarget(rt, expr.target, true)
  if (lv.cell.kind !== 'scalar') throw new RuntimeError('非法的自增/自减目标', expr.line)
  const binOp = expr.op === '++' ? '+' : '-'
  const one: RV = { type: 'int', v: 1 }
  const old: RV = { type: lv.cell.type, v: lv.cell.value === null ? defaultScalar(lv.cell.type) : lv.cell.value }
  const nv = applyBinary(binOp, old, one, expr.line)
  lv.mem.setScalar(lv.name, lv.path, nv.v)
  rt.mem.logWrite(lv.name, lv.path)
  return expr.prefix ? nv : old
}

function* execCall(rt: Runtime, expr: Expr): Generator<Snapshot, RV> {
  const name = expr.name

  if (name === 'min' || name === 'max') {
    if (expr.args.length < 2) throw new RuntimeError(name + ' 需要至少 2 个参数', expr.line)
    let best = yield* evalExpr(rt, expr.args[0])
    for (let i = 1; i < expr.args.length; i++) {
      const cur = yield* evalExpr(rt, expr.args[i])
      const c = cmp(cur, best)
      if ((name === 'min' && c < 0) || (name === 'max' && c > 0)) best = cur
    }
    return best
  }
  if (name === 'abs') {
    if (expr.args.length !== 1) throw new RuntimeError('abs 需要 1 个参数', expr.line)
    const a = yield* evalExpr(rt, expr.args[0])
    return { type: a.type, v: Math.abs(num(a, expr.line)) }
  }
  if (name === 'stoi' || name === 'stol' || name === 'stoll') {
    if (expr.args.length < 1) throw new RuntimeError(name + ' 需要 1 个字串参数', expr.line)
    const raw = yield* evalExpr(rt, expr.args[0])
    // C++ 的形态是 stoi(s, pos, base)：pos 是指针（我们没有指针），所以第 2 个参数忽略、第 3 个当进制
    let base = 10
    if (expr.args.length >= 3) {
      const b = num(yield* evalExpr(rt, expr.args[2]), expr.line)
      if (b < 2 || b > 36) throw new RuntimeError(name + ' 的进制必须在 2..36', expr.line)
      base = Math.trunc(b)
    }
    const v = parseIntPrefix(typeof raw.v === 'string' ? raw.v : String(raw.v), base, expr.line, name)
    return { type: name === 'stoi' ? 'int' : 'long long', v }
  }
  if (name === 'stod' || name === 'stof') {
    if (expr.args.length < 1) throw new RuntimeError(name + ' 需要 1 个字串参数', expr.line)
    const raw = yield* evalExpr(rt, expr.args[0])
    const v = parseFloatPrefix(typeof raw.v === 'string' ? raw.v : String(raw.v), expr.line, name)
    return { type: name === 'stod' ? 'double' : 'float', v }
  }
  if (name === 'to_string') {
    if (expr.args.length !== 1) throw new RuntimeError('to_string 需要 1 个参数', expr.line)
    const a = yield* evalExpr(rt, expr.args[0])
    return { type: 'string', v: toStringVal(a, rt.boolAsInt) }
  }
  if (name === 'make_pair') {
    if (expr.args.length !== 2) throw new RuntimeError('make_pair 需要 2 个参数', expr.line)
    const a = yield* evalExpr(rt, expr.args[0])
    const b = yield* evalExpr(rt, expr.args[1])
    return {
      type: 'int',
      v: 0,
      cell: {
        kind: 'pair',
        firstType: { kind: 'scalar', name: a.type },
        secondType: { kind: 'scalar', name: b.type },
        first: { kind: 'scalar', type: a.type, value: a.v },
        second: { kind: 'scalar', type: b.type, value: b.v },
      },
    }
  }

  if (name === 'sort' || name === 'reverse') {
    if (expr.args.length === 0) throw new RuntimeError(name + ' 需要至少 1 个参数（容器）', expr.line)
    const a0 = expr.args[0]
    // 迭代器形式（v.begin() / v.end()）不支持，给出明确提示而不是误导性的下标错误
    if (a0.kind === 'method_call' && (a0.method === 'begin' || a0.method === 'end')) {
      throw new RuntimeError('不支持迭代器形式，请用 ' + name + '(v) 或 ' + name + '(v, n)', expr.line)
    }
    // 参数形态：sort(v) / sort(v, n) / sort(v, cmp) / sort(v, n, cmp)；reverse 只有 (v) / (v, n)
    let cmpName: string | null = null
    let countArg: Expr | undefined
    if (name === 'sort' && expr.args.length >= 2) {
      const second = expr.args[1]
      if (second.kind === 'ident' && rt.functions.has(second.name)) {
        cmpName = second.name
        if (expr.args.length >= 3) throw new RuntimeError('比较函数形式是 sort(v, cmp) 或 sort(v, n, cmp)', expr.line)
      } else {
        countArg = second
        const third = expr.args[2]
        if (third) {
          if (third.kind === 'ident' && rt.functions.has(third.name)) cmpName = third.name
          else throw new RuntimeError('sort 的第三个参数应是自定义比较函数的名字', expr.line)
        }
      }
    } else if (name === 'reverse' && expr.args.length >= 3) {
      throw new RuntimeError('reverse 只接受 reverse(v) 或 reverse(v, n)', expr.line)
    } else {
      countArg = expr.args[1]
    }
    const lv = yield* resolveTarget(rt, a0, true)
    if (lv.cell.kind === 'scalar' && lv.cell.type === 'string') {
      if (name === 'sort') throw new RuntimeError('sort 不支持 string，请用 reverse', expr.line)
      const s = (lv.cell.value ?? '') as string
      lv.mem.setScalar(lv.name, lv.path, s.split('').reverse().join(''))
      rt.mem.logWrite(lv.name, lv.path)
      return { type: 'int', v: 0 }
    }
    if (lv.cell.kind !== 'array' && lv.cell.kind !== 'vector') throw new RuntimeError(name + ' 需要数组或 vector', expr.line)
    const len = lv.cell.cells.length
    const n = countArg ? Math.min(len, Math.max(0, toIndex(yield* evalExpr(rt, countArg), expr.line))) : len
    let part = lv.cell.cells.slice(0, n)
    if (name === 'sort') {
      if (cmpName) {
        const stats = { name: lv.name, n, comparisons: 0, warned: false }
        rt.sortInfo = stats
        const origAll = lv.cell.cells.slice()
        part = yield* stableSortWithCmp(rt, part, cmpName, expr.line, stats, (cur) => {
          const fullNow = origAll.slice()
          for (let i = 0; i < cur.length; i++) fullNow[i] = cur[i]
          lv.mem.updateAt(lv.name, lv.path, (c) => (c.kind === 'array' || c.kind === 'vector' ? { ...c, cells: fullNow } : c))
        })
      } else {
        rt.sortInfo = null
        part = part.sort((x, y) => scalarCmp(cellScalar(x), cellScalar(y)))
      }
    } else {
      rt.sortInfo = null
      part = part.reverse()
    }
    const full = lv.cell.cells.slice()
    for (let i = 0; i < n; i++) full[i] = part[i]
    lv.mem.updateAt(lv.name, lv.path, (c) => (c.kind === 'array' || c.kind === 'vector' ? { ...c, cells: full } : c))
    rt.mem.logWrite(lv.name, lv.path)
    return { type: 'int', v: 0 }
  }
  if (name === 'lower_bound') {
    if (expr.args.length < 2) throw new RuntimeError('lower_bound 需要 2 个参数 (v, x) 或 3 个参数 (v, n, x)', expr.line)
    const a0 = expr.args[0]
    if (a0.kind === 'method_call' && (a0.method === 'begin' || a0.method === 'end')) {
      throw new RuntimeError('不支持迭代器形式，请用 lower_bound(v, x) 或 lower_bound(v, n, x)', expr.line)
    }
    const lv = yield* resolveTarget(rt, a0)
    if (lv.cell.kind !== 'array' && lv.cell.kind !== 'vector') throw new RuntimeError('lower_bound 需要数组或 vector', expr.line)
    const len = lv.cell.cells.length
    // 两种形式：lower_bound(v, x) 全区间；lower_bound(v, n, x) 前 n 个
    const hasN = expr.args.length >= 3
    const n = hasN ? Math.min(len, Math.max(0, toIndex(yield* evalExpr(rt, expr.args[1]), expr.line))) : len
    const x = yield* evalExpr(rt, expr.args[hasN ? 2 : 1])
    for (let i = 0; i < n; i++) {
      if (scalarCmp(cellScalar(lv.cell.cells[i]), x.v) >= 0) {
        rt.mem.logRead(lv.name, lv.path.concat(i))
        return { type: 'int', v: i }
      }
    }
    return { type: 'int', v: n }
  }
  if (name === 'swap') {
    if (expr.args.length !== 2) throw new RuntimeError('swap 需要 2 个参数', expr.line)
    const la = yield* resolveTarget(rt, expr.args[0], true)
    const lb = yield* resolveTarget(rt, expr.args[1], true)
    if (la.cell.kind !== 'scalar' || lb.cell.kind !== 'scalar') throw new RuntimeError('swap 暂只支持标量', expr.line)
    const av = la.cell.value === null ? defaultScalar(la.cell.type) : la.cell.value
    const bv = lb.cell.value === null ? defaultScalar(lb.cell.type) : lb.cell.value
    la.mem.setScalar(la.name, la.path, bv)
    lb.mem.setScalar(lb.name, lb.path, av)
    rt.mem.logWrite(la.name, la.path)
    rt.mem.logWrite(lb.name, lb.path)
    return { type: 'int', v: 0 }
  }

  const fn = rt.functions.get(name)
  if (!fn) throw new RuntimeError('未定义的函数 "' + name + '"', expr.line)

  const argData: ({ rv: RV } | { lv: LValue })[] = []
  for (let i = 0; i < expr.args.length; i++) {
    const p = fn.params[i]
    if (p && (p.byRef || p.isArray)) {
      const ax = expr.args[i]
      // 数组形参只接受「数组名」这类可定位的实参；字面量/算式先给清楚错误，
      // 否则会先撞上 resolveTarget 的「非法的下标访问」，对初学者毫无指引。
      if (p.isArray && ax.kind !== 'ident' && ax.kind !== 'member' && ax.kind !== 'index') {
        throw new RuntimeError('数组形参 ' + p.name + ' 需要传入数组名（int a[]），不能传字面量或算式', expr.line)
      }
      // 引用参数与数组参数都要拿到调用方的 lvalue（共享同一份数据）
      argData.push({ lv: yield* resolveTarget(rt, ax, true) })
    } else if (p && p.type.kind !== 'scalar') {
      argData.push({ lv: yield* resolveTarget(rt, expr.args[i]) })
    } else {
      argData.push({ rv: yield* evalExpr(rt, expr.args[i]) })
    }
  }

  const newMem = new Memory()
  for (let i = 0; i < fn.params.length; i++) {
    const p = fn.params[i]
    const d = argData[i]
    if (p.byRef || p.isArray) {
      // 数组形参绑定为 ref cell：dumpAll 会解引用，面板直接显示真实数组；
      // 函数内的 a[i] 写入落到调用方的 memory，因而调用方可见（真实 C++ 的共享语义）。
      const lv = (d as { lv: LValue }).lv
      if (p.isArray && lv.cell.kind !== 'array') {
        // 建议书要求：传 vector / 纯量 / 表达式时要给清楚的错误，而不是内部的「非法的下标访问」
        const desc = lv.cell.kind === 'scalar' ? '标量' : lv.cell.kind
        throw new RuntimeError('数组形参 ' + p.name + ' 需要传入数组（int a[]），实际收到 ' + desc, expr.line)
      }
      newMem.declare(p.name, { kind: 'ref', origin: 'param', target: { mem: lv.mem, name: lv.name, path: lv.path } })
    } else if (p.type.kind === 'scalar') {
      const rv = d && 'rv' in d ? (d as { rv: RV }).rv : ({ type: 'int', v: 0 } as RV)
      newMem.declare(p.name, scalarCell(p.type, rv, expr.line))
    } else {
      const cell = d && 'lv' in d ? (d as { lv: LValue }).lv.cell : allocFromType(p.type, [], true, rt.structs)
      newMem.declare(p.name, cell)
    }
  }

  const callId = rt.nextCallId++
  const label = name + '(' + argData.map((d, i) => ('rv' in d ? toStringVal((d as { rv: RV }).rv, rt.boolAsInt) : expr.args[i] ? formatExpr(expr.args[i]) : '?')).join(', ') + ')'
  const node: CallNode = { id: callId, label, returned: false, returnValue: null, locals: [], paramNames: fn.params.map((p) => p.name), children: [] }
  const parentPath = callPath(rt.callTree, rt.activeCallId) ?? []
  rt.callTree = updateCallAt(rt.callTree, parentPath, (n) => ({ ...n, children: [...n.children, node] }))

  rt.mem.clearAccess()
  rt.stack.push({ mem: rt.mem, callId: rt.activeCallId })
  rt.mem = newMem
  rt.activeCallId = callId
  yield* mark(rt, expr.line)

  let result: RV | null = null
  let resultCell: Cell | null = null
  try {
    yield* execBlock(rt, fn.body)
  } catch (e) {
    if (e instanceof ReturnSignal) {
      result = e.value
      resultCell = e.cell ?? null
    } else {
      throw e
    }
  }

  const prev = rt.stack.pop()!
  rt.mem = prev.mem
  rt.activeCallId = prev.callId
  const nodePath = callPath(rt.callTree, callId) ?? []
  const retLabel = result ? toStringVal(result) : resultCell ? '<' + (resultCell.kind === 'struct' ? resultCell.structName : resultCell.kind) + '>' : null
  rt.callTree = updateCallAt(rt.callTree, nodePath, (n) => ({ ...n, returned: true, returnValue: retLabel, locals: [] }))
  return result ?? (resultCell ? { type: 'int', v: 0, cell: resultCell } : { type: 'int', v: 0 })
}

function* execMethodCall(rt: Runtime, expr: Expr): Generator<Snapshot, RV> {
  const obj = yield* resolveTarget(rt, expr.object)
  const method = expr.method
  const c = obj.cell

  if (c.kind === 'scalar' && c.type === 'string') {
    const s = (c.value ?? '') as string
    if (method === 'length' || method === 'size') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'int', v: s.length }
    }
    if (method === 'substr') {
      if (expr.args.length < 1) throw new RuntimeError('substr 需要 1~2 个参数', expr.line)
      const pos = toIndex(yield* evalExpr(rt, expr.args[0]), expr.line)
      const len = expr.args[1] ? toIndex(yield* evalExpr(rt, expr.args[1]), expr.line) : Math.max(0, s.length - pos)
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'string', v: s.substr(pos, len) }
    }
    if (method === 'find') {
      if (expr.args.length < 1) throw new RuntimeError('find 需要 1 个参数', expr.line)
      const t = toStringVal(yield* evalExpr(rt, expr.args[0]), rt.boolAsInt)
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'int', v: s.indexOf(t) }
    }
    if (method === 'clear') {
      obj.mem.setScalar(obj.name, obj.path, '')
      rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    throw new RuntimeError('不支持的 string 方法 "' + method + '"', expr.line)
  }

  if (c.kind === 'vector') {
    if (method === 'push_back') {
      if (expr.args.length !== 1) throw new RuntimeError('push_back 需要 1 个参数', expr.line)
      const item = yield* buildElemCell(rt, c.elemType, expr.args[0], expr.line)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, cells: [...c.cells, item] }))
      rt.mem.logWrite(obj.name, obj.path.concat(c.cells.length))
      return { type: 'int', v: 0 }
    }
    if (method === 'pop_back') {
      if (c.cells.length === 0) throw new RuntimeError('对空 vector 调用 pop_back', expr.line)
      const newCells = c.cells.slice(0, -1)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, cells: newCells }))
      if (newCells.length > 0) rt.mem.logWrite(obj.name, obj.path.concat(newCells.length - 1))
      else rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'size') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'int', v: c.cells.length }
    }
    if (method === 'empty') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'bool', v: c.cells.length === 0 }
    }
    if (method === 'clear') {
      rt.mem.logWrite(obj.name, obj.path)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, cells: [] }))
      return { type: 'int', v: 0 }
    }
    throw new RuntimeError('不支持的 vector 方法 "' + method + '"', expr.line)
  }

  if (c.kind === 'stack') {
    if (method === 'push') {
      if (expr.args.length !== 1) throw new RuntimeError('push 需要 1 个参数', expr.line)
      const item = yield* buildElemCell(rt, c.elemType, expr.args[0], expr.line)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: [...c.items, item] }))
      rt.mem.logWrite(obj.name, obj.path.concat(c.items.length))
      return { type: 'int', v: 0 }
    }
    if (method === 'pop') {
      if (c.items.length === 0) throw new RuntimeError('对空 stack 调用 pop', expr.line)
      const newItems = c.items.slice(0, -1)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: newItems }))
      if (newItems.length > 0) rt.mem.logWrite(obj.name, obj.path.concat(newItems.length - 1))
      else rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'top') {
      if (c.items.length === 0) throw new RuntimeError('对空 stack 调用 top', expr.line)
      rt.mem.logRead(obj.name, obj.path.concat(c.items.length - 1))
      return cellToRV(c.items[c.items.length - 1], expr.line)
    }
    if (method === 'size') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'int', v: c.items.length }
    }
    if (method === 'empty') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'bool', v: c.items.length === 0 }
    }
    throw new RuntimeError('不支持的 stack 方法 "' + method + '"', expr.line)
  }

  if (c.kind === 'queue') {
    if (method === 'push') {
      if (expr.args.length !== 1) throw new RuntimeError('push 需要 1 个参数', expr.line)
      const item = yield* buildElemCell(rt, c.elemType, expr.args[0], expr.line)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: [...c.items, item] }))
      rt.mem.logWrite(obj.name, obj.path.concat(c.items.length))
      return { type: 'int', v: 0 }
    }
    if (method === 'pop') {
      if (c.items.length === 0) throw new RuntimeError('对空 queue 调用 pop', expr.line)
      const newItems = c.items.slice(1)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: newItems }))
      if (newItems.length > 0) rt.mem.logWrite(obj.name, obj.path.concat(0))
      else rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'front') {
      if (c.items.length === 0) throw new RuntimeError('对空 queue 调用 front', expr.line)
      rt.mem.logRead(obj.name, obj.path.concat(0))
      return cellToRV(c.items[0], expr.line)
    }
    if (method === 'back') {
      if (c.items.length === 0) throw new RuntimeError('对空 queue 调用 back', expr.line)
      rt.mem.logRead(obj.name, obj.path.concat(c.items.length - 1))
      return cellToRV(c.items[c.items.length - 1], expr.line)
    }
    if (method === 'size') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'int', v: c.items.length }
    }
    if (method === 'empty') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'bool', v: c.items.length === 0 }
    }
    throw new RuntimeError('不支持的 queue 方法 "' + method + '"', expr.line)
  }

  if (c.kind === 'deque') {
    if (method === 'push_back') {
      if (expr.args.length !== 1) throw new RuntimeError('push_back 需要 1 个参数', expr.line)
      const item = yield* buildElemCell(rt, c.elemType, expr.args[0], expr.line)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: [...c.items, item] }))
      rt.mem.logWrite(obj.name, obj.path.concat(c.items.length))
      return { type: 'int', v: 0 }
    }
    if (method === 'pop_back') {
      if (c.items.length === 0) throw new RuntimeError('对空 deque 调用 pop_back', expr.line)
      const newItems = c.items.slice(0, -1)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: newItems }))
      if (newItems.length > 0) rt.mem.logWrite(obj.name, obj.path.concat(newItems.length - 1))
      else rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'push_front') {
      if (expr.args.length !== 1) throw new RuntimeError('push_front 需要 1 个参数', expr.line)
      const item = yield* buildElemCell(rt, c.elemType, expr.args[0], expr.line)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: [item, ...c.items] }))
      rt.mem.logWrite(obj.name, obj.path.concat(0))
      return { type: 'int', v: 0 }
    }
    if (method === 'pop_front') {
      if (c.items.length === 0) throw new RuntimeError('对空 deque 调用 pop_front', expr.line)
      const newItems = c.items.slice(1)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: newItems }))
      if (newItems.length > 0) rt.mem.logWrite(obj.name, obj.path.concat(0))
      else rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'front') {
      if (c.items.length === 0) throw new RuntimeError('对空 deque 调用 front', expr.line)
      rt.mem.logRead(obj.name, obj.path.concat(0))
      return cellToRV(c.items[0], expr.line)
    }
    if (method === 'back') {
      if (c.items.length === 0) throw new RuntimeError('对空 deque 调用 back', expr.line)
      rt.mem.logRead(obj.name, obj.path.concat(c.items.length - 1))
      return cellToRV(c.items[c.items.length - 1], expr.line)
    }
    if (method === 'size') { rt.mem.logRead(obj.name, obj.path); return { type: 'int', v: c.items.length } }
    if (method === 'empty') { rt.mem.logRead(obj.name, obj.path); return { type: 'bool', v: c.items.length === 0 } }
    if (method === 'clear') {
      rt.mem.logWrite(obj.name, obj.path)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: [] }))
      return { type: 'int', v: 0 }
    }
    throw new RuntimeError('不支持的 deque 方法 "' + method + '"', expr.line)
  }

  if (c.kind === 'pqueue') {
    if (method === 'push') {
      if (expr.args.length !== 1) throw new RuntimeError('push 需要 1 个参数', expr.line)
      const item = yield* buildElemCell(rt, c.elemType, expr.args[0], expr.line)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: heapPush(c.items, c.minHeap, item) }))
      rt.mem.logWrite(obj.name, obj.path.concat(0))
      return { type: 'int', v: 0 }
    }
    if (method === 'pop') {
      if (c.items.length === 0) throw new RuntimeError('对空 priority_queue 调用 pop', expr.line)
      const newItems = heapPop(c.items, c.minHeap)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: newItems }))
      if (newItems.length > 0) rt.mem.logWrite(obj.name, obj.path.concat(0))
      else rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'top') {
      if (c.items.length === 0) throw new RuntimeError('对空 priority_queue 调用 top', expr.line)
      rt.mem.logRead(obj.name, obj.path.concat(0))
      return cellToRV(c.items[0], expr.line)
    }
    if (method === 'size') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'int', v: c.items.length }
    }
    if (method === 'empty') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'bool', v: c.items.length === 0 }
    }
    throw new RuntimeError('不支持的 priority_queue 方法 "' + method + '"', expr.line)
  }

  if (c.kind === 'bst') {
    const typeName = scalarName(c.elemType, expr.line)
    if (method === 'insert') {
      if (expr.args.length !== 1) throw new RuntimeError('insert 需要 1 个参数', expr.line)
      const v = yield* evalExpr(rt, expr.args[0])
      const value = coerceTo(typeName, v, expr.line)
      const id = c.nextId
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, root: insertBst(c.root, id, value), count: c.count + 1, nextId: c.nextId + 1 }))
      rt.mem.logWrite(obj.name, obj.path.concat(id))
      return { type: 'int', v: 0 }
    }
    if (method === 'find') {
      if (expr.args.length !== 1) throw new RuntimeError('find 需要 1 个参数', expr.line)
      const v = yield* evalExpr(rt, expr.args[0])
      const value = coerceTo(typeName, v, expr.line)
      const found = findBst(c.root, value)
      if (found) rt.mem.logRead(obj.name, obj.path.concat(found.id))
      else rt.mem.logRead(obj.name, obj.path)
      return { type: 'bool', v: found !== null }
    }
    if (method === 'size') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'int', v: c.count }
    }
    if (method === 'empty') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'bool', v: c.count === 0 }
    }
    throw new RuntimeError('不支持的 bst 方法 "' + method + '"', expr.line)
  }

  if (c.kind === 'tree') {
    if (method === 'size') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'int', v: c.size }
    }
    if (method === 'empty') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'bool', v: c.size === 0 }
    }
    throw new RuntimeError('不支持的 tree 方法 "' + method + '"', expr.line)
  }

  if (c.kind === 'set') {
    if (method === 'insert') {
      if (expr.args.length !== 1) throw new RuntimeError('insert 需要 1 个参数', expr.line)
      const v = yield* evalExpr(rt, expr.args[0])
      const item = elemCell(c.elemType, v, expr.line)
      const r = setInsert(c.items, item)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: r.items }))
      rt.mem.logWrite(obj.name, obj.path.concat(r.index))
      return { type: 'int', v: 0 }
    }
    if (method === 'erase') {
      if (expr.args.length !== 1) throw new RuntimeError('erase 需要 1 个参数', expr.line)
      const v = yield* evalExpr(rt, expr.args[0])
      const value = coerceTo(scalarName(c.elemType, expr.line), v, expr.line)
      const r = setErase(c.items, value)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: r.items }))
      if (r.index >= 0) rt.mem.logWrite(obj.name, obj.path.concat(r.index))
      else rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'find' || method === 'count') {
      if (expr.args.length !== 1) throw new RuntimeError(method + ' 需要 1 个参数', expr.line)
      const v = yield* evalExpr(rt, expr.args[0])
      const value = coerceTo(scalarName(c.elemType, expr.line), v, expr.line)
      const idx = c.items.findIndex((it) => scalarCmp(cellScalar(it), value) === 0)
      if (idx >= 0) rt.mem.logRead(obj.name, obj.path.concat(idx))
      else rt.mem.logRead(obj.name, obj.path)
      return { type: method === 'count' ? 'int' : 'bool', v: method === 'count' ? (idx >= 0 ? 1 : 0) : idx >= 0 }
    }
    if (method === 'size') { rt.mem.logRead(obj.name, obj.path); return { type: 'int', v: c.items.length } }
    if (method === 'empty') { rt.mem.logRead(obj.name, obj.path); return { type: 'bool', v: c.items.length === 0 } }
    if (method === 'clear') {
      rt.mem.logWrite(obj.name, obj.path)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: [] }))
      return { type: 'int', v: 0 }
    }
    throw new RuntimeError('不支持的 set 方法 "' + method + '"', expr.line)
  }

  if (c.kind === 'map' || c.kind === 'umap') {
    const keyTypeName = scalarName(c.keyType, expr.line)
    if (method === 'erase') {
      if (expr.args.length !== 1) throw new RuntimeError('erase 需要 1 个参数', expr.line)
      const v = yield* evalExpr(rt, expr.args[0])
      const key = coerceTo(keyTypeName, v, expr.line)
      const idx = entryIndex(c.entries, key)
      if (idx >= 0) {
        const entries = c.entries.slice()
        entries.splice(idx, 1)
        obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, entries }))
        rt.mem.logWrite(obj.name, obj.path.concat(idx))
      } else {
        rt.mem.logWrite(obj.name, obj.path)
      }
      return { type: 'int', v: 0 }
    }
    if (method === 'find' || method === 'count') {
      if (expr.args.length !== 1) throw new RuntimeError(method + ' 需要 1 个参数', expr.line)
      const v = yield* evalExpr(rt, expr.args[0])
      const key = coerceTo(keyTypeName, v, expr.line)
      const idx = entryIndex(c.entries, key)
      if (idx >= 0) rt.mem.logRead(obj.name, obj.path.concat(idx))
      else rt.mem.logRead(obj.name, obj.path)
      return { type: method === 'count' ? 'int' : 'bool', v: method === 'count' ? (idx >= 0 ? 1 : 0) : idx >= 0 }
    }
    if (method === 'size') { rt.mem.logRead(obj.name, obj.path); return { type: 'int', v: c.entries.length } }
    if (method === 'empty') { rt.mem.logRead(obj.name, obj.path); return { type: 'bool', v: c.entries.length === 0 } }
    if (method === 'clear') {
      rt.mem.logWrite(obj.name, obj.path)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, entries: [] }))
      return { type: 'int', v: 0 }
    }
    throw new RuntimeError('不支持的 ' + c.kind + ' 方法 "' + method + '"', expr.line)
  }

  throw new RuntimeError('不是容器或不支持方法 "' + method + '"', expr.line)
}

function* buildFromInit(rt: Runtime, item: InitExpr, elemType: Type, line: number): Generator<Snapshot, Cell> {
  if (item.kind === 'expr') {
    if (elemType.kind !== 'scalar') throw new RuntimeError('初始化列表层级不匹配', line)
    const rv = yield* evalExpr(rt, item.expr)
    return { kind: 'scalar', type: elemType.name, value: coerceTo(elemType.name, rv, line) }
  }
  if (elemType.kind === 'array') {
    const cells: Cell[] = []
    for (const sub of item.items) cells.push(yield* buildFromInit(rt, sub, elemType.elem, line))
    return { kind: 'array', elemType: elemType.elem, size: cells.length, cells }
  }
  if (elemType.kind === 'vector') {
    const cells: Cell[] = []
    for (const sub of item.items) cells.push(yield* buildFromInit(rt, sub, elemType.elem, line))
    return { kind: 'vector', elemType: elemType.elem, cells }
  }
  if (elemType.kind === 'struct') {
    if (item.kind !== 'list') throw new RuntimeError('struct 初始化需要列表', line)
    const cell = allocFromType(elemType, [], false, rt.structs)
    yield* applyStructInit(rt, cell, item, line)
    return cell
  }
  throw new RuntimeError('初始化列表层级不匹配', line)
}

function* applyInitList(rt: Runtime, cell: Cell, init: InitExpr, line: number): Generator<Snapshot> {
  if (init.kind !== 'list') return
  if (cell.kind === 'vector') {
    cell.cells = []
    for (const it of init.items) cell.cells.push(yield* buildFromInit(rt, it, cell.elemType, line))
  } else if (cell.kind === 'array') {
    const n = Math.min(cell.size, init.items.length)
    for (let i = 0; i < n; i++) cell.cells[i] = yield* buildFromInit(rt, init.items[i], cell.elemType, line)
  }
}

function* execDecl(rt: Runtime, d: VarDecl): Generator<Snapshot> {
  const line = d.line
  const arraySizes: number[] = []
  const inferPositions: number[] = []
  for (let i = 0; i < (d.arraySizes ?? []).length; i++) {
    const s = (d.arraySizes ?? [])[i]
    if (s === undefined) {
      arraySizes.push(0)
      inferPositions.push(i)
    } else {
      arraySizes.push(Math.max(0, toIndex(yield* evalExpr(rt, s), line)))
    }
  }
  if (inferPositions.length > 0) {
    if (!d.initList) throw new RuntimeError('省略数组大小时必须提供初始化列表', line)
    if (inferPositions.length > 1) throw new RuntimeError('暂只支持省略最外层数组大小', line)
    arraySizes[inferPositions[0]] = d.initList.items.length
  }

  let cell: Cell

  if (d.base.kind === 'scalar' && arraySizes.length === 0) {
    cell = { kind: 'scalar', type: d.base.name, value: null }
    if (d.init) cell.value = coerceTo(d.base.name, yield* evalExpr(rt, d.init), line)
  } else {
    let fullType: Type = d.base
    for (let i = arraySizes.length - 1; i >= 0; i--) fullType = { kind: 'array', elem: fullType }

    if (d.base.kind === 'struct' && arraySizes.length === 0) {
      cell = allocStruct(rt, d.base.name, line)
      if (d.initList) {
        yield* applyStructInit(rt, cell, d.initList, line)
      } else if (d.init) {
        const rv = yield* evalReturnValue(rt, d.init)
        if (rv.cell && rv.cell.kind === 'struct') cell = rv.cell
      }
    } else if (d.vecSize) {
      const n = Math.max(0, toIndex(yield* evalExpr(rt, d.vecSize), line))
      if (d.base.kind === 'vector') {
        if (d.vecFill && d.base.elem.kind === 'scalar') {
          const fill = coerceTo(d.base.elem.name, yield* evalExpr(rt, d.vecFill), line)
          cell = allocVector(d.base.elem, n, fill, rt.structs)
        } else if (d.vecFill) {
          const frv = yield* evalExpr(rt, d.vecFill)
          const template = frv.cell ?? allocFromType(d.base.elem, [], true, rt.structs)
          const cells: Cell[] = []
          for (let i = 0; i < n; i++) cells.push(template)
          cell = { kind: 'vector', elemType: d.base.elem, cells }
        } else {
          cell = allocVector(d.base.elem, n, undefined, rt.structs)
        }
      } else if (d.base.kind === 'tree') {
        cell = allocTree(d.base.elem, n, line, rt.structs)
      } else {
        throw new RuntimeError('只有 vector/tree 支持构造函数', line)
      }
    } else {
      cell = allocFromType(fullType, arraySizes, !!d.initList, rt.structs)
    }

    const isDirectStruct = d.base.kind === 'struct' && arraySizes.length === 0
    if (d.initList && !isDirectStruct) {
      yield* applyInitList(rt, cell, d.initList, line)
    } else if (d.init && !isDirectStruct) {
      if (cell.kind === 'array') {
        fillAllScalars(cell, yield* evalExpr(rt, d.init), line)
      } else if (cell.kind === 'pair') {
        const rv = yield* evalExpr(rt, d.init)
        if (rv.cell && rv.cell.kind === 'pair') cell = rv.cell
      }
    }
  }

  rt.mem.declare(d.name, cell)
}

function* execBlock(rt: Runtime, body: Stmt[]): Generator<Snapshot> {
  for (const s of body) yield* execStmt(rt, s)
}

function* execStmt(rt: Runtime, s: Stmt): Generator<Snapshot> {
  rt.lastLine = s.line
  switch (s.kind) {
    case 'empty':
      break

    case 'block':
      yield* execBlock(rt, s.body)
      break

    case 'var_decl':
      yield* execDecl(rt, s)
      yield* mark(rt, s.line)
      break

    case 'expr_stmt':
      yield* evalExpr(rt, s.expr)
      yield* mark(rt, s.line)
      break

    case 'cout':
      for (const item of s.items) {
        if (item.kind === 'endl') rt.out.push('\n')
        else rt.out.push(toStringVal(yield* evalExpr(rt, item.expr), rt.boolAsInt))
      }
      yield* mark(rt, s.line)
      break

    case 'cin':
      for (const target of s.targets) {
        const raw = rt.input[rt.inputPos]
        if (raw === undefined) throw new RuntimeError('cin 输入不足（读到输入末尾）', s.line)
        rt.inputPos++
        const rv = parseInputValue(raw)
        const lv = yield* resolveTarget(rt, target, true)
        if (lv.cell.kind !== 'scalar') throw new RuntimeError('cin 目标应为标量变量', s.line)
        lv.mem.setScalar(lv.name, lv.path, coerceTo(lv.cell.type, rv, s.line))
        rt.mem.logWrite(lv.name, lv.path)
      }
      yield* mark(rt, s.line)
      break

    case 'if': {
      rt.mem.clearAccess()
      const c = yield* evalExpr(rt, s.cond)
      const result = truthy(c)
      if (rt.showCond.if) yield* markCondition(rt, s.line, s.cond, result, 'if')
      else rt.mem.clearAccess()
      if (result) yield* execStmt(rt, s.then)
      else if (s.else) yield* execStmt(rt, s.else)
      break
    }

    case 'while': {
      while (true) {
        rt.mem.clearAccess()
        const c = yield* evalExpr(rt, s.cond)
        const result = truthy(c)
        if (rt.showCond.while) yield* markCondition(rt, s.line, s.cond, result, 'while')
        else rt.mem.clearAccess()
        if (!result) break
        try {
          yield* execStmt(rt, s.body)
        } catch (e) {
          if (e instanceof ContinueSignal) continue
          if (e instanceof BreakSignal) break
          throw e
        }
      }
      break
    }

    case 'do': {
      while (true) {
        try {
          yield* execStmt(rt, s.body)
        } catch (e) {
          // continue 在 do-while 里等价于「跳到条件判断」，所以这里不跳过下面的条件求值
          if (e instanceof ContinueSignal) {
            // 落到条件判断
          } else if (e instanceof BreakSignal) {
            break
          } else {
            throw e
          }
        }
        // do-while 唯一需要看懂的差别就在这里：body 已经执行完，此刻尚未检查条件。
        // 刻意在求值条件之前产出一个快照（高亮 while 行、右侧已是 body 之后的状态、还没有判断横幅），
        // 学生才能看到「先跑一次，再判断」。
        yield* mark(rt, s.condLine)
        const c = yield* evalExpr(rt, s.cond)
        const result = truthy(c)
        if (rt.showCond.while) yield* markCondition(rt, s.condLine, s.cond, result, 'while')
        else rt.mem.clearAccess()
        if (!result) break
      }
      break
    }

    case 'range_for': {
      const it = s.iter
      // 容器必须是可定位的变量（或它的下标/成员，例如 g[u]）
      if (it.kind !== 'ident' && it.kind !== 'index' && it.kind !== 'member') {
        throw new RuntimeError('range-for 的容器必须是变量或其下标/成员（例如 v 或 g[u]）', s.line)
      }
      const lv = yield* resolveTarget(rt, it)
      const seq = rangeForSequence(lv.cell, s.line)
      if (s.byRef && !seq.canRef) {
        throw new RuntimeError('这个容器的元素不能用 auto& 修改（请用 auto / 显式类型做值拷贝）', s.line)
      }
      // 范围在进入循环时固定下来（与 C++ 一致：end 只取一次）
      const total = seq.elems.length
      for (let i = 0; i < total; i++) {
        const el = seq.elems[i]
        let declCell: Cell
        if (s.byRef) {
          // auto& / T& ：绑定成「指向该元素的 ref cell」，写入会回到原容器
          declCell = {
            kind: 'ref',
            origin: 'loop',
            target: { mem: lv.mem, name: lv.name, path: lv.path.concat(i + seq.refBase) },
          }
        } else if (s.declType && s.declType.kind === 'scalar' && el.kind === 'scalar') {
          // for (int x : ...) / for (char c : s) 等显式类型：按声明类型转一次
          declCell = scalarCell(s.declType, { type: el.type, v: el.value ?? defaultScalar(el.type) }, s.line)
        } else {
          // auto（或非标量元素）：直接用元素 cell；cell 不可变，所以这就是值拷贝语义
          declCell = el
        }
        rt.mem.declare(s.name, declCell)
        yield* mark(rt, s.line)
        try {
          yield* execStmt(rt, s.body)
        } catch (e) {
          if (e instanceof ContinueSignal) continue
          if (e instanceof BreakSignal) break
          throw e
        }
      }
      break
    }

    case 'for': {
      if (s.init) yield* execStmt(rt, s.init)
      while (true) {
        if (s.cond) {
          rt.mem.clearAccess()
          const c = yield* evalExpr(rt, s.cond)
          const result = truthy(c)
          if (rt.showCond.for) yield* markCondition(rt, s.line, s.cond, result, 'for')
          else rt.mem.clearAccess()
          if (!result) break
        }
        try {
          yield* execStmt(rt, s.body)
        } catch (e) {
          if (e instanceof ContinueSignal) {
            // 继续到 increment
          } else if (e instanceof BreakSignal) {
            break
          } else {
            throw e
          }
        }
        if (s.incr) {
          yield* evalExpr(rt, s.incr)
          yield* mark(rt, s.line)
        }
      }
      break
    }

    case 'break':
      throw new BreakSignal()

    case 'continue':
      throw new ContinueSignal()

    case 'return': {
      const rv = yield* evalReturnValue(rt, s.value)
      yield* mark(rt, s.line)
      throw new ReturnSignal(rv.rv, rv.cell ?? undefined)
    }
  }
}

export function* run(program: Program, opts?: RunOptions): Generator<Snapshot> {
  const rt: Runtime = {
    mem: new Memory(),
    globals: new Memory(),
    functions: program.functions,
    stack: [],
    callTree: { id: 0, label: 'main()', returned: false, returnValue: null, locals: [], paramNames: [], children: [] },
    activeCallId: 0,
    nextCallId: 1,
    out: [],
    step: 0,
    lastLine: 1,
    showCond: opts?.showCond ?? { if: true, while: true, for: true },
    boolAsInt: opts?.boolAsInt ?? false,
    input: (opts?.input ?? '').split(/\s+/).filter((s) => s.length > 0),
    inputPos: 0,
    structs: program.structs,
    sortInfo: null,
  }

  rt.mem = rt.globals
  try {
    yield* execBlock(rt, program.globals)
  } catch (e) {
    if (e instanceof RuntimeError) {
      rt.mem.clearAccess()
      yield {
        step: rt.step + 1,
        line: e.line,
        reads: [],
        writes: [],
        vars: dumpAll(rt),
        output: rt.out.join(''),
        callTree: cloneCallTree(rt.callTree),
        activeCallId: rt.activeCallId,
        error: e.message,
      }
      return
    }
    throw e
  }

  rt.mem = new Memory()
  try {
    yield* execBlock(rt, program.body)
  } catch (e) {
    if (e instanceof ReturnSignal) {
      rt.callTree = { ...rt.callTree, returned: true, returnValue: e.value ? toStringVal(e.value) : null, locals: [] }
    } else if (e instanceof RuntimeError) {
      rt.mem.clearAccess()
      yield {
        step: rt.step + 1,
        line: e.line,
        reads: [],
        writes: [],
        vars: dumpAll(rt),
        output: rt.out.join(''),
        callTree: cloneCallTree(rt.callTree),
        activeCallId: rt.activeCallId,
        error: e.message,
      }
      return
    } else if (e instanceof Error) {
      rt.mem.clearAccess()
      yield {
        step: rt.step + 1,
        line: rt.lastLine,
        reads: [],
        writes: [],
        vars: dumpAll(rt),
        output: rt.out.join(''),
        callTree: cloneCallTree(rt.callTree),
        activeCallId: rt.activeCallId,
        error: e.message,
      }
      return
    } else {
      throw e
    }
  }

  rt.mem.clearAccess()
  yield {
    step: rt.step + 1,
    line: rt.lastLine,
    reads: [],
    writes: [],
    vars: dumpAll(rt),
    output: rt.out.join(''),
    callTree: cloneCallTree(rt.callTree),
    activeCallId: rt.activeCallId,
    done: true,
  }
}
