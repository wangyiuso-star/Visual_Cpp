import { useEffect, useState } from 'react'
import { parse } from '../interpreter/parser'
import { run } from '../interpreter/interpreter'
import type { Snapshot } from '../interpreter/interpreter'

/** 執行一次 collect() 需要的全部輸入。任何一個改了，舊快照就必須失效。 */
export interface RunConfig {
  code: string
  input: string
  showIf: boolean
  showWhile: boolean
  showFor: boolean
  boolAsInt: boolean
}

export interface Player {
  snapshots: Snapshot[] | null
  index: number
  playing: boolean
  speed: number
  error: string | null
  breakpoints: Set<number>
  jumpVal: string
  /** 目前這一步的快照（尚未執行或已重置時是 null） */
  cur: Snapshot | null
  /** 編輯器要高亮的行號（-1 = 不高亮） */
  activeLine: number
  /** 例如「第 12 / 340 步」 */
  stepLabel: string
  setSpeed: (v: number) => void
  setJumpVal: (v: string) => void
  collect: () => Snapshot[] | null
  start: () => void
  stepForward: () => void
  stepBack: () => void
  reset: () => void
  togglePlay: () => void
  /** 讓既有快照失效（改程式碼 / 改 cin 輸入 / 改顯示開關後呼叫） */
  invalidate: () => void
  toggleBreakpoint: (line: number) => void
  doJump: () => void
}

/**
 * 逐步執行的播放器：collect（解析 + 跑成快照序列）→ 單步 / 播放 / 後退 / 跳步 / 斷點。
 * 狀態全部收在這裡，UI 只負責畫。原本這些散在 App.tsx 的 480 行元件裡（重構 S7）。
 */
export function usePlayer(config: RunConfig): Player {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null)
  const [index, setIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(500)
  const [error, setError] = useState<string | null>(null)
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set())
  const [jumpVal, setJumpVal] = useState('')

  function collect(): Snapshot[] | null {
    try {
      const program = parse(config.code)
      const snaps: Snapshot[] = []
      for (const s of run(program, {
        showCond: { if: config.showIf, while: config.showWhile, for: config.showFor },
        boolAsInt: config.boolAsInt,
        input: config.input,
      })) {
        snaps.push(s)
      }
      return snaps
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const line = (e as { line?: number }).line
      setError(line ? '第 ' + line + ' 行：' + msg : msg)
      return null
    }
  }

  /** 清掉目前為止的執行結果（快照 / 步數 / 播放中 / 執行錯誤） */
  function invalidate() {
    setPlaying(false)
    setSnapshots(null)
    setIndex(-1)
    setError(null)
  }

  function start() {
    const snaps = collect()
    if (!snaps) {
      setSnapshots(null)
      setIndex(-1)
      return
    }
    setError(null)
    setSnapshots(snaps)
    setIndex(0)
    setPlaying(true)
  }

  function stepForward() {
    if (!snapshots) {
      const snaps = collect()
      if (!snaps) {
        setSnapshots(null)
        setIndex(-1)
        return
      }
      setError(null)
      setSnapshots(snaps)
      setIndex(0)
      return
    }
    setIndex((i) => Math.min(i + 1, snapshots.length - 1))
  }

  function stepBack() {
    if (!snapshots) return
    setIndex((i) => Math.max(i - 1, 0))
  }

  function reset() {
    invalidate()
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false)
      return
    }
    if (!snapshots) {
      start()
      return
    }
    if (index >= snapshots.length - 1) {
      setIndex(0)
      setPlaying(true)
      return
    }
    setIndex((i) => i + 1)
    setPlaying(true)
  }

  function toggleBreakpoint(line: number) {
    setBreakpoints((prev) => {
      const next = new Set(prev)
      if (next.has(line)) next.delete(line)
      else next.add(line)
      return next
    })
  }

  function doJump() {
    if (!snapshots) return
    const n = parseInt(jumpVal, 10)
    if (Number.isNaN(n)) return
    setPlaying(false)
    setIndex(Math.max(0, Math.min(n - 1, snapshots.length - 1)))
  }

  useEffect(() => {
    if (!playing || !snapshots) return
    const id = window.setInterval(() => {
      setIndex((i) => Math.min(i + 1, snapshots.length - 1))
    }, speed)
    return () => window.clearInterval(id)
  }, [playing, snapshots, speed])

  useEffect(() => {
    if (snapshots && index >= snapshots.length - 1) setPlaying(false)
  }, [index, snapshots])

  useEffect(() => {
    if (playing && snapshots && index >= 0 && breakpoints.has(snapshots[index].line)) {
      setPlaying(false)
    }
  }, [index, playing, snapshots, breakpoints])

  const cur = snapshots && index >= 0 ? snapshots[index] : null
  const activeLine = cur ? cur.line : -1
  const stepLabel = snapshots && index >= 0 ? '第 ' + (index + 1) + ' / ' + snapshots.length + ' 步' : '未运行'

  return {
    snapshots, index, playing, speed, error, breakpoints, jumpVal,
    cur, activeLine, stepLabel,
    setSpeed, setJumpVal,
    collect, start, stepForward, stepBack, reset, togglePlay, invalidate, toggleBreakpoint, doJump,
  }
}
