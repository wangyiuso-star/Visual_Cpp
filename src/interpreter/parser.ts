import { tokenize, parseNumber } from './lexer'
import type { Token } from './lexer'
import type { Program, Stmt, Expr, VarDecl, Type, ScalarTypeName, CoutItem, InitExpr, FunctionDef, FunctionParam, StructDef } from './ast'

export class ParseError extends Error {
  line: number
  constructor(message: string, line: number) {
    super(message)
    this.line = line
    this.name = 'ParseError'
  }
}

const SCALAR_TYPES = ['int', 'long', 'char', 'bool', 'string', 'double', 'float']
const ASSIGN_OPS = ['=', '+=', '-=', '*=', '/=', '%=']

const BIN_PREC: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
}

export function parse(src: string): Program {
  return new Parser(src).parseProgram()
}

class Parser {
  tokens: Token[]
  pos = 0
  structs = new Map<string, StructDef>()
  structNames = new Set<string>()

  constructor(src: string) {
    this.tokens = tokenize(src)
  }

  cur(off = 0): Token {
    return this.tokens[Math.min(this.pos + off, this.tokens.length - 1)]
  }

  isIdent(value?: string): boolean {
    const t = this.cur()
    return t.type === 'ident' && (value === undefined || t.value === value)
  }

  isOp(value?: string): boolean {
    const t = this.cur()
    return t.type === 'op' && (value === undefined || t.value === value)
  }

  next(): Token {
    const t = this.cur()
    if (t.type !== 'eof') this.pos++
    return t
  }

  expectOp(value: string): void {
    if (!this.isOp(value)) {
      throw new ParseError('期望 "' + value + '"，但得到 "' + (this.cur().value || '文件末尾') + '"', this.cur().line)
    }
    this.next()
  }

  expectIdent(): Token {
    if (this.cur().type !== 'ident') {
      throw new ParseError('期望标识符，但得到 "' + (this.cur().value || '文件末尾') + '"', this.cur().line)
    }
    return this.next()
  }

  eatOp(value: string): boolean {
    if (this.isOp(value)) {
      this.next()
      return true
    }
    return false
  }

  eatIdent(value: string): boolean {
    if (this.isIdent(value)) {
      this.next()
      return true
    }
    return false
  }

  expectSemi(): void {
    if (!this.eatOp(';')) {
      throw new ParseError('期望 ";"', this.cur().line)
    }
  }

  skipToSemi(): void {
    while (this.cur().type !== 'eof' && !this.isOp(';')) this.next()
    this.eatOp(';')
  }

  parseStruct(): void {
    this.next() // struct
    const name = this.expectIdent().value
    this.expectOp('{')
    const members: { name: string; type: Type }[] = []
    while (!this.isOp('}') && this.cur().type !== 'eof') {
      const t = this.parseType()
      const mname = this.expectIdent().value
      this.expectSemi()
      members.push({ name: mname, type: t })
    }
    this.expectOp('}')
    this.expectSemi()
    this.structs.set(name, { name, members })
    this.structNames.add(name)
  }

  parseProgram(): Program {
    const topLevel: Stmt[] = []
    const functions = new Map<string, FunctionDef>()
    let mainBody: Stmt[] | null = null
    while (this.cur().type !== 'eof') {
      if (this.isIdent('using') || this.isIdent('typedef')) {
        this.skipToSemi()
        continue
      }
      if (this.isIdent('struct')) {
        this.parseStruct()
        continue
      }
      if (this.isMainStart()) {
        mainBody = []
        this.parseMain(mainBody)
        break
      }
      const fn = this.tryParseFunction()
      if (fn) {
        functions.set(fn.name, fn)
        continue
      }
      topLevel.push(this.parseStatement())
    }
    if (mainBody === null) {
      return { kind: 'program', globals: [], body: topLevel, functions, structs: this.structs }
    }
    return { kind: 'program', globals: topLevel, body: mainBody, functions, structs: this.structs }
  }

  tryParseFunction(): FunctionDef | null {
    if (!this.isTypeStart() && !this.isIdent('void')) return null
    const saved = this.pos
    while (this.isIdent('const') || this.isIdent('static')) this.next()
    const line = this.cur().line
    if (this.isIdent('void')) {
      this.next()
    } else {
      this.parseType()
    }
    if (this.cur().type !== 'ident') {
      this.pos = saved
      return null
    }
    this.next() // 函数名
    if (!this.isOp('(')) {
      this.pos = saved
      return null
    }
    // 轻量扫描：跳过参数列表找到匹配的 ')'
    let depth = 0
    while (this.cur().type !== 'eof') {
      if (this.isOp('(')) depth++
      else if (this.isOp(')')) {
        depth--
        if (depth === 0) break
      }
      this.next()
    }
    if (this.cur().type === 'eof' || !this.isOp(')')) {
      this.pos = saved
      return null
    }
    this.next() // 跳过 ')'
    const isFn = this.isOp('{')
    this.pos = saved
    if (!isFn) return null

    // 确认是函数，完整解析
    while (this.isIdent('const') || this.isIdent('static')) this.next()
    let returnType: 'void' | Type
    if (this.isIdent('void')) {
      this.next()
      returnType = 'void'
    } else {
      returnType = this.parseType()
    }
    const name = this.expectIdent().value
    this.expectOp('(')
    const params: FunctionParam[] = []
    if (!this.isOp(')')) {
      do {
        const pt = this.parseType()
        const byRef = this.eatOp('&')
        const pname = this.expectIdent().value
        // 形参数组后缀：int a[] / int a[10] / int a[][3]。长度一律忽略（与 C++ 参数退化为指针一致）。
        let isArray = false
        while (this.isOp('[')) {
          this.next()
          if (!this.isOp(']')) this.parseExpr()
          this.expectOp(']')
          isArray = true
        }
        params.push({ name: pname, type: pt, byRef, isArray })
      } while (this.eatOp(','))
    }
    this.expectOp(')')
    this.expectOp('{')
    const fnBody: Stmt[] = []
    while (!this.isOp('}') && this.cur().type !== 'eof') fnBody.push(this.parseStatement())
    this.expectOp('}')
    return { name, returnType, params, body: fnBody, line }
  }

  isMainStart(): boolean {
    const t = this.cur()
    if (t.type !== 'ident') return false
    if (t.value === 'int' || t.value === 'signed') {
      const m = this.cur(1)
      return m.type === 'ident' && m.value === 'main' && this.cur(2).value === '('
    }
    return false
  }

  parseMain(body: Stmt[]): void {
    while (this.cur().type !== 'eof' && !(this.cur().type === 'ident' && this.cur().value === 'main')) {
      this.next()
    }
    this.next()
    if (this.isOp('(')) {
      this.next()
      let depth = 1
      while (this.cur().type !== 'eof' && depth > 0) {
        if (this.isOp('(')) depth++
        else if (this.isOp(')')) depth--
        this.next()
      }
    }
    this.expectOp('{')
    while (!this.isOp('}') && this.cur().type !== 'eof') {
      body.push(this.parseStatement())
    }
    this.eatOp('}')
  }

  parseStatement(): Stmt {
    const t = this.cur()
    const line = t.line

    if (this.isOp(';')) {
      this.next()
      return { kind: 'empty', line }
    }
    if (this.isOp('{')) return this.parseBlock()
    if (this.isIdent('if')) return this.parseIf()
    if (this.isIdent('for')) return this.parseFor()
    if (this.isIdent('while')) return this.parseWhile()
    if (this.isIdent('do')) return this.parseDo()
    if (this.isIdent('break')) {
      this.next()
      this.expectSemi()
      return { kind: 'break', line }
    }
    if (this.isIdent('continue')) {
      this.next()
      this.expectSemi()
      return { kind: 'continue', line }
    }
    if (this.isIdent('return')) return this.parseReturn()
    if (this.isIdent('cout')) return this.parseCout()
    if (this.isIdent('cin')) return this.parseCin()
    if (this.isTypeStart()) return this.parseVarDecl()

    const expr = this.parseExpr()
    this.expectSemi()
    return { kind: 'expr_stmt', line, expr }
  }

  parseBlock(): Stmt {
    const line = this.cur().line
    this.expectOp('{')
    const body: Stmt[] = []
    while (!this.isOp('}') && this.cur().type !== 'eof') {
      body.push(this.parseStatement())
    }
    this.expectOp('}')
    return { kind: 'block', line, body }
  }

  parseIf(): Stmt {
    const line = this.cur().line
    this.next()
    this.expectOp('(')
    const cond = this.parseExpr()
    this.expectOp(')')
    const then = this.parseStatement()
    let els: Stmt | undefined
    if (this.isIdent('else')) {
      this.next()
      els = this.parseStatement()
    }
    return { kind: 'if', line, cond, then, else: els }
  }

  parseWhile(): Stmt {
    const line = this.cur().line
    this.next()
    this.expectOp('(')
    const cond = this.parseExpr()
    this.expectOp(')')
    const body = this.parseStatement()
    return { kind: 'while', line, cond, body }
  }

  // do <body> while (<cond>);
  parseDo(): Stmt {
    const line = this.cur().line
    this.next() // 吃掉 do
    const body = this.parseStatement()
    if (!this.isIdent('while')) throw new ParseError('do 之后需要 while', this.cur().line)
    const condLine = this.cur().line
    this.next() // 吃掉 while
    this.expectOp('(')
    const cond = this.parseExpr()
    this.expectOp(')')
    this.expectSemi()
    return { kind: 'do', line, condLine, cond, body }
  }

  parseFor(): Stmt {
    const line = this.cur().line
    this.next()
    this.expectOp('(')
    // C++11 范围 for：在标头结束的 ) 之前、或在 ; 之前先遇到 : 就是这种形式。
    // （:: 在 lexer 里已经是单独 token，不会被误判；字符串/字符字面量也是单独 token。）
    if (this.isRangeForHeader()) return this.parseRangeFor(line)
    let init: Stmt | undefined
    let cond: Expr | undefined
    let incr: Expr | undefined

    if (this.isOp(';')) {
      this.next()
    } else if (this.isTypeStart()) {
      init = this.parseVarDecl()
    } else {
      const e = this.parseExpr()
      this.expectSemi()
      init = { kind: 'expr_stmt', line, expr: e }
    }

    if (!this.isOp(';')) cond = this.parseExpr()
    this.expectOp(';')

    if (!this.isOp(')')) incr = this.parseExpr()
    this.expectOp(')')

    const body = this.parseStatement()
    return { kind: 'for', line, init, cond, incr, body }
  }

  // 向前扫描标头：遇到 depth 0 的 : 就是范围 for；先遇到 depth 0 的 ; 或 ) 则不是。
  isRangeForHeader(): boolean {
    let depth = 0
    for (let i = 0; i < 500; i++) {
      const t = this.cur(i)
      if (t.type === 'eof') return false
      if (t.type !== 'op') continue
      const v = t.value
      if (v === '(' || v === '[' || v === '{') depth++
      else if (v === ']' || v === '}') depth = Math.max(0, depth - 1)
      else if (v === ')') {
        if (depth === 0) return false
        depth--
      } else if (v === ';' && depth === 0) return false
      else if (v === ':' && depth === 0) return true
    }
    return false
  }

  // for (T x : c) / for (auto x : c) / for (auto& x : c)
  parseRangeFor(line: number): Stmt {
    while (this.isIdent('const') || this.isIdent('static')) this.next()
    let declType: Type | null = null
    if (this.isIdent('auto')) this.next()
    else declType = this.parseType()
    const byRef = this.eatOp('&')
    const name = this.expectIdent().value
    this.expectOp(':')
    const iter = this.parseExpr()
    this.expectOp(')')
    const body = this.parseStatement()
    return { kind: 'range_for', line, declType, byRef, name, iter, body }
  }

  parseReturn(): Stmt {
    const line = this.cur().line
    this.next()
    let value: Expr | undefined
    if (!this.isOp(';')) value = this.parseExpr()
    this.expectSemi()
    return { kind: 'return', line, value }
  }

  parseCout(): Stmt {
    const line = this.cur().line
    this.next()
    const items: CoutItem[] = []
    while (this.eatOp('<<')) {
      if (this.isIdent('endl')) {
        this.next()
        items.push({ kind: 'endl' })
        continue
      }
      items.push({ kind: 'expr', expr: this.parseExpr() })
    }
    this.expectSemi()
    return { kind: 'cout', line, items }
  }

  parseCin(): Stmt {
    const line = this.cur().line
    this.next() // cin
    const targets: Expr[] = []
    while (this.isOp('>') && this.cur(1).value === '>') {
      this.next()
      this.next()
      targets.push(this.parseCinTarget())
    }
    this.expectSemi()
    return { kind: 'cin', line, targets }
  }

  parseCinTarget(): Expr {
    const t = this.cur()
    if (t.type !== 'ident') throw new ParseError('cin 目标应为变量', t.line)
    this.next()
    let e: Expr = { kind: 'ident', line: t.line, name: t.value }
    while (this.isOp('[')) {
      this.next()
      const idx = this.parseExpr()
      this.expectOp(']')
      e = { kind: 'index', line: t.line, target: e, index: idx }
    }
    return e
  }

  isTypeStart(): boolean {
    let i = 0
    while (this.cur(i).value === 'const' || this.cur(i).value === 'static') i++
    const t = this.cur(i)
    if (t.type !== 'ident') return false
    if (SCALAR_TYPES.includes(t.value)) return true
    if (t.value === 'vector') return true
    if (t.value === 'stack' || t.value === 'queue' || t.value === 'priority_queue') return true
    if (t.value === 'tree' || t.value === 'bst') return true
    if (t.value === 'set' || t.value === 'map' || t.value === 'unordered_map') return true
    if (t.value === 'pair') return true
    if (t.value === 'deque') return true
    if (t.value === 'std') return this.cur(i + 1).value === '::'
    if (t.value === 'signed') {
      const n = this.cur(i + 1).value
      return n === 'int' || n === 'long' || n === 'char'
    }
    if (t.value === 'unsigned') return true
    if (this.structNames.has(t.value)) return true
    return false
  }

  parseVarDecl(): Stmt {
    const line = this.cur().line
    while (this.isIdent('const') || this.isIdent('static')) this.next()
    const base = this.parseType()

    const decls: VarDecl[] = []
    do {
      decls.push(this.parseOneDeclarator(line, base))
    } while (this.eatOp(','))

    this.expectSemi()

    if (decls.length === 1) return decls[0]
    return { kind: 'block', line, body: decls }
  }

  parseOneDeclarator(line: number, base: Type): VarDecl {
    const name = this.expectIdent().value
    const arraySizes: Expr[] = []
    let vecSize: Expr | undefined
    let vecFill: Expr | undefined
    let init: Expr | undefined
    let initList: InitExpr | undefined

    while (this.isOp('[')) {
      this.next()
      if (this.isOp(']')) {
        this.next()
        arraySizes.push(undefined)
      } else {
        arraySizes.push(this.parseExpr())
        this.expectOp(']')
      }
    }

    if (this.isOp('(')) {
      if (base.kind !== 'vector' && base.kind !== 'tree') throw new ParseError('只有 vector/tree 支持构造函数调用', this.cur().line)
      this.next()
      const args: Expr[] = []
      if (!this.isOp(')')) {
        args.push(this.parseExpr())
        while (this.eatOp(',')) args.push(this.parseExpr())
      }
      this.expectOp(')')
      vecSize = args[0]
      if (args[1]) vecFill = args[1]
    }

    if (this.eatOp('=')) {
      if (this.isOp('{')) {
        initList = this.parseInitList()
      } else {
        init = this.parseExpr()
      }
    }

    return {
      kind: 'var_decl',
      line,
      base,
      name,
      arraySizes: arraySizes.length ? arraySizes : undefined,
      vecSize,
      vecFill,
      init,
      initList,
    }
  }

  parseInitList(): InitExpr {
    this.expectOp('{')
    const items: InitExpr[] = []
    if (!this.isOp('}')) {
      do {
        if (this.isOp('{')) items.push(this.parseInitList())
        else items.push({ kind: 'expr', expr: this.parseExpr() })
      } while (this.eatOp(','))
    }
    this.expectOp('}')
    return { kind: 'list', items }
  }

  parseType(): Type {
    if (this.isIdent('std')) {
      this.next()
      this.expectOp('::')
    }
    if (this.isIdent('vector')) {
      this.next()
      this.expectOp('<')
      const elem = this.parseType()
      this.expectOp('>')
      return { kind: 'vector', elem }
    }
    if (this.isIdent('stack')) {
      this.next()
      this.expectOp('<')
      const elem = this.parseType()
      this.expectOp('>')
      return { kind: 'stack', elem }
    }
    if (this.isIdent('queue')) {
      this.next()
      this.expectOp('<')
      const elem = this.parseType()
      this.expectOp('>')
      return { kind: 'queue', elem }
    }
    if (this.isIdent('priority_queue')) {
      this.next()
      this.expectOp('<')
      const elem = this.parseType()
      let minHeap = false
      while (this.eatOp(',')) {
        if (this.isIdent('greater') || this.isIdent('less')) {
          const isGreater = this.isIdent('greater')
          this.next()
          this.expectOp('<')
          this.parseType()
          this.expectOp('>')
          if (isGreater) minHeap = true
        } else {
          this.next()
          this.expectOp('<')
          this.parseType()
          this.expectOp('>')
        }
      }
      this.expectOp('>')
      return { kind: 'pqueue', elem, minHeap }
    }
    if (this.isIdent('tree')) {
      this.next()
      this.expectOp('<')
      const elem = this.parseType()
      this.expectOp('>')
      return { kind: 'tree', elem }
    }
    if (this.isIdent('bst')) {
      this.next()
      this.expectOp('<')
      const elem = this.parseType()
      this.expectOp('>')
      return { kind: 'bst', elem }
    }
    if (this.isIdent('set')) {
      this.next()
      this.expectOp('<')
      const elem = this.parseType()
      this.expectOp('>')
      return { kind: 'set', elem }
    }
    if (this.isIdent('pair')) {
      this.next()
      this.expectOp('<')
      const first = this.parseType()
      this.expectOp(',')
      const second = this.parseType()
      this.expectOp('>')
      return { kind: 'pair', first, second }
    }
    if (this.isIdent('deque')) {
      this.next()
      this.expectOp('<')
      const elem = this.parseType()
      this.expectOp('>')
      return { kind: 'deque', elem }
    }
    if (this.isIdent('map') || this.isIdent('unordered_map')) {
      const isMap = this.isIdent('map')
      this.next()
      this.expectOp('<')
      const key = this.parseType()
      this.expectOp(',')
      const value = this.parseType()
      this.expectOp('>')
      return isMap ? { kind: 'map', key, value } : { kind: 'umap', key, value }
    }
    {
      const t = this.cur()
      if (t.type === 'ident' && this.structNames.has(t.value)) {
        this.next()
        return { kind: 'struct', name: t.value }
      }
    }
    return { kind: 'scalar', name: this.parseScalarTypeName() }
  }

  parseScalarTypeName(): ScalarTypeName {
    if (this.isIdent('std')) {
      this.next()
      this.expectOp('::')
    }
    if (this.eatIdent('unsigned')) {
      if (this.isIdent('long')) {
        this.next()
        if (this.isIdent('long')) this.next()
        return 'long long'
      }
      if (this.isIdent('int')) this.next()
      if (this.isIdent('char')) this.next()
      return 'int'
    }
    if (this.isIdent('long')) {
      this.next()
      if (this.isIdent('long')) {
        this.next()
        return 'long long'
      }
      if (this.isIdent('int')) this.next()
      if (this.isIdent('double')) {
        this.next()
        return 'double'
      }
      return 'long long'
    }
    if (this.eatIdent('int')) return 'int'
    if (this.eatIdent('char')) return 'char'
    if (this.eatIdent('bool')) return 'bool'
    if (this.eatIdent('string')) return 'string'
    if (this.eatIdent('double')) return 'double'
    if (this.eatIdent('float')) return 'float'
    throw new ParseError('不支持的类型 "' + this.cur().value + '"', this.cur().line)
  }

  parseExpr(): Expr {
    return this.parseAssignment()
  }

  parseAssignment(): Expr {
    const left = this.parseBinary(0)
    if (this.cur().type === 'op' && ASSIGN_OPS.includes(this.cur().value)) {
      const op = this.next().value
      const right = this.parseAssignment()
      return { kind: 'assign', line: left.line, op, target: left, value: right }
    }
    return left
  }

  parseBinary(minPrec: number): Expr {
    let left = this.parseUnary()
    while (true) {
      const t = this.cur()
      if (t.type !== 'op') break
      const prec = BIN_PREC[t.value]
      if (prec === undefined || prec < minPrec) break
      this.next()
      const right = this.parseBinary(prec + 1)
      left = { kind: 'binary', line: t.line, op: t.value, left, right }
    }
    return left
  }

  parseUnary(): Expr {
    const t = this.cur()
    if (t.type === 'op' && (t.value === '-' || t.value === '!')) {
      this.next()
      return { kind: 'unary', line: t.line, op: t.value, operand: this.parseUnary() }
    }
    if (t.type === 'op' && (t.value === '++' || t.value === '--')) {
      this.next()
      return { kind: 'update', line: t.line, op: t.value, target: this.parseUnary(), prefix: true }
    }
    return this.parsePostfix()
  }

  parsePostfix(): Expr {
    let e = this.parsePrimary()
    while (true) {
      const t = this.cur()
      if (this.isOp('[')) {
        this.next()
        const idx = this.parseExpr()
        this.expectOp(']')
        e = { kind: 'index', line: t.line, target: e, index: idx }
      } else if (this.isOp('.')) {
        this.next()
        const field = this.expectIdent().value
        if (this.isOp('(')) {
          this.next()
          const args: Expr[] = []
          if (!this.isOp(')')) {
            args.push(this.parseExpr())
            while (this.eatOp(',')) args.push(this.parseExpr())
          }
          this.expectOp(')')
          e = { kind: 'method_call', line: t.line, object: e, method: field, args }
        } else {
          e = { kind: 'member', line: t.line, object: e, field }
        }
      } else if (this.isOp('(')) {
        this.next()
        const args: Expr[] = []
        if (!this.isOp(')')) {
          args.push(this.parseExpr())
          while (this.eatOp(',')) args.push(this.parseExpr())
        }
        this.expectOp(')')
        if (e.kind !== 'ident') throw new ParseError('非法的函数调用', t.line)
        e = { kind: 'call', line: t.line, name: e.name, args }
      } else if (t.type === 'op' && (t.value === '++' || t.value === '--')) {
        this.next()
        e = { kind: 'update', line: t.line, op: t.value, target: e, prefix: false }
      } else {
        break
      }
    }
    return e
  }

  parsePrimary(): Expr {
    const t = this.cur()
    // string::npos —— C++ 里 find 找不到时的返回值。本工具用 -1 表示（find 也回 -1），
    // 所以 if (s.find(x) == string::npos) 这种惯用写法可以直接跑。
    if (
      t.type === 'ident' &&
      t.value === 'string' &&
      this.cur(1).type === 'op' &&
      this.cur(1).value === '::' &&
      this.cur(2).value === 'npos'
    ) {
      this.next()
      this.next()
      this.next()
      return { kind: 'literal', line: t.line, value: -1, litType: 'int' }
    }
    if (t.type === 'ident' && t.value === 'vector') {
      const type = this.parseType()
      if (this.isOp('(')) {
        this.next()
        const args: Expr[] = []
        if (!this.isOp(')')) {
          args.push(this.parseExpr())
          while (this.eatOp(',')) args.push(this.parseExpr())
        }
        this.expectOp(')')
        return { kind: 'container_ctor', line: t.line, type, size: args[0], fill: args[1] }
      }
      throw new ParseError('vector 类型在表达式中需要构造函数', t.line)
    }
    if (t.type === 'op' && t.value === '{') {
      this.next()
      const items: Expr[] = []
      if (!this.isOp('}')) {
        do {
          items.push(this.parseExpr())
        } while (this.eatOp(','))
      }
      this.expectOp('}')
      return { kind: 'init_list', line: t.line, items }
    }
    if (t.type === 'num') {
      this.next()
      const isHex = /^0[xX]/.test(t.value)
      const isDouble = !isHex && /[.eE]/.test(t.value)
      return { kind: 'literal', line: t.line, value: parseNumber(t.value), litType: isDouble ? 'double' : 'int' }
    }
    if (t.type === 'str') {
      this.next()
      return { kind: 'literal', line: t.line, value: t.value, litType: 'string' }
    }
    if (t.type === 'chr') {
      this.next()
      return { kind: 'literal', line: t.line, value: t.value, litType: 'char' }
    }
    if (t.type === 'ident') {
      this.next()
      if (t.value === 'true') return { kind: 'literal', line: t.line, value: true, litType: 'bool' }
      if (t.value === 'false') return { kind: 'literal', line: t.line, value: false, litType: 'bool' }
      if (t.value === 'std') {
        this.expectOp('::')
        const n = this.expectIdent()
        return { kind: 'ident', line: t.line, name: n.value }
      }
      return { kind: 'ident', line: t.line, name: t.value }
    }
    if (this.isOp('(')) {
      this.next()
      const e = this.parseExpr()
      this.expectOp(')')
      return e
    }
    throw new ParseError('无法解析 "' + (t.value || '文件末尾') + '"', t.line)
  }
}
