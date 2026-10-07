import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
import VariablesPanel from '../src/components/VariablesPanel'
import { GRAPH_MAX_EDGES, GRAPH_MAX_NODES, graphTooBigReason } from '../src/components/graphLimit'

// 「不要卡死」的回归测试。
// 起因：使用者交了 501×501 的 DP 表 vector<vector<int>> memo(501, vector<int>(501,-1))；
// 它走「邻接表 → 图」这条路，被当成 501 个节点、251k 条边的完全图，
// 卡片一口气渲染 251k 个 <line>：实测 40MB 的 HTML、node 端一次渲染 3~4 秒，浏览器直接卡死。
// 所以这里用「渲染出来的 HTML 大小」当门槛 —— 卡死必然先表现为 HTML 爆掉。

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; return }
  fail++
  console.log('FAIL ' + name + (detail ? ' | ' + detail : ''))
}

// ---------- 规模判断（纯函式）----------
check('小图可以画', graphTooBigReason(4, 4) === null)
check('刚好到上限可以画', graphTooBigReason(GRAPH_MAX_NODES, GRAPH_MAX_EDGES) === null)
check('节点超上限就不画', (graphTooBigReason(GRAPH_MAX_NODES + 1, 10) ?? '').indexOf('节点') >= 0)
check('边超上限就不画', (graphTooBigReason(10, GRAPH_MAX_EDGES + 1) ?? '').indexOf('边') >= 0)
check('501×501 的 DP 表会说明原因', (graphTooBigReason(501, 501 * 501) ?? '').indexOf('节点') >= 0)

// ---------- 501×501 的 DP 表：每一帧的 HTML 都要小 ----------
{
  const src = [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    'string s1,s2;',
    'vector<vector<int>> memo(501, vector<int>(501, -1));',
    'int make_same(int i,int j){',
    '  if(i==0)return j;',
    '  if(j==0)return i;',
    '  if(memo[i][j]!=-1)return memo[i][j];',
    '  if(s1[i]==s2[j]) return memo[i][j] = make_same(i-1,j-1);',
    '  return memo[i][j] = min(make_same(i-1,j),make_same(i,j-1))+1;',
    '}',
    'int main(){',
    '  string w1,w2; cin >> w1 >> w2;',
    '  s1 = " "+w1; s2 = " "+w2;',
    '  memo[0][0] = 0;',
    '  make_same(w1.size(), w2.size());',
    '}',
    '',
  ].join('\n')
  let snaps: any[] = []
  try { snaps = [...run(parse(src), { input: 'abc abd' })] } catch (e) { check('DP 表程式可执行', false, (e as Error).message) }
  let worst = 0, worstStep = 0, sawAdj = false, sawGraphSvg = false, renderErr = ''
  for (const s of snaps) {
    let h = ''
    try { h = renderToStaticMarkup(createElement(VariablesPanel, { snapshot: s })) } catch (e) { renderErr = 'step ' + s.step + ': ' + (e as Error).message; break }
    if (h.length > worst) { worst = h.length; worstStep = s.step }
    if (h.indexOf('adj-toggle') >= 0) sawAdj = true
    if (h.indexOf('graph-svg') >= 0) sawGraphSvg = true
  }
  check('全部帧都可渲染', renderErr === '', renderErr)
  check('501×501 的卡片走表格模式（有切换按钮）', sawAdj)
  check('501×501 预设不画图（没有 graph-svg）', !sawGraphSvg)
  check('最大一帧的 HTML < 100KB（以前是 40MB）', worst < 100000, 'step ' + worstStep + ' = ' + worst + ' 字元')
}

// ---------- 上千个元素的 set：逐项列出的视图要截断并说明 ----------
{
  const src = 'int main(){ set<int> s; for (int i = 0; i < 1000; i++) s.insert(i); cout << s.size(); return 0; }'
  let last: any = null
  try { for (const s of run(parse(src), {})) last = s } catch (e) { check('大 set 可执行', false, (e as Error).message) }
  let h = ''
  try { h = renderToStaticMarkup(createElement(VariablesPanel, { snapshot: last })) } catch (e) { check('大 set 可渲染', false, (e as Error).message) }
  check('大 set 的 HTML < 300KB', h.length < 300000, h.length + ' 字元')
  check('大 set 有「还有 N 项未显示」的说明', h.indexOf('还有') >= 0 && h.indexOf('未显示') >= 0)
  // 每个元素会渲染成 .cell-wrap > .cell 两层，所以用 cell-wrap 数元素个数
  const shownItems = (h.match(/class="cell-wrap/g) || []).length
  check('大 set 只画 300 项（不会画 1000 项）', shownItems > 250 && shownItems <= 320, shownItems + ' 个元素')
}

console.log('==== render-limit-test: ' + pass + ' 通過, ' + fail + ' 失敗 ====')
if (fail > 0) process.exit(1)