// 線性／關聯容器的檢視：string、stack、queue、deque、set、map、struct、pair。
import type { Cell } from '../../interpreter/memory'
import { VIEW_MAX_ITEMS, cellCls, formatCellShort, isHit } from './format'
import { HiddenNote } from './window'

export function StringView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const c = cell.kind === 'scalar' && cell.type === 'string' ? cell : null
  if (!c) return null
  const s = (c.value ?? '') as string
  if (s.length === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  return (
    <div className="cells">
      {s.split('').map((ch, i) => {
        const p = path.concat(i)
        const chCell: Cell = { kind: 'scalar', type: 'char', value: ch }
        return (
          <div className="cell-wrap" key={i}>
            <div className={cellCls(chCell, name, p, judges, writes, reads)}>{ch}</div>
          </div>
        )
      })}
    </div>
  )
}

export function StackView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const items = cell.kind === 'stack' ? cell.items : []
  if (items.length === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  // 从栈顶往下画，最多 VIEW_MAX_ITEMS 个
  const shown = items.slice(Math.max(0, items.length - VIEW_MAX_ITEMS)).reverse()
  return (
    <div className="stack-view">
      {items.length > VIEW_MAX_ITEMS && <HiddenNote hidden={items.length - VIEW_MAX_ITEMS} total={items.length} />}
      {shown.map((item, k) => {
        const i = items.length - 1 - k
        const p = path.concat(i)
        return (
          <div className="stack-row" key={i}>
            <span className="stack-marker">{k === 0 ? 'top' : ''}</span>
            <div className={cellCls(item, name, p, judges, writes, reads)}>{formatCellShort(item)}</div>
          </div>
        )
      })}
    </div>
  )
}

export function QueueView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const items = cell.kind === 'queue' ? cell.items : []
  if (items.length === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  return (
    <div className="queue-view">
      <span className="queue-marker">front</span>
      {items.slice(0, VIEW_MAX_ITEMS).map((item, i) => {
        const p = path.concat(i)
        return (
          <div className="cell-wrap" key={i}>
            <div className={cellCls(item, name, p, judges, writes, reads)}>{formatCellShort(item)}</div>
            <div className="idx">[{i}]</div>
          </div>
        )
      })}
      {items.length > VIEW_MAX_ITEMS && <HiddenNote hidden={items.length - VIEW_MAX_ITEMS} total={items.length} />}
      <span className="queue-marker">back</span>
    </div>
  )
}

export function DequeView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const items = cell.kind === 'deque' ? cell.items : []
  if (items.length === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  return (
    <div className="queue-view">
      <span className="queue-marker">front</span>
      {items.slice(0, VIEW_MAX_ITEMS).map((item, i) => {
        const p = path.concat(i)
        return (
          <div className="cell-wrap" key={i}>
            <div className={cellCls(item, name, p, judges, writes, reads)}>{formatCellShort(item)}</div>
            <div className="idx">[{i}]</div>
          </div>
        )
      })}
      {items.length > VIEW_MAX_ITEMS && <HiddenNote hidden={items.length - VIEW_MAX_ITEMS} total={items.length} />}
      <span className="queue-marker">back</span>
    </div>
  )
}

export function SetView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const items = cell.kind === 'set' ? cell.items : []
  if (items.length === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  return (
    <div className="queue-view">
      {items.slice(0, VIEW_MAX_ITEMS).map((item, i) => {
        const p = path.concat(i)
        return (
          <div className="cell-wrap" key={i}>
            <div className={cellCls(item, name, p, judges, writes, reads)}>{formatCellShort(item)}</div>
            <div className="idx">[{i}]</div>
          </div>
        )
      })}
      {items.length > VIEW_MAX_ITEMS && <HiddenNote hidden={items.length - VIEW_MAX_ITEMS} total={items.length} />}
    </div>
  )
}

export function MapView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const entries = cell.kind === 'map' || cell.kind === 'umap' ? cell.entries : []
  if (entries.length === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }
  return (
    <div className="map-view">
      {entries.slice(0, VIEW_MAX_ITEMS).map((e, i) => {
        const p = path.concat(i)
        return (
          <div className="map-row" key={i}>
            <span className="cell map-key">{formatCellShort(e.key)}</span>
            <span className="map-arrow">→</span>
            <span className={cellCls(e.value, name, p, judges, writes, reads)}>{formatCellShort(e.value)}</span>
          </div>
        )
      })}
      {entries.length > VIEW_MAX_ITEMS && <HiddenNote hidden={entries.length - VIEW_MAX_ITEMS} total={entries.length} />}
    </div>
  )
}

export function StructView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const c = cell.kind === 'struct' ? cell : null
  if (!c) return null
  return (
    <div className="map-view">
      {c.members.map((m, i) => {
        const p = path.concat(i)
        return (
          <div className="map-row" key={m.name}>
            <span className="cell map-key">{m.name}</span>
            <span className="map-arrow">=</span>
            <span className={cellCls(m.cell, name, p, judges, writes, reads)}>{formatCellShort(m.cell)}</span>
          </div>
        )
      })}
    </div>
  )
}

export function PairView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
}) {
  const c = cell.kind === 'pair' ? cell : null
  if (!c) return null
  return (
    <div className="pair-view">
      <span className="pair-paren">(</span>
      <span className={cellCls(c.first, name, path.concat(0), judges, writes, reads)}>{formatCellShort(c.first)}</span>
      <span className="pair-comma">,</span>
      <span className={cellCls(c.second, name, path.concat(1), judges, writes, reads)}>{formatCellShort(c.second)}</span>
      <span className="pair-paren">)</span>
    </div>
  )
}

