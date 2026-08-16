export type ScalarTypeName = 'int' | 'long long' | 'char' | 'bool' | 'string' | 'double' | 'float'

export type Type =
  | { kind: 'scalar'; name: ScalarTypeName }
  | { kind: 'array'; elem: Type }
  | { kind: 'vector'; elem: Type }
  | { kind: 'stack'; elem: Type }
  | { kind: 'queue'; elem: Type }
  | { kind: 'pqueue'; elem: Type; minHeap: boolean }
  | { kind: 'tree'; elem: Type }
  | { kind: 'bst'; elem: Type }
  | { kind: 'set'; elem: Type }
  | { kind: 'map'; key: Type; value: Type }
  | { kind: 'umap'; key: Type; value: Type }
  | { kind: 'pair'; first: Type; second: Type }
  | { kind: 'deque'; elem: Type }
  | { kind: 'struct'; name: string }

export interface FunctionParam {
  name: string
  type: Type
  byRef?: boolean
}

export interface StructDef {
  name: string
  members: { name: string; type: Type }[]
}

export interface FunctionDef {
  name: string
  returnType: 'void' | Type
  params: FunctionParam[]
  body: Stmt[]
  line: number
}

export interface Program {
  kind: 'program'
  globals: Stmt[]
  body: Stmt[]
  functions: Map<string, FunctionDef>
  structs: Map<string, StructDef>
}

export type InitExpr =
  | { kind: 'expr'; expr: Expr }
  | { kind: 'list'; items: InitExpr[] }

export interface VarDecl {
  kind: 'var_decl'
  line: number
  base: Type
  name: string
  arraySizes?: (Expr | undefined)[]
  vecSize?: Expr
  vecFill?: Expr
  init?: Expr
  initList?: InitExpr
}

export type CoutItem =
  | { kind: 'endl' }
  | { kind: 'expr'; expr: Expr }

export type Stmt =
  | VarDecl
  | { kind: 'expr_stmt'; line: number; expr: Expr }
  | { kind: 'cout'; line: number; items: CoutItem[] }
  | { kind: 'cin'; line: number; targets: Expr[] }
  | { kind: 'block'; line: number; body: Stmt[] }
  | { kind: 'if'; line: number; cond: Expr; then: Stmt; else?: Stmt }
  | { kind: 'for'; line: number; init?: Stmt; cond?: Expr; incr?: Expr; body: Stmt }
  | { kind: 'while'; line: number; cond: Expr; body: Stmt }
  | { kind: 'break'; line: number }
  | { kind: 'continue'; line: number }
  | { kind: 'return'; line: number; value?: Expr }
  | { kind: 'empty'; line: number }

export type Expr =
  | { kind: 'literal'; line: number; value: number | string | boolean; litType: ScalarTypeName }
  | { kind: 'ident'; line: number; name: string }
  | { kind: 'index'; line: number; target: Expr; index: Expr }
  | { kind: 'binary'; line: number; op: string; left: Expr; right: Expr }
  | { kind: 'unary'; line: number; op: string; operand: Expr }
  | { kind: 'assign'; line: number; op: string; target: Expr; value: Expr }
  | { kind: 'update'; line: number; op: '++' | '--'; target: Expr; prefix: boolean }
  | { kind: 'call'; line: number; name: string; args: Expr[] }
  | { kind: 'method_call'; line: number; object: Expr; method: string; args: Expr[] }
  | { kind: 'member'; line: number; object: Expr; field: string }
  | { kind: 'container_ctor'; line: number; type: Type; size: Expr; fill?: Expr }
  | { kind: 'init_list'; line: number; items: Expr[] }
