import { useEffect, useRef, useState } from 'react'
import CodeEditor from './components/CodeEditor'
import VariablesPanel from './components/VariablesPanel'
import { parse } from './interpreter/parser'
import { run } from './interpreter/interpreter'
import type { Snapshot } from './interpreter/interpreter'
import { PRESETS } from './presets'

const SAMPLE = '#include <bits/stdc++.h>\nusing namespace std;\n\nint fib(int n) {\n  if (n <= 1) return n;\n  return fib(n - 1) + fib(n - 2);\n}\n\nint main() {\n  cout << fib(5) << endl;\n  return 0;\n}\n'

export default function App() {
  const [code, setCode] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('cpp-viz-code')
      return saved && saved.length > 0 ? saved : SAMPLE
    } catch {
      return SAMPLE
    }
  })
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null)
  const [index, setIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(500)
  const [error, setError] = useState<string | null>(null)
  const [showIf, setShowIf] = useState(true)
  const [showWhile, setShowWhile] = useState(true)
  const [showFor, setShowFor] = useState(true)
  const [condMenuOpen, setCondMenuOpen] = useState(false)
  const [jumpVal, setJumpVal] = useState('')
  const [editorPct, setEditorPct] = useState(55)
  const [dragging, setDragging] = useState(false)
  const [boolAsInt, setBoolAsInt] = useState(false)
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set())
  const [input, setInput] = useState('')
  const [codePct, setCodePct] = useState(48)
  const [outPct, setOutPct] = useState(26)
  const [hDragKind, setHDragKind] = useState<'code-cin' | 'cin-out' | null>(null)
  const cinPct = 100 - codePct - outPct
  const leftBodyRef = useRef<HTMLDivElement>(null)
  const [leftBodyHeight, setLeftBodyHeight] = useState(0)
  const availH = Math.max(0, leftBodyHeight - 12)

  function collect(): Snapshot[] | null {
    try {
      const program = parse(code)
      const snaps: Snapshot[] = []
      for (const s of run(program, { showCond: { if: showIf, while: showWhile, for: showFor }, boolAsInt, input })) snaps.push(s)
      return snaps
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const line = (e as { line?: number }).line
      setError(line ? '第 ' + line + ' 行：' + msg : msg)
      return null
    }
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
    setPlaying(false)
    setIndex(-1)
    setSnapshots(null)
    setError(null)
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

  function onCodeChange(v: string) {
    setCode(v)
    try {
      localStorage.setItem('cpp-viz-code', v)
    } catch {
      // 忽略
    }
    setPlaying(false)
    setSnapshots(null)
    setIndex(-1)
    setError(null)
  }

  function changeShow(kind: 'if' | 'while' | 'for', val: boolean) {
    if (kind === 'if') setShowIf(val)
    else if (kind === 'while') setShowWhile(val)
    else setShowFor(val)
    setSnapshots(null)
    setIndex(-1)
    setPlaying(false)
  }

  function changeBoolAsInt(val: boolean) {
    setBoolAsInt(val)
    setSnapshots(null)
    setIndex(-1)
    setPlaying(false)
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

  useEffect(() => {
    if (!dragging) return
    function onMove(e: MouseEvent) {
      const el = document.querySelector('.main') as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      const pct = ((e.clientX - r.left) / r.width) * 100
      setEditorPct(Math.min(80, Math.max(15, pct)))
    }
    function onUp() {
      setDragging(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
    }
  }, [dragging])

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setDragging(true)
  }

  function onCinDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setHDragKind('code-cin')
  }

  function onOutDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setHDragKind('cin-out')
  }

  useEffect(() => {
    if (!hDragKind) return
    function onMove(e: MouseEvent) {
      const el = document.querySelector('.left-body') as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      const pctFromTop = ((e.clientY - r.top) / r.height) * 100
      if (hDragKind === 'cin-out') {
        const hi = Math.min(60, 92 - codePct)
        setOutPct(Math.min(hi, Math.max(8, 100 - pctFromTop)))
      } else {
        const hi = Math.min(80, 92 - outPct)
        setCodePct(Math.min(hi, Math.max(10, pctFromTop)))
      }
    }
    function onUp() {
      setHDragKind(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
    }
  }, [hDragKind, codePct, outPct])

  useEffect(() => {
    const el = leftBodyRef.current
    if (!el) return
    const update = () => setLeftBodyHeight(el.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.closest('.cm-editor'))) return
      if (e.key === ' ') {
        if (el && el.tagName === 'BUTTON') return
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepForward()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stepBack()
      } else if (e.key === 'r' || e.key === 'R') {
        reset()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const cur = snapshots && index >= 0 ? snapshots[index] : null
  const activeLine = cur ? cur.line : -1

  let outputText = '(尚未运行)'
  let outputIsError = false
  if (cur) {
    if (cur.error) {
      outputText = cur.error
      outputIsError = true
    } else {
      outputText = cur.output || '(无输出)'
    }
  } else if (error) {
    outputText = error
    outputIsError = true
  }

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">
          <span className="logo">OI</span> 代码可视化
        </span>
        <select
          className="preset-select"
          value=""
          onChange={(e) => {
            const p = PRESETS.find((x) => x.name === e.target.value)
            if (p) onCodeChange(p.code)
          }}
          title="载入示例"
        >
          <option value="" disabled>
            示例…
          </option>
          {PRESETS.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="btn primary" onClick={togglePlay}>
          {playing ? '⏸ 暂停' : '▶ 运行'}
        </button>
        <button className="btn" onClick={stepForward} disabled={playing}>
          ⏭ 单步
        </button>
        <button className="btn" onClick={stepBack} disabled={playing || !snapshots}>
          ⏮ 后退
        </button>
        <button className="btn" onClick={reset}>
          ⟲ 重置
        </button>
        <div className="speed-control" title="播放速度（每步间隔）">
          <input
            type="range"
            min={50}
            max={2000}
            step={50}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="speed-slider"
          />
          <span className="speed-label">{speed}ms</span>
        </div>
        <span className="spacer" />
        <div className="cond-toggle">
          <button className="btn" onClick={() => setCondMenuOpen((o) => !o)}>
            设置 ▾
          </button>
          {condMenuOpen && (
            <div className="cond-menu">
              <div className="cond-menu-hint">运行前设置，改动后需重新运行</div>
              <label>
                <input type="checkbox" checked={showIf} onChange={(e) => changeShow('if', e.target.checked)} />
                if 判断
              </label>
              <label>
                <input type="checkbox" checked={showWhile} onChange={(e) => changeShow('while', e.target.checked)} />
                while 判断
              </label>
              <label>
                <input type="checkbox" checked={showFor} onChange={(e) => changeShow('for', e.target.checked)} />
                for 判断
              </label>
              <label>
                <input type="checkbox" checked={boolAsInt} onChange={(e) => changeBoolAsInt(e.target.checked)} />
                bool 输出 1/0
              </label>
            </div>
          )}
        </div>
        <span className="step-badge">
          {snapshots && index >= 0 ? '第 ' + (index + 1) + ' / ' + snapshots.length + ' 步' : '未运行'}
        </span>
        <div className="jump-control">
          <span className="jump-label">跳到</span>
          <input
            type="number"
            className="jump-input"
            min={1}
            max={snapshots ? snapshots.length : 1}
            placeholder="步"
            value={jumpVal}
            disabled={!snapshots}
            onChange={(e) => setJumpVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doJump()
            }}
          />
          <button className="btn btn-sm" onClick={doJump} disabled={!snapshots}>
            跳转
          </button>
        </div>
      </div>

      <div className="main">
        <div className="editor-pane" style={{ flex: '0 0 ' + editorPct + '%' }}>
          <div className="pane-title">代码编辑器 · C++</div>
          <div className="left-body" ref={leftBodyRef}>
            <div className="editor-body" style={{ height: availH * codePct / 100 }}>
              <CodeEditor value={code} onChange={onCodeChange} activeLine={activeLine} breakpoints={breakpoints} onToggleBreakpoint={toggleBreakpoint} />
            </div>
            <div className="divider-h" onMouseDown={onCinDividerMouseDown} title="拖动调整代码框高度" />
            <div className="cin-pane" style={{ height: availH * cinPct / 100 }}>
              <div className="cin-pane-title">cin 输入</div>
              <textarea
                className="cin-textarea"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="预填 cin 输入，支持空格/换行分隔"
              />
            </div>
            <div className="divider-h" onMouseDown={onOutDividerMouseDown} title="拖动调整 cin / 输出高度" />
            <div className="output-pane" style={{ height: availH * outPct / 100 }}>
              <div className="output-pane-title">输出</div>
              <pre className={outputIsError ? 'error' : ''}>{outputText}</pre>
            </div>
          </div>
        </div>
        <div className="divider" onMouseDown={onDividerMouseDown} />
        <div className="viz-pane">
          <div className="pane-title">
            变量 / 数据结构
            <span className="legend">
              <span className="lg"><span className="swatch line" />当前行</span>
              <span className="lg"><span className="swatch read" />读取</span>
              <span className="lg"><span className="swatch judge" />判断</span>
              <span className="lg"><span className="swatch write" />写入</span>
            </span>
          </div>
          <VariablesPanel snapshot={cur} />
        </div>
      </div>

    </div>
  )
}
