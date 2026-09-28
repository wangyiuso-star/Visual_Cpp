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
console.log('-'.repeat(88))
console.log('==== render-test: ' + pass + ' 通过, ' + fail + ' 失败 ====')
if (fail > 0) process.exit(1)
