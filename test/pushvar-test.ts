import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
let fail = 0
function eq(a: string, b: string, n: string) { const A=a.replace(/\s+/g,' ').trim(), B=b.replace(/\s+/g,' ').trim(); if(A===B){console.log('PASS  '+n)}else{fail++;console.log('FAIL  '+n+' got='+JSON.stringify(a)+' want='+JSON.stringify(b))} }
function out(code: string): string { const p = parse(code); let l: any = null; for (const s of run(p)) l = s; return l.output }

// 用户代码：push_back(struct 变量)
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nstruct Point { int x; int y; int i; };\nint main(){\n vector<Point> v;\n Point P = {1,2,3};\n for(int i=0;i<6;i++) v.push_back(P);\n cout << v.size() << " " << v[0].x << " " << v[3].y << endl;\n}\n'), '6 1 2', 'push_back(struct 变量)')

// 回归：push_back 标量仍正常
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n vector<int> v;\n int x = 5;\n v.push_back(x);\n v.push_back(7);\n cout << v[0] << " " << v[1] << endl;\n}\n'), '5 7', 'push_back 标量')

console.log(fail === 0 ? '==== 全部通过 ====' : '==== 有失败 ====')
if (fail > 0) process.exit(1)
