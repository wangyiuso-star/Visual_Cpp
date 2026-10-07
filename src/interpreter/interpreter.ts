import { Memory, getAtPath } from './memory'
import type { Cell, ScalarValue, VarView, CellRef, BstNode } from './memory'
import type {
  Program,
  Stmt,
  Expr,
  CallExpr,
  MethodCallExpr,
  VarDecl,
  Type,
  ScalarTypeName,
  InitExpr,
  FunctionDef,
  StructDef,
} from './ast'
import { BreakSignal, ContinueSignal, MAX_STEPS, ReturnSignal, RuntimeError, defaultScalar, truthy } from './runtime'
import type { CallNode, LValue, RV, RunOptions, Runtime, Snapshot } from './runtime'
import { BUILTIN_CONSTANTS, SCALAR_BYTES, TYPE_NAME_BYTES, applyBinary, assertScalarRV, cellBytes, cmp, coerceTo, combineAssign, dynamicSizeError, entryIndex, entryInsert, formatExpr, indexTempCell, num, parseInputValue, scalarCell, scalarName, toIndex, toStringVal } from './values'
import { allocFromType, allocStruct, allocTree, allocVector, fillAllScalars } from './cells'
import { inadequateInputMsg, readCinToken } from './input'
import { execBuiltin, execMethod } from './builtins'
import type { EvalCtx } from './builtins'
// 對外的公開型別照舊從 interpreter 匯出（App / 面板 / 測試都是從這裡 import 的）
export type { CallNode, RunOptions, Snapshot } from './runtime'
export { RuntimeError } from './runtime'

function* sizeofOperand(rt: Runtime, operand: Expr, line: number): Generator<Snapshot, number> {
  // sizeof(int) / sizeof(long long)：運算元是型別名
  if (operand.kind === 'ident') {
    const byName = TYPE_NAME_BYTES[operand.name]
    if (byName !== undefined) return byName
  }
  const locatable = operand.kind === 'ident' || operand.kind === 'index' || operand.kind === 'member'
  if (locatable) {
    const lv = yield* resolveTarget(rt, operand)
    return cellBytes(rt, lv.cell, line)
  }
  const rv = yield* evalExpr(rt, operand)
  if (rv.cell) return cellBytes(rt, rv.cell, line)
  if (rv.type === 'string') dynamicSizeError(line)
  return SCALAR_BYTES[rv.type]
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
        // 值可以是容器（例如 unordered_map<string,vector<int>>）→ 用 allocFromType 建默认值。
        // 纯量的情况刻意保持原样（value: null = 未初始化），避免改变既有行为。
        const keyCell: Cell = { kind: 'scalar', type: keyTypeName, value: key }
        const valueCell: Cell =
          parent.cell.valueType.kind === 'scalar'
            ? { kind: 'scalar', type: parent.cell.valueType.name, value: null }
            : allocFromType(parent.cell.valueType, [], true, rt.structs)
        const r = entryInsert(parent.cell.entries, keyCell, valueCell, parent.cell.kind === 'map')
        parent.mem.updateAt(parent.name, parent.path, (cc) => (cc.kind === 'map' || cc.kind === 'umap' ? { ...cc, entries: r.entries } : cc))
        return { name: parent.name, path: parent.path.concat(r.index), cell: r.entries[r.index].value, mem: parent.mem }
      }
      if (idx < 0) {
        // 读不存在的键：本工具的既定行为是「不插入」，回一个同类型的默认值
        const def: Cell =
          parent.cell.valueType.kind === 'scalar'
            ? { kind: 'scalar', type: parent.cell.valueType.name, value: null }
            : allocFromType(parent.cell.valueType, [], true, rt.structs)
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


// builtins.ts 需要「求值」與「取左值」；用注入避免模組循環。
const evalCtx: EvalCtx = { evalExpr, resolveTarget }
function* evalExpr(rt: Runtime, expr: Expr): Generator<Snapshot, RV> {
  switch (expr.kind) {
    case 'literal':
      return { type: expr.litType, v: expr.value as ScalarValue }

    case 'ident': {
      // <climits> 的常数。long long 用 JS number 存，所以 LLONG_MAX 只有约 2^53 的精度（见 README）。
      const k = BUILTIN_CONSTANTS[expr.name]
      if (k !== undefined) return { type: 'int', v: k }
      const lv = yield* resolveTarget(rt, expr)
      rt.mem.logRead(lv.name, lv.path)
      if (lv.cell.kind !== 'scalar') {
        // 容器也能当作「一个值」传递：容器赋值（m["a"] = v）、函数回传容器、容器按值传参、
        // vector<vector> 的 g[u] 都靠这里。类型标记用 int 占位，真正的类型由 cell 携带；
        // 需要标量的地方会被 assertScalarRV 拦下来（不会静默变成 0）。
        return { type: 'int', v: 0, cell: lv.cell }
      }
      return { type: lv.cell.type, v: lv.cell.value === null ? defaultScalar(lv.cell.type) : lv.cell.value }
    }

    case 'index': {
      // 临时值也能下标（只支援读取）：f()[0]、to_string(n)[0]、g(u)[1]
      if (expr.target.kind === 'call' || expr.target.kind === 'method_call') {
        const rv = yield* evalExpr(rt, expr.target)
        if (!rv.cell) throw new RuntimeError('这个表达式的结果不能下标读取', expr.line)
        const idx = toIndex(yield* evalExpr(rt, expr.index), expr.line)
        const el = indexTempCell(rv.cell, idx, expr.line)
        return el.kind === 'scalar'
          ? { type: el.type, v: el.value === null ? defaultScalar(el.type) : el.value }
          : { type: 'int', v: 0, cell: el }
      }
      const lv = yield* resolveTarget(rt, expr)
      rt.mem.logRead(lv.name, lv.strIdx !== undefined ? lv.path.concat(lv.strIdx) : lv.path)
      if (lv.cell.kind !== 'scalar') {
        // 子容器（g[u] 是 vector<int>、m[k] 是 vector<int>）同样可以作为值传递
        return { type: 'int', v: 0, cell: lv.cell }
      }
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
        // 临时值的成员访问：make_pair(1,2).first、mkStruct().x
        const rv = yield* evalExpr(rt, expr.object)
        const oc = rv.cell
        if (!oc) throw new RuntimeError('这个表达式的结果不能取成员', expr.line)
        let mem: Cell | null = null
        if (oc.kind === 'pair') mem = expr.field === 'first' ? oc.first : expr.field === 'second' ? oc.second : null
        else if (oc.kind === 'struct') mem = oc.members.find((m) => m.name === expr.field)?.cell ?? null
        if (!mem) throw new RuntimeError('这个临时值没有成员 "' + expr.field + '"', expr.line)
        return mem.kind === 'scalar'
          ? { type: mem.type, v: mem.value === null ? defaultScalar(mem.type) : mem.value }
          : { type: 'int', v: 0, cell: mem }
      }
      const lv = yield* resolveTarget(rt, expr)
      if (lv.cell.kind !== 'scalar') throw new RuntimeError('成员不是标量', expr.line)
      rt.mem.logRead(lv.name, lv.path)
      return { type: lv.cell.type, v: lv.cell.value === null ? defaultScalar(lv.cell.type) : lv.cell.value }
    }

    // while (cin >> x)：讀到輸入結束就回 false，讓迴圈自然結束（C++ 的 istream 轉 bool）
    case 'cin_expr': {
      const ok = yield* cinReadTargets(rt, expr.targets, expr.line)
      return { type: 'bool', v: ok }
    }

    // 三目運算子 cond ? a : b（只求值被選中的那一邊）
    case 'ternary': {
      const c = yield* evalExpr(rt, expr.cond)
      return truthy(c) ? yield* evalExpr(rt, expr.then) : yield* evalExpr(rt, expr.else)
    }

    // sizeof(x)：只為了 memset(a, 0, sizeof(a)) 與 sizeof(a)/sizeof(a[0]) 這兩個慣用寫法
    case 'sizeof': {
      return { type: 'int', v: yield* sizeofOperand(rt, expr.operand, expr.line) }
    }

    // 強制型別轉換：(int)x / (char)(c + 1) / (long long)x
    case 'cast': {
      const rv = yield* evalExpr(rt, expr.expr)
      assertScalarRV(rv, expr.line)
      return { type: expr.type, v: coerceTo(expr.type, rv, expr.line) }
    }

    case 'comparator':
      throw new RuntimeError('比较子 greater/less 只能用在 sort(v, cmp) 的位置', expr.line)

    case 'container_ctor': {
      if (expr.type.kind !== 'vector') throw new RuntimeError('暂只支持 vector 构造函数表达式', expr.line)
      const elem = expr.type.elem
      // vector<int>()：合法的「空 vector」，常写成 g.push_back(vector<int>())、v = vector<int>()。
      // 早先没处理 0 参数，会拿 undefined 去求值而崩成看不懂的内部讯息。
      if (!expr.size) return { type: 'int', v: 0, cell: allocVector(elem, 0, undefined, rt.structs) }
      const n = Math.max(0, toIndex(yield* evalExpr(rt, expr.size), expr.line))
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
  assertScalarRV(nv, expr.line) // a[0] = v 这种「把容器赋给标量元素」必须报错，不能静默写 0
  // 隐式转换照目标的型别做：char c; c = c + 1; 要存 'b' 而不是 98；
  // int x; x = 3.7; 要存 3（以前会把 3.7 原样存进去）。
  const sv = coerceTo(lv.cell.type, nv, expr.line)
  if (lv.strIdx !== undefined) {
    lv.mem.setStringChar(lv.name, lv.path, lv.strIdx, sv)
    rt.mem.logWrite(lv.name, lv.path.concat(lv.strIdx))
    return { type: lv.cell.type, v: sv }
  }
  lv.mem.setScalar(lv.name, lv.path, sv)
  rt.mem.logWrite(lv.name, lv.path)
  return { type: lv.cell.type, v: sv }
}

function* execUpdate(rt: Runtime, expr: Expr): Generator<Snapshot, RV> {
  const lv = yield* resolveTarget(rt, expr.target, true)
  if (lv.cell.kind !== 'scalar') throw new RuntimeError('非法的自增/自减目标', expr.line)
  const binOp = expr.op === '++' ? '+' : '-'
  const one: RV = { type: 'int', v: 1 }
  const old: RV = { type: lv.cell.type, v: lv.cell.value === null ? defaultScalar(lv.cell.type) : lv.cell.value }
  const nv = applyBinary(binOp, old, one, expr.line)
  // 存回去要照目标的型别转换：char c; c++ 要存 'b'，不是 98（以前 cout 会印出 98）
  const sv = coerceTo(lv.cell.type, nv, expr.line)
  lv.mem.setScalar(lv.name, lv.path, sv)
  rt.mem.logWrite(lv.name, lv.path)
  return expr.prefix ? { type: lv.cell.type, v: sv } : old
}

// 內建函式搬去 builtins.ts 了；這裡只做「先試內建、不是內建再呼叫使用者函式」。
function* execCall(rt: Runtime, expr: CallExpr): Generator<Snapshot, RV> {
  const name = expr.name
  const builtin = yield* execBuiltin(rt, expr, evalCtx)
  if (builtin) return builtin
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
      const locatable = ax.kind === 'ident' || ax.kind === 'member' || ax.kind === 'index'
      if (!locatable) {
        // const T& 可以绑临时值（C++ 的 const 引用会延长生命周期），f(5)、f(a+b) 都合法。
        // 反正 const 引用里写不进去，所以直接按值绑一份，行为与 C++ 一致。
        if (p.constRef) {
          argData.push({ rv: yield* evalExpr(rt, ax) })
          continue
        }
        throw new RuntimeError(
          '引用形参 ' + p.name + ' 需要一个变量（C++ 的 int& 不能绑常数或算式；要传常数请写成 const ' + (p.type.kind === 'scalar' ? p.type.name : 'T') + '& 或改成按值传参）',
          expr.line,
        )
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
    if ((p.byRef || p.isArray) && d && 'lv' in d) {
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
      const dd = d as { lv?: LValue; rv?: RV } | undefined
      const cell = dd && dd.lv ? dd.lv.cell : dd && dd.rv && dd.rv.cell ? dd.rv.cell : allocFromType(p.type, [], true, rt.structs)
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

// 容器／字串方法的實作搬去 builtins.ts 了。
function* execMethodCall(rt: Runtime, expr: MethodCallExpr): Generator<Snapshot, RV> {
  return yield* execMethod(rt, expr, evalCtx)
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
        else throw new RuntimeError('pair 的初始化式必须回传 pair', line)
      } else {
        // 其他容器（vector / map / set / deque / stack / queue / tree / bst）：
        // 以前这里什么都不做 → 静默留成空容器（比报错更糟）。现在要求初始化式回传同类容器。
        const rv = yield* evalExpr(rt, d.init)
        if (!rv.cell) throw new RuntimeError('不能用标量初始化 ' + cell.kind + '（请用会回传同类型容器的表达式）', line)
        if (rv.cell.kind !== cell.kind) throw new RuntimeError('初始化类型不匹配：' + cell.kind + ' = ' + rv.cell.kind, line)
        cell = rv.cell
      }
    }
  }

  rt.mem.declare(d.name, cell)
}

function* execBlock(rt: Runtime, body: Stmt[]): Generator<Snapshot> {
  for (const s of body) yield* execStmt(rt, s)
}

// cin >> ... 的共同實作：statement 形式與 while (cin >> x) 條件形式都用它。
// 回傳 false 代表讀到輸入結束（EOF）—— statement 形式會把它變成明確錯誤，
// 條件形式則讓迴圈自然結束（C++ 的 istream 轉 bool）。
function* cinReadTargets(rt: Runtime, targets: Expr[], line: number): Generator<Snapshot, boolean> {
  for (const target of targets) {
    const lv = yield* resolveTarget(rt, target, true)
    if (lv.cell.kind !== 'scalar') throw new RuntimeError('cin 目标应为标量变量', line)
    const tok = readCinToken(rt, lv.cell.type)
    if (tok === null) return false
    rt.inputPos++
    // char 目標直接吃一個字元（單一字元字串就是 char 的儲存形式）
    const value = lv.cell.type === 'char' ? tok : coerceTo(lv.cell.type, parseInputValue(tok), line)
    lv.mem.setScalar(lv.name, lv.path, value)
    rt.mem.logWrite(lv.name, lv.path)
  }
  return true
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
        if (item.kind === 'endl') {
          rt.out.push('\n')
          continue
        }
        // cout << fixed / setprecision(n)：C++ 的串流操縱子，本身不輸出東西。
        if (item.expr.kind === 'ident' && item.expr.name === 'fixed') {
          rt.floatFixed = true
          continue
        }
        if (item.expr.kind === 'call' && item.expr.name === 'setprecision') {
          if (item.expr.args.length !== 1) throw new RuntimeError('setprecision 需要 1 个参数', s.line)
          rt.floatPrecision = Math.trunc(num(yield* evalExpr(rt, item.expr.args[0]), s.line))
          continue
        }
        const rv = yield* evalExpr(rt, item.expr)
        assertScalarRV(rv, s.line)
        rt.out.push(toStringVal(rv, rt.boolAsInt, { fixed: rt.floatFixed, precision: rt.floatPrecision }))
      }
      yield* mark(rt, s.line)
      break

    case 'cin': {
      // 讲清楚「差多少」：不然使用者只能在程式里慢慢找是哪一个 cin 读不完
      if (!(yield* cinReadTargets(rt, s.targets, s.line))) throw new RuntimeError(inadequateInputMsg(rt), s.line)
      yield* mark(rt, s.line)
      break
    }

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
    // Windows 的 cin 輸入框會有 \r\n；不正規化的話 getline 讀到的行尾會多一個 \r
    inputText: (opts?.input ?? '').replace(/\r\n/g, String.fromCharCode(10)),
    textPos: 0,
    floatFixed: false,
    floatPrecision: null,
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
        error: '内部错误（这是本工具的 bug，请把这段程序反馈给我们）：' + e.message,
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
