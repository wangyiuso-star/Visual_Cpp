import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'

// 调用树节点标签应显示「真实参数值」，而不是源码里的变量名
function labelsOf(code: string): string[] {
  let last: any = null
  for (const s of run(parse(code), {})) last = s
  const out: string[] = []
  const walk = (n: any) => {
    out.push(n.label)
    for (const c of n.children) walk(c)
  }
  walk(last.callTree)
  return out
}

{
  const code = [
    'int fib(int n) {',
    '  if (n <= 1) return n;',
    '  return fib(n - 1) + fib(n - 2);',
    '}',
    'int main() {',
    '  cout << fib(5) << endl;',
    '  return 0;',
    '}',
    '',
  ].join('\n')
  const labels = labelsOf(code)
  console.log('递归树标签:', labels.slice(0, 8).join(' , '))
  const bad = labels.filter((l) => l.indexOf('n - 1') >= 0 || l === 'fib(n)')
  const ok = bad.length === 0 && labels.indexOf('fib(5)') >= 0 && labels.indexOf('fib(3)') >= 0
  console.log(ok ? '==== 递归标签 PASS ====' : '==== 递归标签 FAIL: ' + bad.join(',') + ' ====')
}

{
  const code = [
    'void show(int x) { cout << x << "|"; }',
    'int main() {',
    '  int a = 7;',
    '  show(a);',
    '  show(3);',
    '  return 0;',
    '}',
    '',
  ].join('\n')
  const labels = labelsOf(code)
  console.log('普通调用标签:', labels.join(' , '))
  const ok = labels.indexOf('show(7)') >= 0 && labels.indexOf('show(3)') >= 0
  console.log(ok ? '==== 普通调用 PASS ====' : '==== 普通调用 FAIL ====')
}
