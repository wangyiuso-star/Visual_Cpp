import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

// 渲染期抛错时，React 会把整棵树卸掉 —— 使用者看到的就是「黑屏 / 白屏」，
// 而且完全不知道发生什么事、也不知道要回报什么。
// 这个边界把任何这类错误变成一则看得懂的讯息 + 重试按钮：
// 「内部错误（这是本工具的 bug，不是你的程式写错）」+ 错误内容 + 前几行堆叠。
export interface CrashInfo {
  title: string
  detail: string
  stack?: string
}

export function describeCrash(e: unknown): CrashInfo {
  const err = e instanceof Error ? e : new Error(String(e))
  return {
    title: '内部错误（这是本工具的 bug，不是你程式写错）',
    detail: err.message || String(e),
    stack: err.stack,
  }
}

interface Props {
  children: ReactNode
  // 显示在错误讯息里的位置（app / panel / editor）
  label?: string
  // 这个值一变就自动清掉错误状态（例如程式码改了），否则修好了还卡在错误画面
  resetKey?: unknown
  onReset?: () => void
}

// 替代画面本身抽成组件：ErrorBoundary 的「接住错误」在 node 端测不到（React 的 SSR 不支援 error boundary），
// 但这一段画面可以直接渲染来测。
export function CrashCard({ crash, onReset }: { crash: CrashInfo; onReset?: () => void }) {
  return (
    <div className="crash-card">
      <div className="crash-title">⚠ {crash.title}</div>
      <div className="crash-detail">{crash.detail}</div>
      {crash.stack && <pre className="crash-stack">{crash.stack.split('\n').slice(0, 5).join('\n')}</pre>}
      <div className="crash-hint">
        请把「程式码 + 上面这行讯息」回报给我们（讯息也印在浏览器 Console 里）。点「重置」可以继续用。
      </div>
      <button className="btn-sm" onClick={() => onReset?.()}>重置</button>
    </div>
  )
}

export default class ErrorBoundary extends Component<Props, { crash: CrashInfo | null }> {
  state: { crash: CrashInfo | null } = { crash: null }

  static getDerivedStateFromError(e: unknown): { crash: CrashInfo } {
    return { crash: describeCrash(e) }
  }

  componentDidCatch(e: unknown, info: ErrorInfo): void {
    // 保留在 console 里，方便回报时复制
    console.error('[cpp-viz:' + (this.props.label ?? 'panel') + '] 渲染错误', e, info)
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.crash && prev.resetKey !== this.props.resetKey) this.setState({ crash: null })
  }

  render(): ReactNode {
    const c = this.state.crash
    if (!c) return this.props.children
    return (
      <CrashCard
        crash={c}
        onReset={() => {
          this.setState({ crash: null })
          this.props.onReset?.()
        }}
      />
    )
  }
}
