import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'

let pass = 0
let fail = 0
function run1(code: string, input = '') {
  const snaps: any[] = []
  try { for (const s of run(parse(code), { input })) snaps.push(s) } catch (e) { return { err: 'PARSE: ' + (e as Error).message, out: '' } }
  const last = snaps[snaps.length - 1]
  return { err: String((last && last.error) ?? ''), out: String((last && last.output) ?? '') }
}
function eq(name: string, code: string, want: string, input = '') {
  const r = run1(code, input)
  if (r.err) { fail++; console.log('FAIL ' + name + ' | 报错 ' + r.err); return }
  if (r.out === want) { pass++; return }
  fail++
  console.log('FAIL ' + name + ' | 期望 "' + want + '" 实际 "' + r.out + '"')
}
function err(name: string, code: string, wantPart: string) {
  const r = run1(code)
  if (r.err && r.err.indexOf(wantPart) >= 0) { pass++; return }
  fail++
  console.log('FAIL ' + name + ' | 期望错误含 "' + wantPart + '"，实际 ' + (r.err ? '"' + r.err + '"' : '没报错，输出 "' + r.out + '"'))
}
function W(inner: string) { return 'int main(){ ' + inner + ' return 0; }' }

// ---------- stoi 基本 ----------
eq('stoi 正整数', W('cout<<stoi("123");'), '123')
eq('stoi 负号', W('cout<<stoi("-45");'), '-45')
eq('stoi 正号', W('cout<<stoi("+7");'), '7')
eq('stoi 前导空白', W('cout<<stoi("  42");'), '42')
eq('stoi 前导零', W('cout<<stoi("007");'), '7')
eq('stoi 零', W('cout<<stoi("0");'), '0')

// ---------- C++ 前缀语义：遇到非数字就停 ----------
eq('stoi 遇到非数字停（12abc→12）', W('cout<<stoi("12abc");'), '12')
eq('stoi 小数点也停（3.9→3）', W('cout<<stoi("3.9");'), '3')
// C++ 的 std::stoi("-x") 也是丢 invalid_argument（符号后没有数字）
err('stoi 负号后接非数字 → 报错', W('cout<<stoi("-x");'), '没有可解析的数字')

// ---------- 进制（C++ 是 stoi(s, pos, base)，第 2 参忽略） ----------
eq('stoi base 2', W('cout<<stoi("101", 0, 2);'), '5')
eq('stoi base 16', W('cout<<stoi("ff", 0, 16);'), '255')
eq('stoi base 16 负数', W('cout<<stoi("-ff", 0, 16);'), '-255')
eq('stoi base 8', W('cout<<stoi("17", 0, 8);'), '15')

// ---------- 错误 ----------
err('stoi 没有数字', W('cout<<stoi("abc");'), '没有可解析的数字')
err('stoi 空字串', W('cout<<stoi("");'), '没有可解析的数字')
err('stoi 进制越界', W('cout<<stoi("1", 0, 40);'), '进制必须在 2..36')

// ---------- stoll / stod / stof ----------
eq('stoll 大数', W('cout<<stoll("123456789012");'), '123456789012')
eq('stod 小数', W('cout<<stod("3.14");'), '3.14')
eq('stod 指数', W('cout<<stod("1e3");'), '1000')
eq('stod 前辍（2.5xyz→2.5）', W('cout<<stod("2.5xyz");'), '2.5')
eq('stof', W('cout<<stof("1.5");'), '1.5')
err('stod 没有数字', W('cout<<stod("x1");'), '没有可解析的数字')

// ---------- to_string ----------
eq('to_string(int)', W('cout<<to_string(123);'), '123')
eq('to_string 负数', W('cout<<to_string(-5);'), '-5')
eq('to_string double', W('cout<<to_string(1.5);'), '1.5')
eq('to_string 字串拼接', W('int n=42; cout<<to_string(n)+"!";'), '42!')

// ---------- 实用组合 ----------
eq('cin 读字串再 stoi（最常见的用法）', W('string s; cin>>s; int n=stoi(s); cout<<n+1;'), '124', '123')
eq('to_string 反转整数（回文题常用）', W('int n=1230; string s=to_string(n); string t=""; for(int i=s.size()-1;i>=0;i--) t=t+s[i]; cout<<t;'), '0321')
eq('stoi + to_string 混合', W('string s="99"; int x=stoi(s); string t=to_string(x*2); cout<<t;'), '198')

// ---------- 与 range-for 组合（跨功能） ----------
eq('range-for 逐字元 + stoi 求数位和',
  W('string s="1234"; int sum=0; for (char c : s) sum = sum + stoi(to_string(c)); cout<<sum;'), '10')

// ---------- 回归：原有内建不受影响 ----------
eq('回归 abs', W('cout<<abs(-5);'), '5')
eq('回归 to_string 与 cout 对 bool 的处理一致', W('bool b=true; cout<<to_string(b)<<" "<<b;'), 'true true')

console.log('==== stoi-test: ' + pass + ' 通過, ' + fail + ' 失敗 ====')
if (fail > 0) process.exit(1)
