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

function err(name: string, code: string, wantPart: string) {
  let last: any = null
  try {
    for (const s of run(parse(code), {})) last = s
  } catch (e) {
    const m = (e as Error).message
    if (m.indexOf(wantPart) >= 0) { pass++; return }
    fail++
    console.log('FAIL ' + name + ' | 解析期错误 "' + m + '" 不含 "' + wantPart + '"')
    return
  }
  const m = String((last && last.error) ?? '')
  if (m.indexOf(wantPart) >= 0) { pass++; return }
  fail++
  console.log('FAIL ' + name + ' | 期望错误含 "' + wantPart + '"，实际 ' + (m ? '"' + m + '"' : '没有报错'))
}

// 共享/别名语义：函数内写 a[i] 必须让调用方看见（真实 C++ 的数组退化为指针）
eq('int a[] 写入对调用方可见', 'void f(int a[], int n){ a[0]=99; } int main(){ int b[3]={1,2,3}; f(b,3); cout<<b[0]; return 0; }', '99')
eq('int a[10] 长度被忽略', 'int f(int a[10]){ a[1]=7; return a[1]; } int main(){ int b[2]={1,2}; cout<<f(b); return 0; }', '7')
eq('int a[] 读调用方数据', 'int sum(int a[], int n){ int s=0; for(int i=0;i<n;i++) s+=a[i]; return s; } int main(){ int b[3]={4,5,6}; cout<<sum(b,3); return 0; }', '15')
eq('2D 形参 int a[][3]', 'void f(int a[][3]){ a[1][2]=8; } int main(){ int m[2][3]; f(m); cout<<m[1][2]; return 0; }', '8')
// 建议书要求：int a[] 收到非数组实参要给清楚的错误（不是内部的「非法的下标访问」）
err('int a[] 收到 vector → 清楚报错', 'void f(int a[]){ a[0]=5; } int main(){ vector<int> v; v.push_back(1); f(v); return 0; }', 'int a[]')
err('int a[] 收到纯量 → 清楚报错', 'void f(int a[]){ a[0]=5; } int main(){ int x=1; f(x); return 0; }', 'int a[]')
eq('全局数组实参', 'int g[2]={1,2}; void f(int a[]){ a[1]=9; } int main(){ f(g); cout<<g[1]; return 0; }', '9')
eq('数组形参 + 递归', 'void fill(int a[], int i, int n){ if(i>=n) return; a[i]=i*i; fill(a,i+1,n); } int main(){ int b[4]; fill(b,0,4); cout<<b[0]<<b[1]<<b[2]<<b[3]; return 0; }', '0149')
eq('两个数组形参', 'void cp(int a[], int b[], int n){ for(int i=0;i<n;i++) b[i]=a[i]; } int main(){ int x[3]={7,8,9}, y[3]; cp(x,y,3); cout<<y[0]<<y[1]<<y[2]; return 0; }', '789')
// 回归：容器「按值」传参仍然不共享（不能被这次改动改掉）
eq('回归：vector 按值传参仍是拷贝', 'void f(vector<int> v){ v.push_back(9); } int main(){ vector<int> v; f(v); cout<<v.size(); return 0; }', '0')
eq('回归：int& 引用仍然有效', 'void inc(int& x){ x++; } int main(){ int a=5; inc(a); cout<<a; return 0; }', '6')
eq('回归：标量按值传参', 'void f(int x){ x=100; } int main(){ int a=1; f(a); cout<<a; return 0; }', '1')

console.log('==== arrayparam-test: ' + pass + ' 通过, ' + fail + ' 失败 ====')
if (fail > 0) process.exit(1)
