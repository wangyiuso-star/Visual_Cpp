import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
let fail = 0
function eq(a: string, b: string, n: string) { const A = a.replace(/\s+/g,' ').trim(), B = b.replace(/\s+/g,' ').trim(); if (A===B) console.log('PASS  '+n); else { fail++; console.log('FAIL  '+n+' got='+JSON.stringify(a)+' want='+JSON.stringify(b)) } }
function out(code: string): string { const p = parse(code); let l: any = null; for (const s of run(p)) l = s; return l.output }
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n vector<pair<int,int>> g[3];\n g[0].push_back(make_pair(1, 5));\n g[0].push_back(make_pair(2, 7));\n cout << g[0][0].first << " " << g[0][0].second << endl;\n cout << g[0].size() << endl;\n}\n'
  eq(out(code), '1 5 2', 'vector<pair> push_back + member 读')
}
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n pair<int,int> p = make_pair(9, 8);\n cout << p.first << " " << p.second << endl;\n p.first = 11;\n cout << p.first << " " << p.second << endl;\n}\n'
  eq(out(code), '9 8 11 8', 'pair 初始化 + member 写')
}
console.log(fail === 0 ? '==== 全部通过 ====' : '==== 有失败 ====')
if (fail > 0) process.exit(1)
