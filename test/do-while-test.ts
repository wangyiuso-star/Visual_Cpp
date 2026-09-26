import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'

let pass = 0
let fail = 0

function eq(name: string, code: string, want: string) {
  let last: any = null
  try {
    for (const s of run(parse(code), {})) last = s
    if (last && last.error) throw new Error(String(last.error))
    const got = String((last && last.output) ?? '')
    if (got === want) { pass++; return }
    fail++
    console.log('FAIL ' + name + ' | 期望 "' + want + '" 实际 "' + got + '"')
  } catch (e) {
    fail++
    console.log('FAIL ' + name + ' | 报错 ' + (e as Error).message)
  }
}

function truthy(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; return }
  fail++
  console.log('FAIL ' + name + (detail ? ' | ' + detail : ''))
}

// ---------- 1. 执行结果 ----------
eq('基本', 'int main(){ int i=0; do { i++; } while(i<3); cout<<i; return 0; }', '3')
eq('body 至少执行一次（条件一开始就为假）', 'int main(){ int i=9; do { i++; } while(i<3); cout<<i; return 0; }', '10')
eq('无花括号 body', 'int main(){ int i=0; do i++; while(i<3); cout<<i; return 0; }', '3')
eq('continue 仍会判断条件', 'int main(){ int i=0,s=0; do { i++; if(i==2) continue; s+=i; } while(i<3); cout<<s; return 0; }', '4')
eq('break', 'int main(){ int i=0; do { i++; if(i==2) break; } while(i<3); cout<<i; return 0; }', '2')
eq('嵌套 do-while', 'int main(){ int i=0,s=0; do { int j=0; do { s++; j++; } while(j<2); i++; } while(i<2); cout<<s; return 0; }', '4')
eq('数组累加（典型用法）', 'int main(){ int a[3]={1,2,3}; int s=0,i=0; do { s+=a[i]; i++; } while(i<3); cout<<s; return 0; }', '6')

// ---------- 2. 关键规格：body 跑完、检查条件之前要有快照 ----------
{
  const code = [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    'int main() {',
    '  int i = 0;',
    '  do {',
    '    i++;',
    '  } while (i < 3);',
    '  cout << i;',
    '  return 0;',
    '}',
    '',
  ].join('\n')
  const snaps = [...run(parse(code), {})]
  const val = (s: any) => {
    const v = s.vars.find((x: any) => x.name === 'i')
    return v && v.cell.kind === 'scalar' ? String(v.cell.value) : '?'
  }
  console.log('--- do-while 快照序列（line=6 是 i++，line=7 是 while）---')
  for (const s of snaps) {
    const cond = s.condition ? (s.condition.result ? '条件=真' : '条件=假') : '（尚未检查）'
    console.log('  step ' + (s.step + 1) + '  line ' + s.line + '  ' + cond + '  i=' + val(s))
  }
  // (a) 存在「line=7 且没有判断横幅」的快照 —— 即检查之前的那一刻
  const preCheck = snaps.filter((s: any) => s.line === 7 && !s.condition)
  truthy('存在「检查条件之前」的快照', preCheck.length > 0, 'line=7 且无横幅的快照数 = ' + preCheck.length)
  // (b) 每个这样的快照紧跟着同行的「有横幅」快照
  const withCheck = snaps.filter((s: any) => s.line === 7 && !!s.condition)
  truthy('检查前快照与判断快照成对', preCheck.length === withCheck.length && preCheck.length === 3,
    '检查前=' + preCheck.length + ' 判断=' + withCheck.length + '（i=0→1,1→2,2→3 共 3 次）')
  // (c) 检查前快照里 body 的效果已经生效（i=1/2/3，而不是初始的 0）
  const preVals = preCheck.map((s: any) => val(s))
  truthy('检查前快照已是 body 之后的状态', preVals.join(',') === '1,2,3', '实际 i = ' + preVals.join(','))
  // (d) body 先执行：第一个 line=6 的快照早于第一个 line=7 的快照
  const firstBody = snaps.findIndex((s: any) => s.line === 6)
  const firstWhile = snaps.findIndex((s: any) => s.line === 7)
  truthy('body 先于条件执行', firstBody >= 0 && firstWhile > firstBody, 'line6@' + firstBody + ' line7@' + firstWhile)
  // (e) 检查前快照紧接在「有横幅」快照之前（顺序不能反）
  const ok = snaps.every((s: any, idx: number) => {
    if (s.line !== 7 || s.condition) return true
    const nx = snaps[idx + 1]
    return !!nx && nx.line === 7 && !!nx.condition
  })
  truthy('顺序为「先快照(无横幅) → 再判断(有横幅)」', ok)
  // (f) 条件横幅的 kind 是 while（与 showCond.while 开关一致）
  truthy('横幅 kind = while', withCheck.every((s: any) => s.condition.kind === 'while'))
}

// ---------- 3. 死循环保护 ----------
{
  // 注意：run 不会 throw 运行期错误，而是把 error 放进最后一个快照（interpreter.ts:1631-1644）
  let last: any = null
  let thrown = ''
  try {
    for (const s of run(parse('int main(){ do { } while(true); return 0; }'), {})) last = s
  } catch (e) {
    thrown = (e as Error).message
  }
  const msg = thrown || String((last && last.error) || '')
  truthy('空 body 死循环会被步数上限拦截', msg.indexOf('步数超过') >= 0, '实际: ' + msg)
}

console.log('==== do-while-test: ' + pass + ' 通过, ' + fail + ' 失败 ====')
if (fail > 0) process.exit(1)
