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

export function tokenize(src: string): Token[] {
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
