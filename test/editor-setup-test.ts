import { check, report } from './_helpers'
import { readFileSync } from 'node:fs'
import { EditorState } from '@codemirror/state'
import { indentUnit } from '@codemirror/language'
import { keymap } from '@codemirror/view'
import { indentLess, indentMore } from '@codemirror/commands'
import {
  DEFAULT_INDENT_SIZE,
  INDENT_SIZES,
  editorIndentExtensions,
  indentUnitOf,
  normalizeIndentSize,
} from '../src/components/editorSetup'

// 编辑器缩排设定：Tab 缩排几个空格 + 整行加减缩排的快捷键。
// 使用者回报「Windows 上 Tab 是 4 格，工具里只有 2 格」→ 预设改成 4（可切回 2）。
// 这里不需要真 DOM：EditorState 就能检查 facet 与快捷键绑定。

// ---------- 预设与换算 ----------
check('预设缩排是 4 格', DEFAULT_INDENT_SIZE === 4, String(DEFAULT_INDENT_SIZE))
check('可以选 2 或 4', INDENT_SIZES.join(',') === '2,4', INDENT_SIZES.join(','))
check('indentUnitOf(4) = 4 个空格', indentUnitOf(4) === '    ')
check('indentUnitOf(2) = 2 个空格', indentUnitOf(2) === '  ')
check('normalizeIndentSize 收到乱值 → 回预设 4', normalizeIndentSize('abc') === 4 && normalizeIndentSize(7) === 4)
check('normalizeIndentSize 接受 2 与 4（含字串）', normalizeIndentSize(2) === 2 && normalizeIndentSize('4') === 4)

// ---------- 套进 EditorState 之后真的是 4 格 ----------
const st4 = EditorState.create({ doc: 'int main() {\n}', extensions: editorIndentExtensions(4) })
check('EditorState 的 indentUnit = 4 个空格', st4.facet(indentUnit) === '    ', JSON.stringify(st4.facet(indentUnit)))
check('tabSize 也是 4（显示 \\t 时用）', st4.tabSize === 4, String(st4.tabSize))
const st2 = EditorState.create({ doc: '', extensions: editorIndentExtensions(2) })
check('切成 2 格时 indentUnit = 2 个空格', st2.facet(indentUnit) === '  ', JSON.stringify(st2.facet(indentUnit)))

// ---------- 快捷键 ----------
const binds = st4.facet(keymap).flat()
const bind = (key: string) => binds.find((b: any) => b.key === key)
check('Tab → 加缩排（indentMore）', bind('Tab')?.run === indentMore)
check('Shift-Tab → 减缩排（indentLess）', bind('Shift-Tab')?.run === indentLess)
check('Ctrl-] → 加缩排', bind('Mod-]')?.run === indentMore)
check('Ctrl-[ → 减缩排', bind('Mod-[')?.run === indentLess)
check('真的有绑定到 4 组键', ['Tab', 'Shift-Tab', 'Mod-]', 'Mod-['].every((k) => !!bind(k)))

// ---------- 接线的契约测试（以前吃过「改了线但没接上」的亏）----------
const app = readFileSync('src/App.tsx', 'utf8')
check('App 把 indentSize 传给 CodeEditor', /indentSize=\{indentSize\}/.test(app))
// S7 之后设定选单的 JSX 搬到 Topbar.tsx，接线（changeIndentSize）还留在 App
const topbar = readFileSync('src/components/Topbar.tsx', 'utf8')
check('设定选单里有 Tab 缩排选项', topbar.indexOf('Tab 缩排') >= 0 && app.indexOf('changeIndentSize') >= 0)
check('Topbar 把缩排选择接回 App（onIndentSizeChange）', /onIndentSizeChange/.test(topbar))
check('App 会记住选择（localStorage）', app.indexOf('cpp-viz-indent-size') >= 0)
const ed = readFileSync('src/components/CodeEditor.tsx', 'utf8')
check('CodeEditor 用 Compartment 动态重设缩排（不重建编辑器）', /indentCompartment\.reconfigure/.test(ed))
check('CodeEditor 真的用了 editorIndentExtensions', /editorIndentExtensions/.test(ed))

report('editor-setup-test')