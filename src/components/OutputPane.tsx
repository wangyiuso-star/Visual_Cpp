import type { Snapshot } from '../interpreter/interpreter'

export interface OutputView {
  text: string
  isError: boolean
}

/**
 * 輸出面板該顯示什麼（純函式，方便 node 端斷言）：
 *   1. 已經有目前這一步 → 這一步的執行期錯誤，否則它的輸出
 *   2. 還沒有快照但 collect() 失敗過 → 解析／執行前的錯誤（例如語法錯誤）
 *   3. 都沒有 → 「尚未执行」
 */
export function outputView(cur: Snapshot | null, error: string | null): OutputView {
  if (cur) {
    if (cur.error) return { text: cur.error, isError: true }
    return { text: cur.output || '(无输出)', isError: false }
  }
  if (error) return { text: error, isError: true }
  return { text: '(尚未运行)', isError: false }
}

/** 左下的輸出面板（從 App.tsx 抽出來，重構 S7）。 */
export default function OutputPane({ view, height }: { view: OutputView; height?: number }) {
  return (
    <div className="output-pane" style={height === undefined ? undefined : { height }}>
      <div className="output-pane-title">输出</div>
      <pre className={view.isError ? 'error' : ''}>{view.text}</pre>
    </div>
  )
}
