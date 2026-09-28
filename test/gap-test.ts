import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'

// 这一轮（v0.7.0）从 HKOI 教材编辑的缺口提案实作出来的功能，逐条锁住。
// 提案：_工作檔/工作紀錄/13-給VisualCode的缺口提案.md（可用 28 / 不支援 29 的探针表）。

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
  fail++;
  console.log('FAIL ' + name + ' | 期望 ' + JSON.stringify(want) + ' 实际 ' + JSON.stringify(r.out))
}
function err(name: string, code: string, wantPart: string, input = '') {
  const r = run1(code, input)
  if (r.err && r.err.indexOf(wantPart) >= 0) { pass++; return }
  fail++;
  console.log('FAIL ' + name + ' | 期望错误含 ' + JSON.stringify(wantPart) + '，实际 ' + (r.err ? JSON.stringify(r.err) : '没报错，输出 ' + JSON.stringify(r.out)))
}
// 前置代码（#include / struct / 函数定义）不能塞进 main，所以给一个带 pre 的版本
function eqPre(name: string, pre: string, code: string, want: string, input = '') {
  eq(name, pre + ' ' + code, want, input)
}

// ---------- 1.1 while (cin >> x) 讀到 EOF ----------
eq('while(cin>>x) 加總到 EOF', 'int main(){ int x, s=0; while(cin>>x) s+=x; cout<<s; return 0; }', '6', '1 2 3')
eq('while(cin>>x) 空輸入 → 0 圈、不報錯', 'int main(){ int x, s=0; while(cin>>x) s+=x; cout<<s; return 0; }', '0', '')
eq('while(!(cin>>x)) 反向寫法', 'int main(){ int x; while(!(cin>>x)) { cout<<"no"; break; } cout<<"end"; return 0; }', 'noend', '')
eq('cin>>x 當 if 條件', 'int main(){ int x; if(cin>>x) cout<<x; return 0; }', '7', '7')
eq('EOF 後 x 保留最後一次讀到的值', 'int main(){ int x=99; while(cin>>x){} cout<<x; return 0; }', '3', '1 2 3')
eq('多行輸入照樣讀', 'int main(){ int x,s=0; while(cin>>x) s+=x; cout<<s; return 0; }', '6', '1\n2\n3')
err('cin 語句形式讀不足仍是明確錯誤', 'int main(){ int a,b; cin>>a>>b; return 0; }', '要读第 2 个值', '7')

// ---------- 1.2 getline + cin >> char + cin.ignore ----------
eq('getline 讀含空白的整行', 'int main(){ string s; getline(cin,s); cout<<s; return 0; }', 'hello world', 'hello world')
eq('getline 讀空行會得到空字串', 'int main(){ string s; getline(cin,s); cout<<"["<<s<<"]"; return 0; }', '[]', '')
eq('Windows 的 \\r\\n 行尾不會污染 getline', 'int main(){ string s; getline(cin,s); cout<<"["<<s<<"]"; return 0; }', '[ab]', 'ab\r\ncd')
eq('cin>>n 之後 getline 讀到空字串（C++ 的經典行為）', 'int main(){ int n; string s; cin>>n; getline(cin,s); cout<<n<<"["<<s<<"]"; return 0; }', '3[]', '3\nhello')
eq('同一行剩下的字元（含空白）會被 getline 讀走', 'int main(){ int n; string s; cin>>n; getline(cin,s); cout<<"["<<s<<"]"; return 0; }', '[ hello]', '3 hello')
eq('cin.ignore() 之後 getline 讀到下一行', 'int main(){ int n; string s; cin>>n; cin.ignore(); getline(cin,s); cout<<n<<"["<<s<<"]"; return 0; }', '3[hello]', '3 hello')
eq('cin.ignore(1000, 換行) 版本', "int main(){ int n; string s; cin>>n; cin.ignore(1000, '\\n'); getline(cin,s); cout<<s; return 0; }", 'world', '3 hello\nworld')
eq('while(getline(cin,s)) 逐行讀到 EOF', 'int main(){ string s; int c=0; while(getline(cin,s)) c++; cout<<c; return 0; }', '3', 'a\nb\nc')
eq('getline 到 EOF 回 false 且字串不變', 'int main(){ string s="keep"; bool ok=getline(cin,s); cout<<ok<<s; return 0; }', 'falsekeep', '')
eq('cin>>char 讀單一字元', 'int main(){ char c; cin>>c; cout<<c; return 0; }', 'a', 'a')
eq('連續 cin>>char 讀相鄰字元', 'int main(){ char a,b; cin>>a>>b; cout<<a<<b; return 0; }', 'xy', 'xy')
eq('cin>>char 跳過空白', 'int main(){ char c; cin>>c; cout<<c; return 0; }', 'a', '   a  ')

// ---------- 1.3 強制型別轉換 ----------
eq('(int)3.9 截斷', 'int main(){ cout<<(int)3.9; return 0; }', '3')
eq('(int)(負數) 向零截斷', 'int main(){ cout<<(int)(-3.9); return 0; }', '-3')
eq('(char)(c+1) 下一個字母', "int main(){ char c='a'; cout<<(char)(c+1); return 0; }", 'b')
eq('(char)65', 'int main(){ cout<<(char)65; return 0; }', 'A')
eq('(int)c 取字元碼', "int main(){ char c='A'; cout<<(int)c; return 0; }", '65')
eq('(long long)x', 'int main(){ int x=3; cout<<(long long)x; return 0; }', '3')
eq('(int)v.size()', 'int main(){ vector<int> v; v.push_back(1); cout<<(int)v.size(); return 0; }', '1')
eq('(double)a/b 真除法', 'int main(){ int a=1,b=3; cout<<(double)a/b; return 0; }', '0.333333')
eq('(double)(a/b) 先整數除', 'int main(){ int a=1,b=3; cout<<(double)(a/b); return 0; }', '0')
eq('(bool)5', 'int main(){ cout<<(bool)5; return 0; }', 'true')
eq('轉型套在算式上（2.7+1.3 剛好是 4.0）', 'int main(){ cout<<(int)(2.7+1.3); return 0; }', '4')
eq('轉型套在算式上（1.6+1.6=3.2 → 3）', 'int main(){ cout<<(int)(1.6+1.6); return 0; }', '3')
eq('(string) 連字串', 'int main(){ int n=5; cout<<(string)"n="+to_string(n); return 0; }', 'n=5')

// ---------- 1.4 數學函式 ----------
eq('sqrt(16)', 'int main(){ cout<<sqrt(16); return 0; }', '4')
eq('sqrt(2)', 'int main(){ cout<<sqrt(2); return 0; }', '1.41421')
eq('sqrt(-1) 照 C++ 印 nan', 'int main(){ cout<<sqrt(-1); return 0; }', 'nan')
eq('pow(2,10)', 'int main(){ cout<<pow(2,10); return 0; }', '1024')
eq('pow(2,0.5)', 'int main(){ cout<<pow(2,0.5); return 0; }', '1.41421')
eq('floor / ceil 負數', 'int main(){ cout<<floor(-1.5)<<" "<<ceil(-1.5); return 0; }', '-2 -1')
eq('fabs / abs', 'int main(){ cout<<fabs(-2.5)<<" "<<abs(-3); return 0; }', '2.5 3')
eq('用 sqrt 判斷質數', 'int main(){ int n=97,c=0; for(int i=2;i<=sqrt(n);i++) if(n%i==0) c++; cout<<(c==0); return 0; }', 'true')

// ---------- 1.5 sort 的降序比較子 ----------
eq('sort(v, greater<int>())', 'int main(){ vector<int> v; v.push_back(1); v.push_back(3); v.push_back(2); sort(v,greater<int>()); cout<<v[0]<<v[1]<<v[2]; return 0; }', '321')
eq('sort(v, less<int>())', 'int main(){ vector<int> v; v.push_back(3); v.push_back(1); v.push_back(2); sort(v,less<int>()); cout<<v[0]<<v[1]<<v[2]; return 0; }', '123')
eq('sort(a, n, greater<int>()) 前 n 個', 'int main(){ int a[5]={1,3,2,5,4}; sort(a,3,greater<int>()); cout<<a[0]<<a[1]<<a[2]; return 0; }', '321')
eq('sort 字串元素降序', 'int main(){ vector<string> v; v.push_back("a"); v.push_back("c"); v.push_back("b"); sort(v,greater<string>()); cout<<v[0]<<v[1]<<v[2]; return 0; }', 'cba')
eq('sort(vector<pair>) 預設字典序', 'int main(){ vector<pair<int,int>> v; v.push_back({2,1}); v.push_back({1,9}); v.push_back({1,2}); sort(v); cout<<v[0].first<<v[0].second<<v[1].second<<v[2].first; return 0; }', '1292')

// ---------- 1.6 fixed + setprecision ----------
eq('fixed<<setprecision(2)', 'int main(){ double x=3.14159; cout<<fixed<<setprecision(2)<<x; return 0; }', '3.14')
eq('setprecision(2) 單獨 = 有效位數', 'int main(){ cout<<setprecision(2)<<3.14159; return 0; }', '3.1')
eq('fixed 單獨 = 6 位小數', 'int main(){ cout<<fixed<<3.14159; return 0; }', '3.141590')
eq('fixed<<setprecision(0)', 'int main(){ cout<<fixed<<setprecision(0)<<3.7; return 0; }', '4')
eq('狀態會留到下一次輸出', 'int main(){ double x=1.0/3; cout<<fixed<<setprecision(3)<<x<<" "<<x; return 0; }', '0.333 0.333')
eq('整數不受 fixed 影響', 'int main(){ cout<<fixed<<setprecision(2)<<5; return 0; }', '5')
eq('E1714C 風格：兩位小數', 'int main(){ double a=1.0/3; cout<<fixed<<setprecision(2)<<a; return 0; }', '0.33')

// ---------- 浮點預設輸出 = C++ 語意（6 位有效數字） ----------
eq('0.1+0.2 印 0.3', 'int main(){ cout<<0.1+0.2; return 0; }', '0.3')
eq('1.0/3 印 0.333333', 'int main(){ cout<<1.0/3; return 0; }', '0.333333')
eq('2.5 不補零', 'int main(){ cout<<2.5; return 0; }', '2.5')
eq('1e9 用科學記號（指數兩位）', 'int main(){ cout<<1000000000.0; return 0; }', '1e+09')
eq('小於 1e-4 用科學記號', 'int main(){ cout<<0.00001; return 0; }', '1e-05')

// ---------- 字元算術（Unit 6「字元就是數字」） ----------
eq("c-'a' 取字母序", "int main(){ char c='d'; cout<<(c-'a'); return 0; }", '3')
eq('c+1 隱式轉', "int main(){ char c='a'; c=c+1; cout<<c; return 0; }", 'b')
eq('c+=1', "int main(){ char c='a'; c+=1; cout<<c; return 0; }", 'b')
eq('c-32 轉大寫', "int main(){ char c='a'; cout<<(char)(c-32); return 0; }", 'A')
eq("'A'+32 轉小寫", "int main(){ cout<<(char)('A'+32); return 0; }", 'a')
eq('char 與 int 比較（C++ 提升成 int）', "int main(){ char c='a'; cout<<(c==97); return 0; }", 'true')
eq('判斷小寫字母', "int main(){ char c='q'; if(c>='a' && c<='z') cout<<\"lower\"; return 0; }", 'lower')
eq('字串逐字元轉大寫', "int main(){ string s=\"hkoi\"; for(char c : s) cout<<(char)(c-32); return 0; }", 'HKOI')
eq('字元迴圈數數', "int main(){ for(char c='a'; c<='e'; c++) cout<<c; return 0; }", 'abcde')

// ---------- 容器與 pair 的比較（4.1 的『訊息誤導』改成真的能比） ----------
eq('vector 字典序', 'int main(){ vector<int> v; vector<int> w; v.push_back(1); w.push_back(2); cout<<(v<w); return 0; }', 'true')
eq('vector 前綴較短者小', 'int main(){ vector<int> v; vector<int> w; v.push_back(1); w.push_back(1); w.push_back(0); cout<<(v<w); return 0; }', 'true')
eq('vector 相等', 'int main(){ vector<int> v; vector<int> w; v.push_back(1); w.push_back(1); cout<<(v==w); return 0; }', 'true')
eq('vector 不等', 'int main(){ vector<int> v; vector<int> w; v.push_back(1); w.push_back(2); cout<<(v!=w); return 0; }', 'true')
eq('pair 比較先比 first', 'int main(){ pair<int,int> a=make_pair(1,9), b=make_pair(2,0); cout<<(a<b); return 0; }', 'true')
eq('pair 比較再比 second', 'int main(){ pair<int,int> a=make_pair(1,9), b=make_pair(1,2); cout<<(a<b); return 0; }', 'false')
eq('sort 用 pair 預設比較', 'int main(){ vector<pair<int,int>> v; v.push_back({2,1}); v.push_back({1,2}); sort(v); cout<<v[0].first<<v[1].first; return 0; }', '12')
eq('lower_bound 找 pair', 'int main(){ vector<pair<int,int>> v; v.push_back({1,1}); v.push_back({3,3}); pair<int,int> x=make_pair(2,0); cout<<lower_bound(v,x); return 0; }', '1')
eq('set 的字典序', 'int main(){ set<int> a; set<int> b; a.insert(1); b.insert(2); cout<<(a<b); return 0; }', 'true')
eq('unordered_map 比相等（無序）', 'int main(){ unordered_map<int,int> a; unordered_map<int,int> b; a[1]=1; a[2]=2; b[2]=2; b[1]=1; cout<<(a==b); return 0; }', 'true')
err('raw array 比較說明比的是指標', 'int main(){ int a[2]={1,2}; int b[2]={1,2}; cout<<(a==b); return 0; }', '比的是指针')
err('stack 比較明確不支援', 'int main(){ stack<int> a; stack<int> b; cout<<(a==b); return 0; }', '暂不支援')
err('容器與純量混比明確報錯', 'int main(){ vector<int> v; cout<<(v<3); return 0; }', '不能把 vector 容器与标量比较')
err('不同容器型別不能比', 'int main(){ vector<int> v; deque<int> d; cout<<(v==d); return 0; }', '不能比较')
err('unordered_map 不能比大小', 'int main(){ unordered_map<int,int> a; unordered_map<int,int> b; cout<<(a<b); return 0; }', '没有顺序')

// ---------- 4.2 const T& 參數 ----------
eqPre('const vector<int>& 讀取', 'int f(const vector<int>& v){ return v.size(); }', 'int main(){ vector<int> v; v.push_back(1); v.push_back(2); cout<<f(v); return 0; }', '2')
eqPre('const int& 可以綁常數', 'int f(const int& x){ return x*2; }', 'int main(){ cout<<f(5); return 0; }', '10')
eqPre('const string& 可以綁字面量', 'int f(const string& s){ return s.size(); }', 'int main(){ cout<<f("abc"); return 0; }', '3')
eqPre('const int& 綁算式結果', 'int f(const int& x){ return x; }', 'int main(){ int a=2; cout<<f(a*3); return 0; }', '6')
err('非 const 的 int& 不能綁常數（C++ 也編不過）', 'void f(int& x){ x++; } int main(){ f(5); return 0; }', '需要一个变量')
eqPre('const int& 傳變數仍然共享（唯讀）', 'int f(const int& x){ return x; }', 'int main(){ int a=7; cout<<f(a); return 0; }', '7')

// ---------- 賦值的隱式轉換（以前會把 3.7 原樣存進 int） ----------
eq('int x; x=3.7 → 3', 'int main(){ int x; x=3.7; cout<<x; return 0; }', '3')
eq("char c; c=65 → 'A'", 'int main(){ char c; c=65; cout<<c; return 0; }', 'A')
eq('bool b; b=3 → true', 'int main(){ bool b; b=3; cout<<b; return 0; }', 'true')
eq('double d; d=7 → 7', 'int main(){ double d; d=7; cout<<d; return 0; }', '7')
eq('char 陣列元素賦值也轉', 'int main(){ char a[2]; a[0]=72; a[1]=73; cout<<a[0]<<a[1]; return 0; }', 'HI')


// ---------- 第二優先（v0.8.0）：#define / typedef / using / 三目 / sizeof / memset / fill / assign / INT_MAX ----------
eq('#define 當陣列大小', '#define MAXN 10\nint main(){ int a[MAXN]; a[9]=7; cout<<a[9]; return 0; }', '7')
eq('#define 當常數', '#define N 5\nint main(){ cout<<N*2; return 0; }', '10')
eq('#define 巢狀（巨集套巨集）', '#define A 3\n#define B A\nint main(){ cout<<B; return 0; }', '3')
eq('#define 的名稱出現在字串/註解裡不會被換', '#define N 5\nint main(){ cout<<"N"; /* N */ return 0; }', 'N')
eq('typedef 別名', 'typedef long long ll;\nint main(){ ll x=5; cout<<x; return 0; }', '5')
eq('using 別名', 'using ll = long long;\nint main(){ ll x=5; cout<<x; return 0; }', '5')
eq('別名用在 container', 'typedef long long ll;\nint main(){ vector<ll> v; v.push_back(9); cout<<v[0]; return 0; }', '9')
eq('using namespace std 照舊', 'using namespace std;\nint main(){ cout<<1; return 0; }', '1')
eq('size_t 宣告', 'int main(){ size_t n=3; cout<<n; return 0; }', '3')
eq('三目基本', 'int main(){ int a=3,b=5; cout<<(a>b?a:b); return 0; }', '5')
eq('三目當引數', 'int main(){ int a=3,b=5; cout<<max(a,b); return 0; }', '5')
eq('三目嵌套（右結合）', 'int main(){ int a=1,b=2,c=3; cout<<(a>b?a:b>c?b:c); return 0; }', '3')
eq('三目只求值被選中的一邊', 'int main(){ int a=1,b=2; cout<<(a<b?a:b); return 0; }', '1')
eq('INT_MAX / INT_MIN', 'int main(){ cout<<INT_MAX<<" "<<INT_MIN; return 0; }', '2147483647 -2147483648')
eq('用 INT_MAX 初始化最小值', 'int main(){ int best=INT_MAX; vector<int> v; v.push_back(3); v.push_back(7); for(int x:v) if(x<best) best=x; cout<<best; return 0; }', '3')
eq('sizeof(int)', 'int main(){ cout<<sizeof(int); return 0; }', '4')
eq('sizeof 陣列', 'int main(){ int a[3]; cout<<sizeof(a); return 0; }', '12')
eq('sizeof(a)/sizeof(a[0]) 取長度', 'int main(){ int a[5]; cout<<sizeof(a)/sizeof(a[0]); return 0; }', '5')
eq('sizeof struct', 'struct P { int x; int y; }; int main(){ P p; cout<<sizeof(p); return 0; }', '8')
err('sizeof(vector) 給教學說明（不是元素個數）', 'int main(){ vector<int> v; cout<<sizeof(v); return 0; }', '不是元素个数')
eq('memset 歸零', 'int main(){ int a[3]={1,2,3}; memset(a,0,sizeof(a)); cout<<a[0]<<a[1]<<a[2]; return 0; }', '000')
eq('memset -1 是逐位元組', 'int main(){ int a[2]; memset(a,-1,sizeof(a)); cout<<a[0]; return 0; }', '-1')
eq('memset 0x3f 是 0x3f3f3f3f（不能想成 63）', 'int main(){ int a[2]; memset(a,0x3f,sizeof(a)); cout<<a[0]; return 0; }', '1061109567')
eq('memset char 陣列', 'int main(){ char a[3]; memset(a,0,sizeof(a)); cout<<(int)a[0]; return 0; }', '0')
err('memset 非 0 用在 double 要明確報錯', 'int main(){ double a[2]; memset(a,0x3f,sizeof(a)); return 0; }', '垃圾位元')
eq('fill(v.begin(), v.end(), x)', 'int main(){ vector<int> v(3); fill(v.begin(),v.end(),7); cout<<v[0]<<v[1]<<v[2]; return 0; }', '777')
eq('fill(a, a+n, x)', 'int main(){ int a[4]={1,1,1,1}; fill(a,a+2,9); cout<<a[0]<<a[1]<<a[2]; return 0; }', '991')
eq('sort(v.begin(), v.end())', 'int main(){ vector<int> v; v.push_back(3); v.push_back(1); sort(v.begin(),v.end()); cout<<v[0]<<v[1]; return 0; }', '13')
eq('sort(a, a+n) 區間寫法（只排前 3 個）', 'int main(){ int a[4]={4,3,2,1}; sort(a,a+3); cout<<a[0]<<a[1]<<a[2]<<a[3]; return 0; }', '2341')
eq('sort(a, a+n, greater<int>())', 'int main(){ int a[3]={1,3,2}; sort(a,a+3,greater<int>()); cout<<a[0]<<a[1]<<a[2]; return 0; }', '321')
eq('reverse(v.begin(), v.end())', 'int main(){ vector<int> v; v.push_back(1); v.push_back(2); reverse(v.begin(),v.end()); cout<<v[0]<<v[1]; return 0; }', '21')
eq('lower_bound(v.begin(), v.end(), x)', 'int main(){ vector<int> v; v.push_back(1); v.push_back(3); v.push_back(5); cout<<lower_bound(v.begin(),v.end(),4); return 0; }', '2')
eq('v.assign(3, 5)', 'int main(){ vector<int> v; v.assign(3,5); cout<<v.size()<<v[0]<<v[2]; return 0; }', '355')
eq('max({a,b,c}) 初始化列表', 'int main(){ int a=1,b=9,c=5; cout<<max({a,b,c}); return 0; }', '9')
eq('cin.get() 讀字元（含空白）', 'int main(){ char a,b; a=cin.get(); b=cin.get(); cout<<"["<<a<<b<<"]"; return 0; }', '[a ]', 'a b')
err('s.find(x) != s.end() 給迭代器指引', 'int main(){ set<int> s; s.insert(1); if(s.find(1)!=s.end()) cout<<1; return 0; }', '本工具不做迭代器')
// ---------- 初始化列表的尾逗号（合法 C++，以前报「无法解析 }」）----------
eq('vector 初始化列表尾逗号', 'int main(){ vector<int> v = {1, 2, 3,}; cout<<v.size()<<v[2]; return 0; }', '33')
eq('数组初始化列表尾逗号', 'int main(){ int a[] = {1, 2, 3,}; cout<<a[2]; return 0; }', '3')
eq('嵌套初始化列表尾逗号', 'int main(){ vector<vector<int>> g = {{1, 2},{3,},}; cout<<g[0][1]<<g[1][0]; return 0; }', '23')
eq('struct 初始化列表尾逗号', 'struct P { int x; int y; }; int main(){ P p = {1, 2,}; cout<<p.y; return 0; }', '2')
eq('空初始化列表', 'int main(){ vector<int> v = {}; cout<<v.size(); return 0; }', '0')
eq('空的花括号初始化 int a[2] = {}', 'int main(){ int a[2] = {}; cout<<a[0]<<a[1]; return 0; }', '00')
// ---------- 不支援的东西要给「讲清楚」的错误（不能静默给错答案）----------
// 函式多载：以前同名函数定义两次是「后定义的默默生效」→ f(3) 可能跑到 double 版本，答案直接错。
err('同名函数定义两次要明确报错（以前会默默用后定义的）', 'int f(int x){ return x*10; } int f(double x){ return 1; } int main(){ cout<<f(3); return 0; }', '不支援函数多载')
err('__builtin_popcount 要说明「位元运算不做」', 'int main(){ cout<<__builtin_popcount(7); return 0; }', '位元运算')
console.log('==== gap-test: ' + pass + ' 通過, ' + fail + ' 失敗 ====')
if (fail > 0) process.exit(1)