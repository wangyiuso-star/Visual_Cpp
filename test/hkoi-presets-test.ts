import { check, report } from './_helpers'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
import VariablesPanel from '../src/components/VariablesPanel'
// 直接引用 HKOI 教學專案裡的 preset 檔（在本倉庫之外，兩專案並排）。
// 這是「跨專案」驗證：若那個資料夾不存在，打包會失敗，scripts/run-tests.mjs 會把它記為 SKIP
// 而不是 FAIL，所以本倉庫在別處 clone 也能跑 npm test。
// ⚠️ 資料夾是 VisualCode-preset，不是 presets ——
//    原本寫成 presets/ 讓這個測試從加入起就一直被 SKIP，等於從來沒驗證過課程 preset。
import { PRESETS } from '../../HKOI_teaching/VisualCode-preset/presets'

const marks = ['class="cell', 'graph-svg', 'tree-node-wrap', 'call-label', 'viz-empty', 'stack-marker', 'queue-marker', 'scalar-var']

// 从渲染出的 HTML 取「同屏可见的变量名」：容器卡片是 .var-name（caret span 之后那段），
// 纯量则渲染在右侧纯量栏 .sv-name —— 两者都算可见，否则会误判 head 之类的纯量没显示。
function varNames(html: string): string[] {
  const out: string[] = []
  const reCard = /class="caret">[^<]*<\/span>([A-Za-z_][A-Za-z0-9_]*)/g
  let m: RegExpExecArray | null
  while ((m = reCard.exec(html))) out.push(m[1])
  const reScalar = /class="sv-name">([A-Za-z_][A-Za-z0-9_]*)</g
  while ((m = reScalar.exec(html))) out.push(m[1])
  return out
}

console.log('preset'.padEnd(24) + ' 步數  最大格子  同屏變數（最後一帧）')
console.log('-'.repeat(96))

// 有幾個 preset 需要 cin 輸入（HKOI 那邊把範例輸入寫在註解裡，preset 本身沒有 input 欄位）。
// 照他們的註解給：讀到 EOF → 一串數字；getline 陷阱 → 第一行 3、第二行 hello world。
const PRESET_INPUTS: Record<string, string> = {
  '讀到 EOF（while cin）': '1 2 3',
  'getline 與 cin.ignore': '3' + String.fromCharCode(10) + 'hello world',
}
function presetInput(name: string, code: string): string {
  const fixed = PRESET_INPUTS[name]
  if (fixed !== undefined) return fixed
  // 其他 preset 若之後也用了 cin，先給一組安全的數字輸入
  // （cin 語句形式讀不足會明確報錯，這正是我們要的——所以一定要餵資料）
  return /\bcin\b/.test(code) ? '1 2 3 4 5' : ''
}

type Info = { steps: number; snaps: any[]; htmls: string[]; maxCells: number; allHtml: string }

const info: Record<string, Info> = {}

for (const p of PRESETS) {
  let snaps: any[] = []
  try {
    snaps = [...run(parse(p.code), { input: presetInput(p.name, p.code) })]
  } catch (e) {
    check(p.name + ' 可執行', false, '解析拋錯: ' + (e as Error).message)
    continue
  }
  const last = snaps[snaps.length - 1]
  if (last && last.error) {
    check(p.name + ' 可執行', false, '執行報錯: ' + last.error)
    continue
  }
  const stride = Math.max(1, Math.ceil(snaps.length / 80))
  const picks = snaps.filter((_: any, i: number) => i % stride === 0)
  if (picks[picks.length - 1] !== last) picks.push(last)

  let maxCells = 0
  let allHtml = ''
  let renderErr = ''
  let emptyCase = ''
  const htmls: string[] = []
  for (const s of picks) {
    let h = ''
    try {
      h = renderToStaticMarkup(createElement(VariablesPanel, { snapshot: s }))
    } catch (e) {
      renderErr = 'step ' + s.step + ': ' + (e as Error).message
      break
    }
    htmls.push(h)
    allHtml += h
    const n = (h.match(/class="cell/g) || []).length
    if (n > maxCells) maxCells = n
    if (s.vars.length > 0 && !marks.some((mm) => h.indexOf(mm) >= 0)) emptyCase = 'step ' + s.step + ' 空殼'
  }
  if (renderErr) { check(p.name + ' 渲染不崩', false, renderErr); continue }
  check(p.name + ' 渲染不崩', true)
  check(p.name + ' 無空殼幀', emptyCase === '', emptyCase)
  info[p.name] = { steps: snaps.length, snaps, htmls, maxCells, allHtml }

  const lastNames = picks.length ? varNames(htmls[htmls.length - 1]).join(' ') : ''
  console.log(p.name.padEnd(24) + ' ' + String(snaps.length).padStart(4) + '  ' + String(maxCells).padStart(7) + '   ' + lastNames)
}

console.log('-'.repeat(96))

// ---------- 你點名的 5 項視覺檢查 ----------
{
  const i = info['汉诺塔']
  check('汉诺塔：呼叫樹節點有畫出（hanoi(...) 標籤）', !!i && i.allHtml.indexOf('hanoi(') >= 0)
  check('汉诺塔：遞迴樹確實長出來（某帧 >=3 個節點）', !!i && i.htmls.some((h) => (h.match(/call-node-wrap/g) || []).length >= 3),
    i ? '最多 ' + Math.max(...i.htmls.map((h) => (h.match(/call-node-wrap/g) || []).length)) + ' 個' : '')
}
{
  const i = info['数组反转 (递归)']
  check('数组反转：swap 的兩個格子同時著 write 色', !!i && i.htmls.some((h) => (h.match(/class="cell write"/g) || []).length >= 2))
  check('数组反转：確實有 swap 造成的讀寫高亮', !!i && i.allHtml.indexOf('class="cell write"') >= 0)
}
{
  const i = info['linked list（数组模拟）']
  check('linked list：data 與 nextPtr 兩個陣列同屏', !!i && i.htmls.some((h) => {
    const n = varNames(h)
    return n.indexOf('data') >= 0 && n.indexOf('nextPtr') >= 0
  }))
  check('linked list：head 也可追蹤（同屏）', !!i && i.htmls.some((h) => {
    const n = varNames(h)
    return n.indexOf('data') >= 0 && n.indexOf('nextPtr') >= 0 && n.indexOf('head') >= 0
  }))
}
{
  const i = info['stack / queue 模拟']
  check('stack 渲染成豎排（.stack-view）', !!i && i.allHtml.indexOf('stack-view') >= 0)
  check('queue 渲染成橫排（.queue-view）', !!i && i.allHtml.indexOf('queue-view') >= 0)
}
{
  const i = info['合并两个有序数组']
  check('合併：a / b / c 三個陣列面板同屏', !!i && i.htmls.some((h) => {
    const n = varNames(h)
    return n.indexOf('a') >= 0 && n.indexOf('b') >= 0 && n.indexOf('c') >= 0
  }))
}

// ---------- 兩個新功能 preset（他們為我的實作預留的） ----------
{
  const i = info['do-while 示範']
  check('do-while preset：能跑且輸出 100', !!i && String(i.snaps[i.snaps.length - 1].output).indexOf('100') >= 0)
  const condLine = i ? (i.snaps.find((s: any) => s.condition) || {}).line : -1
  const pre = i ? i.snaps.filter((s: any) => s.line === condLine && !s.condition) : []
  check('do-while preset：有「檢查條件之前」的快照', pre.length > 0, 'condLine=' + condLine + ' pre=' + pre.length)
  const xVal = pre.length ? pre[0].vars.find((v: any) => v.name === 'x') : null
  check('do-while preset：該快照已是 body 之後的狀態（x=200）', !!xVal && String(xVal.cell.value) === '200',
    xVal ? 'x=' + xVal.cell.value : '')
  check('do-while preset：body 先於條件執行', !!i && i.snaps.findIndex((s: any) => s.line === condLine && !s.condition) > i.snaps.findIndex((s: any) => s.line === condLine - 2),
    condLine ? 'line ' + (condLine - 2) + '（x = x * 2）應早於 line ' + condLine : '')
}
{
  const i = info['陣列形參（不會被複製）']
  check('陣列形參 preset：共享語意（輸出 2 4 6 8 10）', !!i && String(i.snaps[i.snaps.length - 1].output).replace(/\s+/g, ' ').trim() === '2 4 6 8 10',
    i ? JSON.stringify(String(i.snaps[i.snaps.length - 1].output)) : '')
  check('陣列形參 preset：函式內 a 是 local 別名、外層 a 也可見', !!i && i.htmls.some((h) => {
    const n = varNames(h)
    return n.filter((x) => x === 'a').length >= 1 && h.indexOf('scope-local') >= 0
  }))
}

// ---------- 三個排序 preset 的結果 ----------
for (const nm of ['选择排序', '冒泡排序', '插入排序']) {
  const i = info[nm]
  check(nm + '：輸出已排序', !!i && String(i.snaps[i.snaps.length - 1].output).replace(/\s+/g, ' ').trim() === '1 2 3 4 5 6 7 8',
    i ? JSON.stringify(String(i.snaps[i.snaps.length - 1].output)) : '')
}

report('hkoi-presets-test')
