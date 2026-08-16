import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'

let pass = 0, fail = 0
function eq(actual: string, expected: string, name: string) {
  const a = actual.replace(/\s+/g, ' ').trim()
  const e = expected.replace(/\s+/g, ' ').trim()
  if (a === e) { pass++; console.log('PASS  ' + name) }
  else { fail++; console.log('FAIL  ' + name + '  got=' + JSON.stringify(actual) + ' want=' + JSON.stringify(expected)) }
}
function runAll(code: string, opts?: any): any[] {
  const p = parse(code)
  return [...run(p, opts)]
}
function cellVal(snap: any, name: string): string {
  const v = (snap.vars as any[]).find((x) => x.name === name)
  if (!v) return '<absent>'
  const c = v.cell
  if (c.kind === 'array' || c.kind === 'vector') return c.cells.map((x: any) => x.value).join(',')
  if (c.kind === 'stack' || c.kind === 'queue' || c.kind === 'pqueue') return c.items.map((x: any) => x.value).join(',')
  if (c.kind === 'scalar') return String(c.value)
  return '<' + c.kind + '>'
}
function hasState(snaps: any[], name: string, want: string): boolean {
  return snaps.some((s) => cellVal(s, name) === want)
}

// 1. 快照隔离（核心）：初始化数组，历史快照不能全变成终值
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n int a[3] = {0,0,0};\n a[0]=1;\n a[0]=2;\n a[1]=5;\n cout<<a[0]<<a[1]<<a[2]<<endl;\n}\n'
  const snaps = runAll(code)
  eq(hasState(snaps, 'a', '1,0,0') ? 'yes' : 'no', 'yes', '隔离：存在 a=[1,0,0] 历史快照')
  eq(hasState(snaps, 'a', '2,0,0') ? 'yes' : 'no', 'yes', '隔离：存在 a=[2,0,0] 历史快照')
  eq(hasState(snaps, 'a', '2,5,0') ? 'yes' : 'no', 'yes', '隔离：存在 a=[2,5,0] 历史快照')
  eq(snaps[snaps.length - 1].output, '250', '数组最终输出')
}

// 2. vector push_back / pop_back 隔离 + 最终
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n vector<int> v;\n v.push_back(3);\n v.push_back(1);\n v.push_back(4);\n v.pop_back();\n cout<<v.size()<<endl;\n}\n'
  const snaps = runAll(code)
  eq(hasState(snaps, 'v', '3,1,4') ? 'yes' : 'no', 'yes', 'vector 存在 [3,1,4] 历史')
  eq(hasState(snaps, 'v', '3,1') ? 'yes' : 'no', 'yes', 'vector 存在 [3,1] 历史（pop_back 后）')
  eq(snaps[snaps.length - 1].output, '2', 'vector size 输出')
}

// 3. stack
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n stack<int> s;\n s.push(10);\n s.push(20);\n cout<<s.top()<<endl;\n s.pop();\n cout<<s.top()<<endl;\n}\n'
  const snaps = runAll(code)
  eq(snaps[snaps.length - 1].output, '20 10', 'stack top/pop')
}

// 4. queue
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n queue<int> q;\n q.push(1);\n q.push(2);\n q.push(3);\n q.pop();\n cout<<q.front()<<endl;\n cout<<q.back()<<endl;\n}\n'
  const snaps = runAll(code)
  eq(snaps[snaps.length - 1].output, '2 3', 'queue front/back')
}

// 5. priority_queue（大根堆）
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n priority_queue<int> pq;\n pq.push(3);\n pq.push(9);\n pq.push(5);\n cout<<pq.top()<<endl;\n pq.pop();\n cout<<pq.top()<<endl;\n}\n'
  const snaps = runAll(code)
  eq(snaps[snaps.length - 1].output, '9 5', 'pqueue 大根堆 top/pop')
}

// 6. bst
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n bst<int> t;\n t.insert(5);\n t.insert(3);\n t.insert(7);\n t.insert(1);\n t.insert(4);\n cout<<t.find(4)<<" "<<t.find(10)<<" "<<t.size()<<endl;\n}\n'
  const snaps = runAll(code)
  eq(snaps[snaps.length - 1].output, 'true false 5', 'bst insert/find/size')
}

// 7. tree（1 基下标）
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n tree<int> t(3);\n t[1]=10;\n t[2]=20;\n t[3]=30;\n cout<<t[1]+t[2]+t[3]<<endl;\n}\n'
  const snaps = runAll(code)
  eq(snaps[snaps.length - 1].output, '60', 'tree 下标读写')
}

// 8. 递归 fib：输出 + 调用树非根节点均已 returned
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint fib(int n){\n if(n<=1) return n;\n return fib(n-1)+fib(n-2);\n}\nint main(){\n cout<<fib(6)<<endl;\n}\n'
  const snaps = runAll(code)
  eq(snaps[snaps.length - 1].output, '8', 'fib(6) 输出')
  const tree = snaps[snaps.length - 1].callTree
  let nodes = 0, returnedAll = true
  const walk = (n: any) => { if (n.id !== 0) { nodes++; if (!n.returned) returnedAll = false } n.children.forEach(walk) }
  walk(tree)
  eq(returnedAll && nodes > 3 ? 'yes' : 'no', 'yes', '递归调用树非根节点均已 returned')
}

// 9. 全局变量从函数内写入 + 隔离
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint g=0;\nvoid setg(int x){ g=x; }\nint main(){\n setg(7);\n cout<<g<<endl;\n}\n'
  const snaps = runAll(code)
  eq(hasState(snaps, 'g', '7') ? 'yes' : 'no', 'yes', '全局 g=7 历史存在')
  eq(snaps[snaps.length - 1].output, '7', '全局写入最终输出')
}

// 10. 二维数组 + 嵌套初始化
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n int m[2][3]={{1,2,3},{4,5,6}};\n int s=0;\n for(int i=0;i<2;i++) for(int j=0;j<3;j++) s+=m[i][j];\n cout<<s<<endl;\n}\n'
  const snaps = runAll(code)
  eq(snaps[snaps.length - 1].output, '21', '二维数组求和')
}

// 11. vector<vector<int>> 二维
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n vector<vector<int>> g(3);\n g[0].push_back(1);\n g[0].push_back(2);\n g[1].push_back(3);\n cout<<g[0].size()<<" "<<g[1].size()<<" "<<g[2].size()<<endl;\n}\n'
  const snaps = runAll(code)
  eq(snaps[snaps.length - 1].output, '2 1 0', 'vector<vector> push_back')
}

// 12. cin（多行输入）
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n int n;\n cin>>n;\n int a[100];\n for(int i=0;i<n;i++) cin>>a[i];\n int sum=0;\n for(int i=0;i<n;i++) sum+=a[i];\n cout<<sum<<endl;\n}\n'
  const snaps = runAll(code, { input: '5\n1 2 3 4 5\n' })
  eq(snaps[snaps.length - 1].output, '15', 'cin 多行输入求和')
}

console.log('\n==== ' + pass + ' 通过, ' + fail + ' 失败 ====')
if (fail > 0) process.exit(1)
