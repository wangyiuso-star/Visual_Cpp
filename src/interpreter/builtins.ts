// 內建函式與容器／字串方法（execCall 的內建段 + execMethodCall 的主體）。
// 從 interpreter.ts 抽出來（v0.10.x S4）—— 這是最大的一塊，也是「加語言功能時常改」的地方。
//
// 為什麼需要 ctx：內建函式要「求值」與「取左值」，但那兩個是直譯器核心（核心又反過來呼叫這裡），
// 直接 import 會形成循環。所以核心把能力用參數注入；這裡只依賴型別與純函式。
import { RuntimeError, defaultScalar, truthy } from './runtime'
import type { LValue, RV, Runtime, Snapshot } from './runtime'
import { cellOrder, cellScalar, cellToRV, cmp, coerceTo, elemCell, entryIndex, findBst, formatExpr, heapPop, heapPush, insertBst, memsetValue, num, parseFloatPrefix, parseIntPrefix, scalarCell, scalarCmp, scalarName, setErase, setInsert, toIndex, toStringVal, typeBytes } from './values'
import { allocFromType } from './cells'
import { readCinLine } from './input'
import type { Cell } from './memory'
import type { CallExpr, Expr, MethodCallExpr, Type } from './ast'

export interface EvalCtx {
  evalExpr(rt: Runtime, expr: Expr): Generator<Snapshot, RV>
  resolveTarget(rt: Runtime, expr: Expr, forWrite?: boolean): Generator<Snapshot, LValue>
}

export function containerLen(cell: Cell): number | null {
  if (cell.kind === 'array') return cell.size
  if (cell.kind === 'vector') return cell.cells.length
  if (cell.kind === 'deque' || cell.kind === 'set') return cell.items.length
  return null
}

// 認得 OI 最常見的兩種「區間」寫法，把它化簡成「某個容器 + 個數」：
//   v.begin(), v.end()   → 整個容器
//   a, a + n             → 前 n 個
// 認不出來就回 null，讓呼叫端給原本的錯誤訊息（本工具不做真正的迭代器）。
function* resolveRange(
  rt: Runtime,
  ctx: EvalCtx,
  first: Expr,
  second: Expr,
  line: number,
): Generator<Snapshot, { lv: LValue; n: number } | null> {
  const same = (a: Expr, b: Expr) => formatExpr(a) === formatExpr(b)
  if (first.kind === 'method_call' && first.method === 'begin' && first.args.length === 0) {
    const e = second
    if (e.kind === 'method_call' && e.method === 'end' && e.args.length === 0 && same(e.object, first.object)) {
      const lv = yield* ctx.resolveTarget(rt, first.object, true)
      const len = containerLen(lv.cell)
      if (len === null) throw new RuntimeError('这个表达式不是容器，不能取 begin() / end()', line)
      return { lv, n: len }
    }
    return null
  }
  if (second.kind === 'binary' && second.op === '+' && same(second.left, first)) {
    const lv = yield* ctx.resolveTarget(rt, first, true)
    const len = containerLen(lv.cell)
    if (len === null) return null
    const n = toIndex(yield* ctx.evalExpr(rt, second.right), line)
    return { lv, n: Math.max(0, Math.min(len, n)) }
  }
  return null
}

function* buildStructFromList(rt: Runtime, ctx: EvalCtx, elemType: Type, items: Expr[], line: number): Generator<Snapshot, Cell> {
  if (elemType.kind !== 'struct') throw new RuntimeError('初始化列表只支持 struct 元素', line)
  const def = rt.structs.get(elemType.name)
  if (!def) throw new RuntimeError('未定义的结构体 ' + elemType.name, line)
  const members: { name: string; cell: Cell }[] = []
  for (let i = 0; i < def.members.length; i++) {
    const m = def.members[i]
    if (i < items.length && m.type.kind === 'scalar') {
      const rv = yield* ctx.evalExpr(rt, items[i])
      members.push({ name: m.name, cell: { kind: 'scalar', type: m.type.name, value: coerceTo(m.type.name, rv, line) } })
    } else {
      members.push({ name: m.name, cell: allocFromType(m.type, [], false, rt.structs) })
    }
  }
  return { kind: 'struct', structName: elemType.name, members }
}

function* buildElemCell(rt: Runtime, ctx: EvalCtx, elemType: Type, argExpr: Expr, line: number): Generator<Snapshot, Cell> {
  if (argExpr.kind === 'init_list') {
    // 元素本身是 vector 时（vector<vector<int>> g; g.push_back({1, 2});），
    // {…} 就是那个内层 vector 的初始化列表 —— 合法 C++，之前会报「只支持 struct 元素」。
    if (elemType.kind === 'vector') {
      const cells: Cell[] = []
      for (const it of argExpr.items) cells.push(yield* buildElemCell(rt, ctx, elemType.elem, it, line))
      return { kind: 'vector', elemType: elemType.elem, cells }
    }
    // vector<pair<int,int>> v; v.push_back({1, 2});
    if (elemType.kind === 'pair') {
      if (argExpr.items.length !== 2) throw new RuntimeError('pair 的初始化列表要有 2 个值（{first, second}）', line)
      const first = yield* buildElemCell(rt, ctx, elemType.first, argExpr.items[0], line)
      const second = yield* buildElemCell(rt, ctx, elemType.second, argExpr.items[1], line)
      return { kind: 'pair', firstType: elemType.first, secondType: elemType.second, first, second }
    }
    return yield* buildStructFromList(rt, ctx, elemType, argExpr.items, line)
  }
  if (argExpr.kind === 'ident' || argExpr.kind === 'index' || argExpr.kind === 'member') {
    const lv = yield* ctx.resolveTarget(rt, argExpr)
    if (lv.cell.kind === 'scalar') {
      const rv: RV = { type: lv.cell.type, v: lv.cell.value === null ? defaultScalar(lv.cell.type) : lv.cell.value }
      return scalarCell(elemType, rv, line)
    }
    return lv.cell
  }
  const v = yield* ctx.evalExpr(rt, argExpr)
  return elemCell(elemType, v, line)
}

function* callComparator(
  rt: Runtime,
  ctx: EvalCtx,
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
  const res = yield* ctx.evalExpr(rt, {
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
  ctx: EvalCtx,
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
        const takeRight = yield* callComparator(rt, ctx, cmpName, arr[j], arr[i], line)
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
    if (yield* callComparator(rt, ctx, cmpName, arr[i + 1], arr[i], line)) {
      stats.warned = true
      break
    }
  }
  return arr
}

// range-for 的容器 → 元素列表 + 元素类型 + 取引用的索引基准 + 能否写回
export function requireStringArg(rv: RV, method: string, line: number): string {
  if (rv.type === 'char') {
    throw new RuntimeError(
      method + ' 需要字串参数（C++ 没有接受单一字元的 ' + method + ' 重载）；单一字元请用 push_back 或 +=',
      line,
    )
  }
  if (rv.type !== 'string') {
    if (rv.cell && rv.cell.kind !== 'scalar') {
      throw new RuntimeError(method + ' 需要字串参数，收到 ' + rv.cell.kind + ' 容器', line)
    }
    throw new RuntimeError(method + ' 需要字串参数，收到 ' + rv.type + '（可用 to_string 转成字串）', line)
  }
  return rv.v as string
}

// 会改到容器的那些方法：不能让它们作用在临时值上（否则改了也没人看得见）
export const MUTATING_METHODS = [
  'push_back', 'pop_back', 'push_front', 'pop_front', 'push', 'pop',
  'insert', 'erase', 'replace', 'clear', 'resize', 'assign',
]


// execCall 的「內建函式」部分：不是內建就回 null，讓 execCall 去呼叫使用者定義的函式。
export function* execBuiltin(rt: Runtime, expr: CallExpr, ctx: EvalCtx): Generator<Snapshot, RV | null> {
  const name = expr.name
  // 使用者自己定義的函式優先：例如有人把遞迴函式取名 fill（test/arrayparam-test.ts 就是），
  // 內建不該把使用者的名字搶走。
  const shadowed = rt.functions.has(name)
  // 位元運算與相關內建是「永久排除」（教材編輯決定，見 AGENTS.md）。訊息講清楚，不要只說「未定义的函数」。
  if (name.startsWith('__builtin_')) {
    throw new RuntimeError('本工具不做位元运算相关的内建函数（' + name + '；位元运算已决定不做），可以改用迴圈或 x % 2 自己算', expr.line)
  }

  if (name === 'min' || name === 'max') {
    // min({a, b, c}) 這種初始化列表形式也是常見寫法
    if (expr.args.length === 1 && expr.args[0].kind === 'init_list') {
      const items = expr.args[0].items
      if (items.length === 0) throw new RuntimeError(name + '({}) 至少要有一个值', expr.line)
      let best0 = yield* ctx.evalExpr(rt, items[0])
      for (let i = 1; i < items.length; i++) {
        const cur = yield* ctx.evalExpr(rt, items[i])
        const c = cmp(cur, best0, expr.line)
        if ((name === 'min' && c < 0) || (name === 'max' && c > 0)) best0 = cur
      }
      return best0
    }
    if (expr.args.length < 2) throw new RuntimeError(name + ' 需要至少 2 个参数', expr.line)
    let best = yield* ctx.evalExpr(rt, expr.args[0])
    for (let i = 1; i < expr.args.length; i++) {
      const cur = yield* ctx.evalExpr(rt, expr.args[i])
      const c = cmp(cur, best)
      if ((name === 'min' && c < 0) || (name === 'max' && c > 0)) best = cur
    }
    return best
  }
  if (name === 'abs') {
    if (expr.args.length !== 1) throw new RuntimeError('abs 需要 1 个参数', expr.line)
    const a = yield* ctx.evalExpr(rt, expr.args[0])
    return { type: a.type, v: Math.abs(num(a, expr.line)) }
  }
  // <cmath> 的常用函式（Unit 1 §9 數學函式）。C++ 的 sqrt/pow/floor/ceil 都回 double。
  if (
    !shadowed &&
    (name === 'sqrt' ||
    name === 'pow' ||
    name === 'floor' ||
    name === 'ceil' ||
    name === 'round' ||
    name === 'fabs')
  ) {
    const need = name === 'pow' ? 2 : 1
    if (expr.args.length !== need) throw new RuntimeError(name + ' 需要 ' + need + ' 个参数', expr.line)
    const a = num(yield* ctx.evalExpr(rt, expr.args[0]), expr.line)
    if (name === 'pow') {
      const b = num(yield* ctx.evalExpr(rt, expr.args[1]), expr.line)
      return { type: 'double', v: Math.pow(a, b) }
    }
    if (name === 'sqrt') return { type: 'double', v: Math.sqrt(a) }
    if (name === 'floor') return { type: 'double', v: Math.floor(a) }
    if (name === 'ceil') return { type: 'double', v: Math.ceil(a) }
    if (name === 'round') return { type: 'double', v: Math.round(a) }
    return { type: 'double', v: Math.abs(a) }
  }
  if (name === 'getline' && !shadowed) {
    if (expr.args.length !== 2) throw new RuntimeError('getline 需要 2 个参数：getline(cin, s)', expr.line)
    const src = expr.args[0]
    if (!(src.kind === 'ident' && src.name === 'cin')) {
      throw new RuntimeError('getline 的第一个参数只支援 cin（读档还没做）', expr.line)
    }
    const lv = yield* ctx.resolveTarget(rt, expr.args[1], true)
    if (!(lv.cell.kind === 'scalar' && lv.cell.type === 'string')) {
      throw new RuntimeError('getline 的第二个参数要是 string 变量', expr.line)
    }
    const lineText = readCinLine(rt)
    if (lineText === null) return { type: 'bool', v: false } // C++：到檔案尾回 false、字串不變
    lv.mem.setScalar(lv.name, lv.path, lineText)
    rt.mem.logWrite(lv.name, lv.path)
    return { type: 'bool', v: true }
  }
  if (name === 'stoi' || name === 'stol' || name === 'stoll') {
    if (expr.args.length < 1) throw new RuntimeError(name + ' 需要 1 个字串参数', expr.line)
    const raw = yield* ctx.evalExpr(rt, expr.args[0])
    // C++ 的形态是 stoi(s, pos, base)：pos 是指针（我们没有指针），所以第 2 个参数忽略、第 3 个当进制
    let base = 10
    if (expr.args.length >= 3) {
      const b = num(yield* ctx.evalExpr(rt, expr.args[2]), expr.line)
      if (b < 2 || b > 36) throw new RuntimeError(name + ' 的进制必须在 2..36', expr.line)
      base = Math.trunc(b)
    }
    const v = parseIntPrefix(typeof raw.v === 'string' ? raw.v : String(raw.v), base, expr.line, name)
    return { type: name === 'stoi' ? 'int' : 'long long', v }
  }
  if (name === 'stod' || name === 'stof') {
    if (expr.args.length < 1) throw new RuntimeError(name + ' 需要 1 个字串参数', expr.line)
    const raw = yield* ctx.evalExpr(rt, expr.args[0])
    const v = parseFloatPrefix(typeof raw.v === 'string' ? raw.v : String(raw.v), expr.line, name)
    return { type: name === 'stod' ? 'double' : 'float', v }
  }
  if (name === 'to_string') {
    if (expr.args.length !== 1) throw new RuntimeError('to_string 需要 1 个参数', expr.line)
    const a = yield* ctx.evalExpr(rt, expr.args[0])
    return { type: 'string', v: toStringVal(a, rt.boolAsInt) }
  }
  if (name === 'toupper' || name === 'tolower') {
    if (expr.args.length !== 1) throw new RuntimeError(name + ' 需要 1 个字符参数', expr.line)
    const a = yield* ctx.evalExpr(rt, expr.args[0])
    const ch = String(a.v)
    // 单字元的 toUpperCase/toLowerCase 正好就是 ASCII 的转换（非字母不变）
    return { type: 'char', v: name === 'toupper' ? ch.toUpperCase() : ch.toLowerCase() }
  }
  if (name === 'isdigit' || name === 'isalpha' || name === 'isupper' || name === 'islower' || name === 'isalnum' || name === 'isspace') {
    if (expr.args.length !== 1) throw new RuntimeError(name + ' 需要 1 个字符参数', expr.line)
    const a = yield* ctx.evalExpr(rt, expr.args[0])
    const ch = String(a.v)
    const isDig = ch >= '0' && ch <= '9'
    const isUp = ch >= 'A' && ch <= 'Z'
    const isLow = ch >= 'a' && ch <= 'z'
    let res = false
    if (name === 'isdigit') res = isDig
    else if (name === 'isalpha') res = isUp || isLow
    else if (name === 'isupper') res = isUp
    else if (name === 'islower') res = isLow
    else if (name === 'isalnum') res = isDig || isUp || isLow
    else res = ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
    return { type: 'bool', v: res }
  }
  if (name === 'make_pair') {
    if (expr.args.length !== 2) throw new RuntimeError('make_pair 需要 2 个参数', expr.line)
    const a = yield* ctx.evalExpr(rt, expr.args[0])
    const b = yield* ctx.evalExpr(rt, expr.args[1])
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

  if (name === 'memset' && !shadowed) {
    if (expr.args.length !== 3) throw new RuntimeError('memset 需要 3 个参数：memset(数组, 值, sizeof(数组))', expr.line)
    const lv = yield* ctx.resolveTarget(rt, expr.args[0], true)
    if (lv.cell.kind !== 'array' && lv.cell.kind !== 'vector') {
      throw new RuntimeError('memset 的第一个参数要是数组或 vector', expr.line)
    }
    const raw = Math.trunc(num(yield* ctx.evalExpr(rt, expr.args[1]), expr.line))
    const bytes = Math.max(0, Math.trunc(num(yield* ctx.evalExpr(rt, expr.args[2]), expr.line)))
    const elemBytes = typeBytes(rt, lv.cell.elemType, expr.line)
    const count = Math.min(lv.cell.cells.length, Math.ceil(bytes / elemBytes))
    const byte = ((raw % 256) + 256) % 256
    const cells = lv.cell.cells.slice()
    for (let i = 0; i < count; i++) cells[i] = memsetValue(lv.cell.elemType, byte, elemBytes, expr.line)
    lv.mem.updateAt(lv.name, lv.path, (c0) => (c0.kind === 'array' || c0.kind === 'vector' ? { ...c0, cells } : c0))
    rt.mem.logWrite(lv.name, lv.path)
    return { type: 'int', v: 0 }
  }
  if (name === 'fill' && !shadowed) {
    if (expr.args.length !== 3) throw new RuntimeError('fill 需要 3 个参数：fill(v.begin(), v.end(), x) 或 fill(a, a+n, x)', expr.line)
    const r = yield* resolveRange(rt, ctx, expr.args[0], expr.args[1], expr.line)
    if (!r) throw new RuntimeError('fill 只支援 fill(v.begin(), v.end(), x) 或 fill(a, a+n, x)（本工具不做迭代器）', expr.line)
    if (r.lv.cell.kind !== 'array' && r.lv.cell.kind !== 'vector') throw new RuntimeError('fill 的目标要是数组或 vector', expr.line)
    const val = yield* ctx.evalExpr(rt, expr.args[2])
    const item = elemCell(r.lv.cell.elemType, val, expr.line)
    const cells = r.lv.cell.cells.slice()
    for (let i = 0; i < r.n; i++) cells[i] = item
    r.lv.mem.updateAt(r.lv.name, r.lv.path, (c0) => (c0.kind === 'array' || c0.kind === 'vector' ? { ...c0, cells } : c0))
    rt.mem.logWrite(r.lv.name, r.lv.path)
    return { type: 'int', v: 0 }
  }
  if (name === 'sort' || name === 'reverse') {
    if (expr.args.length === 0) throw new RuntimeError(name + ' 需要至少 1 个参数（容器）', expr.line)
    const a0 = expr.args[0]
    // OI 常見的區間寫法：sort(v.begin(), v.end()) / sort(a, a+n)（含帶比較子的版本）
    const range = expr.args.length >= 2 ? yield* resolveRange(rt, ctx, expr.args[0], expr.args[1], expr.line) : null
    if (!range && a0.kind === 'method_call' && (a0.method === 'begin' || a0.method === 'end')) {
      throw new RuntimeError(
        '不支持这种迭代器形式：请用 ' + name + '(v) / ' + name + '(v, n)，或 ' + name + '(v.begin(), v.end())',
        expr.line,
      )
    }
    // 参数形态：sort(v) / sort(v, n) / sort(v, cmp) / sort(v, n, cmp)；reverse 只有 (v) / (v, n)
    let cmpName: string | null = null
    let builtinCmp: 'greater' | 'less' | null = null
    let countArg: Expr | undefined
    if (range && name === 'sort' && expr.args.length >= 3) {
      // sort(v.begin(), v.end(), cmp) / sort(a, a+n, greater<int>())
      const a = expr.args[2]
      if (a.kind === 'comparator') builtinCmp = a.name
      else if (a.kind === 'ident' && rt.functions.has(a.name)) cmpName = a.name
      else throw new RuntimeError('sort 的第三个参数应是比较子（cmp 或 greater<int>()）', expr.line)
    } else if (name === 'sort' && expr.args.length >= 2) {
      // 參數形式：sort(v) / sort(v, n) / sort(v, cmp) / sort(v, n, cmp)（cmp 可以是函式名或 greater<int>()）
      for (let k = 1; k < expr.args.length; k++) {
        const a = expr.args[k]
        const isCmp = a.kind === 'comparator' || (a.kind === 'ident' && rt.functions.has(a.name))
        if (isCmp) {
          if (cmpName || builtinCmp) throw new RuntimeError('sort 只能有一个比较子', expr.line)
          if (a.kind === 'comparator') builtinCmp = a.name
          else cmpName = a.name
        } else {
          if (countArg) {
            throw new RuntimeError(
              expr.args.length >= 3
                ? 'sort 的第三个参数应是自定义比较函数的名字（或 greater<int>()）'
                : 'sort 的参数形式是 sort(v) / sort(v, n) / sort(v, cmp) / sort(v, n, cmp)',
              expr.line,
            )
          }
          countArg = a
        }
      }
    } else if (name === 'reverse' && expr.args.length >= 3) {
      throw new RuntimeError('reverse 只接受 reverse(v) / reverse(v, n) / reverse(v.begin(), v.end())', expr.line)
    } else if (!range) {
      countArg = expr.args[1]
    }
    const lv = range ? range.lv : yield* ctx.resolveTarget(rt, a0, true)
    if (lv.cell.kind === 'scalar' && lv.cell.type === 'string') {
      if (name === 'sort') throw new RuntimeError('sort 不支持 string，请用 reverse', expr.line)
      const s = (lv.cell.value ?? '') as string
      lv.mem.setScalar(lv.name, lv.path, s.split('').reverse().join(''))
      rt.mem.logWrite(lv.name, lv.path)
      return { type: 'int', v: 0 }
    }
    if (lv.cell.kind !== 'array' && lv.cell.kind !== 'vector') throw new RuntimeError(name + ' 需要数组或 vector', expr.line)
    const len = lv.cell.cells.length
    const n = range
      ? range.n
      : countArg
        ? Math.min(len, Math.max(0, toIndex(yield* ctx.evalExpr(rt, countArg), expr.line)))
        : len
    let part = lv.cell.cells.slice(0, n)
    if (name === 'sort') {
      if (cmpName) {
        const stats = { name: lv.name, n, comparisons: 0, warned: false }
        rt.sortInfo = stats
        const origAll = lv.cell.cells.slice()
        part = yield* stableSortWithCmp(rt, ctx, part, cmpName, expr.line, stats, (cur) => {
          const fullNow = origAll.slice()
          for (let i = 0; i < cur.length; i++) fullNow[i] = cur[i]
          lv.mem.updateAt(lv.name, lv.path, (c) => (c.kind === 'array' || c.kind === 'vector' ? { ...c, cells: fullNow } : c))
        })
      } else if (builtinCmp) {
        rt.sortInfo = null
        const sign = builtinCmp === 'greater' ? -1 : 1
        part = part.sort((x, y) => sign * cellOrder(x, y, expr.line))
      } else {
        rt.sortInfo = null
        // 容器元素也能排（sort(vector<pair<int,int>>) 是 OI 的常客）
        part = part.sort((x, y) => cellOrder(x, y, expr.line))
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
    // 区间写法：lower_bound(v.begin(), v.end(), x) / lower_bound(a, a+n, x)
    const range = expr.args.length >= 3 ? yield* resolveRange(rt, ctx, expr.args[0], expr.args[1], expr.line) : null
    if (!range && a0.kind === 'method_call' && (a0.method === 'begin' || a0.method === 'end')) {
      throw new RuntimeError(
        '不支持这种迭代器形式：请用 lower_bound(v, x) / lower_bound(v, n, x)，或 lower_bound(v.begin(), v.end(), x)',
        expr.line,
      )
    }
    const lv = range ? range.lv : yield* ctx.resolveTarget(rt, a0)
    if (lv.cell.kind !== 'array' && lv.cell.kind !== 'vector') throw new RuntimeError('lower_bound 需要数组或 vector', expr.line)
    const len = lv.cell.cells.length
    // 三种形式：lower_bound(v, x) 全区间；lower_bound(v, n, x) 前 n 个；区间写法
    const hasN = !range && expr.args.length >= 3
    const n = range ? range.n : hasN ? Math.min(len, Math.max(0, toIndex(yield* ctx.evalExpr(rt, expr.args[1]), expr.line))) : len
    const x = yield* ctx.evalExpr(rt, expr.args[range ? 2 : hasN ? 2 : 1])
    const xCell: Cell = x.cell ?? { kind: 'scalar', type: x.type, value: x.v }
    for (let i = 0; i < n; i++) {
      if (cellOrder(lv.cell.cells[i], xCell, expr.line) >= 0) {
        rt.mem.logRead(lv.name, lv.path.concat(i))
        return { type: 'int', v: i }
      }
    }
    return { type: 'int', v: n }
  }
  if (name === 'swap') {
    if (expr.args.length !== 2) throw new RuntimeError('swap 需要 2 个参数', expr.line)
    const la = yield* ctx.resolveTarget(rt, expr.args[0], true)
    const lb = yield* ctx.resolveTarget(rt, expr.args[1], true)
    if (la.cell.kind !== 'scalar' || lb.cell.kind !== 'scalar') throw new RuntimeError('swap 暂只支持标量', expr.line)
    const av = la.cell.value === null ? defaultScalar(la.cell.type) : la.cell.value
    const bv = lb.cell.value === null ? defaultScalar(lb.cell.type) : lb.cell.value
    la.mem.setScalar(la.name, la.path, bv)
    lb.mem.setScalar(lb.name, lb.path, av)
    rt.mem.logWrite(la.name, la.path)
    rt.mem.logWrite(lb.name, lb.path)
    return { type: 'int', v: 0 }
  }

  return null
}

// execMethodCall 的全部實作（容器／字串方法）。
export function* execMethod(rt: Runtime, expr: MethodCallExpr, ctx: EvalCtx): Generator<Snapshot, RV> {
  // cin.ignore() / cin.ignore(n, delim)：吃掉字元（cin >> n 之後要清掉換行，這是 getline 的搭檔）
  if (expr.object.kind === 'ident' && expr.object.name === 'cin') {
    // cin.get()：讀下一個字元（含空白，這點跟 cin >> c 不同），到檔案尾回空字元
    if (expr.method === 'get') {
      if (expr.args.length !== 0) throw new RuntimeError('cin.get() 不接受参数（cin.get(buf, n) 还没做）', expr.line)
      if (rt.textPos >= rt.inputText.length) return { type: 'char', v: '' }
      const ch = rt.inputText.charAt(rt.textPos)
      rt.textPos++
      return { type: 'char', v: ch }
    }
    if (expr.method !== 'ignore') throw new RuntimeError('cin 只支援 ignore() / get()（其他 istream 方法还没做）', expr.line)
    if (expr.args.length === 0) {
      if (rt.textPos < rt.inputText.length) rt.textPos++
      return { type: 'int', v: 0 }
    }
    const count = Math.max(0, Math.trunc(num(yield* ctx.evalExpr(rt, expr.args[0]), expr.line)))
    const delim =
      expr.args.length >= 2 ? String((yield* ctx.evalExpr(rt, expr.args[1])).v).charAt(0) : String.fromCharCode(10)
    let skipped = 0
    while (skipped < count && rt.textPos < rt.inputText.length) {
      const ch = rt.inputText.charAt(rt.textPos)
      rt.textPos++
      skipped++
      if (ch === delim) break
    }
    return { type: 'int', v: 0 }
  }
  // 方法的接收者通常是个左值（变量 / 下标 / 成员）；但也允许是临时值，
  // 这样 s.substr(1).size()、to_string(n).size() 这类串接能用（以前会报误导性的「非法的下标访问」）。
  const isTempReceiver = expr.object.kind === 'call' || expr.object.kind === 'method_call'
  let obj: LValue
  if (isTempReceiver) {
    if (MUTATING_METHODS.indexOf(expr.method) >= 0) {
      throw new RuntimeError('不能对临时值调用修改方法 "' + expr.method + '"（请先存成变量）', expr.line)
    }
    const rv = yield* ctx.evalExpr(rt, expr.object)
    obj = {
      name: '',
      path: [],
      mem: rt.mem,
      cell: rv.cell ?? { kind: 'scalar', type: rv.type, value: rv.v },
    }
  } else {
    // forWrite = true：方法可能改到接收者。这也让 m[不存在的键].push_back(x) 照 C++ 的
    // operator[] 语义先插入一个默认值（以前会走到 path -1，爆出 JS 内部错误）。
    // 纯读取 m[k]（不经方法）仍然维持「不插入」的既定行为。
    obj = yield* ctx.resolveTarget(rt, expr.object, true)
  }
  const method = expr.method
  const c = obj.cell

  // 本工具不做迭代器。直接寫 v.begin() / v.end()（沒有包在 sort/fill 的區間寫法裡）就在這裡給指引。
  if (method === 'begin' || method === 'end') {
    throw new RuntimeError(
      '本工具不做迭代器（' + method + '()）。走訪整個容器用 range-for：for (auto& x : v)；取長度用 v.size()；set/map 判斷存在用 s.count(x) > 0',
      expr.line,
    )
  }

  if (c.kind === 'scalar' && c.type === 'string') {
    const s = (c.value ?? '') as string
    if (method === 'length' || method === 'size') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'int', v: s.length }
    }
    if (method === 'substr') {
      if (expr.args.length < 1) throw new RuntimeError('substr 需要 1~2 个参数', expr.line)
      const pos = toIndex(yield* ctx.evalExpr(rt, expr.args[0]), expr.line)
      // C++ 的 substr 在 pos > size() 时丢 out_of_range；以前这里静默回空字串，
      // 与 at 的行为不一致。现在明确报错（pos == size() 合法，回空字串）。
      if (pos < 0 || pos > s.length) throw new RuntimeError('substr 的起始位置 ' + pos + ' 越界（长度 ' + s.length + '）', expr.line)
      const len = expr.args[1] ? toIndex(yield* ctx.evalExpr(rt, expr.args[1]), expr.line) : Math.max(0, s.length - pos)
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'string', v: s.substr(pos, Math.max(0, len)) }
    }
    if (method === 'find') {
      if (expr.args.length < 1) throw new RuntimeError('find 需要 1~2 个参数 (str[, pos])', expr.line)
      const t = toStringVal(yield* ctx.evalExpr(rt, expr.args[0]), rt.boolAsInt)
      // 第二参 pos：从该下标开始往后找（以前被忽略，属静默错误）
      const from = expr.args[1] ? Math.max(0, toIndex(yield* ctx.evalExpr(rt, expr.args[1]), expr.line)) : 0
      rt.mem.logRead(obj.name, obj.path)
      // 找不到回 -1（本工具没有 string::npos，教材请统一用 -1）
      return { type: 'int', v: s.indexOf(t, from) }
    }
    if (method === 'rfind') {
      if (expr.args.length < 1) throw new RuntimeError('rfind 需要 1~2 个参数 (str[, pos])', expr.line)
      const t = toStringVal(yield* ctx.evalExpr(rt, expr.args[0]), rt.boolAsInt)
      const from = expr.args[1] ? toIndex(yield* ctx.evalExpr(rt, expr.args[1]), expr.line) : s.length - 1
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'int', v: s.lastIndexOf(t, Math.min(from, s.length - 1)) }
    }
    if (method === 'empty') {
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'bool', v: s.length === 0 }
    }
    if (method === 'at' || method === 'front' || method === 'back') {
      if (s.length === 0) throw new RuntimeError(method + ' 对空 string 无意义', expr.line)
      let idx = 0
      if (method === 'at') {
        if (expr.args.length !== 1) throw new RuntimeError('at 需要 1 个参数', expr.line)
        idx = toIndex(yield* ctx.evalExpr(rt, expr.args[0]), expr.line)
      } else if (method === 'back') {
        idx = s.length - 1
      }
      if (idx < 0 || idx >= s.length) throw new RuntimeError('string 下标 ' + idx + ' 越界（长度 ' + s.length + '）', expr.line)
      rt.mem.logRead(obj.name, obj.path.concat(idx))
      return { type: 'char', v: s.charAt(idx) }
    }
    if (method === 'push_back') {
      if (expr.args.length !== 1) throw new RuntimeError('push_back 需要 1 个字符', expr.line)
      const ch = coerceTo('char', yield* ctx.evalExpr(rt, expr.args[0]), expr.line)
      obj.mem.setScalar(obj.name, obj.path, s + String(ch))
      rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'pop_back') {
      if (s.length === 0) throw new RuntimeError('对空 string 调用 pop_back', expr.line)
      obj.mem.setScalar(obj.name, obj.path, s.slice(0, -1))
      rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'append') {
      if (expr.args.length !== 1) throw new RuntimeError('append 需要 1 个参数', expr.line)
      const t = requireStringArg(yield* ctx.evalExpr(rt, expr.args[0]), method, expr.line)
      obj.mem.setScalar(obj.name, obj.path, s + t)
      rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'insert') {
      if (expr.args.length !== 2) throw new RuntimeError('insert 需要 2 个参数 (pos, str)', expr.line)
      const pos = toIndex(yield* ctx.evalExpr(rt, expr.args[0]), expr.line)
      if (pos < 0 || pos > s.length) throw new RuntimeError('insert 位置 ' + pos + ' 越界（长度 ' + s.length + '）', expr.line)
      const t = requireStringArg(yield* ctx.evalExpr(rt, expr.args[1]), method, expr.line)
      obj.mem.setScalar(obj.name, obj.path, s.slice(0, pos) + t + s.slice(pos))
      rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'erase') {
      if (expr.args.length < 1) throw new RuntimeError('erase 需要 1~2 个参数 (pos[, len])', expr.line)
      const pos = toIndex(yield* ctx.evalExpr(rt, expr.args[0]), expr.line)
      if (pos < 0 || pos > s.length) throw new RuntimeError('erase 位置 ' + pos + ' 越界（长度 ' + s.length + '）', expr.line)
      const len = expr.args[1] ? toIndex(yield* ctx.evalExpr(rt, expr.args[1]), expr.line) : s.length - pos
      obj.mem.setScalar(obj.name, obj.path, s.slice(0, pos) + s.slice(pos + Math.max(0, len)))
      rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'replace') {
      if (expr.args.length !== 3) throw new RuntimeError('replace 需要 3 个参数 (pos, len, str)', expr.line)
      const pos = toIndex(yield* ctx.evalExpr(rt, expr.args[0]), expr.line)
      const len = toIndex(yield* ctx.evalExpr(rt, expr.args[1]), expr.line)
      if (pos < 0 || pos > s.length) throw new RuntimeError('replace 位置 ' + pos + ' 越界（长度 ' + s.length + '）', expr.line)
      const t = requireStringArg(yield* ctx.evalExpr(rt, expr.args[2]), method, expr.line)
      obj.mem.setScalar(obj.name, obj.path, s.slice(0, pos) + t + s.slice(pos + Math.max(0, len)))
      rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'compare') {
      if (expr.args.length !== 1) throw new RuntimeError('compare 需要 1 个参数', expr.line)
      const t = requireStringArg(yield* ctx.evalExpr(rt, expr.args[0]), method, expr.line)
      rt.mem.logRead(obj.name, obj.path)
      return { type: 'int', v: s < t ? -1 : s > t ? 1 : 0 }
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
      const item = yield* buildElemCell(rt, ctx, c.elemType, expr.args[0], expr.line)
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
    if (method === 'front' || method === 'back' || method === 'at') {
      if (c.cells.length === 0) throw new RuntimeError(method + ' 对空 vector 无意义', expr.line)
      let idx = 0
      if (method === 'at') {
        if (expr.args.length !== 1) throw new RuntimeError('at 需要 1 个参数', expr.line)
        idx = toIndex(yield* ctx.evalExpr(rt, expr.args[0]), expr.line)
      } else if (method === 'back') {
        idx = c.cells.length - 1
      }
      if (idx < 0 || idx >= c.cells.length) throw new RuntimeError('vector 下标 ' + idx + ' 越界（长度 ' + c.cells.length + '）', expr.line)
      rt.mem.logRead(obj.name, obj.path.concat(idx))
      const el = c.cells[idx]
      return el.kind === 'scalar' ? { type: el.type, v: el.value === null ? defaultScalar(el.type) : el.value } : { type: 'int', v: 0, cell: el }
    }
    if (method === 'assign') {
      // v.assign(n, x)：把內容換成 n 個 x（C++ 的 assign(count, value) 形式）
      if (expr.args.length !== 2) throw new RuntimeError('assign 需要 2 个参数 (n, x)', expr.line)
      const n = Math.max(0, toIndex(yield* ctx.evalExpr(rt, expr.args[0]), expr.line))
      const val = yield* ctx.evalExpr(rt, expr.args[1])
      const item = elemCell(c.elemType, val, expr.line)
      const cells: Cell[] = []
      for (let i = 0; i < n; i++) cells.push(item)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, cells }))
      rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'resize') {
      if (expr.args.length < 1) throw new RuntimeError('resize 需要至少 1 个参数', expr.line)
      const n = Math.max(0, toIndex(yield* ctx.evalExpr(rt, expr.args[0]), expr.line))
      const cells = c.cells.slice()
      while (cells.length > n) cells.pop()
      while (cells.length < n) cells.push(allocFromType(c.elemType, [], true, rt.structs))
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, cells }))
      rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'insert') {
      if (expr.args.length !== 2) throw new RuntimeError('insert 需要 2 个参数 (pos, val)', expr.line)
      const pos = toIndex(yield* ctx.evalExpr(rt, expr.args[0]), expr.line)
      if (pos < 0 || pos > c.cells.length) throw new RuntimeError('insert 位置 ' + pos + ' 越界（长度 ' + c.cells.length + '）', expr.line)
      const item = yield* buildElemCell(rt, ctx, c.elemType, expr.args[1], expr.line)
      const cells = c.cells.slice()
      cells.splice(pos, 0, item)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, cells }))
      rt.mem.logWrite(obj.name, obj.path.concat(pos))
      return { type: 'int', v: 0 }
    }
    if (method === 'erase') {
      if (expr.args.length < 1) throw new RuntimeError('erase 需要 1~2 个参数 (pos[, len])', expr.line)
      const pos = toIndex(yield* ctx.evalExpr(rt, expr.args[0]), expr.line)
      if (pos < 0 || pos >= c.cells.length) throw new RuntimeError('erase 位置 ' + pos + ' 越界（长度 ' + c.cells.length + '）', expr.line)
      const len = expr.args[1] ? toIndex(yield* ctx.evalExpr(rt, expr.args[1]), expr.line) : 1
      const cells = c.cells.slice()
      cells.splice(pos, Math.max(0, len))
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, cells }))
      rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
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
      const item = yield* buildElemCell(rt, ctx, c.elemType, expr.args[0], expr.line)
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
      const item = yield* buildElemCell(rt, ctx, c.elemType, expr.args[0], expr.line)
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
      const item = yield* buildElemCell(rt, ctx, c.elemType, expr.args[0], expr.line)
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
      const item = yield* buildElemCell(rt, ctx, c.elemType, expr.args[0], expr.line)
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
      const item = yield* buildElemCell(rt, ctx, c.elemType, expr.args[0], expr.line)
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
      const v = yield* ctx.evalExpr(rt, expr.args[0])
      const value = coerceTo(typeName, v, expr.line)
      const id = c.nextId
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, root: insertBst(c.root, id, value), count: c.count + 1, nextId: c.nextId + 1 }))
      rt.mem.logWrite(obj.name, obj.path.concat(id))
      return { type: 'int', v: 0 }
    }
    if (method === 'find') {
      if (expr.args.length !== 1) throw new RuntimeError('find 需要 1 个参数', expr.line)
      const v = yield* ctx.evalExpr(rt, expr.args[0])
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
    // set 的排序与去重都靠 scalarCmp，元素必须是标量。在入口就给明确错误，
    // 免得学生看到「cellScalar: 非标量」这种内部讯息。
    scalarName(c.elemType, expr.line)
    if (method === 'insert') {
      if (expr.args.length !== 1) throw new RuntimeError('insert 需要 1 个参数', expr.line)
      const v = yield* ctx.evalExpr(rt, expr.args[0])
      const item = elemCell(c.elemType, v, expr.line)
      const r = setInsert(c.items, item)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: r.items }))
      rt.mem.logWrite(obj.name, obj.path.concat(r.index))
      return { type: 'int', v: 0 }
    }
    if (method === 'erase') {
      if (expr.args.length !== 1) throw new RuntimeError('erase 需要 1 个参数', expr.line)
      const v = yield* ctx.evalExpr(rt, expr.args[0])
      const value = coerceTo(scalarName(c.elemType, expr.line), v, expr.line)
      const r = setErase(c.items, value)
      obj.mem.updateAt(obj.name, obj.path, () => ({ ...c, items: r.items }))
      if (r.index >= 0) rt.mem.logWrite(obj.name, obj.path.concat(r.index))
      else rt.mem.logWrite(obj.name, obj.path)
      return { type: 'int', v: 0 }
    }
    if (method === 'find' || method === 'count') {
      if (expr.args.length !== 1) throw new RuntimeError(method + ' 需要 1 个参数', expr.line)
      const v = yield* ctx.evalExpr(rt, expr.args[0])
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
      const v = yield* ctx.evalExpr(rt, expr.args[0])
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
      const v = yield* ctx.evalExpr(rt, expr.args[0])
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
