import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'

let pass = 0
let fail = 0
function run1(code: string, input = '') {
  try {
    let last: any = null
    for (const s of run(parse(code), { input })) last = s
    return { err: String((last && last.error) ?? ''), out: String((last && last.output) ?? '') }
  } catch (e) { return { err: 'PARSE: ' + (e as Error).message, out: '' } }
}
function eq(name: string, code: string, want: string, input = '') {
  const r = run1(code, input)
  if (r.err) { fail++; console.log('FAIL ' + name + ' | 报错 ' + r.err); return }
  if (r.out === want) { pass++; return }
  fail++
  console.log('FAIL ' + name + ' | 期望 "' + want + '" 实际 "' + r.out + '"')
}
function err(name: string, code: string, wantPart: string, input = '') {
  const r = run1(code, input)
  if (r.err && r.err.indexOf(wantPart) >= 0) { pass++; return }
  fail++
  console.log('FAIL ' + name + ' | 期望错误含 "' + wantPart + '"，实际 ' + (r.err ? '"' + r.err + '"' : '没报错，输出 "' + r.out + '"'))
}

// ---------- cin 的基本语义：按空白切 token，每个 >> 吃一个 ----------
eq('链式读入', 'int main(){ int a,b; cin>>a>>b; cout<<a+b; return 0; }', '5', '2 3')
eq('多行输入', 'int main(){ int n; cin>>n; int a[100]; for(int i=0;i<n;i++) cin>>a[i]; cout<<a[0]+a[n-1]; return 0; }', '40', '3\n10 20 30')
eq('数字 + 字串', 'int main(){ int n; string s; cin>>n>>s; cout<<n<<s; return 0; }', '3abc', '3 abc')
eq('负数 / 小数', 'int main(){ int a; double b; cin>>a>>b; cout<<a<<" "<<b; return 0; }', '-2 1.5', '-2 1.5')

// ---------- 没有空白的运算式 = 1 个 token ----------
eq('无空白 → 整串进 string', 'int main(){ string s; cin>>s; cout<<s; return 0; }', '2*3-4*5', '2*3-4*5')
eq('用 string 读运算子（变通写法）', 'int main(){ int a,b; string op; cin>>a>>op>>b; cout<<a<<op<<b; return 0; }', '2*3', '2 * 3')

// ---------- 输入不足：新訊息要讲清楚差几个 ----------
err('要读 2 个但只有 1 个 → 指出第 2 个',
  'int main(){ int a,b; cin>>a>>b; return 0; }', '要读第 2 个值', '7')
err('上面那题也要说「只有 1 个」',
  'int main(){ int a,b; cin>>a>>b; return 0; }', '只提供了 1 个', '7')
err('要读 3 个但只有 2 个 → 指出第 3 个',
  'int main(){ int a,b,c; cin>>a>>b>>c; return 0; }', '要读第 3 个值', '1 2')
err('完全没有输入 → 指出第 1 个',
  'int main(){ int a; cin>>a; return 0; }', '要读第 1 个值', '')

// ---------- 已知限制（照实断言，方便教材引用） ----------
err('token 不是数字却给 int → 不能转为数字',
  'int main(){ int a; cin>>a; return 0; }', '不能转为数字', '2*3')
eq('cin >> char 讀單一字元', 'int main(){ char c; cin>>c; cout<<c; return 0; }', 'a', 'a')
err('cin 目标不能是容器',
  'int main(){ int a[3]; cin>>a; return 0; }', 'cin 目标应为标量变量', '1')
eq('cin 可以读到数组元素', 'int main(){ int a[3]; cin>>a[1]; cout<<a[1]; return 0; }', '9', '9')

console.log('==== cin-test: ' + pass + ' 通過, ' + fail + ' 失敗 ====')
if (fail > 0) process.exit(1)
