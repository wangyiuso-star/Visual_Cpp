// 値的轉換與比較：這些都是**純函式**（只依賴 runtime 的型別與小工具，不需要 Runtime 狀態），
// 所以從 interpreter.ts 抽出來（v0.10.x S2），可以單獨測試、也讓 builtins/stmts 直接共用。
import { RuntimeError, defaultScalar, isIntegral, truthy } from './runtime'
import type { RV, Runtime } from './runtime'
import type { Cell, ScalarValue, BstNode } from './memory'
import type { Type, ScalarTypeName, Expr } from './ast'

export function toStringVal(rv: RV, boolAsInt = false, fmt?: FloatFmt): string {
  if (rv.type === 'char') return rv.v as string
  if (rv.type === 'string') return rv.v as string
  if (rv.type === 'bool') return boolAsInt ? (rv.v ? '1' : '0') : rv.v ? 'true' : 'false'
  if (fmt && (rv.type === 'double' || rv.type === 'float')) return formatDouble(rv.v as number, fmt)
  return String(rv.v)
}

export interface FloatFmt {
  fixed: boolean
  precision: number | null
}

// C++ 預設的浮點輸出：6 位有效數字；指數 < -4 或 >= 6 時改用科學記號（指數至少兩位，1e+09）。
export function cppDefaultDouble(v: number): string {
  if (Number.isNaN(v)) return 'nan'
  if (v === Infinity) return 'inf'
  if (v === -Infinity) return '-inf'
  if (!Number.isFinite(v)) return String(v)
  if (v === 0) return '0'
  const exp = Math.floor(Math.log10(Math.abs(v)))
  if (exp < -4 || exp >= 6) {
    const m = /^(.*)e([+-])(\d+)$/.exec(v.toExponential(5))
    if (m) return String(Number(m[1])) + 'e' + m[2] + m[3].padStart(2, '0')
    return v.toExponential(5)
  }
  return String(Number(v.toPrecision(6)))
}

// cout << fixed << setprecision(n) 的組合，以及單獨的 setprecision(n)（有效位數）。
export function formatDouble(v: number, fmt: FloatFmt): string {
  if (fmt.fixed) return v.toFixed(Math.max(0, Math.min(20, fmt.precision ?? 6)))
  if (fmt.precision !== null) return String(Number(v.toPrecision(Math.max(1, Math.min(21, fmt.precision)))))
  return cppDefaultDouble(v)
}

export function parseInputValue(raw: string): RV {
  if (/^[+-]?\d+$/.test(raw)) return { type: 'int', v: parseInt(raw, 10) }
  if (/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(raw)) return { type: 'double', v: Number(raw) }
  return { type: 'string', v: raw }
}

// ---- cin 的游標模型 ----
// 舊版只有一個 token 陣列，所以 getline 不可能實作（換行資訊早就被 split 掉了）。
// 現在多存原始輸入 + 游標：>> 跳過空白讀一個 token（char 只吃一個字元，照 C++ 的 char 重載），
// getline 讀到下一個 '\n' 為止（並吃掉它）—— 所以 cin >> n; getline(cin, s); 會讀到空字串，
// 這正是 C++ 的經典行為（要配 cin.ignore()）。
export function assertScalarRV(rv: RV, line: number): void {
  if (rv.cell && rv.cell.kind !== 'scalar') {
    throw new RuntimeError(
      '不能把 ' + rv.cell.kind + ' 容器当作标量使用（用下标 / range-for 取出元素，或放到需要容器的位置）',
      line,
    )
  }
}

export function num(rv: RV, line: number): number {
  assertScalarRV(rv, line)
  if (typeof rv.v === 'number') return rv.v
  if (typeof rv.v === 'boolean') return rv.v ? 1 : 0
  if (typeof rv.v === 'string') {
    // char 存的是單字元字串，算術時要照它的字元碼（C++ 的 char 會被提升成 int）。
    // 少了這一條，'z' - 'a' 會變成「字符串 "z" 不能转为数字」——Unit 6「字元就是數字」整個上不了。
    if (rv.type === 'char') return charCode(rv.v)
    if (rv.v === '') return 0
    const n = Number(rv.v)
    if (!Number.isFinite(n)) throw new RuntimeError('字符串 "' + rv.v + '" 不能转为数字', line)
    return n
  }
  return 0
}

// ---- stoi / stol / stoll / stod / stof 用到的字串前缀解析 ----
export function digitValue(ch: string): number {
  const c = ch.toLowerCase()
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48
  if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 87
  return -1
}

export function isSpaceChar(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r'
}

// 照 C++ 的 stoi 语义：跳过前导空白、可选正负号，读到第一个不属于该进制的字符就停。
// 一个数字都没有 → 明确报错（对应 std::invalid_argument）。
export function parseIntPrefix(raw: string, base: number, line: number, fnName: string): number {
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
export function parseFloatPrefix(raw: string, line: number, fnName: string): number {
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

export function toIndex(rv: RV, line: number): number {
  const n = num(rv, line)
  if (!Number.isFinite(n)) throw new RuntimeError('非法的下标', line)
  return Math.trunc(n)
}

// <climits> 常見常數
export const BUILTIN_CONSTANTS: Record<string, number> = {
  INT_MAX: 2147483647,
  INT_MIN: -2147483648,
  LLONG_MAX: 9223372036854775807,
  LLONG_MIN: -9223372036854775808,
  UINT_MAX: 4294967295,
  LONG_MAX: 9223372036854775807,
  LONG_MIN: -9223372036854775808,
}

export function charCode(s: string): number {
  return s.length > 0 ? s.charCodeAt(0) : 0
}

// 標量之間比大小：只有「任一邊是 string 型別」才用字串比較（C++ 的 string 重載），
// 其餘照數值 —— char 用字元碼。以前是「typeof 是 string 就字串比」，
// 所以 'a' > 100 這種 char 與 int 混比會給錯答案。
export function cmp(l: RV, r: RV, line = 0): number {
  assertScalarRV(l, line)
  assertScalarRV(r, line)
  if (l.type === 'string' || r.type === 'string') {
    const a = toStringVal(l)
    const b = toStringVal(r)
    return a < b ? -1 : a > b ? 1 : 0
  }
  const a = num(l, line)
  const b = num(r, line)
  return a < b ? -1 : a > b ? 1 : 0
}

export function eq(l: RV, r: RV, line = 0): boolean {
  assertScalarRV(l, line)
  assertScalarRV(r, line)
  if (l.type === 'string' || r.type === 'string') return toStringVal(l) === toStringVal(r)
  return num(l, line) === num(r, line)
}

export function coerceTo(type: ScalarTypeName, rv: RV, line: number): ScalarValue {
  assertScalarRV(rv, line)
  if (type === 'string') return toStringVal(rv)
  if (type === 'char') {
    if (rv.type === 'char') return rv.v as string
    return String.fromCharCode(num(rv, line))
  }
  if (type === 'bool') return truthy(rv)
  if (type === 'double' || type === 'float') return num(rv, line)
  return Math.trunc(num(rv, line))
}

// sizeof 的位元組數。教學上真正需要的只有兩個慣用寫法：
//   memset(a, 0, sizeof(a))、sizeof(a) / sizeof(a[0])
// 動態容器（vector / string / set / map…）刻意不支援 —— C++ 的 sizeof(vector) 回的是「物件本身」
// 的大小（約 24 bytes），不是元素個數；回一個假數字會教出 sizeof(v)/sizeof(v[0]) 這個經典錯誤。
export const SCALAR_BYTES: Record<ScalarTypeName, number> = {
  char: 1,
  bool: 1,
  int: 4,
  'long long': 8,
  float: 4,
  double: 8,
  string: 32,
}

export const TYPE_NAME_BYTES: Record<string, number> = {
  int: 4,
  char: 1,
  bool: 1,
  short: 2,
  long: 8,
  'long long': 8,
  double: 8,
  float: 4,
  unsigned: 4,
  size_t: 8,
}

export function dynamicSizeError(line: number): never {
  throw new RuntimeError(
    'sizeof 只支援数组 / struct / pair / 纯量。C++ 的 sizeof 用在 vector/string/set/map 上回的是物件大小、不是元素个数（想取个数要用 .size()）',
    line,
  )
}

export function typeBytes(rt: Runtime, t: Type, line: number): number {
  if (t.kind === 'scalar') {
    if (t.name === 'string') dynamicSizeError(line)
    return SCALAR_BYTES[t.name]
  }
  if (t.kind === 'pair') return typeBytes(rt, t.first, line) + typeBytes(rt, t.second, line)
  if (t.kind === 'struct') {
    const def = rt.structs.get(t.name)
    if (!def) throw new RuntimeError('未定义的结构体 ' + t.name, line)
    return def.members.reduce((sum, m) => sum + typeBytes(rt, m.type, line), 0)
  }
  return dynamicSizeError(line)
}

export function cellBytes(rt: Runtime, cell: Cell, line: number): number {
  if (cell.kind === 'scalar') {
    if (cell.type === 'string') dynamicSizeError(line)
    return SCALAR_BYTES[cell.type]
  }
  if (cell.kind === 'array') return cell.size * typeBytes(rt, cell.elemType, line)
  if (cell.kind === 'pair') return cellBytes(rt, cell.first, line) + cellBytes(rt, cell.second, line)
  if (cell.kind === 'struct') return cell.members.reduce((sum, m) => sum + cellBytes(rt, m.cell, line), 0)
  return dynamicSizeError(line)
}

export function applyBinary(op: string, l: RV, r: RV, line: number): RV {
  switch (op) {
    case '+':
      if (l.type === 'string' || r.type === 'string') {
        assertScalarRV(l, line)
        assertScalarRV(r, line)
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
      return { type: 'bool', v: valueEquals(l, r, line) }
    case '!=':
      return { type: 'bool', v: !valueEquals(l, r, line) }
    case '<':
      return { type: 'bool', v: valueOrder(l, r, line) < 0 }
    case '<=':
      return { type: 'bool', v: valueOrder(l, r, line) <= 0 }
    case '>':
      return { type: 'bool', v: valueOrder(l, r, line) > 0 }
    case '>=':
      return { type: 'bool', v: valueOrder(l, r, line) >= 0 }
    default:
      throw new RuntimeError('不支持的操作符 "' + op + '"', line)
  }
}

export function numeric(
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

export function combineAssign(op: string, cur: RV, value: RV, line: number): RV {
  if (op === '=') return value
  return applyBinary(op.slice(0, -1), cur, value, line)
}

export function formatExpr(expr: Expr): string {
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

// 在「不可定位的临时容器」上取下标（只支援读取）：f()[0]、to_string(n)[0]、g(u)[1]
export function indexTempCell(cell: Cell, idx: number, line: number): Cell {
  if (cell.kind === 'scalar' && cell.type === 'string') {
    const s = (cell.value ?? '') as string
    if (idx < 0 || idx >= s.length) throw new RuntimeError('下标 ' + idx + ' 越界（长度 ' + s.length + '）', line)
    return { kind: 'scalar', type: 'char', value: s.charAt(idx) }
  }
  if (cell.kind === 'tree') {
    if (idx < 1 || idx > cell.size) throw new RuntimeError('tree 下标 ' + idx + ' 越界（范围 1..' + cell.size + '）', line)
    return cell.nodes[idx]
  }
  if (cell.kind === 'array' || cell.kind === 'vector' || cell.kind === 'deque') {
    const cells = cell.kind === 'deque' ? cell.items : cell.cells
    if (idx < 0 || idx >= cells.length) throw new RuntimeError('下标 ' + idx + ' 越界（长度 ' + cells.length + '）', line)
    return cells[idx]
  }
  throw new RuntimeError('这个表达式的结果是 ' + cell.kind + '，不能下标读取', line)
}

export function scalarName(elemType: Type, line: number): ScalarTypeName {
  if (elemType.kind !== 'scalar') throw new RuntimeError('该容器暂只支持标量元素', line)
  return elemType.name
}

export function scalarCmp(a: ScalarValue, b: ScalarValue): number {
  if (typeof a === 'string' || typeof b === 'string') {
    const sa = String(a)
    const sb = String(b)
    return sa < sb ? -1 : sa > sb ? 1 : 0
  }
  const na = Number(a)
  const nb = Number(b)
  return na < nb ? -1 : na > nb ? 1 : 0
}

export function scalarCell(elemType: Type, rv: RV, line: number): Cell {
  if (elemType.kind !== 'scalar') throw new RuntimeError('该容器暂只支持标量元素', line)
  return { kind: 'scalar', type: elemType.name, value: coerceTo(elemType.name, rv, line) }
}

// memset 是「逐位元組」填：memset(a, 0x3f, sizeof(a)) 會讓每個 int 變成 0x3f3f3f3f。
// 這個語意不能省略，否則學生會以為 memset 是把元素設成 0x3f。
export function memsetValue(elemType: Type, byte: number, elemBytes: number, line: number): Cell {
  if (elemType.kind === 'scalar') {
    if (elemType.name === 'char') return { kind: 'scalar', type: 'char', value: String.fromCharCode(byte) }
    if (elemType.name === 'bool') return { kind: 'scalar', type: 'bool', value: byte !== 0 }
    if (elemType.name === 'double' || elemType.name === 'float') {
      if (byte !== 0) throw new RuntimeError('memset 非 0 值用在 double/float 上会得到垃圾位元，本工具不模拟（请用 fill 或迴圈）', line)
      return { kind: 'scalar', type: elemType.name, value: 0 }
    }
    if (elemType.name === 'long long') {
      const v = byte === 0 ? 0 : byte === 255 ? -1 : byte * 0x0101010101010101
      return { kind: 'scalar', type: 'long long', value: v }
    }
    const v = (byte * 0x01010101) | 0
    return { kind: 'scalar', type: 'int', value: v }
  }
  throw new RuntimeError('memset 暂只支援纯量元素的数组 / vector', line)
}

export function elemCell(elemType: Type, rv: RV, line: number): Cell {
  if (rv.cell) return rv.cell
  return scalarCell(elemType, rv, line)
}

export function cellToRV(cell: Cell, line: number): RV {
  if (cell.kind === 'scalar') return { type: cell.type, v: cell.value === null ? defaultScalar(cell.type) : cell.value }
  if (cell.kind === 'pair') return { type: 'int', v: 0, cell }
  throw new RuntimeError('内部错误：非标量元素', line)
}

export function cellScalar(cell: Cell): ScalarValue {
  if (cell.kind !== 'scalar') throw new Error('cellScalar: 非标量')
  return cell.value === null ? defaultScalar(cell.type) : cell.value
}

// 容器摊平成「可比较的序列」：C++ 的 operator< 对 vector/deque/set/pair/map 都是字典序
//（map 比的是 (key,value) 序列）。raw array 刻意不支援 —— C++ 里 int a[3] == b[3] 比的是
// 指针地址，假装成逐元素比较会教错。stack/queue/priority_queue/tree/bst 也不支援。
export function seqOf(cell: Cell): Cell[] | null {
  switch (cell.kind) {
    case 'vector':
      return cell.cells
    case 'deque':
    case 'set':
      return cell.items
    case 'pair':
      return [cell.first, cell.second]
    case 'map':
      return cell.entries.flatMap((e) => [e.key, e.value])
    default:
      return null
  }
}

export function scalarOrderKey(cell: { type: ScalarTypeName; value: ScalarValue | null }): string | number {
  const v = cell.value === null ? defaultScalar(cell.type) : cell.value
  if (cell.type === 'char') return charCode(String(v))
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  return Number(v)
}

export function rawArrayCompareError(cell: Cell, line: number): never {
  throw new RuntimeError(
    'int a[] 之间的比较在 C++ 里比的是指针（地址），不是逐元素；本工具没有指针，所以不支援（请用 vector）',
    line,
  )
}

// 三向比较：-1 / 0 / 1。容器之间照 C++ 的字典序，元素可以是容器（镶嵌）。
export function cellOrder(a: Cell, b: Cell, line: number): number {
  if (a.kind === 'array' || b.kind === 'array') rawArrayCompareError(a.kind === 'array' ? a : b, line)
  if (a.kind !== b.kind) throw new RuntimeError('不能比较 ' + a.kind + ' 与 ' + b.kind + '（C++ 里只有同一种容器能比）', line)
  if (a.kind === 'scalar' && b.kind === 'scalar') {
    const x = scalarOrderKey(a)
    const y = scalarOrderKey(b)
    if (typeof x === 'string' && typeof y === 'string') return x < y ? -1 : x > y ? 1 : 0
    if (typeof x === 'string' || typeof y === 'string') {
      const sx = String(x)
      const sy = String(y)
      return sx < sy ? -1 : sx > sy ? 1 : 0
    }
    return x < y ? -1 : x > y ? 1 : 0
  }
  if (a.kind === 'umap' || b.kind === 'umap') {
    throw new RuntimeError('unordered_map 没有顺序，不能比大小（可以用 == 比相等）', line)
  }
  const sa = seqOf(a)
  const sb = seqOf(b)
  if (!sa || !sb) throw new RuntimeError(a.kind + ' 容器之间的比较暂不支援', line)
  const n = Math.min(sa.length, sb.length)
  for (let i = 0; i < n; i++) {
    const c = cellOrder(sa[i], sb[i], line)
    if (c !== 0) return c
  }
  return sa.length - sb.length
}

// 相等：unordered_map 是无序的，要比的是 (key,value) 集合。
export function cellEquals(a: Cell, b: Cell, line: number): boolean {
  if (a.kind === 'umap' || b.kind === 'umap') {
    if (a.kind !== b.kind) throw new RuntimeError('不能比较 ' + a.kind + ' 与 ' + b.kind, line)
    const key = (c: Cell) => (c.kind === 'umap' ? c.entries : [])
    const sa = key(a)
      .map((e) => [e.key, e.value] as [Cell, Cell])
      .sort((p, q) => cellOrder(p[0], q[0], line))
    const sb = key(b)
      .map((e) => [e.key, e.value] as [Cell, Cell])
      .sort((p, q) => cellOrder(p[0], q[0], line))
    if (sa.length !== sb.length) return false
    for (let i = 0; i < sa.length; i++) {
      if (cellOrder(sa[i][0], sb[i][0], line) !== 0) return false
      if (cellOrder(sa[i][1], sb[i][1], line) !== 0) return false
    }
    return true
  }
  return cellOrder(a, b, line) === 0
}

// 比较两个值（可能是容器，也可能是标量）。混用（容器 vs 标量）给明确错误。
export function valueOrder(l: RV, r: RV, line: number): number {
  const lc = l.cell && l.cell.kind !== 'scalar' ? l.cell : null
  const rc = r.cell && r.cell.kind !== 'scalar' ? r.cell : null
  if (lc && rc) return cellOrder(lc, rc, line)
  if (lc || rc) {
    throw new RuntimeError('不能把 ' + (lc ? lc.kind : rc!.kind) + ' 容器与标量比较', line)
  }
  return cmp(l, r, line)
}

export function valueEquals(l: RV, r: RV, line: number): boolean {
  const lc = l.cell && l.cell.kind !== 'scalar' ? l.cell : null
  const rc = r.cell && r.cell.kind !== 'scalar' ? r.cell : null
  if (lc && rc) return cellEquals(lc, rc, line)
  if (lc || rc) return false
  return eq(l, r, line)
}

export function setInsert(items: Cell[], item: Cell): { items: Cell[]; index: number } {
  const v = cellScalar(item)
  let i = 0
  while (i < items.length && scalarCmp(cellScalar(items[i]), v) < 0) i++
  if (i < items.length && scalarCmp(cellScalar(items[i]), v) === 0) return { items, index: i }
  const arr = items.slice()
  arr.splice(i, 0, item)
  return { items: arr, index: i }
}

export function setErase(items: Cell[], value: ScalarValue): { items: Cell[]; index: number } {
  const i = items.findIndex((c) => scalarCmp(cellScalar(c), value) === 0)
  if (i < 0) return { items, index: -1 }
  const arr = items.slice()
  arr.splice(i, 1)
  return { items: arr, index: i }
}

export function entryIndex(entries: { key: Cell; value: Cell }[], key: ScalarValue): number {
  return entries.findIndex((e) => scalarCmp(cellScalar(e.key), key) === 0)
}

export function entryInsert(entries: { key: Cell; value: Cell }[], keyCell: Cell, valueCell: Cell, sorted: boolean): { entries: { key: Cell; value: Cell }[]; index: number } {
  if (!sorted) return { entries: [...entries, { key: keyCell, value: valueCell }], index: entries.length }
  const key = cellScalar(keyCell)
  let i = 0
  while (i < entries.length && scalarCmp(cellScalar(entries[i].key), key) < 0) i++
  const arr = entries.slice()
  arr.splice(i, 0, { key: keyCell, value: valueCell })
  return { entries: arr, index: i }
}

export function heapNum(c: Cell): number {
  if (c.kind === 'pair') return heapNum(c.first)
  if (c.kind !== 'scalar') return 0
  const v = c.value
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  return 0
}

export function heapBetter(a: Cell, b: Cell, minHeap: boolean): boolean {
  return minHeap ? heapNum(a) < heapNum(b) : heapNum(a) > heapNum(b)
}

export function heapPush(items: Cell[], minHeap: boolean, item: Cell): Cell[] {
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

export function heapPop(items: Cell[], minHeap: boolean): Cell[] {
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

export function insertBst(root: BstNode | null, id: number, value: ScalarValue): BstNode {
  if (!root) return { id, value, left: null, right: null }
  if (scalarCmp(value, root.value) < 0) return { ...root, left: insertBst(root.left, id, value) }
  return { ...root, right: insertBst(root.right, id, value) }
}

export function findBst(root: BstNode | null, value: ScalarValue): BstNode | null {
  let cur = root
  while (cur) {
    const c = scalarCmp(value, cur.value)
    if (c === 0) return cur
    cur = c < 0 ? cur.left : cur.right
  }
  return null
}

