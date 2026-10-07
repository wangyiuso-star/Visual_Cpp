import { check, report } from './_helpers'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import App from '../src/App'
import { outputView } from '../src/components/OutputPane'
import { run } from '../src/interpreter/interpreter'
import { parse } from '../src/interpreter/parser'

// S7（App.tsx 拆檔）的驗證：
//   1. 輸出面板的顯示邏輯是純函式 → 直接斷言所有分支
//   2. 刻意搬走／搬到別處的東西用原始碼契約鎖住（以前吃過「改了線但沒接上」的虧）

// ---------- outputView：輸出面板要顯示什麼 ----------
const noErr = { error: null, output: '42\n' } as any
const withErr = { error: '第 7 行：除以零', output: '1\n' } as any
const noOut = { error: null, output: '' } as any

check('有快照 + 有輸出 → 顯示輸出', outputView(noErr, null).text === '42\n' && !outputView(noErr, null).isError)
check('有快照 + 空輸出 → 「(无输出)」', outputView(noOut, null).text === '(无输出)' && !outputView(noOut, null).isError)
check('有快照 + 執行期錯誤 → 顯示錯誤並標紅', outputView(withErr, null).text === '第 7 行：除以零' && outputView(withErr, null).isError)
check('沒有快照但有解析錯誤 → 顯示解析錯誤並標紅', outputView(null, '第 3 行：語法錯誤').text === '第 3 行：語法錯誤' && outputView(null, '第 3 行：語法錯誤').isError)
check('什麼都沒有 → 「(尚未运行)」', outputView(null, null).text === '(尚未运行)' && !outputView(null, null).isError)
check('快照在時，快照的錯誤優先於 collect 的舊錯誤', outputView(noErr, '舊的解析錯誤').text === '42\n')

// 用真的一份快照再確認一次接線（不是只餵假物件）
const snaps = [...run(parse('#include <bits/stdc++.h>\nusing namespace std;\nint main(){ cout << 7 << endl; }\n'), { input: '' })]
const last = snaps[snaps.length - 1]
check('真快照：輸出的最後一步顯示 7', outputView(last, null).text.indexOf('7') >= 0 && !outputView(last, null).isError, JSON.stringify(outputView(last, null)))

// ---------- 契約：拆完之後誰該有什麼、誰不該再有什麼 ----------
const app = readFileSync('src/App.tsx', 'utf8')
const player = readFileSync('src/components/usePlayer.ts', 'utf8')
const topbar = readFileSync('src/components/Topbar.tsx', 'utf8')
const splitter = readFileSync('src/components/Splitter.tsx', 'utf8')
const output = readFileSync('src/components/OutputPane.tsx', 'utf8')

check('App 只負責版面：不再自己計時播放（setInterval 已搬走）', !app.includes('setInterval') && player.includes('setInterval'))
check('App 不再碰斷點集合（breakpoints.has 在 usePlayer）', !app.includes('breakpoints.has') && player.includes('breakpoints.has'))
check('App 不再有設定選單的 JSX（cond-menu 在 Topbar）', !app.includes('cond-menu') && topbar.includes('cond-menu'))
check('App 不再有 presets 下拉（示例… 在 Topbar）', !app.includes('示例…') && topbar.includes('示例…'))
check('App 不再自己判斷輸出文字（改用 outputView）', app.includes('outputView(player.cur, player.error)') && output.includes('export function outputView'))
check('App 用 Splitter 元件取代裸的 divider div', app.includes('<Splitter') && !/className="divider/.test(app))
check('Splitter 兩種方向都支援', splitter.includes("orientation === 'vertical' ? 'divider' : 'divider-h'"))
check('App 把執行控制接給 Topbar', ['onTogglePlay', 'onStepForward', 'onStepBack', 'onReset', 'onJump'].every((k) => app.includes(k + '={player.')))
check('App 把 cin 輸入的失效邏輯保留（player.invalidate）', app.includes('player.invalidate()'))
check('App 的「跳到」上限仍然來自快照數', app.includes('maxStep={player.snapshots ? player.snapshots.length : 1}'))

// ---------- 整個主殼真的能渲染出來（拆完之後最容易斷的是接線）----------",
const shellHtml = renderToStaticMarkup(createElement(App))
check('主殼能渲染（不拋錯、不是空殼）', shellHtml.length > 1000, String(shellHtml.length))
check('渲染出工具列與三個面板', ['topbar', 'editor-pane', 'cin-textarea', 'output-pane', 'viz-pane'].every((k) => shellHtml.includes(k)))
check('工具列帶出示例下拉與設定選單', shellHtml.includes('示例…') && shellHtml.includes('设置 ▾'))
check('還沒執行時輸出面板顯示「(尚未运行)」', shellHtml.includes('(尚未运行)'))
check('變數面板的圖例還在', shellHtml.includes('當前行') || shellHtml.includes('当前行'))

// 拆檔的成果（避免以後又長回去）
const appLines = app.split('\n').length
check('App.tsx 在 260 行以內（拆分前 480 行）', appLines <= 260, String(appLines))

report('appshell-test')
