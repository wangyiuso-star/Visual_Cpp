import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
const code = '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  int n = 5;\n  vector<pair<int,int>> g[5];\n  g[0].push_back(make_pair(1, 2));\n  g[0].push_back(make_pair(2, 4));\n  g[1].push_back(make_pair(2, 1));\n  g[1].push_back(make_pair(3, 7));\n  g[2].push_back(make_pair(4, 3));\n  g[3].push_back(make_pair(4, 1));\n  int dist[5];\n  bool done[5];\n  for (int i = 0; i < n; i++) { dist[i] = 1000000; done[i] = false; }\n  dist[0] = 0;\n  for (int t = 0; t < n; t++) {\n    int u = -1;\n    for (int i = 0; i < n; i++)\n      if (!done[i] && (u == -1 || dist[i] < dist[u])) u = i;\n    if (u == -1) break;\n    done[u] = true;\n    for (int j = 0; j < g[u].size(); j++) {\n      int v = g[u][j].first;\n      int w = g[u][j].second;\n      if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;\n    }\n  }\n  for (int i = 0; i < n; i++) cout << dist[i] << " ";\n  cout << endl;\n  return 0;\n}\n'
const p = parse(code)
let last: any = null
for (const s of run(p)) last = s
const got = last.output.replace(/\s+/g, ' ').trim()
const want = '0 2 3 9 6'
console.log('Dijkstra =', JSON.stringify(last.output), '| want', JSON.stringify(want), '|', got === want ? 'PASS' : 'FAIL')
if (got !== want) process.exit(1)
