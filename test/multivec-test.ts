import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
let fail = 0
function eq(a: string, b: string, n: string) { const A=a.replace(/\s+/g,' ').trim(), B=b.replace(/\s+/g,' ').trim(); if(A===B){console.log('PASS  '+n)}else{fail++;console.log('FAIL  '+n+' got='+JSON.stringify(a)+' want='+JSON.stringify(b))} }
function out(code: string): string { const p = parse(code); let l: any = null; for (const s of run(p)) l = s; return l.output }

// 1) vector<vector<int>> g(n, vector<int>(m)) 矩阵填充 + 隔离
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n vector<vector<int>> g(3, vector<int>(4));\n g[0][0]=7;\n cout<<g[0][0]<<" "<<g[1][0]<<" "<<g[2][0]<<endl;\n}\n'), '7 0 0', '矩阵填充 + 隔离')

// 2) int a[] = {...} 数组大小推断
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n int a[] = {1,2,3,4};\n int s=0;\n for(int i=0;i<4;i++) s+=a[i];\n cout<<s<<endl;\n}\n'), '10', '数组大小推断 int a[]')

// 3) vector<int> v(n, fill) 仍正常
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n vector<int> v(5, 9);\n cout<<v[0]<<" "<<v[4]<<endl;\n}\n'), '9 9', 'vector<int>(n, fill)')

// 4) vector<vector<int>> g(n) 空行仍正常
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n vector<vector<int>> g(2);\n g[0].push_back(3);\n cout<<g[0].size()<<" "<<g[1].size()<<endl;\n}\n'), '1 0', 'vector<vector>(n) 空行')

console.log(fail === 0 ? '==== 全部通过 ====' : '==== 有失败 ====')
if (fail > 0) process.exit(1)
