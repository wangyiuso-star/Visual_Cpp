import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'

// 多行输入（含换行）
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n  int n;\n  cin >> n;\n  int a[100];\n  for (int i = 0; i < n; i++) cin >> a[i];\n  int sum = 0;\n  for (int i = 0; i < n; i++) sum += a[i];\n  cout << sum << endl;\n  return 0;\n}\n'
  const p = parse(code)
  let last: any = null
  for (const s of run(p, { input: '5\n1 2 3 4 5\n' })) last = s
  console.log('多行输入 output =', JSON.stringify(last.output), 'error =', last.error || '(none)', '| 期望 15')
}
