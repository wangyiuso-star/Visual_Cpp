// 特性化測試（characterization test）：把「現在的行為」整批錄成 golden file。
// 為什麼需要：重構（拆檔、去重、搬家）**不該改變任何行為**。35 個既有測試檔負責語意，
// 這份負責「一點都不能變」—— digest 一有變化，就是搬檔時動到了什麼。
// 刻意要改變行為時：UPDATE_GOLDEN=1 node test/interp-golden.mjs 重錄，並在 commit message 說明為什麼。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'

const GOLDEN = 'test/_golden/interp-golden.txt'
const UPDATE = !!process.env.UPDATE_GOLDEN
const NL = String.fromCharCode(10)
const Q = String.fromCharCode(34) // C++ 的雙引號（避免跟這份檔案裡的 TS 引號打架）
const CAP = 8 // 容器只摘要前 8 個 —— 501x501 的 DP 表不能整個展開
const CASES: { name: string; code: string; input?: string }[] = [
  { name: '基本運算與輸出', code: 'int main(){ int a=7,b=3; cout<<a+b<<endl<<a/b<<endl<<a%b; return 0; }' },
  { name: '一維陣列 + 初始化列表', code: 'int main(){ int a[]={5,3,9}; cout<<a[0]+a[1]+a[2]; return 0; }' },
  { name: '二維陣列', code: 'int main(){ int m[2][3]={{1,2,3},{4,5,6}}; cout<<m[1][2]<<m[0][0]; return 0; }' },
  { name: 'vector 基本操作', code: 'int main(){ vector<int> v; v.push_back(3); v.push_back(1); v.insert(0,9); v.erase(2,1); cout<<v.size()<<v[0]<<v[1]; return 0; }' },
  { name: '二維 vector 矩陣', code: 'int main(){ vector<vector<int>> g(2, vector<int>(2,-1)); g[1][1]=7; cout<<g[0][0]<<g[1][1]; return 0; }' },
  { name: '容器當值（回傳 + 賦值）', code: 'vector<int> f(){ vector<int> v; v.push_back(4); return v; } int main(){ vector<int> r=f(); r.push_back(5); cout<<r.size()<<r[0]; return 0; }' },
  { name: 'map / set / unordered_map', code: 'int main(){ map<string,int> m; m[' + Q + 'a' + Q + ']=1; m[' + Q + 'b' + Q + ']=2; set<int> s; s.insert(3); s.insert(3); cout<<m.size()<<s.size()<<m.count(' + Q + 'a' + Q + '); return 0; }' },
  { name: 'struct 與 pair', code: 'struct P{int x; int y;}; int main(){ P p; p.x=1; p.y=2; pair<int,int> q=make_pair(3,4); cout<<p.x+p.y+q.first+q.second; return 0; }' },
  { name: 'sort / greater / reverse / lower_bound', code: 'int main(){ vector<int> v; v.push_back(3); v.push_back(1); v.push_back(2); sort(v, greater<int>()); cout<<v[0]<<v[2]; reverse(v); cout<<v[0]; int a[3]={1,3,5}; cout<<lower_bound(a,4); return 0; }' },
  { name: 'sort + 自訂 cmp（含比較次數）', code: 'int cmp(int a,int b){ return a<b; } int main(){ int a[5]={5,4,3,2,1}; sort(a,5,cmp); cout<<a[0]<<a[4]; return 0; }' },
  { name: 'tree / bst / priority_queue', code: 'int main(){ tree<int> t(3); t[1]=1; t[2]=2; t[3]=3; bst<int> b; b.insert(5); b.insert(3); priority_queue<int> pq; pq.push(2); pq.push(9); cout<<t[3]<<b.size()<<pq.top(); return 0; }' },
  { name: 'do-while', code: 'int main(){ int i=0,s=0; do{ s+=i; i++; }while(i<4); cout<<s; return 0; }' },
  { name: 'range-for（值 vs 引用）', code: 'int main(){ int a[3]={1,2,3}; for(int x:a) x=x*2; for(int& x:a) x=x*2; cout<<a[0]<<a[2]; return 0; }' },
  { name: 'string 方法', code: 'int main(){ string s=' + Q + 'hello' + Q + '; s += ' + Q + '!' + Q + '; cout<<s.substr(1,3)<<s.find(' + Q + 'l' + Q + ')<<s.size()<<s.compare(' + Q + 'hello!' + Q + '); return 0; }' },
  { name: '字元函式 + 字元算術', code: 'int main(){ string s=' + Q + 'aZ9' + Q + '; for(char c:s) cout<<(char)toupper(c)<<isdigit(c); cout<<(char)(s[0]+1)<<(s[1]-32); return 0; }' },
  { name: 'stoi / to_string / 進制', code: 'int main(){ cout<<stoi(' + Q + '42x' + Q + ')<<stoi(' + Q + 'ff' + Q + ',0,16)<<to_string(7)+to_string(stod(' + Q + '1.5' + Q + ')); return 0; }' },
  { name: 'C 風格轉型', code: 'int main(){ double d=2.9; cout<<(int)d<<(char)65<<(long long)d<<(double)1/2; return 0; }' },
  { name: '三目 / INT_MAX / min({...})', code: 'int main(){ int a=3,b=9,c=5; cout<<(a>b?a:b)<<INT_MAX<<min({a,b,c}); return 0; }' },
  { name: 'typedef / using / size_t', code: 'typedef long long ll; using ull = long long; int main(){ ll x=5; ull y=6; size_t n=3; cout<<x+y<<n; return 0; }' },
  { name: '#define', code: ['#define N 4', 'int main(){ int a[N]; a[3]=7; cout<<a[3]<<N; return 0; }'].join(NL) },
  { name: 'sizeof / memset / fill / assign', code: 'int main(){ int a[3]={1,2,3}; memset(a,0,sizeof(a)); vector<int> v; v.assign(3,5); fill(v.begin(),v.end(),8); cout<<a[0]<<v[0]<<sizeof(a); return 0; }' },
  { name: 'cin 鏈式讀入', code: 'int main(){ int n; string s; double d; cin>>n>>s>>d; cout<<n<<s<<d; return 0; }', input: '3 abc 1.5' },
  { name: 'while (cin >> x) 讀到 EOF', code: 'int main(){ int x,s=0,c=0; while(cin>>x){ s+=x; c++; } cout<<s<<c; return 0; }', input: '1 2 3' },
  { name: 'getline 的經典陷阱', code: 'int main(){ int n; string s; cin>>n; getline(cin,s); cout<<n<<s.size(); return 0; }', input: '3' + NL + 'hello world' },
  { name: 'getline + cin.ignore', code: 'int main(){ string s; getline(cin,s); cout<<s.size(); cin.ignore(); getline(cin,s); cout<<s; return 0; }', input: 'abc' + NL + 'def' },
  { name: 'cin 讀不足（明確錯誤）', code: 'int main(){ int a,b; cin>>a>>b; return 0; }', input: '' },
  { name: '函式：引用 / const& / 陣列形參 / 遞迴', code: 'int f(int& x){ x++; return x; } int g(const vector<int>& v){ return v.size(); } void h(int a[]){ a[0]=9; } int fib(int n){ return n<=1?n:fib(n-1)+fib(n-2); } int main(){ int x=1; vector<int> v; v.push_back(1); v.push_back(2); int a[2]={1,2}; cout<<f(x)<<g(v); h(a); cout<<a[0]<<fib(4); return 0; }' },
  { name: '同名函式定義兩次（多載 → 明確報錯）', code: 'int f(int x){ return x; } int f(double x){ return 1; } int main(){ return 0; }' },
  { name: '執行期錯誤：除以 0', code: 'int main(){ int a=1,b=0; cout<<a/b; return 0; }' },
  { name: '執行期錯誤：陣列越界', code: 'int main(){ int a[2]; a[5]=1; return 0; }' },
  { name: '501x501 記憶化 DP（摘要要截斷）', code: 'vector<vector<int>> memo(501, vector<int>(501, -1)); int f(int i,int j){ if(i==0) return j; if(j==0) return i; if(memo[i][j]!=-1) return memo[i][j]; return memo[i][j]=min(f(i-1,j),f(i,j-1))+1; } int main(){ cout<<f(3,4); return 0; }' },
]

// ---- 摘要：把每一帧壓成一行，最後整體雜湊 ----
function digestList(kind: string, arr: any[], depth: number): string {
  const head = arr.slice(0, CAP).map((x) => digestCell(x, depth + 1))
  return kind + '[' + head.join(',') + (arr.length > CAP ? ',…' + arr.length : '') + ']'
}
function digestBst(node: any, depth: number): string {
  if (!node || depth > 3) return ''
  return digestBst(node.left, depth + 1) + String(node.value) + ' ' + digestBst(node.right, depth + 1)
}
function digestCell(c: any, depth = 0): string {
  if (!c || depth > 3) return '?'
  switch (c.kind) {
    case 'scalar': return c.type + ':' + String(c.value)
    case 'ref': return 'ref(' + c.target.name + ')'
    case 'array': case 'vector': return digestList(c.kind, c.cells, depth)
    case 'deque': case 'stack': case 'queue': case 'pqueue': case 'set': return digestList(c.kind, c.items, depth)
    case 'pair': return 'pair(' + digestCell(c.first, depth + 1) + ',' + digestCell(c.second, depth + 1) + ')'
    case 'struct': return 'struct' + c.structName + '{' + c.members.map((m: any) => m.name + '=' + digestCell(m.cell, depth + 1)).join(',') + '}'
    case 'map': case 'umap': return c.kind + '{' + c.entries.slice(0, CAP).map((e: any) => digestCell(e.key, depth + 1) + '=>' + digestCell(e.value, depth + 1)).join(',') + (c.entries.length > CAP ? ',…' + c.entries.length : '') + '}'
    case 'tree': return digestList('tree', c.nodes.slice(1), depth)
    case 'bst': return 'bst(' + digestBst(c.root, depth) + ')'
    default: return c.kind
  }
}
function digestCall(n: any, depth = 0): string {
  if (!n || depth > 6) return ''
  return n.label + (n.returned ? '*' : '') + '[' + n.children.map((c: any) => digestCall(c, depth + 1)).join(',') + ']'
}
function digestFrame(s: any): string {
  const vars = s.vars.map((v: any) => v.name + (v.alias ? '&' : '') + '=' + digestCell(v.cell)).join(';')
  const touch = (list: any[]) => (list || []).map((r: any) => r.name + '@' + r.path.join(',')).sort().join('+')
  const sort = s.sortInfo ? ' SORT[' + s.sortInfo.name + ',' + s.sortInfo.comparisons + ',' + s.sortInfo.warned + ']' : ''
  const cond = s.condition ? ' COND[' + s.condition.text + '=' + s.condition.result + ']' : ''
  return s.step + '|' + s.line + '|out=' + String(s.output ?? '') + '|vars=' + vars + '|r=' + touch(s.reads) + '|w=' + touch(s.writes) + '|j=' + touch(s.judges) + sort + cond + '|call=' + digestCall(s.callTree) + (s.error ? '|ERR=' + s.error : '')
}
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
function runCase(c: { name: string; code: string; input?: string }) {
  let snaps: any[] = []
  try {
    for (const s of run(parse(c.code), { input: c.input ?? '' })) snaps.push(s)
  } catch (e) {
    const msg = 'PARSE: ' + (e as Error).message
    return { frames: 0, out: '', err: msg, sha: hash(msg) }
  }
  const last = snaps[snaps.length - 1]
  return {
    frames: snaps.length,
    out: last ? String(last.output ?? '') : '',
    err: last && last.error ? String(last.error) : '',
    sha: hash(snaps.map(digestFrame).join(NL)),
  }
}

// ---- 跑：比對 golden（沒有 golden 或 UPDATE_GOLDEN=1 就重錄）----
let pass = 0
let fail = 0
const results = CASES.map((c) => ({ c, r: runCase(c) }))
const lines = results.map(({ c, r }) => c.name + '\t' + r.frames + '\t' + r.sha + '\t' + r.err.replace(/[\t\n]/g, ' '))
const text = ['# 特性化 golden（v0.10.x 錄製）—— 重構不該改變行為；刻意改變請 UPDATE_GOLDEN=1 重錄並在 commit 說明'].concat(lines).join(NL) + NL
if (UPDATE || !existsSync(GOLDEN)) {
  mkdirSync('test/_golden', { recursive: true })
  writeFileSync(GOLDEN, text)
  console.log('已寫入 golden：' + GOLDEN + '（' + CASES.length + ' 個案例）')
} else {
  const want = new Map<string, string>()
  for (const line of readFileSync(GOLDEN, 'utf8').split(NL)) {
    // 註解用 ' # '（井號加空格）；案例名稱可能是 '#define'，不能只判斷 '#' 開頭
    if (!line || line.startsWith('# ')) continue
    const parts = line.split('\t')
    want.set(parts[0], parts.slice(1).join('\t'))
  }
  for (const { c, r } of results) {
    const got = r.frames + '\t' + r.sha + '\t' + r.err.replace(/[\t\n]/g, ' ')
    const w = want.get(c.name)
    if (w === got) { pass++; continue }
    fail++
    if (w === undefined) console.log('FAIL ' + c.name + ' | golden 裡沒有這個案例（新加的？請 UPDATE_GOLDEN=1 重錄）')
    else console.log('FAIL ' + c.name + ' | 行為變了！\n  golden: ' + w + '\n  現在  : ' + got + '\n  （如果是刻意的，UPDATE_GOLDEN=1 重錄並在 commit message 說明）')
  }
  for (const name of want.keys()) if (!CASES.some((c) => c.name === name)) { fail++; console.log('FAIL ' + name + ' | golden 有、但 CASES 裡不見了（案例被刪掉？）') }
}
console.log('==== interp-golden-test: ' + pass + ' 通過, ' + fail + ' 失敗（共 ' + CASES.length + ' 個案例）====')
if (fail > 0) process.exit(1)