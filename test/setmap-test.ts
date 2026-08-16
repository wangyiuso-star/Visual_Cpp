import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'

let pass = 0, fail = 0
function eq(actual: string, expected: string, name: string) {
  const a = actual.replace(/\s+/g, ' ').trim()
  const e = expected.replace(/\s+/g, ' ').trim()
  if (a === e) { pass++; console.log('PASS  ' + name) }
  else { fail++; console.log('FAIL  ' + name + '  got=' + JSON.stringify(actual) + ' want=' + JSON.stringify(expected)) }
}
function out(code: string, opts?: any): { output: string; error?: string } {
  const p = parse(code)
  let last: any = null
  for (const s of run(p, opts)) last = s
  return { output: last.output, error: last.error }
}

// set：insert 排序去重 + find/count/size
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n set<int> s;\n s.insert(3);\n s.insert(1);\n s.insert(2);\n s.insert(2);\n cout<<s.size()<<" "<<s.find(2)<<" "<<s.count(4)<<endl;\n}\n'
  const r = out(code)
  eq(r.output, '3 true 0', 'set insert/find/count/size')
}

// set erase
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n set<int> s;\n s.insert(5);\n s.insert(1);\n s.insert(9);\n s.erase(5);\n cout<<s.size()<<" "<<s.find(5)<<endl;\n}\n'
  const r = out(code)
  eq(r.output, '2 false', 'set erase')
}

// map operator[] 插入/更新/读
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n map<string,int> m;\n m["a"]=1;\n m["b"]=2;\n m["a"]=10;\n cout<<m["a"]<<" "<<m["b"]<<" "<<m.size()<<endl;\n}\n'
  const r = out(code)
  eq(r.output, '10 2 2', 'map operator[] 插入/更新')
}

// map find/count/erase + 读不存在的键不插入
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n map<string,int> m;\n m["a"]=1;\n m["b"]=2;\n cout<<m.find("c")<<" "<<m.count("a")<<endl;\n m.erase("a");\n cout<<m.size()<<" "<<m["z"]<<" "<<m.size()<<endl;\n}\n'
  const r = out(code)
  eq(r.output, 'false 1 1 0 1', 'map find/count/erase + 读不存在的键不插入')
}

// map 频数统计 cnt[x]++
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n map<int,int> cnt;\n cnt[3]++;\n cnt[1]++;\n cnt[3]++;\n cnt[2]++;\n cout<<cnt[1]<<" "<<cnt[2]<<" "<<cnt[3]<<endl;\n}\n'
  const r = out(code)
  eq(r.output, '1 1 2', 'map 频数统计 cnt[x]++')
}

// unordered_map 基本
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n unordered_map<int,string> um;\n um[1]="one";\n um[2]="two";\n cout<<um[1]<<" "<<um[2]<<" "<<um.size()<<endl;\n}\n'
  const r = out(code)
  eq(r.output, 'one two 2', 'unordered_map 基本')
}

// map erase 后读同键（应不插入，返回默认）
{
  const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n map<int,int> m;\n m[7]=99;\n m.erase(7);\n cout<<m.size()<<" "<<m[7]<<endl;\n}\n'
  const r = out(code)
  eq(r.output, '0 0', 'map erase 后读同键不插入')
}

console.log('\n==== ' + pass + ' 通过, ' + fail + ' 失败 ====')
if (fail > 0) process.exit(1)
