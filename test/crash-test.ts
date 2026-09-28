import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ErrorBoundary, { CrashCard, describeCrash } from '../src/components/ErrorBoundary'

// 「黑屏」防护：渲染期抛错时 React 会把整棵树卸掉，使用者只看到一片空白，
// 也不知道要回报什么。ErrorBoundary + CrashCard 把这种错误变成看得懂的一则讯息。
// 注：React 的 SSR（renderToStaticMarkup）不支援 error boundary，所以「接住」这一步在 node 端测不到，
//     这里测的是替代画面本身、讯息文字，以及「App 真的有把面板包起来」。

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; return }
  fail++
  console.log('FAIL ' + name + (detail ? ' | ' + detail : ''))
}

// ---------- 讯息 ----------
const c1 = describeCrash(new Error('boom'))
check('Error 的 message 会带出来', c1.detail === 'boom', c1.detail)
check('标题讲清楚是工具的 bug', c1.title.indexOf('内部错误') >= 0 && c1.title.indexOf('bug') >= 0, c1.title)
const c2 = describeCrash('不是 Error 的字串')
check('非 Error 的东西也能变成讯息', c2.detail === '不是 Error 的字串', c2.detail)
check('非 Error 也有标题', c2.title.indexOf('内部错误') >= 0)
check('有堆叠时才会附上堆叠', (c1.stack ?? '').length > 0)

// ---------- 替代画面 ----------
const h = renderToStaticMarkup(createElement(CrashCard, { crash: c1 }))
check('画的是错误卡（不是空白）', h.indexOf('crash-card') >= 0)
check('画面里有错误内容', h.indexOf('boom') >= 0)
check('画面里有回报指引', h.indexOf('回报给我们') >= 0)
check('画面里有重置按钮', h.indexOf('重置') >= 0)
const hStack = renderToStaticMarkup(createElement(CrashCard, { crash: c1 }))
check('堆叠只取前几行（不占满画面）', (hStack.match(/crash-stack/g) || []).length === 1)
const hNoStack = renderToStaticMarkup(createElement(CrashCard, { crash: { title: 't', detail: 'd' } }))
check('没有堆叠时不画堆叠区块', hNoStack.indexOf('crash-stack') < 0)

// ---------- 正常时不能干扰渲染 ----------
const ok = renderToStaticMarkup(createElement(ErrorBoundary, { label: 't' }, createElement('div', null, '内容')))
check('没出错时直接渲染 children', ok.indexOf('内容') >= 0 && ok.indexOf('crash-card') < 0, ok)

// ---------- App 真的把面板包起来了（契约测试） ----------
const app = readFileSync('src/App.tsx', 'utf8')
check('App 有 import ErrorBoundary', /import ErrorBoundary from '\.\/components\/ErrorBoundary'/.test(app))
const wrap = app.indexOf('<ErrorBoundary') >= 0 && app.indexOf('<VariablesPanel') > app.indexOf('<ErrorBoundary')
check('VariablesPanel 被 ErrorBoundary 包住', wrap)
const panel = readFileSync('src/components/VariablesPanel.tsx', 'utf8')
check('面板读 localStorage 有 try/catch 守衛（隐私模式下连读都会抛）', /function readStoredLayout[\s\S]{0,200}catch/.test(panel))

console.log('==== crash-test: ' + pass + ' 通過, ' + fail + ' 失敗 ====')
if (fail > 0) process.exit(1)