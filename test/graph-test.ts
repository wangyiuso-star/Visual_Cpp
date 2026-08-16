import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
const code = '#include <bits/stdc++.h>\nusing namespace std;\n\nvector<int> g[6];\nbool vis[6];\n\nvoid dfs(int u) {\n  vis[u] = true;\n  cout << u << " ";\n  for (int j = 0; j < g[u].size(); j++) {\n    int v = g[u][j];\n    if (!vis[v]) dfs(v);\n  }\n}\n\nint main() {\n  g[0].push_back(1); g[0].push_back(2);\n  g[1].push_back(0); g[1].push_back(3);\n  g[2].push_back(0); g[2].push_back(4);\n  g[3].push_back(1); g[3].push_back(5);\n  g[4].push_back(2);\n  g[5].push_back(3);\n  dfs(0);\n  cout << endl;\n  return 0;\n}\n'
const p = parse(code)
let last: any = null
for (const s of run(p)) last = s
const got = last.output.replace(/\s+/g, ' ').trim()
const want = '0 1 3 5 2 4'
console.log('DFS output =', JSON.stringify(last.output), '| want', JSON.stringify(want), '|', got === want ? 'PASS' : 'FAIL')
// 确认 g 的 cell 形态是 array-of-vector（图视图识别依据）
const gv = last.vars.find((x: any) => x.name === 'g')
console.log('g cell kind =', gv.cell.kind, '| elemType =', gv.cell.elemType.kind, '| N =', gv.cell.cells.length)
if (got !== want) process.exit(1)
