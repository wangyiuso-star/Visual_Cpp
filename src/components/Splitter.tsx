import { useEffect, useState } from 'react'

export interface SplitterProps {
  orientation: 'vertical' | 'horizontal'
  onMouseDown: (e: React.MouseEvent) => void
  title?: string
}

/** 拖拉用的分割線：vertical = 左右（.divider），horizontal = 上下（.divider-h）。 */
export function Splitter({ orientation, onMouseDown, title }: SplitterProps) {
  return (
    <div
      className={orientation === 'vertical' ? 'divider' : 'divider-h'}
      onMouseDown={onMouseDown}
      title={title}
    />
  )
}

/** 左右分割：拖的時候把滑鼠 x 在 .main 裡的相對位置換算成百分比。 */
export function useVerticalDrag(setPct: (v: number) => void, min = 15, max = 80) {
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    if (!dragging) return
    function onMove(e: MouseEvent) {
      const el = document.querySelector('.main') as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      const pct = ((e.clientX - r.left) / r.width) * 100
      setPct(Math.min(max, Math.max(min, pct)))
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
  }, [dragging, min, max, setPct])
  return {
    dragging,
    onMouseDown: (e: React.MouseEvent) => {
      e.preventDefault()
      setDragging(true)
    },
  }
}

export type StackDragKind = 'code-cin' | 'cin-out'

/**
 * 左側三段的上下分割（程式碼 / cin / 輸出）：拖 code-cin 界線改 codePct，
 * 拖 cin-out 界線改 outPct。兩條界線的夾制條件互相牽扯，所以放在同一個 hook 裡。
 */
export function useStackDrag(opts: {
  codePct: number
  outPct: number
  setCodePct: (v: number) => void
  setOutPct: (v: number) => void
}) {
  const [kind, setKind] = useState<StackDragKind | null>(null)
  const { codePct, outPct, setCodePct, setOutPct } = opts
  useEffect(() => {
    if (!kind) return
    function onMove(e: MouseEvent) {
      const el = document.querySelector('.left-body') as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      const pctFromTop = ((e.clientY - r.top) / r.height) * 100
      if (kind === 'cin-out') {
        const hi = Math.min(60, 92 - codePct)
        setOutPct(Math.min(hi, Math.max(8, 100 - pctFromTop)))
      } else {
        const hi = Math.min(80, 92 - outPct)
        setCodePct(Math.min(hi, Math.max(10, pctFromTop)))
      }
    }
    function onUp() {
      setKind(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
    }
  }, [kind, codePct, outPct, setCodePct, setOutPct])
  const start = (k: StackDragKind) => (e: React.MouseEvent) => {
    e.preventDefault()
    setKind(k)
  }
  return { kind, onCodeDividerMouseDown: start('code-cin'), onOutDividerMouseDown: start('cin-out') }
}
