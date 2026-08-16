import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
let fail = 0
function eq(a: string, b: string, n: string) { const A=a.replace(/\s+/g,' ').trim(), B=b.replace(/\s+/g,' ').trim(); if(A===B){console.log('PASS  '+n)}else{fail++;console.log('FAIL  '+n+' got='+JSON.stringify(a)+' want='+JSON.stringify(b))} }
function out(code: string): string { const p = parse(code); let l: any = null; for (const s of run(p)) l = s; return l.output }

// 用户代码：vector<Point> push_back({1,2,3})
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nstruct Point { int x; int y; int i; int j; int k; int a; int b; int c; };\nint main(){\n vector<Point> v;\n for(int i=0;i<6;i++) v.push_back({1,2,3});\n cout << v.size() << endl;\n cout << v[0].x << " " << v[0].y << " " << v[0].i << " " << v[0].c << endl;\n}\n'), '6 1 2 3 0', 'vector<struct> push_back({...})')

console.log(fail === 0 ? '==== 全部通过 ====' : '==== 有失败 ====')
if (fail > 0) process.exit(1)
