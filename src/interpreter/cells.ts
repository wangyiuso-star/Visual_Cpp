// Cell（直譯器的值模型）的配置工具：只讀 structs 對照表，不需要 Runtime 狀態。
// 從 interpreter.ts 抽出來（v0.10.x S4）—— execDecl（宣告）與 builtins（容器方法）都要用。
import { RuntimeError, defaultScalar } from './runtime'
import type { RV, Runtime } from './runtime'
import { coerceTo } from './values'
import type { Cell, ScalarValue } from './memory'
import type { StructDef, Type } from './ast'

export function allocStruct(rt: Runtime, structName: string, line: number): Cell {
  const def = rt.structs.get(structName)
  if (!def) throw new RuntimeError('未定义的结构体 ' + structName, line)
  const members = def.members.map((m) => ({
    name: m.name,
    cell: m.type.kind === 'scalar' ? { kind: 'scalar', type: m.type.name, value: null } : allocFromType(m.type, [], true, rt.structs),
  }))
  return { kind: 'struct', structName, members }
}

export function allocFromType(type: Type, sizes: number[], defaultFill: boolean, structs?: Map<string, StructDef>): Cell {
  if (type.kind === 'scalar') {
    return { kind: 'scalar', type: type.name, value: defaultFill ? defaultScalar(type.name) : null }
  }
  if (type.kind === 'array') {
    const n = sizes[0] ?? 0
    const cells: Cell[] = []
    for (let i = 0; i < n; i++) cells.push(allocFromType(type.elem, sizes.slice(1), defaultFill, structs))
    return { kind: 'array', elemType: type.elem, size: n, cells }
  }
  if (type.kind === 'struct') {
    const def = structs?.get(type.name)
    if (!def) throw new Error('未定义的结构体 ' + type.name)
    return { kind: 'struct', structName: type.name, members: def.members.map((m) => ({ name: m.name, cell: allocFromType(m.type, [], false, structs) })) }
  }
  if (type.kind === 'stack') return { kind: 'stack', elemType: type.elem, items: [] }
  if (type.kind === 'queue') return { kind: 'queue', elemType: type.elem, items: [] }
  if (type.kind === 'pqueue') return { kind: 'pqueue', elemType: type.elem, items: [], minHeap: type.minHeap }
  if (type.kind === 'tree') return { kind: 'tree', elemType: type.elem, size: 0, nodes: [{ kind: 'scalar', type: 'int', value: null }] }
  if (type.kind === 'bst') return { kind: 'bst', elemType: type.elem, root: null, count: 0, nextId: 0 }
  if (type.kind === 'set') return { kind: 'set', elemType: type.elem, items: [] }
  if (type.kind === 'map') return { kind: 'map', keyType: type.key, valueType: type.value, entries: [] }
  if (type.kind === 'umap') return { kind: 'umap', keyType: type.key, valueType: type.value, entries: [] }
  if (type.kind === 'pair') return { kind: 'pair', firstType: type.first, secondType: type.second, first: allocFromType(type.first, [], false, structs), second: allocFromType(type.second, [], false, structs) }
  if (type.kind === 'deque') return { kind: 'deque', elemType: type.elem, items: [] }
  return { kind: 'vector', elemType: type.elem, cells: [] }
}

export function allocVector(elemType: Type, n: number, fill?: ScalarValue, structs?: Map<string, StructDef>): Cell {
  const cells: Cell[] = []
  for (let i = 0; i < n; i++) {
    if (elemType.kind === 'scalar') {
      cells.push({ kind: 'scalar', type: elemType.name, value: fill !== undefined ? fill : defaultScalar(elemType.name) })
    } else {
      cells.push(allocFromType(elemType, [], true, structs))
    }
  }
  return { kind: 'vector', elemType, cells }
}

export function allocTree(elemType: Type, n: number, line: number, structs?: Map<string, StructDef>): Cell {
  if (elemType.kind !== 'scalar' && elemType.kind !== 'struct') throw new RuntimeError('tree 只支持标量或 struct 元素', line)
  const mk = (): Cell => (elemType.kind === 'scalar' ? { kind: 'scalar', type: elemType.name, value: null } : allocFromType(elemType, [], false, structs))
  const nodes: Cell[] = [mk()]
  for (let i = 0; i < n; i++) nodes.push(mk())
  return { kind: 'tree', elemType, size: n, nodes }
}

export function fillAllScalars(cell: Cell, rv: RV, line: number): void {
  if (cell.kind === 'scalar') {
    cell.value = coerceTo(cell.type, rv, line)
    return
  }
  if (cell.kind === 'array' || cell.kind === 'vector') {
    for (const sub of cell.cells) fillAllScalars(sub, rv, line)
  }
}

