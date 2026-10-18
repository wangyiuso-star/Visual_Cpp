import type { Snapshot } from '../interpreter/interpreter'
import { t } from '../i18n'

export interface OutputView {
  text: string
  isError: boolean
  /** 非致命警告（目前只有 long long 超出 2^53 的精度失真）：显示在输出上方，不遮挡输出本身 */
  warning?: string
}

/**
 * 輸出面板該顯示什麼（純函式，方便 node 端斷言）：
 *   1. 已經有目前這一步 → 這一步的執行期錯誤，否則它的輸出
 *   2. 還沒有快照但 collect() 失敗過 → 解析／執行前的錯誤（例如語法錯誤）
 *   3. 都沒有 → 「尚未执行」
 */
export function outputView(cur: Snapshot | null, error: string | null): OutputView {
  if (cur) {
    if (cur.error) return { text: cur.error, isError: true, warning: cur.warning }
    return { text: cur.output || t('(无输出)'), isError: false, warning: cur.warning }
  }
  if (error) return { text: error, isError: true }
  return { text: t('(尚未运行)'), isError: false }
}

/** 左下的輸出面板（從 App.tsx 抽出來，重構 S7）。 */
export default function OutputPane({ view, height }: { view: OutputView; height?: number }) {
  return (
    <div className="output-pane" style={height === undefined ? undefined : { height }}>
      <div className="output-pane-title">{t('输出')}</div>
      {view.warning && (
        <div className="output-warning" role="status">
          ⚠ {view.warning}
        </div>
      )}
      <pre className={view.isError ? 'error' : ''}>{view.text}</pre>
    </div>
  )
}
