// 對外入口：只放 run()（把程式跑成一個 Snapshot 序列）與公開型別的轉出。
// 執行引擎在 core.ts，各層職責見 ARCHITECTURE.md。
import { ReturnSignal, RuntimeError } from './runtime'
import type { RunOptions, Runtime, Snapshot } from './runtime'
import { cloneCallTree, dumpAll } from './snapshot'
import { execBlock } from './core'
import { toStringVal } from './values'
import { Memory } from './memory'
import type { Program } from './ast'
// 對外的公開型別照舊從 interpreter 匯出（App / 面板 / 測試都是從這裡 import 的）
export type { CallNode, RunOptions, Snapshot } from './runtime'
export { RuntimeError } from './runtime'

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
