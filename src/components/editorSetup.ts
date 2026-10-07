import { EditorState } from '@codemirror/state'
import { indentUnit } from '@codemirror/language'
import { keymap } from '@codemirror/view'
import { indentLess, indentMore } from '@codemirror/commands'

// 缩排设定。CodeMirror 的 indentUnit 预设是「2 个空格」，但 Windows 上多数编辑器（VS / Dev-C++ /
// VS Code 预设）是 4 个空格，教材那边也常写 4 个 —— 所以预设改成 4，并在「设置」里可以切回 2。
// 抽成这个模组是为了「测得动」：node 端可以建立 EditorState 检查 facet，不需要真 DOM。
export const DEFAULT_INDENT_SIZE = 4
export const INDENT_SIZES = [2, 4] as const

export function indentUnitOf(size: number): string {
  return ' '.repeat(Math.max(1, Math.round(size)))
}

export function normalizeIndentSize(size: unknown): number {
  const n = Math.round(Number(size))
  return INDENT_SIZES.includes(n as 2 | 4) ? n : DEFAULT_INDENT_SIZE
}

// Tab / Shift-Tab 整行加減缩排（@uiw 预设的 indentWithTab 也是这一组）。
// 另外补 Ctrl-] / Ctrl-[（VS Code、Sublime 的写法），按一下就能加/减一层，不用先选取。
// 注：缩排量由 indentUnit 决定，所以这里不用自己算空格数。
export function indentKeymap() {
  return keymap.of([
    { key: 'Tab', run: indentMore },
    { key: 'Shift-Tab', run: indentLess },
    { key: 'Mod-]', run: indentMore },
    { key: 'Mod-[', run: indentLess },
  ])
}

// 加进编辑器 extensions 的这一组：缩排单位 + 快捷键 + 定位停位宽（显示 \t 时用）
export function editorIndentExtensions(size: number) {
  const n = normalizeIndentSize(size)
  return [indentUnit.of(indentUnitOf(n)), indentKeymap(), EditorState.tabSize.of(n)]
}
