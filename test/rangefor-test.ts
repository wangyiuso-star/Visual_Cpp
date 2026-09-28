import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'

let pass = 0
let fail = 0
function run1(code: string) {
  const snaps: any[] = []
  try { for (const s of run(parse(code), {})) snaps.push(s) } catch (e) { return { err: 'PARSE: ' + (e as Error).message, out: '', snaps } }
  const last = snaps[snaps.length - 1]
  return { err: String((last && last.error) ?? ''), out: String((last && last.output) ?? ''), snaps }
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
  console.log('FAIL ' + name + ' | 期望错误含 "' + wantPart + '"，实际 ' + (r.err ? '"' + r.err + '"' : '没报错，输出 "' + r.out + '"'))
}
function truthy(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; return }
  fail++
  console.log('FAIL ' + name + (detail ? ' | ' + detail : ''))
}

// ---------- 1. 基本：array / vector / 显式类型 / auto ----------
eq('array + auto', 'int main(){ int a[4]={1,2,3,4}; int s=0; for (auto x : a) s+=x; cout<<s; return 0; }', '10')
eq('array + 显式类型', 'int main(){ int a[4]={1,2,3,4}; int s=0; for (int x : a) s+=x; cout<<s; return 0; }', '10')
eq('vector + auto', 'int main(){ vector<int> v; v.push_back(3); v.push_back(4); for (auto x : v) cout<<x; return 0; }', '34')
eq('deque', 'int main(){ deque<int> d; d.push_back(1); d.push_front(0); for (auto x : d) cout<<x; return 0; }', '01')

// ---------- 2. 共享 vs 拷贝（教学重点） ----------
eq('auto& 写回原容器（共享）', 'int main(){ vector<int> v; v.push_back(3); v.push_back(4); for (auto& x : v) x = x * 2; for (int i=0;i<v.size();i++) cout<<v[i]; return 0; }', '68')
eq('auto 只是拷贝（不写回）', 'int main(){ vector<int> v; v.push_back(3); v.push_back(4); for (auto x : v) x = 99; for (int i=0;i<v.size();i++) cout<<v[i]; return 0; }', '34')
eq('auto& 对 array', 'int main(){ int a[3]={1,2,3}; for (auto& x : a) x = x + 10; cout<<a[0]<<a[1]<<a[2]; return 0; }', '111213')

// ---------- 3. string（Unit 6 逐字元走访） ----------
eq('string + char', 'int main(){ string s="abc"; for (char c : s) cout<<c; return 0; }', 'abc')
eq('string + auto', 'int main(){ string s="abc"; for (auto c : s) cout<<c; return 0; }', 'abc')
eq('string 累加', 'int main(){ string s="hello"; string t=""; for (auto c : s) t = t + c; cout<<t; return 0; }', 'hello')

// ---------- 4. set / map / tree / bst ----------
eq('set（升序去重）', 'int main(){ set<int> st; st.insert(3); st.insert(1); st.insert(2); for (auto x : st) cout<<x; return 0; }', '123')
eq('map（pair）', 'int main(){ map<string,int> m; m["a"]=1; m["b"]=2; for (auto p : m) cout<<p.first<<p.second<<" "; return 0; }', 'a1 b2 ')
eq('tree（1 基层级顺序）', 'int main(){ tree<int> t(3); t[1]=5; t[2]=6; t[3]=7; for (auto x : t) cout<<x; return 0; }', '567')
eq('bst（中序＝升序）', 'int main(){ bst<int> t; t.insert(5); t.insert(3); t.insert(7); t.insert(1); for (auto x : t) cout<<x; return 0; }', '1357')

// ---------- 5. break / continue / 巢状 / 下标容器 ----------
eq('break', 'int main(){ int a[4]={1,2,3,4}; for (auto x : a) { if (x==3) break; cout<<x; } return 0; }', '12')
eq('continue', 'int main(){ int a[4]={1,2,3,4}; for (auto x : a) { if (x==2) continue; cout<<x; } return 0; }', '134')
eq('巢状', 'int main(){ int a[2]={1,2}; for (auto x : a) for (auto y : a) cout<<x+y; return 0; }', '2334')
eq('容器是下标式（g[u]）', 'int main(){ vector<vector<int>> g(2, vector<int>(1,0)); g[0][0]=7; for (auto x : g[0]) cout<<x; return 0; }', '7')

// ---------- 6. 显式类型会转型 ----------
eq('for (int x : vector<double>) 会转', 'int main(){ vector<double> d; d.push_back(1.9); d.push_back(2.1); for (int x : d) cout<<x; return 0; }', '12')

// ---------- 7. 快照：每个元素一步 ----------
{
  const r = run1('#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n  int a[3] = {1,2,3};\n  for (auto x : a) {\n    cout << x;\n  }\n  return 0;\n}\n')
  const atLoop = r.snaps.filter((s: any) => s.line === 5)
  truthy('每个元素产生一个快照（line 5 共 3 个）', atLoop.length === 3, '实际 ' + atLoop.length)
  const xs = atLoop.map((s: any) => { const v = s.vars.find((y: any) => y.name === 'x'); return v ? v.cell.value : '?' })
  truthy('快照里 x 依序为 1,2,3', xs.join(',') === '1,2,3', xs.join(','))
}

// ---------- 8. 错误讯息 ----------
err('stack 不能迭代', 'int main(){ stack<int> st; st.push(1); for (auto x : st) cout<<x; return 0; }', 'range-for 不支持迭代 stack')
err('queue 不能迭代', 'int main(){ queue<int> q; q.push(1); for (auto x : q) cout<<x; return 0; }', 'range-for 不支持迭代 queue')
err('priority_queue 不能迭代', 'int main(){ priority_queue<int> pq; pq.push(1); for (auto x : pq) cout<<x; return 0; }', 'range-for 不支持迭代 pqueue')
err('string 不能 auto&', 'int main(){ string s="abc"; for (auto& c : s) cout<<c; return 0; }', '不能用 auto&')
err('set 不能 auto&', 'int main(){ set<int> st; st.insert(1); for (auto& x : st) cout<<x; return 0; }', '不能用 auto&')
err('容器必须是变数', 'int main(){ for (auto x : 5) cout<<x; return 0; }', 'range-for 的容器必须是变量')

// ---------- 9. 回归：经典 for 不受影响 ----------
eq('回归：for (int i=0;...)', 'int main(){ for (int i=0;i<3;i++) cout<<i; return 0; }', '012')
eq('回归：for (;;) + break', 'int main(){ int i=0; for (;;) { if (i>=3) break; cout<<i; i++; } return 0; }', '012')
eq('回归：for 空 init/cond', 'int main(){ int i=0; for (;i<3;) { cout<<i; i++; } return 0; }', '012')

console.log('==== rangefor-test: ' + pass + ' 通過, ' + fail + ' 失敗 ====')
if (fail > 0) process.exit(1)
