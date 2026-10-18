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

// ---------- 1. 基本语义 ----------
eq('匹配到 case', 'int main(){ int x=2; switch(x){ case 1: cout<<"a"; break; case 2: cout<<"b"; break; } return 0; }', 'b')
eq('走 default', 'int main(){ int x=9; switch(x){ case 1: cout<<"a"; break; default: cout<<"d"; break; } return 0; }', 'd')
eq('没有 default 且无匹配 → 什么都不做', 'int main(){ int x=9; switch(x){ case 1: cout<<"a"; break; } cout<<"!"; return 0; }', '!')
eq('fallthrough（不写 break）', 'int main(){ int x=1; switch(x){ case 1: cout<<"1"; case 2: cout<<"2"; case 3: cout<<"3"; } return 0; }', '123')
eq('break 只跳出 switch', 'int main(){ int x=1; switch(x){ case 1: cout<<"1"; break; case 2: cout<<"2"; } cout<<"!"; return 0; }', '1!')
eq('case 标签叠起来（case 1: case 2:）', 'int main(){ int x=2; switch(x){ case 1: case 2: cout<<"A"; break; default: cout<<"B"; } return 0; }', 'A')
eq('char 标签', "int main(){ char c='b'; switch(c){ case 'a': cout<<1; break; case 'b': cout<<2; break; } return 0; }", '2')
eq('负数标签', 'int main(){ int x=-1; switch(x){ case -1: cout<<"neg"; break; default: cout<<"other"; } return 0; }', 'neg')
eq('default 写在前面也能匹配', 'int main(){ int x=5; switch(x){ default: cout<<"D"; break; case 5: cout<<"F"; break; } return 0; }', 'F')
eq('default 写在前面且 fallthrough', 'int main(){ int x=5; switch(x){ default: cout<<"D"; case 5: cout<<"F"; return 0; } return 0; }', 'F')

// ---------- 2. 与循环/函数的交互 ----------
eq('switch 在 for 里，break 只跳出 switch', 'int main(){ int s=0; for(int i=0;i<3;i++){ switch(i){ case 1: s+=10; break; default: s+=1; } } cout<<s; return 0; }', '12')
eq('switch 里的 continue 由外层循环接住', 'int main(){ int s=0; for(int i=0;i<4;i++){ switch(i%2){ case 0: continue; default: break; } s+=i; } cout<<s; return 0; }', '4')
eq('switch 在函数里 + return', 'int f(int x){ switch(x){ case 0: return 10; case 1: return 20; } return -1; } int main(){ cout<<f(0)<<" "<<f(1)<<" "<<f(7); return 0; }', '10 20 -1')
eq('嵌套 switch', 'int main(){ int a=1,b=2; switch(a){ case 1: switch(b){ case 2: cout<<"12"; break; } break; default: cout<<"x"; } return 0; }', '12')
eq('表达式作为 subject（只求值一次）', 'int main(){ int i=0; switch(i++){ case 0: cout<<i; break; default: cout<<"x"; } return 0; }', '1')

// ---------- 3. 快照 / 教学可视化 ----------
{
  const code = [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    'int main() {',
    '  int x = 2;',
    '  switch (x) {',
    '    case 1:',
    '      cout << "one";',
    '      break;',
    '    case 2:',
    '      cout << "two";',
    '      break;',
    '  }',
    '  return 0;',
    '}',
    '',
  ].join('\n')
  const snaps = [...run(parse(code), {})]
  const lines = snaps.map((s: any) => s.line)
  truthy('匹配的 case 行（第 9 行）有快照', lines.indexOf(9) >= 0, '实际行号序列 ' + lines.join(','))
  truthy('没匹配的 case 1 body（第 7 行）不执行', lines.indexOf(7) === -1, '实际行号序列 ' + lines.join(','))
  truthy('case 快照出现在变量声明之后', lines.indexOf(9) > lines.indexOf(4), '实际行号序列 ' + lines.join(','))
}

// ---------- 4. 语法错误要讲清楚 ----------
{
  let msg = ''
  try {
    for (const _ of run(parse('int main(){ switch(1){ cout<<1; } return 0; }'), {})) void _
  } catch (e) {
    msg = (e as Error).message
  }
  truthy('case 之外写语句 → 明确报错', msg.indexOf('case') >= 0, '实际: ' + msg)
}
{
  let msg = ''
  try {
    for (const _ of run(parse('int main(){ switch(1){ case 1 cout<<1; } return 0; }'), {})) void _
  } catch (e) {
    msg = (e as Error).message
  }
  truthy('case 标签少了冒号 → 明确报错', msg.length > 0, '实际: ' + msg)
}

console.log('==== switch-test: ' + pass + ' 通过, ' + fail + ' 失败 ====')
if (fail > 0) process.exit(1)
