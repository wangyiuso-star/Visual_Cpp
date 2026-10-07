import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
import { PRESETS } from '../src/presets'
import VariablesPanel from '../src/components/VariablesPanel'

// 渲染层冒烟：把 VariablesPanel 真渲染成 HTML。
// presets-test 只断言输出，这里断言「画得出东西且不崩」——能抓到输出对但画面爆掉的 bug
//（例如历史上 struct 进容器导致的黑屏：row.cells.length on undefined）。
// 这是 DOM 级验证，不是像素级；像素需要真浏览器。

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; return }
  fail++
  console.log('FAIL ' + name + (detail ? ' | ' + detail : ''))
}

// 每个 preset 至少应在某一帧渲染出的标记
const expect: Record<string, string[]> = {
  // 注意：参数被 collectLocals 排除（interpreter.ts:590），所以 fib(int n) 没有 call-locals；
  // 参数值靠节点内联标签呈现（fib(6)）——这是 2026-08-16 修的真实参数值标签。
  'fib 递归': ['call-label', 'fib(6)'],
  '阶乘递归': ['call-label', 'fact(5)'],
  '二分查找': ['cell', 'idx'],
  '二叉搜索树': ['tree-node-wrap', 'tree-graph'],
  '全排列 dfs': ['call-label'],
  // 归并排序的函数体里有 mid/i/j 等真正的局部变量，用来验证 call-locals 确实会渲染
  '归并排序': ['call-label', 'call-locals'],
  'set/map 容器': ['map-key', 'map-row'],
  '图的 DFS': ['graph-svg', 'graph-node', 'graph-edge'],
  '带权图（有向）': ['graph-weight', 'graph-svg'],
  'Dijkstra 最短路': ['graph-label', 'graph-idx'],
}

const nonEmptyMarkers = ['class="cell', 'graph-svg', 'tree-node-wrap', 'call-label', 'viz-empty', 'stack-marker', 'queue-marker', 'scalar-var']

console.log('preset'.padEnd(18) + ' 步數  取樣  最大格子  渲染出的結構')
console.log('-'.repeat(88))

for (const p of PRESETS) {
  let snaps: any[] = []
  try {
    snaps = [...run(parse(p.code), {})]
  } catch (e) {
    check(p.name + ' 可执行', false, '执行期抛错: ' + (e as Error).message)
    continue
  }
  const last = snaps[snaps.length - 1]
  if (last && last.error) {
    check(p.name + ' 可执行', false, '运行报错: ' + last.error)
    continue
  }

  const stride = Math.max(1, Math.ceil(snaps.length / 80))
  const picks = snaps.filter((_: any, i: number) => i % stride === 0)
  if (picks[picks.length - 1] !== last) picks.push(last)

  let maxCells = 0
  let all = ''
  let renderErr = ''
  let emptyCase = ''
  for (const s of picks) {
    let h = ''
    try {
      h = renderToStaticMarkup(createElement(VariablesPanel, { snapshot: s }))
    } catch (e) {
      renderErr = 'step ' + s.step + ': ' + (e as Error).message
      break
    }
    const n = (h.match(/class="cell/g) || []).length
    if (n > maxCells) maxCells = n
    all += h
    // 有变量时不该渲染成空壳
    if (s.vars.length > 0 && !nonEmptyMarkers.some((m) => h.indexOf(m) >= 0)) {
      emptyCase = 'step ' + s.step + '（有 ' + s.vars.length + ' 个变量却没有任何结构标记）'
    }
  }
  if (renderErr) { check(p.name + ' 渲染不崩', false, renderErr); continue }
  check(p.name + ' 渲染不崩', true)
  check(p.name + ' 无空壳帧', emptyCase === '', emptyCase)

  const seen: string[] = []
  for (const t of expect[p.name] || []) {
    const ok = all.indexOf(t) >= 0
    seen.push((ok ? '+' : '-') + t)
  }
  check(p.name + ' 关键结构齐全', seen.every((s) => s[0] === '+'), seen.filter((s) => s[0] === '-').join(','))
  console.log(p.name.padEnd(18) + ' ' + String(snaps.length).padStart(4) + '  ' + String(picks.length).padStart(4) + '  ' + String(maxCells).padStart(7) + '   ' + seen.join(' '))
}

// ---------- 新语句 do-while 也要能被渲染出来 ----------
{
  const dw = [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    'int main() {',
    '  int i = 0, s = 0;',
    '  do {',
    '    s += i;',
    '    i++;',
    '  } while (i < 4);',
    '  cout << s << endl;',
    '  return 0;',
    '}',
    '',
  ].join('\n')
  const snaps = [...run(parse(dw), {})]
  let ok = true
  let detail = ''
  let sawPreCheck = false
  for (const s of snaps) {
    try {
      const h = renderToStaticMarkup(createElement(VariablesPanel, { snapshot: s }))
      if (s.vars.length > 0 && !nonEmptyMarkers.some((m) => h.indexOf(m) >= 0)) {
        ok = false
        detail = 'step ' + s.step + ' 渲染成空壳'
        break
      }
    } catch (e) {
      ok = false
      detail = 'step ' + s.step + ' 渲染抛错: ' + (e as Error).message
      break
    }
    if (s.line === 8 && !s.condition) sawPreCheck = true
  }
  check('do-while 全部快照可渲染', ok, detail)
  check('do-while 检查条件前的快照可渲染', sawPreCheck)
}

// ---------- 自定义比较函数排序的统计横幅要画得出来 ----------
{
  const sc = [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    'bool cmp(int x, int y){ return x > y; }',
    'int main() {',
    '  int a[6] = {1, 5, 3, 2, 6, 4};',
    '  sort(a, 6, cmp);',
    '  cout << a[0] << endl;',
    '  return 0;',
    '}',
    '',
  ].join('\n')
  const snaps = [...run(parse(sc), {})]
  let sawBanner = false
  let ok = true
  let detail = ''
  for (const s of snaps) {
    try {
      const h = renderToStaticMarkup(createElement(VariablesPanel, { snapshot: s }))
      if (h.indexOf('sort-banner') >= 0) sawBanner = true
      if (s.vars.length > 0 && !nonEmptyMarkers.some((m) => h.indexOf(m) >= 0)) {
        ok = false
        detail = 'step ' + s.step + ' 渲染成空壳'
        break
      }
    } catch (e) {
      ok = false
      detail = 'step ' + s.step + ' 渲染抛错: ' + (e as Error).message
      break
    }
  }
  check('cmp 排序全部快照可渲染', ok, detail)
  check('排序统计横幅有渲染出来', sawBanner)
}

// ---------- 容器当值：画面上不能再出现一格 '?' ----------
// 使用者回报：「map 的值是 vector 时，画面上显示 ?」。根因是面板里十几处
// 「不是标量就给 '?'」的退路。这里从 DOM 层锁住那几个具体位置。
{
  const cases: [string, string[], string[]][] = [
    ['map 的值是 vector', [], ['map<string, vector<int>> m; m["a"].push_back(5); m["a"].push_back(6);']],
    ['struct 的成员是 vector', ['struct P { int x; vector<int> v; };'], ['P p; p.x = 1; p.v.push_back(3);']],
    ['pair 的成员是 vector', [], ['pair<int, vector<int>> p; p.first = 1; p.second.push_back(9);']],
    ['stack 的元素是 vector', [], ['stack<vector<int>> s; vector<int> v; v.push_back(1); s.push(v);']],
  ]
  for (const [name, pre, body] of cases) {
    const src = ['#include <bits/stdc++.h>', 'using namespace std;'].concat(pre).concat(['int main() {']).concat(body.map((b) => '  ' + b)).concat(['  return 0;', '}', '']).join('\n')
    let last: any = null
    try {
      for (const s of run(parse(src), {})) last = s
    } catch (e) { check(name + ' 可执行', false, (e as Error).message); continue }
    if (last && last.error) { check(name + ' 可执行', false, '运行报错: ' + last.error); continue }
    let h = ''
    try { h = renderToStaticMarkup(createElement(VariablesPanel, { snapshot: last })) } catch (e) {
      check(name + ' 可渲染', false, (e as Error).message)
      continue
    }
    check(name + ' 画面上没有 ?', h.indexOf('>?') < 0, '出现了 ?')
  }
}

// ---------- 卡片控制项：拖动把手 / 单卡缩放 / 整行宽（v0.9.0）----------
// 拖动本身要真浏览器（DOM 事件）才测得到，这里只从 DOM 层确认控件都画出来了、
// 而且每张卡片都带了自己的 --card-zoom（缩放变量）。
{
  const src = [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    'int sum(int n){ int s = 0; for(int i = 1; i <= n; i++) s += i; return s; }',
    'int main(){ int a[3] = {1,2,3}; cout << sum(a[0]); return 0; }',
    '',
  ].join('\n')
  let last: any = null
  try {
    for (const s of run(parse(src), {})) last = s
  } catch (e) { check('卡片控制项：程式可执行', false, (e as Error).message) }
  if (last && last.error) check('卡片控制项：程式可执行', false, last.error)
  let h = ''
  try {
    h = renderToStaticMarkup(createElement(VariablesPanel, { snapshot: last }))
  } catch (e) { check('卡片控制项：可渲染', false, (e as Error).message) }
  check('卡片有拖动把手', h.indexOf('card-drag') >= 0)
  check('卡片有缩放控件', h.indexOf('card-controls') >= 0 && h.indexOf('zoom-pct') >= 0)
  check('卡片带 --card-zoom 缩放变数', h.indexOf('--card-zoom') >= 0)
  check('卡片有上下移与整行宽按钮', h.indexOf('border-radius:4px;font-size:11px;padding:2px 5px') >= 0 || (h.match(/reorder-btn/g) || []).length >= 3)
}
// ---------- 图的 SVG 要是响应式（有 viewBox，配合 CSS max-width:100%）----------
// 起因：使用者把图那张卡片放大到 160%，固定宽度的 SVG 撑出去 → 出现横向卷轴、后面的节点被裁掉。
{
  const p = PRESETS.find((x: any) => /图/.test(x.name))
  check('找得到图的 preset', !!p)
  if (p) {
    let last: any = null
    try { for (const s of run(parse(p.code), {})) last = s } catch (e) { check('图的 preset 可执行', false, (e as Error).message) }
    let h = ''
    try { h = renderToStaticMarkup(createElement(VariablesPanel, { snapshot: last })) } catch (e) { check('图的 preset 可渲染', false, (e as Error).message) }
    const m = /class="graph-svg" width="(\d+)" height="(\d+)" viewBox="([^"]+)"/.exec(h)
    check('图的 svg 带 viewBox（放大时才缩得进卡片）', !!m, h.slice(Math.max(0, h.indexOf('graph-svg') - 20), h.indexOf('graph-svg') + 120))
    if (m) check('viewBox 与 width/height 一致', m[3] === '0 0 ' + m[1] + ' ' + m[2], m[3] + ' vs ' + m[1] + 'x' + m[2])
  }
}
// ---------- 卡片并排（v0.9.6）：多张卡片并排 ----------
// 起因：使用者说「让更多变量可以放在右边并列」——以前窄屏直接退成单列，而且大部分卡片
// （一维数组/字串/set/map…）都写死占整行，结果一张卡片一行、右边永远空着。
// 现在：网格 auto-fill 自动分栏 + 预设每张卡片只占一栏，只有树/堆与很宽的二维表才占整行。
{
  const src = [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    'int main(){',
    '  vector<vector<int>> memo(20, vector<int>(20, -1));',
    '  vector<int> small3 = {1,2,3};',
    '  pair<int,int> pt = make_pair(1,2);',
    '  string s = "hi";',
    '  tree<int> t(3); t[1]=1; t[2]=2; t[3]=3;',
    '  int x = 5;',
    '  cout << memo[0][0] << small3[0] << pt.first << s << t[1] << x;',
    '  return 0;',
    '}',
    '',
  ].join('\n')
  let last: any = null
  try { for (const s of run(parse(src), {})) last = s } catch (e) { check('并排测试可执行', false, (e as Error).message) }
  let h = ''
  try { h = renderToStaticMarkup(createElement(VariablesPanel, { snapshot: last })) } catch (e) { check('并排测试可渲染', false, (e as Error).message) }
  // 卡片外层的 class 由 cardClass() 组成：'var' +（占整行时）' card-wide'。
  // 名字要锚在 </span>NAME<span（caret 之后紧跟变量名），不然单字母名字（s）会误判到别的卡片。
  const cardCls = (name: string) => {
    const m = new RegExp('class="var([^"]*)"[\\s\\S]{0,300}?</span>' + name + '<span').exec(h)
    return m ? m[1] : ''
  }
  const wideCard = (name: string) => cardCls(name).indexOf('card-wide') >= 0
  check('二维表卡片不再占整行（可以和别的卡片并排）', !wideCard('memo'), cardCls('memo'))
  check('一维数组只占一栏', !wideCard('small3'), cardCls('small3'))
  check('pair 只占一栏', !wideCard('pt'), cardCls('pt'))
  check('字串只占一栏（以前占整行，右边全空）', !wideCard('s'), cardCls('s'))
  // SSR 量不到面板宽度（panelW = 0）→ 树的自动规则当作「窄面板」→ 占整行。
  // 量到宽度之后（浏览器里）面板够宽就会并排，这里只锁「窄面板时仍然占整行」。
  check('树在窄面板（或还没量到宽度）时仍然占整行', wideCard('t'), cardCls('t'))
  const css = readFileSync('src/index.css', 'utf8')
  check('网格用 auto-fill 自动并排（不是写死两列/单列）', /grid-template-columns:\s*repeat\(auto-fill/.test(css))
  check('窄屏也是 auto-fill（不再硬退成单列）', (css.match(/grid-template-columns:\s*repeat\(auto-fill/g) || []).length >= 2)
  check('一维视窗才自适应（useFit(WIN_1D)）', /useFit\(WIN_1D/.test(readFileSync('src/components/viz/window.tsx', 'utf8')))
  const panelSrc = readFileSync('src/components/VariablesPanel.tsx', 'utf8')
  check('面板会量自己的宽度（决定树要不要占整行）', /panelW/.test(panelSrc) && /ResizeObserver/.test(panelSrc))
  const layoutSrc = readFileSync('src/components/panelLayout.ts', 'utf8')
  check('有「面板够宽就让树并排」的门槛常数', /export const TREE_PACK_MIN = \d+/.test(layoutSrc))
  check('isWide 接受 auto 参数（手动选择优先）', /function isWide\(layout: CardLayout, key: string, auto = false\)/.test(layoutSrc))
}
console.log('-'.repeat(88))
console.log('==== render-test: ' + pass + ' 通过, ' + fail + ' 失败 ====')
if (fail > 0) process.exit(1)
