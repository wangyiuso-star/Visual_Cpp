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

// ---------- 函数回传容器 ----------
eq('回传 vector', 'vector<int> f(){ vector<int> v; v.push_back(7); return v; } int main(){ vector<int> r=f(); cout<<r[0]<<r.size(); return 0; }', '71')
eq('回传 vector（带参数）', 'vector<int> f(int n){ vector<int> v; v.push_back(n*2); return v; } int main(){ cout<<f(5)[0]; return 0; }', '10')
eq('递归回传 vector', 'vector<int> g(int n){ vector<int> v; if(n==0){ v.push_back(0); return v; } vector<int> p=g(n-1); v.push_back(p[0]+1); return v; } int main(){ cout<<g(3)[0]; return 0; }', '3')
eq('回传 string / map（非 vector 也适用）', 'map<string,int> f(){ map<string,int> m; m["a"]=3; return m; } int main(){ map<string,int> r=f(); cout<<r["a"]; return 0; }', '3')

// ---------- 容器的值语义 ----------
eq('容器按值当参数', 'int f(vector<int> v){ return v.size(); } int main(){ vector<int> v; v.push_back(1); v.push_back(2); cout<<f(v); return 0; }', '2')
eq('g[u] 整行当参数', 'int f(vector<int> v){ return v[1]; } int main(){ vector<vector<int>> g(2, vector<int>(2,0)); g[1][1]=8; cout<<f(g[1]); return 0; }', '8')
eq('容器拷贝隔离（写自己不影响别人）', 'int main(){ vector<int> v; v.push_back(1); vector<int> w=v; w.push_back(2); cout<<v.size()<<w.size(); return 0; }', '12')

// ---------- map 的值可以是容器 ----------
eq('map 值=vector：写入+读取', 'int main(){ unordered_map<string,vector<int>> m; vector<int> v; v.push_back(5); v.push_back(6); m["a"]=v; cout<<m["a"][0]<<m["a"][1]; return 0; }', '56')
eq('map 值=vector：直接赋呼叫结果', 'vector<int> f(){ vector<int> v; v.push_back(9); return v; } int main(){ unordered_map<string,vector<int>> m; m["k"]=f(); cout<<m["k"][0]; return 0; }', '9')
eq('m[不存在的键].push_back（照 C++ operator[] 会插入）', 'int main(){ unordered_map<string,vector<int>> m; m["a"].push_back(3); cout<<m["a"].size()<<m["a"][0]; return 0; }', '13')
eq('回归：map<string,string>', 'int main(){ map<string,string> m; m["a"]="x"; cout<<m["a"]; return 0; }', 'x')

// ---------- 守衛：绝不能静默变 0 ----------
err('int x = v', 'int main(){ vector<int> v; v.push_back(1); int x=v; cout<<x; return 0; }', '不能把 vector 容器当作标量使用')
err('string s = v', 'int main(){ vector<int> v; v.push_back(1); string s=v; cout<<s; return 0; }', '当作标量使用')
err('a[0] = v', 'int main(){ int a[2]; vector<int> v; v.push_back(1); a[0]=v; cout<<a[0]; return 0; }', '当作标量使用')
err('cout << v', 'int main(){ vector<int> v; v.push_back(1); cout<<v; return 0; }', '当作标量使用')
err('s += v', 'int main(){ string s="a"; vector<int> v; v.push_back(1); s+=v; cout<<s; return 0; }', '当作标量使用')
err('v + 1', 'int main(){ vector<int> v; v.push_back(1); cout<<(v+1); return 0; }', '当作标量使用')
err('v < w（容器比较暂不支援）', 'int main(){ vector<int> v; vector<int> w; cout<<(v<w); return 0; }', '当作标量使用')
err('回传标量却赋给 vector', 'int f(){ return 1; } int main(){ vector<int> v = f(); return 0; }', '不能用标量初始化 vector')
err('类型不符的初始化', 'int main(){ set<int> s; vector<int> v; set<int> w = v; return 0; }', '初始化类型不匹配')

// ---------- 回归：既有功能 ----------
eq('回归：struct 回传', 'struct P{int x;}; P mk(){ P p; p.x=5; return p; } int main(){ P q=mk(); cout<<q.x; return 0; }', '5')
eq('回归：pair = make_pair', 'int main(){ pair<int,int> p=make_pair(1,2); cout<<p.first; return 0; }', '1')
eq('回归：sort', 'int main(){ vector<int> v; v.push_back(2); v.push_back(1); sort(v); cout<<v[0]; return 0; }', '1')
eq('回归：数组初始化列表', 'int main(){ int a[3]={1,2,3}; cout<<a[2]; return 0; }', '3')
eq('回归：struct 存容器', 'struct P{int x;}; int main(){ vector<P> v; P p; p.x=7; v.push_back(p); cout<<v[0].x; return 0; }', '7')

// ---------- ★ 使用者回报的原题（LeetCode 241 风格）----------
{
  const prog = "#include <bits/stdc++.h>\nusing namespace std;\nunordered_map<string,vector<int>> memo;\nvector<int> diffWaysToCompute(string expression){\n  if(memo.count(expression))return memo[expression];\n  vector<int> res;\n  for(int i=0;i<expression.size();i++){\n    char c = expression[i];\n    if(c=='+'||c=='-'||c=='*'){\n      vector<int> left = diffWaysToCompute(expression.substr(0,i));\n      vector<int> right = diffWaysToCompute(expression.substr(i+1));\n      for(int l:left){\n        for(int r:right){\n          if(c=='+')res.push_back(l+r);\n          else if(c=='-')res.push_back(l-r);\n          else res.push_back(l*r);\n        }\n      }\n    }\n  }\n  if(res.empty()){ res.push_back(stoi(expression)); }\n  return memo[expression]=res;\n}\nint main() {\n  string exp; cin >> exp;\n  vector<int> r = diffWaysToCompute(exp);\n  for (int x : r) cout << x << \" \";\n  return 0;\n}\n"
  eq('★ 2-1-1 → 两种加括号', prog, '2 0 ', '2-1-1')
  eq('★ 2*3-4*5 → 五种', prog, '-34 -10 -14 -10 10 ', '2*3-4*5')
  eq('★ 单一数字', prog, '2 ', '2')
}

// ---------- vector<int>() 空构造式 + 内层初始化列表 ----------
// 起因：学生写 g.push_back(vector<int>()) 时，解释器拿 undefined 去求值，
// 崩成「Cannot read properties of undefined (reading 'kind')」这种看不懂的内部讯息。
eq('vector<int>() 当空 vector', 'int main(){ vector<vector<int>> g; g.push_back(vector<int>()); cout<<g.size()<<g[0].size(); return 0; }', '10')
eq('v = vector<int>() 赋值成空 vector', 'int main(){ vector<int> v; v.push_back(1); v=vector<int>(); cout<<v.size(); return 0; }', '0')
eq('vector<int>(3) 带大小（回归）', 'int main(){ vector<vector<int>> g; g.push_back(vector<int>(3)); cout<<g[0].size(); return 0; }', '3')
eq('g.push_back({1,2}) 内层初始化列表', 'int main(){ vector<vector<int>> g; g.push_back({1,2}); g.push_back({3}); cout<<g[0][1]<<g[1][0]<<g.size(); return 0; }', '232')
eq('vector<vector<int>> 空行可再填', 'int main(){ vector<vector<int>> g; g.push_back(vector<int>()); g[0].push_back(4); cout<<g[0][0]; return 0; }', '4')

// ---------- 不支援的组合要给「人看得懂」的错误，不能外泄内部讯息 ----------
err('set<容器> 明确报错', 'int main(){ set<vector<int>> s; vector<int> v; v.push_back(1); s.insert(v); return 0; }', '只支持标量')
err('sort(vector<容器>) 明确报错', 'int main(){ vector<vector<int>> g; g.push_back({2}); g.push_back({1}); sort(g); return 0; }', '只能放进标量元素')
err('lower_bound(vector<容器>) 明确报错', 'int main(){ vector<vector<int>> g; g.push_back({1}); vector<int> x; x.push_back(1); cout<<lower_bound(g,x); return 0; }', '只能放进标量元素')

console.log('==== container-test: ' + pass + ' 通過, ' + fail + ' 失敗 ====')
if (fail > 0) process.exit(1)
