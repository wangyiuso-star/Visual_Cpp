// 視窗式檢視：一維陣列、二維矩陣、struct 矩陣。
// 二維與 struct 矩陣共用同一套「偏移 + 跟隨讀寫 + 滑桿」邏輯（以前是兩份複製）。
import { useEffect, useRef, useState } from 'react'
import type { Cell, VarView } from '../../interpreter/memory'
import { VIEW_MAX_ITEMS, WIN_1D, WIN_2D, cellCls, formatCellShort, isHit, rowLen } from './format'

export function HiddenNote({ hidden, total }: { hidden: number; total: number }) {
  return (
    <div className="viz-empty" style={{ padding: '4px 0' }}>
      … 还有 {hidden} 项未显示（共 {total} 项；面板一次最多画 {VIEW_MAX_ITEMS} 项，避免页面卡住）
    </div>
  )
}
// 调用树缩放范围
// 二維矩陣與 struct 矩陣共用的「視窗偏移」：讀到/寫到哪一格就自動跟到哪一格，滑桿也能手動移。
// 以前 Windowed2D 與 StructArrayView 各有一份一模一樣的複製（改一處要記得改另一處，
// 已經吃過一次虧），v0.10.0 抽成這個 hook。
export function useWindowOffset(rows: number, maxCols: number, focus: number[] | undefined, winRows: number, winCols: number) {
  const maxRowOff = Math.max(0, rows - winRows)
  const maxColOff = Math.max(0, maxCols - winCols)
  const [off, setOff] = useState({ r: 0, c: 0 })

  useEffect(() => {
    if (!focus || focus.length < 2) return
    const fr = focus[0]
    const fc = focus[1]
    setOff((prev) => {
      let r = Math.min(prev.r, maxRowOff)
      let c = Math.min(prev.c, maxColOff)
      let changed = false
      if (fr < r || fr >= r + winRows) {
        r = Math.max(0, Math.min(fr - Math.floor(winRows / 2), maxRowOff))
        changed = true
      }
      if (fc < c || fc >= c + winCols) {
        c = Math.max(0, Math.min(fc - Math.floor(winCols / 2), maxColOff))
        changed = true
      }
      return changed ? { r, c } : prev
    })
  }, [focus, maxRowOff, maxColOff, rows, maxCols, winRows, winCols])

  return { off, setOff, maxRowOff, maxColOff }
}

export function StructArrayView({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
  focus,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
  focus: number[] | undefined
}) {
  const cells = cell.kind === 'array' || cell.kind === 'vector' ? cell.cells : []
  const rows = cells.length
  const maxCols = rows > 0 && cells[0].kind === 'struct' ? cells[0].members.length : 0

  const { off, setOff, maxRowOff, maxColOff } = useWindowOffset(rows, maxCols, focus, WIN_2D, WIN_2D)

  if (rows === 0) {
    return (
      <div className="viz-empty" style={{ padding: '4px 0' }}>
        (空)
      </div>
    )
  }

  const rStart = Math.min(off.r, maxRowOff)
  const cStart = Math.min(off.c, maxColOff)
  const rowIdxs: number[] = []
  for (let i = rStart; i < Math.min(rStart + WIN_2D, rows); i++) rowIdxs.push(i)
  const colIdxs: number[] = []
  for (let j = cStart; j < Math.min(cStart + WIN_2D, Math.max(maxCols, 1)); j++) colIdxs.push(j)

  return (
    <div>
      <div className="grid2d-row">
        {rows > WIN_2D && (
          <div className="row-slider-wrap">
            <span className="window-dim">行</span>
            <input
              type="range"
              min={0}
              max={maxRowOff}
              value={rStart}
              onChange={(e) => setOff((o) => ({ ...o, r: Number(e.target.value) }))}
              className="slider-vertical"
            />
          </div>
        )}
        <div className="nested">
          {rowIdxs.map((i) => {
            const row = cells[i]
            return (
              <div className="nested-row" key={i}>
                <div className="nested-label">[{i}]</div>
                <div className="cells">
                  {colIdxs.map((j) => {
                    if (row.kind !== 'struct' || j >= row.members.length) {
                      return (
                        <div className="cell-wrap" key={j}>
                          <div className="cell cell-empty" />
                          <div className="idx">[{j}]</div>
                        </div>
                      )
                    }
                    const m = row.members[j]
                    const p = path.concat(i, j)
                    return (
                      <div className="cell-wrap" key={j}>
                        <div className={cellCls(m.cell, name, p, judges, writes, reads)}>
                          {formatCellShort(m.cell)}
                        </div>
                        <div className="idx">[{m.name}]</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {maxCols > WIN_2D && (
        <div className="window-control">
          <span className="window-dim">列</span>
          <input type="range" min={0} max={maxColOff} value={cStart} onChange={(e) => setOff((o) => ({ ...o, c: Number(e.target.value) }))} className="cell-slider" />
          <span className="window-range">[{cStart}..{Math.min(cStart + WIN_2D, maxCols) - 1}] / 共 {maxCols}</span>
        </div>
      )}
    </div>
  )
}

export const CELL_GAP = 4 // .cell-wrap 的 margin-right

export function useFit(min: number, max: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(min)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const sample = el.querySelector('.cell-wrap') as HTMLElement | null
      const avail = el.clientWidth
      if (!sample || !avail) return
      const w = sample.offsetWidth + CELL_GAP
      if (w <= 0) return
      const n = Math.max(min, Math.min(max, Math.floor(avail / w)))
      setCols((prev) => (prev === n ? prev : n))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [min, max])
  return { ref, cols }
}

export function Windowed1D({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
  focus,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
  focus: number[] | undefined
}) {
  const { ref, cols } = useFit(WIN_1D, 40)
  const len = cell.kind === 'array' ? cell.size : cell.cells.length
  const maxOff = Math.max(0, len - cols)
  const [off, setOff] = useState(0)

  useEffect(() => {
    if (!focus || focus.length < 1) return
    const f = focus[0]
    setOff((prev) => {
      const cur = Math.min(prev, maxOff)
      if (f < cur || f >= cur + cols) {
        return Math.max(0, Math.min(f - Math.floor(cols / 2), maxOff))
      }
      return cur
    })
  }, [focus, maxOff, len, cols])

  const start = Math.min(off, maxOff)
  const end = Math.min(start + cols, len)
  const idxs: number[] = []
  for (let i = start; i < end; i++) idxs.push(i)

  return (
    <div ref={ref}>
      <div className="cells">
        {idxs.map((i) => {
          const sub = cell.cells[i]
          const p = path.concat(i)
          return (
            <div className="cell-wrap" key={i}>
              <div className={cellCls(sub, name, p, judges, writes, reads)}>{formatCellShort(sub)}</div>
              <div className="idx">[{i}]</div>
            </div>
          )
        })}
      </div>
      {len > cols && (
        <div className="window-control">
          <input type="range" min={0} max={maxOff} value={start} onChange={(e) => setOff(Number(e.target.value))} className="cell-slider" />
          <span className="window-range">[{start}..{end - 1}] / 共 {len}</span>
        </div>
      )}
    </div>
  )
}

export function Windowed2D({
  name,
  path,
  cell,
  reads,
  writes,
  judges,
  focus,
}: {
  name: string
  path: number[]
  cell: Cell
  reads: Set<string>
  writes: Set<string>
  judges: Set<string>
  focus: number[] | undefined
}) {
  // 视窗固定 5×5（使用者要的是「固定大小 + 写入时自动跳转」，不要跟着宽度变，
  // 这样每张卡片看到的行列数是可预期的；卡住的是写入/读取的那一格会自动滚进视窗）。
  const rows = cell.kind === 'array' ? cell.size : cell.cells.length
  let maxCols = 0
  for (let i = 0; i < cell.cells.length; i++) maxCols = Math.max(maxCols, rowLen(cell.cells[i]))

  const { off, setOff, maxRowOff, maxColOff } = useWindowOffset(rows, maxCols, focus, WIN_2D, WIN_2D)

  const rStart = Math.min(off.r, maxRowOff)
  const cStart = Math.min(off.c, maxColOff)
  const rowIdxs: number[] = []
  for (let i = rStart; i < Math.min(rStart + WIN_2D, rows); i++) rowIdxs.push(i)
  const colIdxs: number[] = []
  for (let j = cStart; j < Math.min(cStart + WIN_2D, Math.max(maxCols, 1)); j++) colIdxs.push(j)

  return (
    <div>
      <div className="grid2d-row">
        {rows > WIN_2D && (
          <div className="row-slider-wrap">
            <span className="window-dim">行</span>
            <input
              type="range"
              min={0}
              max={maxRowOff}
              value={rStart}
              onChange={(e) => setOff((o) => ({ ...o, r: Number(e.target.value) }))}
              className="slider-vertical"
            />
          </div>
        )}
        <div className="nested">
          {rowIdxs.map((i) => {
            const row = cell.cells[i]
            const rl = rowLen(row)
            if (maxCols === 0) {
              return (
                <div className="nested-row" key={i}>
                  <div className="nested-label">[{i}]</div>
                  <div className="viz-empty" style={{ padding: '4px 0' }}>
                    (空)
                  </div>
                </div>
              )
            }
            return (
              <div className="nested-row" key={i}>
                <div className="nested-label">[{i}]</div>
                <div className="cells">
                  {colIdxs.map((j) => {
                    if (j >= rl) {
                      return (
                        <div className="cell-wrap" key={j}>
                          <div className="cell cell-empty" />
                          <div className="idx">[{j}]</div>
                        </div>
                      )
                    }
                    const sub = row.cells[j]
                    const p = path.concat(i, j)
                    return (
                      <div className="cell-wrap" key={j}>
                        <div className={cellCls(sub, name, p, judges, writes, reads)}>{formatCellShort(sub)}</div>
                        <div className="idx">[{j}]</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {maxCols > WIN_2D && (
        <div className="window-control">
          <span className="window-dim">列</span>
          <input type="range" min={0} max={maxColOff} value={cStart} onChange={(e) => setOff((o) => ({ ...o, c: Number(e.target.value) }))} className="cell-slider" />
          <span className="window-range">[{cStart}..{Math.min(cStart + WIN_2D, maxCols) - 1}] / 共 {maxCols}</span>
        </div>
      )}
    </div>
  )
}

