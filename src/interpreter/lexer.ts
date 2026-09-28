export type TokType = 'num' | 'str' | 'chr' | 'ident' | 'op' | 'eof'

export interface Token {
  type: TokType
  value: string
  line: number
  col: number
}

const OPS2 = ['<<', '<=', '>=', '==', '!=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '->', '::']
const OPS1 = ['{', '}', '(', ')', '[', ']', ';', ',', '.', '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', ':', '?']

function isIdentStart(c: string): boolean {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_'
}
function isIdentPart(c: string): boolean {
  return isIdentStart(c) || (c >= '0' && c <= '9')
}
function isDigit(c: string): boolean {
  return c >= '0' && c <= '9'
}
function isHexDigit(c: string): boolean {
  return isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

export function parseNumber(raw: string): number {
  let s = raw
  s = s.replace(/(ULL|ull|LL|ll|UL|ul|L|l|U|u)+$/, '')
  if (/^0[xX]/.test(s)) return parseInt(s, 16)
  return Number(s)
}

// 掃描一段程式碼，跳過字串/字元常數與註解，只複製「程式碼」部分；
// 若遇到識別字就查巨集表換掉它。回傳 changed 讓外層知道還要不要再掃一趟（巨集套巨集）。
function substMacros(text: string, macros: Map<string, string>): { out: string; changed: boolean } {
  let out = ''
  let i = 0
  let changed = false
  while (i < text.length) {
    const c = text[i]
    if (c === '"' || c === "'") {
      const quote = c
      out += c
      i++
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') {
          out += text[i]
          i++
          if (i < text.length) {
            out += text[i]
            i++
          }
          continue
        }
        out += text[i]
        i++
      }
      if (i < text.length) {
        out += text[i]
        i++
      }
      continue
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        out += text[i]
        i++
      }
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      out += '/*'
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out += text[i]
        i++
      }
      if (i < text.length) {
        out += '*/'
        i += 2
      }
      continue
    }
    if (isIdentStart(c)) {
      let j = i
      while (j < text.length && isIdentPart(text[j])) j++
      const word = text.slice(i, j)
      const rep = macros.get(word)
      if (rep !== undefined) {
        out += rep
        changed = true
      } else {
        out += word
      }
      i = j
      continue
    }
    out += c
    i++
  }
  return { out, changed }
}

// #define NAME 內容 的文字層展開（本工具沒有真正的前置處理器）。
// 做法：第一趟把所有井號開頭的行拿掉（#include 本來就會被忽略），遇到物件式巨集就記下來；
// 用等長空白取代，這樣行號/欄號不變，錯誤訊息的位置還是對的。第二趟換掉識別字（最多 5 趟，支援巨集套巨集）。
// 只支援物件式巨集；函式式巨集（#define f(x) ...）忽略。
export function expandDefines(src: string): string {
  const macros = new Map<string, string>()
  let out = ''
  let i = 0
  let lineStart = true
  while (i < src.length) {
    const c = src[i]
    if (c === '\n') {
      out += c
      i++
      lineStart = true
      continue
    }
    if (c === '"' || c === "'") {
      const quote = c
      out += c
      i++
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') {
          out += src[i]
          i++
          if (i < src.length) {
            out += src[i]
            i++
          }
          continue
        }
        out += src[i]
        i++
      }
      if (i < src.length) {
        out += src[i]
        i++
      }
      lineStart = false
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += src[i]
        i++
      }
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      out += '/*'
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i]
        i++
      }
      if (i < src.length) {
        out += '*/'
        i += 2
      }
      lineStart = false
      continue
    }
    if (lineStart && (c === ' ' || c === '\t')) {
      out += c
      i++
      continue
    }
    if (lineStart && c === '#') {
      let j = i
      while (j < src.length && src[j] !== '\n') j++
      const lineText = src.slice(i, j)
      const m = /^#\s*define\s+([A-Za-z_]\w*)(.*)$/.exec(lineText)
      // 名稱後面「緊接著 (」＝函式式巨集（C++ 的判定方式就是這樣），不支援
      if (m && !m[2].startsWith('(')) macros.set(m[1], m[2].trim())
      out += ' '.repeat(j - i)
      i = j
      continue
    }
    if (c !== ' ' && c !== '\t') lineStart = false
    out += c
    i++
  }
  if (macros.size === 0) return out
  let text = out
  for (let k = 0; k < 5; k++) {
    const r = substMacros(text, macros)
    text = r.out
    if (!r.changed) break
  }
  return text
}

export function tokenize(src: string): Token[] {
  src = expandDefines(src)
  const tokens: Token[] = []
  let i = 0
  let line = 1
  let col = 1

  function advance(): string {
    const c = src[i++]
    if (c === '\n') {
      line++
      col = 1
    } else {
      col++
    }
    return c
  }
  function peek(off = 0): string {
    return src[i + off] ?? ''
  }

  while (i < src.length) {
    const c = src[i]

    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      advance()
      continue
    }

    if (c === '/' && peek(1) === '/') {
      while (i < src.length && src[i] !== '\n') advance()
      continue
    }
    if (c === '/' && peek(1) === '*') {
      advance()
      advance()
      while (i < src.length && !(src[i] === '*' && peek(1) === '/')) advance()
      advance()
      advance()
      continue
    }
    if (c === '#') {
      while (i < src.length && src[i] !== '\n') advance()
      continue
    }

    const startLine = line
    const startCol = col

    if (c === '"') {
      advance()
      let s = ''
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') {
          advance()
          const e = advance()
          if (e === 'n') s += '\n'
          else if (e === 't') s += '\t'
          else if (e === 'r') s += '\r'
          else if (e === '\\') s += '\\'
          else if (e === '"') s += '"'
          else if (e === "'") s += "'"
          else s += e
        } else {
          s += advance()
        }
      }
      advance()
      tokens.push({ type: 'str', value: s, line: startLine, col: startCol })
      continue
    }

    if (c === "'") {
      advance()
      let s = ''
      while (i < src.length && src[i] !== "'") {
        if (src[i] === '\\') {
          advance()
          const e = advance()
          if (e === 'n') s += '\n'
          else if (e === 't') s += '\t'
          else if (e === 'r') s += '\r'
          else if (e === '\\') s += '\\'
          else if (e === "'") s += "'"
          else s += e
        } else {
          s += advance()
        }
      }
      advance()
      tokens.push({ type: 'chr', value: s, line: startLine, col: startCol })
      continue
    }

    if (isDigit(c)) {
      let raw = ''
      if (c === '0' && (peek(1) === 'x' || peek(1) === 'X')) {
        raw += advance()
        raw += advance()
        while (isHexDigit(src[i])) raw += advance()
      } else {
        while (isDigit(src[i])) raw += advance()
        if (src[i] === '.' && isDigit(peek(1))) {
          raw += advance()
          while (isDigit(src[i])) raw += advance()
        }
        if (src[i] === 'e' || src[i] === 'E') {
          let j = i + 1
          if (src[j] === '+' || src[j] === '-') j++
          if (isDigit(src[j])) {
            raw += advance()
            if (src[i] === '+' || src[i] === '-') raw += advance()
            while (isDigit(src[i])) raw += advance()
          }
        }
      }
      while (src[i] === 'U' || src[i] === 'u' || src[i] === 'L' || src[i] === 'l') advance()
      tokens.push({ type: 'num', value: raw, line: startLine, col: startCol })
      continue
    }

    if (isIdentStart(c)) {
      let name = ''
      while (isIdentPart(src[i])) name += advance()
      tokens.push({ type: 'ident', value: name, line: startLine, col: startCol })
      continue
    }

    let matched = false
    for (const op of OPS2) {
      if (src.startsWith(op, i)) {
        for (let k = 0; k < op.length; k++) advance()
        tokens.push({ type: 'op', value: op, line: startLine, col: startCol })
        matched = true
        break
      }
    }
    if (matched) continue

    if (OPS1.includes(c)) {
      advance()
      tokens.push({ type: 'op', value: c, line: startLine, col: startCol })
      continue
    }

    advance()
    tokens.push({ type: 'op', value: c, line: startLine, col: startCol })
  }

  tokens.push({ type: 'eof', value: '', line, col })
  return tokens
}
