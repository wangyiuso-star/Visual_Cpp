// 測試共用樣板（重構 S9）。
//
// 以前每個 test/*.test.ts 都自己抄一份 `let pass/fail` + `check`（37 個檔 × ~15 行）；
// 這個檔案是它們唯一該住的地方。檔名以 `_` 開頭，所以 scripts/run-tests.mjs 不會把它
// 當成一個測試檔，但仍然可以被 import。
//
// 每個測試檔都是獨立的 node 行程（run-tests.mjs 逐檔 execFileSync），
// 所以這裡的計數器不會跨檔累加。
import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
import type { Snapshot } from '../src/interpreter/interpreter'

export const stats = { pass: 0, fail: 0 }

/** 斷言一個條件；失敗會印出名字與細節（有 detail 才印，維持原本的輸出格式）。 */
export function check(name: string, cond: boolean, detail = ''): boolean {
  if (cond) {
    stats.pass++
    return true
  }
  stats.fail++
  console.log('FAIL ' + name + (detail ? ' | ' + detail : ''))
  return false
}

/** 值的相等（===）。detail 會把期望與實際都印出來，方便一眼看出差在哪。 */
export function eq(name: string, actual: unknown, expected: unknown): boolean {
  return check(name, actual === expected, '期望 ' + JSON.stringify(expected) + '，實際 ' + JSON.stringify(actual))
}

/**
 * 跑一段 C++，回傳**最後一個**快照（含 output / error）。
 * 注意：run() 不丟執行期錯誤，錯誤在快照的 error 欄位；語法錯誤才會丟出來。
 */
export function run1(code: string, input = ''): Snapshot {
  let last: Snapshot | null = null
  for (const s of run(parse(code), { input })) last = s
  if (!last) throw new Error('程式沒有任何快照')
  return last
}

/** 斷言「這支程式的輸出等於 want」（執行期錯誤算失敗）。 */
export function out(name: string, code: string, want: string, input = ''): boolean {
  const s = run1(code, input)
  return check(name, !s.error && s.output === want, s.error ? '報錯: ' + s.error : '實際 "' + s.output + '"')
}

/**
 * 斷言「這支程式必須報錯」，而且（給了 wantPart 時）訊息要包含它。
 * 回傳錯誤訊息（沒報錯就回 null）—— 本工具的核心原則是不准靜默給錯答案，
 * 所以「不支援的寫法」一律要見到明確錯誤。
 */
export function err(name: string, code: string, wantPart = '', input = ''): string | null {
  let msg: string | null = null
  try {
    for (const s of run(parse(code), { input })) if (s.error) msg = s.error
  } catch (e) {
    msg = (e as Error).message
  }
  if (msg === null) {
    check(name, false, '竟然沒有報錯')
    return null
  }
  check(name, wantPart === '' || msg.indexOf(wantPart) >= 0, '訊息 "' + msg + '" 不含 "' + wantPart + '"')
  return msg
}

/** 收尾：印統計，有失敗就讓這個測試檔以非 0 結束（run-tests.mjs 靠 exit code 判斷）。 */
export function report(fileName: string): void {
  console.log('==== ' + fileName + ': ' + stats.pass + ' 通過, ' + stats.fail + ' 失敗 ====')
  if (stats.fail > 0) process.exit(1)
}
