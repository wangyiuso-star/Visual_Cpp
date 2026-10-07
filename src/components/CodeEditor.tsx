import { useEffect, useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, Decoration, DecorationSet, gutter, GutterMarker, lineNumbers } from '@codemirror/view'
import { Compartment, StateField, StateEffect, RangeSet, RangeSetBuilder } from '@codemirror/state'
import { editorIndentExtensions, normalizeIndentSize } from './editorSetup'

const setActiveLine = StateEffect.define<number>()

const activeLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setActiveLine)) {
        if (e.value <= 0 || e.value > tr.state.doc.lines) {
          deco = Decoration.none
        } else {
          const line = tr.state.doc.line(e.value)
          deco = Decoration.set([Decoration.line({ class: 'cm-active-line' }).range(line.from)])
        }
      }
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

const setBreakpoints = StateEffect.define<Set<number>>()

const breakpointMarker = new (class extends GutterMarker {
  toDOM() {
    const dot = document.createElement('span')
    dot.className = 'cm-breakpoint-dot'
    return dot
  }
})()

const breakpointSpacer = new (class extends GutterMarker {
  toDOM() {
    const s = document.createElement('span')
    s.className = 'cm-breakpoint-spacer'
    return s
  }
})()

const breakpointField = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty
  },
  update(set, tr) {
    set = set.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setBreakpoints)) {
        const builder = new RangeSetBuilder<GutterMarker>()
        const sorted = Array.from(e.value).sort((a, b) => a - b)
        for (const lineNum of sorted) {
          if (lineNum < 1 || lineNum > tr.state.doc.lines) continue
          const line = tr.state.doc.line(lineNum)
          builder.add(line.from, line.from, breakpointMarker)
        }
        set = builder.finish()
      }
    }
    return set
  },
})

interface Props {
  value: string
  onChange: (v: string) => void
  activeLine: number
  breakpoints: Set<number>
  onToggleBreakpoint: (line: number) => void
  // Tab 缩排几个空格（2 或 4）。预设 4，见 editorSetup.ts。
  indentSize: number
}

export default function CodeEditor({
  value,
  onChange,
  activeLine,
  breakpoints,
  onToggleBreakpoint,
  indentSize,
}: Props) {
  const ref = useRef<ReactCodeMirrorRef>(null)
  const indentCompartment = useMemo(() => new Compartment(), [])
  const onToggleRef = useRef(onToggleBreakpoint)
  useEffect(() => {
    onToggleRef.current = onToggleBreakpoint
  }, [onToggleBreakpoint])

  const extensions = useMemo(() => {
    const breakpointGutter = gutter({
      class: 'cm-breakpoint-gutter',
      markers: (view) => view.state.field(breakpointField),
      initialSpacer: () => breakpointSpacer,
      domEventHandlers: {
        mousedown(view, line, event) {
          event.preventDefault()
          // CodeMirror 的 domEventHandlers 把事件型別寬鬆地標成 Event，其實是滑鼠事件
          if ((event as MouseEvent).button !== 0) return false
          const lineNum = view.state.doc.lineAt(line.from).number
          onToggleRef.current(lineNum)
          return true
        },
      },
    })
    return [cpp(), activeLineField, breakpointField, breakpointGutter, lineNumbers(), indentCompartment.of(editorIndentExtensions(indentSize))]
    // indentSize 用 Compartment 动态重设（见下面的 useEffect），所以这里不需要进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 缩排设定改了：就地重设那一小块 extension（不用重建整个编辑器，也不会丢 undo 历史）
  useEffect(() => {
    const view = ref.current?.view
    if (view) view.dispatch({ effects: indentCompartment.reconfigure(editorIndentExtensions(normalizeIndentSize(indentSize))) })
  }, [indentSize, indentCompartment])

  useEffect(() => {
    const view = ref.current?.view
    if (!view) return
    view.dispatch({ effects: setActiveLine.of(activeLine) })
    // 跟随当前执行行：高亮了但可能滚在可视区外，这里把它滚进视野（仅在越界时滚动）
    if (activeLine >= 1 && activeLine <= view.state.doc.lines) {
      const line = view.state.doc.line(activeLine)
      view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'nearest', yMargin: 40 }) })
    }
  }, [activeLine])

  useEffect(() => {
    const view = ref.current?.view
    if (view) {
      view.dispatch({ effects: setBreakpoints.of(breakpoints) })
    }
  }, [breakpoints])

  return (
    <CodeMirror
      ref={ref}
      value={value}
      onChange={onChange}
      theme={oneDark}
      extensions={extensions}
      height="100%"
      basicSetup={{ highlightActiveLine: false, highlightActiveLineGutter: false, lineNumbers: false }}
    />
  )
}
