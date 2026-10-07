import { useEffect, useRef, useState } from 'react'
import CodeEditor from './components/CodeEditor'
import VariablesPanel from './components/VariablesPanel'
import ErrorBoundary from './components/ErrorBoundary'
import Topbar from './components/Topbar'
import OutputPane, { outputView } from './components/OutputPane'
import { Splitter, useStackDrag, useVerticalDrag } from './components/Splitter'
import { DEFAULT_INDENT_SIZE, normalizeIndentSize } from './components/editorSetup'
import { usePlayer } from './components/usePlayer'
import { EDITOR_PCT_MAX, EDITOR_PCT_MIN, twoColumnMinWidth } from './components/panelLayout'
import { PRESETS } from './presets'

const SAMPLE = '#include <bits/stdc++.h>\nusing namespace std;\n\nint fib(int n) {\n  if (n <= 1) return n;\n  return fib(n - 1) + fib(n - 2);\n}\n\nint main() {\n  cout << fib(5) << endl;\n  return 0;\n}\n'

/**
 * 主殼：只負責「版面 + 把狀態接起來」。
 * 播放/單步/斷點在 usePlayer，工具列在 Topbar，輸出面板在 OutputPane，分割線在 Splitter（重構 S7）。
 */
export default function App() {
  const [code, setCode] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('cpp-viz-code')
      return saved && saved.length > 0 ? saved : SAMPLE
    } catch {
      return SAMPLE
    }
  })
  const [showIf, setShowIf] = useState(true)
  const [showWhile, setShowWhile] = useState(true)
  const [showFor, setShowFor] = useState(true)
  const [boolAsInt, setBoolAsInt] = useState(false)
  const [input, setInput] = useState('')
  // Tab 缩排几个空格（预设 4，见 editorSetup.ts）。这是编辑器设定，不用让快照失效。
  const [indentSize, setIndentSize] = useState<number>(() => {
    try {
      return normalizeIndentSize(localStorage.getItem('cpp-viz-indent-size'))
    } catch {
      return DEFAULT_INDENT_SIZE
    }
  })
  const [editorPct, setEditorPct] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 1500 ? 50 : 55))
  const [codePct, setCodePct] = useState(48)
  const [outPct, setOutPct] = useState(26)
  const cinPct = 100 - codePct - outPct
  const leftBodyRef = useRef<HTMLDivElement>(null)
  const [leftBodyHeight, setLeftBodyHeight] = useState(0)
  const availH = Math.max(0, leftBodyHeight - 12)

  const player = usePlayer({ code, input, showIf, showWhile, showFor, boolAsInt })
  const vDrag = useVerticalDrag(setEditorPct, EDITOR_PCT_MIN, EDITOR_PCT_MAX)
  const hDrag = useStackDrag({ codePct, outPct, setCodePct, setOutPct })
  const [packSignal, setPackSignal] = useState(0)
  const [packHint, setPackHint] = useState<string | null>(null)

  /**
   * 「自動並排」：一鍵解掉三件擋住並排的事 ——
   *   1. 樹 / 遞歸樹的「手動整行（⤢）」與「放大 >100%」：兩者都會讓 isWide() 無視面板寬度、永遠佔整行
   *      （手動設定存在 localStorage，所以拖中線也沒用）→ 交給 VariablesPanel（packSignal）。
   *   2. 右側面板不夠寬放不下兩欄 → 依「量到的實際寬度」把中線往左移。
   *   3. 真的做不到（螢幕太窄 / 編輯器已到 15% 下限）→ 在標題列講清楚，不要靜默沒反應。
   * 為什麼要重試：React 的 state 更新與版面重算是非同步的，所以每 40ms 重新量一次（最多 4 次）。
   */
  function autoPack() {
    setPackHint(null)
    setPackSignal((n) => n + 1)
    let tries = 0
    const step = () => {
      const row = document.querySelector('.main') as HTMLElement | null
      const rowW = row ? row.getBoundingClientRect().width : 0
      if (rowW <= 0) return
      const body = document.querySelector('.viz-body') as HTMLElement | null
      const main = document.querySelector('.viz-main') as HTMLElement | null
      if (!body || !main) {
        // 還沒有任何卡片：先把右側留到六成，之後跑起來就有機會並排
        setEditorPct((p) => (100 - p < 60 ? Math.min(p, 40) : p))
        return
      }
      const cols = getComputedStyle(main).gridTemplateColumns.split(/\s+/).filter((s) => s.length > 0).length
      if (cols >= 2) return
      // 面板寬 = 卡片區寬 + 內距 + 純量欄；這個差值跟面板寬度無關，量一次就好
      const chrome = Math.max(0, body.clientWidth - main.clientWidth)
      const need = twoColumnMinWidth(window.innerWidth) + chrome + 12 + tries * 24
      setEditorPct((p) => {
        const panelW = (rowW * (100 - p)) / 100
        if (panelW >= need) return p
        return Math.max(EDITOR_PCT_MIN, Math.min(EDITOR_PCT_MAX, 100 - (need / rowW) * 100))
      })
      tries++
      if (tries < 4) window.setTimeout(step, 40)
      else setPackHint('螢幕不夠寬：面板已放到最大（編輯器 ' + EDITOR_PCT_MIN + '%），卡片區仍放不下两栏')
    }
    step()
  }

  function onCodeChange(v: string) {
    setCode(v)
    try {
      localStorage.setItem('cpp-viz-code', v)
    } catch {
      // 忽略
    }
    player.invalidate()
  }

  // cin 输入也是 collect() 的输入之一，所以改了它同样要让快照失效。
  // 以前这里只 setInput、没清快照 → 「先运行（输入框还空着）→ 再填输入」会一直重播
  // 旧的「cin 输入不足」快照，按单步/播放都还是那个错误，看起来像「偶发的 bug」，
  // 刷新（清空 snapshots）才会好 —— 这正是使用者遇到的现象。
  function onInputChange(v: string) {
    setInput(v)
    player.invalidate()
  }

  function changeShow(kind: 'if' | 'while' | 'for', val: boolean) {
    if (kind === 'if') setShowIf(val)
    else if (kind === 'while') setShowWhile(val)
    else setShowFor(val)
    player.invalidate()
  }

  function changeIndentSize(size: number) {
    const n = normalizeIndentSize(size)
    setIndentSize(n)
    try {
      localStorage.setItem('cpp-viz-indent-size', String(n))
    } catch {
      // 无痕模式：存不了也没关系
    }
  }

  function changeBoolAsInt(val: boolean) {
    setBoolAsInt(val)
    player.invalidate()
  }

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
        player.togglePlay()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        player.stepForward()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        player.stepBack()
      } else if (e.key === 'r' || e.key === 'R') {
        player.reset()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const view = outputView(player.cur, player.error)

  return (
    <div className="app">
      <Topbar
        playing={player.playing}
        canBack={!!player.snapshots}
        canJump={!!player.snapshots}
        maxStep={player.snapshots ? player.snapshots.length : 1}
        stepLabel={player.stepLabel}
        speed={player.speed}
        jumpVal={player.jumpVal}
        showIf={showIf}
        showWhile={showWhile}
        showFor={showFor}
        boolAsInt={boolAsInt}
        indentSize={indentSize}
        onPickPreset={(name) => {
          const p = PRESETS.find((x) => x.name === name)
          if (p) onCodeChange(p.code)
        }}
        onTogglePlay={player.togglePlay}
        onStepForward={player.stepForward}
        onStepBack={player.stepBack}
        onReset={player.reset}
        onSpeedChange={player.setSpeed}
        onShowChange={changeShow}
        onBoolAsIntChange={changeBoolAsInt}
        onIndentSizeChange={changeIndentSize}
        onJumpValChange={player.setJumpVal}
        onJump={player.doJump}
      />

      <div className="main">
        <div className="editor-pane" style={{ flex: '0 0 ' + editorPct + '%' }}>
          <div className="pane-title">代码编辑器 · C++</div>
          <div className="left-body" ref={leftBodyRef}>
            <div className="editor-body" style={{ height: availH * codePct / 100 }}>
              <CodeEditor
                value={code}
                onChange={onCodeChange}
                activeLine={player.activeLine}
                breakpoints={player.breakpoints}
                onToggleBreakpoint={player.toggleBreakpoint}
                indentSize={indentSize}
              />
            </div>
            <Splitter orientation="horizontal" onMouseDown={hDrag.onCodeDividerMouseDown} title="拖动调整代码框高度" />
            <div className="cin-pane" style={{ height: availH * cinPct / 100 }}>
              <div className="cin-pane-title">cin 输入</div>
              <textarea
                className="cin-textarea"
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                placeholder="预填 cin 输入，支持空格/换行分隔"
              />
            </div>
            <Splitter orientation="horizontal" onMouseDown={hDrag.onOutDividerMouseDown} title="拖动调整 cin / 输出高度" />
            <OutputPane view={view} height={availH * outPct / 100} />
          </div>
        </div>
        <Splitter orientation="vertical" onMouseDown={vDrag.onMouseDown} />
        <div className="viz-pane">
          <div className="pane-title">
            变量 / 数据结构
            <span className="legend">
              <span className="lg"><span className="swatch line" />当前行</span>
              <span className="lg"><span className="swatch read" />读取</span>
              <span className="lg"><span className="swatch judge" />判断</span>
              <span className="lg"><span className="swatch write" />写入</span>
            </span>
            <button
              className="btn btn-sm pack-btn"
              onClick={autoPack}
              title="把右側面板調寬到卡片剛好兩欄並排，並把樹 / 遞歸樹的「整行」與放大重設"
            >
              ⇔ 自動並排
            </button>
            {packHint && <span className="pack-hint">{packHint}</span>}
          </div>
          <ErrorBoundary label="panel" resetKey={code}>
            <VariablesPanel snapshot={player.cur} packSignal={packSignal} />
          </ErrorBoundary>
        </div>
      </div>

    </div>
  )
}
