// 快照與呼叫樹的工具：每一步要 yield 的那個 Snapshot 在這裡組出來。
// 從 interpreter.ts 抽出來（v0.10.x S5）—— 這些只依賴 Runtime 狀態與純函式，不需要求值能力，
// 所以可以獨立成檔（execStmt 每條敘述都會呼叫 mark）。
import { Memory, getAtPath } from './memory'
import type { Cell, CellRef, VarView } from './memory'
import type { Expr } from './ast'
import type { Runtime, Snapshot, CallNode, RV } from './runtime'
import { MAX_STEPS, RuntimeError } from './runtime'
import { formatExpr, toStringVal, cellScalar } from './values'
export function getVar(rt: Runtime, name: string, line: number): { cell: Cell; mem: Memory; name: string; path: number[] } {
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

export function findCallNode(root: CallNode, id: number): CallNode | null {
  if (root.id === id) return root
  for (const c of root.children) {
    const r = findCallNode(c, id)
    if (r) return r
  }
  return null
}

export function callPath(root: CallNode, id: number): number[] | null {
  if (root.id === id) return []
  for (let i = 0; i < root.children.length; i++) {
    const p = callPath(root.children[i], id)
    if (p) return [i, ...p]
  }
  return null
}

export function updateCallAt(root: CallNode, path: number[], fn: (n: CallNode) => CallNode): CallNode {
  if (path.length === 0) return fn(root)
  const i = path[0]
  const children = root.children.slice()
  children[i] = updateCallAt(children[i], path.slice(1), fn)
  return { ...root, children }
}

// 调用树已不可变（写时复制），快照直接共享引用，无需深拷贝。
export function cloneCallTree(root: CallNode): CallNode {
  return root
}

export function dumpAll(rt: Runtime): VarView[] {
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

export function formatCellValue(cell: Cell): string {
  if (cell.kind !== 'scalar') return '<' + cell.kind + '>'
  const v = cell.value
  if (v === null) return '?'
  if (cell.type === 'char') return "'" + v + "'"
  if (cell.type === 'string') return '"' + v + '"'
  if (cell.type === 'bool') return v ? 'true' : 'false'
  return String(v)
}

export function collectLocals(mem: Memory, exclude?: Set<string>): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = []
  for (const name of mem.order) {
    if (name.indexOf('__sort_') === 0) continue
    if (exclude && exclude.has(name)) continue
    const cell = mem.vars.get(name)!
    if (cell.kind === 'scalar') out.push({ name, value: formatCellValue(cell) })
  }
  return out
}

export function updateActiveLocals(rt: Runtime): void {
  const path = callPath(rt.callTree, rt.activeCallId)
  if (!path) return
  rt.callTree = updateCallAt(rt.callTree, path, (n) => ({ ...n, locals: collectLocals(rt.mem, new Set(n.paramNames)) }))
}

export function* mark(rt: Runtime, line: number): Generator<Snapshot> {
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

export function* markCondition(rt: Runtime, line: number, cond: Expr, result: boolean, kind: 'if' | 'while' | 'for'): Generator<Snapshot> {
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
