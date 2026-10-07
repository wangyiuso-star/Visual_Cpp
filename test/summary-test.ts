import { check, report } from './_helpers'
import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
import { PRESETS } from '../src/presets'
// 抽出來之後可以直接從純函式模組匯入，不必 import 整個 React 元件
import { formatCellShort } from '../src/components/viz/format'

// 容器当值时的「一行摘要」：set 元素、map 的键/值、struct 成员、pair 成员、
// stack/queue/deque 的元素……这裡以前一律显示 '?'（使用者回报：map 的值是 vector 时画面上是 '?'）。
// 现在一律走 formatCellShort 的递归摘要，这个档案把每种容器都锁住。

// 跑一段程序，取回指定变数的 cell
function cellOf(pre: string[], body: string[], name: string): any {
  const src = ['#include <bits/stdc++.h>', 'using namespace std;'].concat(pre).concat(['int main() {']).concat(body.map((b) => '  ' + b)).concat(['  return 0;', '}', '']).join(String.fromCharCode(10))
  let last: any = null
  try {
    for (const s of run(parse(src), {})) last = s
  } catch (e) { return { __err: 'PARSE: ' + (e as Error).message } }
  if (last && last.error) return { __err: last.error }
  const v = last.vars.find((x: any) => x.name === name)
  if (!v) return { __err: '找不到变数 ' + name }
  return v.cell
}

function sum(name: string, pre: string[], body: string[], varname: string, want: string) {
  const c = cellOf(pre, body, varname)
  if (c && c.__err) { check(name, false, c.__err); return }
  let got = ''
  try { got = formatCellShort(c) } catch (e) { check(name, false, '抛错 ' + (e as Error).message); return }
  check(name, got === want, '期望 ' + want + ' 实际 ' + got)
}

// ---------- 各种容器当值 ----------
sum('vector', [], ['vector<int> v; v.push_back(1); v.push_back(2);'], 'v', '[1, 2]')
sum('数组', [], ['int a[3] = {1, 2, 3};'], 'a', '[1, 2, 3]')
sum('deque', [], ['deque<int> d; d.push_back(1); d.push_back(2);'], 'd', '[1, 2]')
sum('stack', [], ['stack<int> s; s.push(1); s.push(2);'], 's', '[1, 2]')
sum('queue', [], ['queue<int> q; q.push(1); q.push(2);'], 'q', '[1, 2]')
sum('set', [], ['set<int> s; s.insert(4); s.insert(2);'], 's', '{2, 4}')
sum('string', [], ['string s = \"hi\";'], 's', '\"hi\"')
sum('2D vector', [], ['vector<vector<int>> g; g.push_back({1, 2}); g.push_back({3});'], 'g', '[[1, 2], [3]]')

// ---------- 使用者回报的那一个：容器的值是容器 ----------
sum('map 的值是 vector', [], ['map<string, vector<int>> m; m[\"a\"].push_back(5); m[\"a\"].push_back(6);'], 'm', '{\"a\":[5, 6]}')
sum('map 的值是 map', [], ['map<int, map<int,int>> m; m[1][2] = 3;'], 'm', '{1:{2:3}}')
sum('unordered_map 的值是 vector', [], ['unordered_map<string, vector<int>> m; m[\"k\"].push_back(7);'], 'm', '{\"k\":[7]}')
sum('struct 成员是 vector', ['struct P { int x; vector<int> v; };'], ['P p; p.x = 1; p.v.push_back(3);'], 'p', '{x:1, v:[3]}')
sum('pair 的成员是 vector', [], ['pair<int, vector<int>> p; p.first = 1; p.second.push_back(9);'], 'p', '(1, [9])')
sum('stack 的元素是 vector', [], ['stack<vector<int>> s; vector<int> v; v.push_back(1); s.push(v);'], 's', '[[1]]')
sum('set 的元素是 string', [], ['set<string> s; s.insert(\"b\"); s.insert(\"a\");'], 's', '{\"a\", \"b\"}')
sum('tree', [], ['tree<int> t(3); t[1] = 1; t[2] = 2; t[3] = 3;'], 't', '[1, 2, 3]')
sum('bst', [], ['bst<int> b; b.insert(4); b.insert(2);'], 'b', '[2, 4]')

// ---------- 摘要本身的规则（直接喂 cell，不经过程序）----------
const INT = { kind: 'scalar', name: 'int' } as any
const sc = (v: any): any => ({ kind: 'scalar', type: 'int', value: v })
const vec = (cells: any[]): any => ({ kind: 'vector', elemType: INT, cells })
const arr10 = vec([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(sc))
check('超过 8 个元素会省略', formatCellShort(arr10) === '[1, 2, 3, 4, 5, 6, 7, 8, …]', formatCellShort(arr10))
const deep = vec([vec([vec([vec([sc(1)])])])])
check('嵌套太深会省略', formatCellShort(deep) === '[[[…]]]', formatCellShort(deep))
const refCell: any = { kind: 'ref', target: { name: 'x', mem: null, path: [] } }
check('引用显示成 &名字', formatCellShort(refCell) === '&x', formatCellShort(refCell))
check('空容器是空括号', formatCellShort(vec([])) === '[]', formatCellShort(vec([])))
const pairOf = (a: any, b: any): any => ({ kind: 'pair', first: a, second: b })
check('pair 里放容器', formatCellShort(pairOf(sc(1), vec([sc(2)]))) === '(1, [2])', formatCellShort(pairOf(sc(1), vec([sc(2)]))))

// ---------- 地毯式：所有 preset 的每一格都不能是 '?' ----------
{
  let bad = ''
  let n = 0
  for (const preset of PRESETS) {
    let last: any = null
    try {
      for (const s of run(parse(preset.code), { input: '3 2 1' })) {
        for (const v of s.vars) {
          n++
          let t = ''
          try { t = formatCellShort(v.cell) } catch (e) { bad = preset.name + '/' + v.name + ' 抛错 ' + (e as Error).message; break }
          // 未初始化的纯量本来就显示 '?'（formatScalar 的约定），那是合法的；
          // 这里抓的是「容器被整格画成 '?'」——使用者回报的那个 bug。
          if (v.cell.kind !== 'scalar' && t === '?') { bad = preset.name + '/' + v.name + ' = ' + t; break }
        }
        if (bad) break
        last = s
      }
    } catch (e) { bad = preset.name + ' 执行抛错 ' + (e as Error).message }
    if (bad) break
  }
  check('preset 里 ' + n + ' 格容器都不会被画成 ?', bad === '', bad)
}

report('summary-test')