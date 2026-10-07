// cin 的游標模型：`cin >> x` 跳過空白讀一個 token（char 目標只吃一個字元，照 C++ 的 char 重載），
// `getline` 讀到下一個換行（並吃掉它）。
// 從 interpreter.ts 抽出來（v0.10.x S3）—— 這是最容易寫錯的一塊（EOF、\r\n、getline 的經典陷阱），
// 獨立成檔比較好讀，也讓「輸入」的規則集中在一處。
import type { Runtime } from './runtime'
import type { ScalarTypeName } from './ast'
import { isSpaceChar } from './values'
export function skipInputSpace(rt: Runtime): void {
  while (rt.textPos < rt.inputText.length && isSpaceChar(rt.inputText.charAt(rt.textPos))) rt.textPos++
}

export function readCinToken(rt: Runtime, target: ScalarTypeName | null): string | null {
  skipInputSpace(rt)
  if (rt.textPos >= rt.inputText.length) return null
  if (target === 'char') {
    const ch = rt.inputText.charAt(rt.textPos)
    rt.textPos++
    return ch
  }
  let end = rt.textPos
  while (end < rt.inputText.length && !isSpaceChar(rt.inputText.charAt(end))) end++
  const tok = rt.inputText.slice(rt.textPos, end)
  rt.textPos = end
  return tok
}

export function readCinLine(rt: Runtime): string | null {
  if (rt.textPos >= rt.inputText.length) return null
  const nl = rt.inputText.indexOf('\n', rt.textPos)
  if (nl < 0) {
    const rest = rt.inputText.slice(rt.textPos)
    rt.textPos = rt.inputText.length
    return rest
  }
  const lineText = rt.inputText.slice(rt.textPos, nl)
  rt.textPos = nl + 1
  return lineText
}

// 容器长度（不是容器就回 null）
export function inadequateInputMsg(rt: Runtime): string {
  return (
    'cin 输入不足：程式要读第 ' +
    (rt.inputPos + 1) +
    ' 个值，但「cin 输入」框只提供了 ' +
    rt.input.length +
    ' 个（用空白分隔）'
  )
}

// 「容器不能当标量用」。evalExpr 现在会把「容器识别字 / 下标」当成「带 cell 的值」回传，
// 所以每个「要求标量」的入口都要在这里拦下来——否则会静默变成 0（那比报错更糟）。
