import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'

let pass = 0
let fail = 0

function run1(code: string): { out: string; err: string; snaps: any[] } {
  const snaps: any[] = []
  try {
    for (const s of run(parse(code), {})) snaps.push(s)
  } catch (e) {
    return { out: '', err: 'PARSE: ' + (e as Error).message, snaps }
  }
  const last = snaps[snaps.length - 1]
  return { out: String((last && last.output) ?? ''), err: String((last && last.error) ?? ''), snaps }
}

function eq(name: string, code: string, want: string) {
  const r = run1(code)
  if (r.err) { fail++; console.log('FAIL ' + name + ' | 报错 ' + r.err); return }
  if (r.out === want) { pass++; return }
  fail++
  console.log('FAIL ' + name + ' | 期望 "' + want + '" 实际 "' + r.out + '"')
}

function err(name: string, code: string, wantPart: string) {
  const r = run1(code)
  if (r.err && r.err.indexOf(wantPart) >= 0) { pass++; return }
  fail++
  console.log('FAIL ' + name + ' | 期望错误含 "' + wantPart + '"，实际 ' + (r.err ? '"' + r.err + '"' : '没有报错，输出 "' + r.out + '"'))
}

function truthy(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; return }
  fail++
  console.log('FAIL ' + name + (detail ? ' | ' + detail : ''))
}

const DESC = 'bool cmp(int x, int y){ return x > y; }\n'
const ASC = 'bool cmp(int x, int y){ return x < y; }\n'

// ---------- 1. 基本：cmp 真的被采纳（不再是静默忽略） ----------
eq('sort(a, n, cmp) 降序', DESC + 'int main(){ int a[5]={1,5,3,2,4}; sort(a, 5, cmp); for(int i=0;i<5;i++) cout<<a[i]; return 0; }', '54321')
eq('sort(a, cmp) 二参形式', DESC + 'int main(){ int a[3]={1,3,2}; sort(a, cmp); for(int i=0;i<3;i++) cout<<a[i]; return 0; }', '321')
eq('升序 cmp', ASC + 'int main(){ int a[3]={3,1,2}; sort(a, 3, cmp); for(int i=0;i<3;i++) cout<<a[i]; return 0; }', '123')
eq('只排前 n 个', DESC + 'int main(){ int a[4]={1,3,2,9}; sort(a, 3, cmp); for(int i=0;i<4;i++) cout<<a[i]; return 0; }', '3219')
eq('cmp 可以读全域数组（C711 式「按关联键排序索引」）',
  'int key[4]={30,10,40,20};\nbool byKey(int i, int j){ return key[i] < key[j]; }\nint main(){ int idx[4]={0,1,2,3}; sort(idx, 4, byKey); for(int i=0;i<4;i++) cout<<idx[i]; return 0; }', '1302')

// ---------- 2. 稳定性（建议书明确要求稳定排序） ----------
// 按 key 排序，key 相同的两笔必须保持输入的先后（id 0 在 2 前、1 在 3 前）
const stableCode = [
  'struct P { int key; int id; };',
  'bool cmp(P x, P y){ return x.key < y.key; }',
  'int main(){',
  '  P a[4];',
  '  a[0].key=2; a[0].id=0;',
  '  a[1].key=1; a[1].id=1;',
  '  a[2].key=2; a[2].id=2;',
  '  a[3].key=1; a[3].id=3;',
  '  sort(a, 4, cmp);',
  '  for(int i=0;i<4;i++) cout<<a[i].key<<a[i].id<<" ";',
  '  return 0;',
  '}',
  '',
].join('\n')
eq('稳定排序（struct 元素，相等键保持原序）', stableCode, '11 13 20 22 ')

// ---------- 3. 比较次数（教学点） ----------
{
  const r = run1(DESC + 'int main(){ int a[8]={8,7,6,5,4,3,2,1}; sort(a, 8, cmp); cout<<a[0]; return 0; }')
  const infos = r.snaps.map((s: any) => s.sortInfo).filter(Boolean)
  truthy('快照带 sortInfo', infos.length > 0, '带 sortInfo 的快照数 = ' + infos.length)
  const maxCmp = infos.reduce((m: number, i: any) => Math.max(m, i.comparisons), 0)
  console.log('  n=8 时比较次数 = ' + maxCmp + '（归并排序上界 8*log2(8) = 24）')
  truthy('比较次数 > 0', maxCmp > 0)
  truthy('比较次数在上界内（O(n log n)）', maxCmp <= 24, '实际 ' + maxCmp)
  truthy('sortInfo.n = 8', infos[0].n === 8)
  truthy('sortInfo.name = a', infos[0].name === 'a')
  // 快照隔离：历史快照的次数不应被后续比较改写
  const first = infos[0].comparisons
  const lastInfo = infos[infos.length - 1].comparisons
  truthy('历史快照次数不被后续改写（快照隔离）', infos[0].comparisons === first && lastInfo >= first,
    'first=' + first + ' last=' + lastInfo)
}

// ---------- 4. 保护措施 ----------
{
  const r = run1('bool bad(int a, int b){ return true; }\nint main(){ int a[3]={1,3,2}; sort(a, 3, bad); cout<<a[0]; return 0; }')
  const infos = r.snaps.map((s: any) => s.sortInfo).filter(Boolean)
  truthy('cmp 违反严格弱序会被检出', infos.some((i: any) => i.warned), 'warned 从未为 true')
}
{
  const r = run1(DESC + 'int main(){ int a[8]={8,7,6,5,4,3,2,1}; sort(a, 8, cmp); cout<<a[0]; return 0; }')
  const infos = r.snaps.map((s: any) => s.sortInfo).filter(Boolean)
  truthy('正常 cmp 不误报弱序警告', infos.every((i: any) => !i.warned))
}
{
  // 步数保护：100 个元素用 cmp 排序仍应在 20000 步上限内
  const r = run1(DESC + 'int main(){ int a[100]; for(int i=0;i<100;i++) a[i]=100-i; sort(a, 100, cmp); cout<<a[0]<<a[99]; return 0; }')
  truthy('n=100 用 cmp 排序不超步数上限', r.err === '', r.err)
  truthy('n=100 cmp 排序结果正确', r.out === '1001', '实际 "' + r.out + '"')
}

// ---------- 5. 无 cmp 的旧用法不受影响 ----------
eq('回归：sort(a, n) 升序', 'int main(){ int a[5]={5,4,3,2,1}; sort(a, 5); cout<<a[0]; return 0; }', '1')
eq('回归：sort(a)', 'int main(){ int a[3]={3,1,2}; sort(a); cout<<a[0]; return 0; }', '1')
eq('回归：reverse(a, n)', 'int main(){ int a[3]={1,2,3}; reverse(a,3); cout<<a[0]; return 0; }', '3')
err('第三个参数不是函数名 → 明确报错', 'int main(){ int a[3]={3,1,2}; sort(a, 3, 5); return 0; }', '第三个参数应是自定义比较函数')

// ---------- 6. 数组形参：非数组实参的清楚错误（建议书要求） ----------
err('int a[] 收到纯量', 'void f(int a[]){ a[0]=1; } int main(){ int x=5; f(x); return 0; }', 'int a[]')
err('int a[] 收到 vector', 'void f(int a[]){ a[0]=1; } int main(){ vector<int> v; v.push_back(1); f(v); return 0; }', 'int a[]')
err('int a[] 收到表达式', 'void f(int a[]){ a[0]=1; } int main(){ f(1+2); return 0; }', 'int a[]')
err('int a[] 收到不存在的名字', 'void f(int a[]){ a[0]=1; } int main(){ f(zzz); return 0; }', '未定义的变量')

console.log('==== sortcmp-test: ' + pass + ' 通过, ' + fail + ' 失败 ====')
if (fail > 0) process.exit(1)
