// 直譯器的「共同型別與小工具」：Runtime 狀態、Snapshot、錯誤、步數上限。
// 從 interpreter.ts 抽出來（v0.10.x S1）—— 讓 values / input / builtins / stmts 可以單向依賴這一層，
// 而不是全部擠在一個 2900 行的檔案裡互相參照。
import type { Memory, Cell, ScalarValue, VarView, CellRef } from './memory'
import type { ScalarTypeName, FunctionDef, StructDef } from './ast'

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
  /** 非致命警告：目前只有「long long 超过 2^53，JS number 已经开始失真」。
   *  不中断程序（所以不是 error），但要显式告诉使用者「这一步算的数已经不准了」——与项目第一原则一致。 */
  warning?: string
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

export interface RV {
  type: ScalarTypeName
  v: ScalarValue
  cell?: Cell
}

export interface LValue {
  name: string
  path: number[]
  cell: Cell
  mem: Memory
  strIdx?: number
}

export class BreakSignal {}
export class ContinueSignal {}
export class ReturnSignal {
  constructor(public value: RV | null, public cell?: Cell) {}
}

export interface Frame {
  mem: Memory
  callId: number
}

export interface Runtime {
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
  // cin 的游標模型：token 陣列只留著算「總共幾個值」（錯誤訊息用），
  // 真正的位置記在 inputText/textPos —— getline 必須知道換行在哪。
  input: string[]
  inputPos: number
  inputText: string
  textPos: number
  // cout << fixed / setprecision(n) 的輸出狀態（C++ 的串流狀態）
  floatFixed: boolean
  floatPrecision: number | null
  structs: Map<string, StructDef>
  sortInfo: { name: string; n: number; comparisons: number; warned: boolean } | null
  /** 最近一次「数值精度」警告（long long > 2^53）。每步快照会带上它，UI 显示在输出面板上方。 */
  warning?: string
}

export const MAX_STEPS = 20000

export function isIntegral(t: ScalarTypeName): boolean {
  return t === 'int' || t === 'long long' || t === 'char' || t === 'bool'
}

export function truthy(rv: RV): boolean {
  if (rv.type === 'bool') return rv.v === true
  if (typeof rv.v === 'number') return rv.v !== 0
  return (rv.v as string).length > 0
}

export function defaultScalar(type: ScalarTypeName): ScalarValue {
  if (type === 'bool') return false
  if (type === 'char') return ''
  if (type === 'string') return ''
  return 0
}
