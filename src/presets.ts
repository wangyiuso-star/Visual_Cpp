export interface Preset {
  name: string
  code: string
}

export const PRESETS: Preset[] = [
  {
    name: 'fib 递归',
    code: '#include <bits/stdc++.h>\nusing namespace std;\n\nint fib(int n) {\n  if (n <= 1) return n;\n  return fib(n - 1) + fib(n - 2);\n}\n\nint main() {\n  cout << fib(6) << endl;\n  return 0;\n}\n',
  },
  {
    name: '阶乘递归',
    code: '#include <bits/stdc++.h>\nusing namespace std;\n\nint fact(int n) {\n  if (n <= 1) return 1;\n  return n * fact(n - 1);\n}\n\nint main() {\n  cout << fact(5) << endl;\n  return 0;\n}\n',
  },
  {
    name: '二分查找',
    code: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  int a[10] = {1, 3, 5, 7, 9, 11, 13, 15, 17, 19};\n  int target = 13;\n  int l = 0, r = 9, ans = -1;\n  while (l <= r) {\n    int mid = (l + r) / 2;\n    if (a[mid] == target) { ans = mid; break; }\n    else if (a[mid] < target) l = mid + 1;\n    else r = mid - 1;\n  }\n  cout << ans << endl;\n  return 0;\n}\n',
  },
  {
    name: '二叉搜索树',
    code: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  bst<int> t;\n  t.insert(5); t.insert(3); t.insert(7);\n  t.insert(1); t.insert(4); t.insert(6); t.insert(8);\n  cout << t.find(4) << " " << t.find(10) << endl;\n  return 0;\n}\n',
  },
  {
    name: '全排列 dfs',
    code: '#include <bits/stdc++.h>\nusing namespace std;\n\nint n = 3;\nint a[10];\nbool used[10];\n\nvoid dfs(int k) {\n  if (k == n) {\n    for (int i = 0; i < n; i++) cout << a[i] << " ";\n    cout << endl;\n    return;\n  }\n  for (int i = 1; i <= n; i++) {\n    if (!used[i]) {\n      used[i] = true;\n      a[k] = i;\n      dfs(k + 1);\n      used[i] = false;\n    }\n  }\n}\n\nint main() {\n  dfs(0);\n  return 0;\n}\n',
  },
  {
    name: '归并排序',
    code: '#include <bits/stdc++.h>\nusing namespace std;\n\nint a[8] = {5, 3, 8, 6, 2, 7, 1, 4};\nint tmp[8];\n\nvoid mergeSort(int l, int r) {\n  if (l >= r) return;\n  int mid = (l + r) / 2;\n  mergeSort(l, mid);\n  mergeSort(mid + 1, r);\n  int i = l, j = mid + 1, k = l;\n  while (i <= mid && j <= r) {\n    if (a[i] <= a[j]) tmp[k++] = a[i++];\n    else tmp[k++] = a[j++];\n  }\n  while (i <= mid) tmp[k++] = a[i++];\n  while (j <= r) tmp[k++] = a[j++];\n  for (int p = l; p <= r; p++) a[p] = tmp[p];\n}\n\nint main() {\n  mergeSort(0, 7);\n  for (int i = 0; i < 8; i++) cout << a[i] << " ";\n  cout << endl;\n  return 0;\n}\n',
  },
  {
    name: 'set/map 容器',
    code: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  set<int> s;\n  s.insert(5); s.insert(1); s.insert(5);\n  cout << s.size() << " " << s.find(1) << endl;\n\n  map<string, int> cnt;\n  cnt["apple"] = 3;\n  cnt["banana"] = 2;\n  cnt["apple"] = 4;\n  cout << cnt["apple"] << " " << cnt["banana"] << endl;\n\n  unordered_map<int, int> um;\n  um[10] = 1; um[20] = 2;\n  cout << um[10] + um[20] << endl;\n  return 0;\n}\n',
  },
  {
    name: '图的 DFS',
    code: '#include <bits/stdc++.h>\nusing namespace std;\n\nvector<int> g[6];\nbool vis[6];\n\nvoid dfs(int u) {\n  vis[u] = true;\n  cout << u << " ";\n  for (int j = 0; j < g[u].size(); j++) {\n    int v = g[u][j];\n    if (!vis[v]) dfs(v);\n  }\n}\n\nint main() {\n  g[0].push_back(1); g[0].push_back(2);\n  g[1].push_back(0); g[1].push_back(3);\n  g[2].push_back(0); g[2].push_back(4);\n  g[3].push_back(1); g[3].push_back(5);\n  g[4].push_back(2);\n  g[5].push_back(3);\n  dfs(0);\n  cout << endl;\n  return 0;\n}\n',
  },
  {
    name: '带权图（有向）',
    code: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  vector<pair<int,int>> g[4];\n  g[0].push_back(make_pair(1, 5));\n  g[0].push_back(make_pair(2, 2));\n  g[1].push_back(make_pair(2, 1));\n  g[1].push_back(make_pair(3, 7));\n  g[2].push_back(make_pair(3, 3));\n  for (int i = 0; i < 4; i++)\n    for (int j = 0; j < g[i].size(); j++)\n      cout << i << "->" << g[i][j].first << ":" << g[i][j].second << " ";\n  cout << endl;\n  return 0;\n}\n',
  },
  {
    name: 'Dijkstra 最短路',
    code: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  int n = 5;\n  vector<pair<int,int>> g[5];\n  g[0].push_back(make_pair(1, 2));\n  g[0].push_back(make_pair(2, 4));\n  g[1].push_back(make_pair(2, 1));\n  g[1].push_back(make_pair(3, 7));\n  g[2].push_back(make_pair(4, 3));\n  g[3].push_back(make_pair(4, 1));\n\n  int dist[5];\n  for (int i = 0; i < n; i++) dist[i] = 1000000;\n  dist[0] = 0;\n\n  priority_queue<pair<int,int>, greater<pair<int,int>>> pq;\n  pq.push(make_pair(0, 0));\n  while (!pq.empty()) {\n    int d = pq.top().first;\n    int u = pq.top().second;\n    pq.pop();\n    if (d > dist[u]) continue;\n    for (int j = 0; j < g[u].size(); j++) {\n      int v = g[u][j].first;\n      int w = g[u][j].second;\n      if (dist[u] + w < dist[v]) {\n        dist[v] = dist[u] + w;\n        pq.push(make_pair(dist[v], v));\n      }\n    }\n  }\n  for (int i = 0; i < n; i++) cout << dist[i] << " ";\n  cout << endl;\n  return 0;\n}\n',
  },
]
