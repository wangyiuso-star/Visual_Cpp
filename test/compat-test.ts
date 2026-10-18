import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'

// VisualCode（cpp-viz）語言子集相容性矩陣 —— 可執行的事實來源。
// yes(...) 斷言可用且輸出正確；no(...) 斷言不可用（抛錯或報錯）。
let pass = 0
let fail = 0

function outcome(code: string, input = ''): { ok: boolean; msg: string; out: string } {
  try {
    let last: any = null
    for (const s of run(parse(code), { input })) last = s
    if (last && last.error) return { ok: false, msg: String(last.error), out: String(last.output ?? '') }
    return { ok: true, msg: '', out: String((last && last.output) ?? '') }
  } catch (e) {
    return { ok: false, msg: (e as Error).message, out: '' }
  }
}

function yes(name: string, code: string, want: string, input = '') {
  const r = outcome(code, input)
  if (r.ok && r.out === want) { pass++; return }
  fail++
  console.log('FAIL [應可用] ' + name + ' | 期望 "' + want + '" 實際 ' + (r.ok ? '"' + r.out + '"' : '報錯: ' + r.msg))
}

function no(name: string, code: string, input = '') {
  const r = outcome(code, input)
  if (!r.ok) { pass++; return }
  fail++
  console.log('FAIL [應不可用] ' + name + ' | 卻成功輸出 "' + r.out + '"')
}

// ---------- A. 可用 ----------
yes('sort(a, n)', 'int main(){ int a[5]={5,4,3,2,1}; sort(a,5); cout<<a[0]; return 0; }', '1')
yes('sort(a) 全區間', 'int main(){ int a[3]={3,1,2}; sort(a); cout<<a[0]; return 0; }', '1')
yes('reverse(a, n)', 'int main(){ int a[3]={1,2,3}; reverse(a,3); cout<<a[0]; return 0; }', '3')
yes('reverse(string)', 'int main(){ string s="abc"; reverse(s); cout<<s; return 0; }', 'cba')
yes('lower_bound(a, n, x)', 'int main(){ int a[5]={1,3,5,7,9}; cout<<lower_bound(a,5,6); return 0; }', '3')
yes('lower_bound(a, x) 二參', 'int main(){ int a[5]={1,3,5,7,9}; cout<<lower_bound(a,6); return 0; }', '3')
yes('swap 純量', 'int main(){ int x=1,y=2; swap(x,y); cout<<x<<y; return 0; }', '21')
yes('swap 陣列元素', 'int main(){ int a[2]={1,2}; swap(a[0],a[1]); cout<<a[0]<<a[1]; return 0; }', '21')
yes('引用參數 int&', 'void inc(int& x){ x++; } int main(){ int a=5; inc(a); cout<<a; return 0; }', '6')
yes('容器按值參數', 'void f(vector<int> v){ v.push_back(9); cout<<v.size(); } int main(){ vector<int> v; f(v); cout<<v.size(); return 0; }', '10')
yes('函式內局部陣列', 'void f(){ int tmp[3]; tmp[0]=7; tmp[1]=8; cout<<tmp[0]<<tmp[1]; } int main(){ f(); return 0; }', '78')
yes('函式內局部 vector', 'void f(){ vector<int> t; t.push_back(9); cout<<t[0]; } int main(){ f(); return 0; }', '9')
yes('函式內局部 2D 陣列', 'void f(){ int m[2][3]; m[1][2]=9; cout<<m[1][2]; } int main(){ f(); return 0; }', '9')
yes('遞迴中局部陣列逐幀獨立', 'void f(int d){ int tmp[2]; tmp[0]=d*10; if(d>0) f(d-1); cout<<tmp[0]<<" "; } int main(){ f(2); return 0; }', '0 10 20 ')
yes('局部陣列預設 0（與 C++ 不同）', 'void f(){ int tmp[3]; cout<<tmp[0]<<tmp[1]<<tmp[2]; } int main(){ f(); return 0; }', '000')
yes('局部陣列大小 1000', 'void f(){ int tmp[1000]; tmp[999]=42; cout<<tmp[999]; } int main(){ f(); return 0; }', '42')
yes('cin >> s', 'int main(){ string s; cin>>s; cout<<"["<<s<<"]"; return 0; }', '[hello]', 'hello world')
yes('cin 鏈式 >>', 'int main(){ string a,b; cin>>a>>b; cout<<a+" "+b; return 0; }', 'hello world', 'hello world')
yes('cin >> a[i] 迴圈讀數', 'int main(){ int n; cin>>n; int a[100]; for(int i=0;i<n;i++) cin>>a[i]; cout<<a[0]+a[n-1]; return 0; }', '40', '3 10 20 30')
yes('char 字面量與比較', "int main(){ char c = 'x'; if(c=='x') cout<<c; return 0; }", 'x')
yes('v.size() 作條件', 'int main(){ vector<int> v; v.push_back(1); v.push_back(2); for(int i=0;i<v.size();i++) cout<<v[i]; return 0; }', '12')
yes('while(true)+break 取代 do-while', 'int main(){ int i=0; while(true){ i++; if(i>=3) break; } cout<<i; return 0; }', '3')
yes('double 隱式轉 int', 'int main(){ double x=1.0/3; int t = x*100; cout<<t; return 0; }', '33')
yes('手工保留兩位小數', 'int main(){ double x=1.0/3; int t = x*100; cout<<t/100; cout<<"."; if(t%100<10) cout<<0; cout<<t%100; return 0; }', '0.33')
yes('double 預設輸出＝6 位有效數字（C++ 語意）', 'int main(){ cout<<0.1+0.2<<" "<<1.0/3; return 0; }', '0.3 0.333333')
yes('#include <iomanip> 本身不報錯', '#include <iomanip>\nint main(){ cout<<1; return 0; }', '1')
yes('全域陣列 + 函式內寫', 'int g[3]; void f(){ g[0]=1; } int main(){ f(); cout<<g[0]; return 0; }', '1')

// ---------- B. 不可用 ----------
yes('do-while', 'int main(){ int i=0; do { i++; } while(i<3); cout<<i; return 0; }', '3')
yes('int f(int a[], int n) 共享語意', 'void f(int a[], int n){ a[0]=99; } int main(){ int b[3]={1,2,3}; f(b,3); cout<<b[0]; return 0; }', '99')
yes('int f(int a[3]) 長度被忽略', 'int f(int a[3]){ a[0]=8; } int main(){ int b[3]={5,6,7}; f(b); cout<<b[0]; return 0; }', '8')
yes('range-for  for (int x : v)', 'int main(){ int a[3]={1,2,3}; for (int x : a) cout<<x; return 0; }', '123')
yes('range-for + auto', 'int main(){ int a[3]={1,2,3}; for (auto x : a) cout<<x; return 0; }', '123')
yes('range-for + auto& 共享', 'int main(){ int a[2]={1,2}; for (auto& x : a) x=x*2; cout<<a[0]<<a[1]; return 0; }', '24')
no('一般 auto（非 range-for）', 'int main(){ auto x = 5; cout<<x; return 0; }')
no('auto x = 5', 'int main(){ auto x = 5; return 0; }')
yes('sort(v.begin(), v.end())', 'int main(){ vector<int> v; v.push_back(2); v.push_back(1); sort(v.begin(),v.end()); cout<<v[0]<<v[1]; return 0; }', '12')
yes('sort(a, n, cmp) 自訂比較（降序）', 'int cmp(int x,int y){ return x>y; } int main(){ int a[3]={1,3,2}; sort(a,3,cmp); cout<<a[0]<<a[1]<<a[2]; return 0; }', '321')
yes('string find(str, pos)', 'int main(){ string s="hello"; cout<<s.find("l",4); return 0; }', '-1')
no('string.append(單一字元) —— C++ 無此重載', "int main(){ string s=\"a\"; s.append('!'); return 0; }")
no('string.substr 起點越界', 'int main(){ string s="abc"; cout<<s.substr(9); return 0; }')
yes('string find == string::npos', 'int main(){ string s="hello"; if (s.find("z")==string::npos) cout<<"nf"; return 0; }', 'nf')
yes('string 方法串接', 'int main(){ string s="hello"; cout<<s.substr(1).size(); return 0; }', '4')
yes('toupper / isdigit', 'int main(){ string s="a1"; for (char c : s) if (isdigit(c)) cout<<toupper(c); return 0; }', '1')
yes('vector resize / insert / erase', 'int main(){ vector<int> v; v.push_back(2); v.insert(0,1); v.resize(4); v.erase(3,1); cout<<v.size(); return 0; }', '3')
yes('stoi', 'int main(){ cout<<stoi("123")+1; return 0; }', '124')
yes('to_string', 'int main(){ int n=42; cout<<to_string(n)+"!"; return 0; }', '42!')
yes('stoi 指定進制', 'int main(){ cout<<stoi("ff",0,16); return 0; }', '255')
yes('sort(a, cmp) 二參形式', 'int cmp(int x,int y){ return x>y; } int main(){ int a[2]={1,2}; sort(a,cmp); cout<<a[0]; return 0; }', '2')
no('int a[] 收到純量實參', 'void f(int a[]){ a[0]=1; } int main(){ int x=1; f(x); return 0; }')
no('int a[] 收到 vector', 'void f(int a[]){ a[0]=1; } int main(){ vector<int> v; f(v); return 0; }')
yes('getline(cin, s)', 'int main(){ string s; getline(cin, s); cout<<s; return 0; }', 'hello world', 'hello world')
yes('cin >> char', 'int main(){ char c; cin>>c; cout<<c; return 0; }', 'a', 'a')
yes('setprecision(n)', 'int main(){ cout<<setprecision(2)<<3.14159; return 0; }', '3.1')
yes('fixed + setprecision(n)', 'int main(){ cout<<fixed<<setprecision(2)<<3.14159; return 0; }', '3.14')
yes('fixed 單獨（預設 6 位小數）', 'int main(){ cout<<fixed<<3.14159; return 0; }', '3.141590')
no('printf', 'int main(){ printf("x"); return 0; }')
no('switch', 'int main(){ int x=1; switch(x){ case 1: break; } return 0; }')
yes('三目 a?b:c', 'int main(){ int a=1,b=2; cout<<(a>b?a:b); return 0; }', '2')
no('位運算 ^', 'int main(){ cout<<(5^3); return 0; }')
yes('C 風格 cast (double)a', 'int main(){ int a=1,b=3; cout<<(double)a/b; return 0; }', '0.333333')
yes('C 風格 cast (char)(c+1)', "int main(){ char c='a'; cout<<(char)(c+1); return 0; }", 'b')
yes('C 風格 cast (int)v.size()', 'int main(){ vector<int> v; v.push_back(1); cout<<(int)v.size(); return 0; }', '1')
yes('cin.get()', 'int main(){ char c; c = cin.get(); cout<<c; return 0; }', 'a', 'a')
yes('using (型別別名 / namespace)', 'using ll = long long;\nint main(){ ll x=5; cout<<x; return 0; }', '5')

// ---------- C. 不能下標的容器要明確報錯（S8：以前是 undefined 崩潰）----------
// C++ 也不允許 s[0] / st[0]，所以寧可報錯也不要靜默取到元素或吐 undefined。
no('set 不能下標 s[0]', 'int main(){ set<int> s; s.insert(1); cout<<s[0]; return 0; }')
no('stack 不能下標 st[0]', 'int main(){ stack<int> st; st.push(1); cout<<st[0]; return 0; }')
no('queue 不能下標', 'int main(){ queue<int> q; q.push(1); cout<<q[0]; return 0; }')
no('省 array 大小卻沒有初始化列表', 'int main(){ int a[]; return 0; }')
no('省 array 大小卻用純量初始化（int a[] = x）', 'int main(){ int x=1; int a[] = x; return 0; }')

// ---------- D. 數值精度：超過 2^53 必須顯式警告，不能靜默給錯答案 ----------
// C++ 的 long long 到 9.2e18，但本工具用 JS number 存（精確上限 2^53≈9.0e15）。
// 規則：算到超出範圍要「看得見」的 warning（不中斷程式），沒超出則不能亂報。
function lastSnap(code: string) {
  let last: any = null
  for (const s of run(parse(code), { input: '' })) last = s
  return last
}
{
  const s = lastSnap('int main(){ long long x = 9223372036854775807; cout << x; return 0; }')
  if (s && s.warning) pass++
  else { fail++; console.log('FAIL [精度] long long 字面量超过 2^53 必須有 warning') }
}
{
  const s = lastSnap('int main(){ long long x = 100; x = x * 1000; cout << x; return 0; }')
  if (s && !s.warning) pass++
  else { fail++; console.log('FAIL [精度] 正常範圍不該出現 warning') }
}

console.log('==== compat-test: ' + pass + ' 通過, ' + fail + ' 失敗 ====')
if (fail > 0) process.exit(1)
