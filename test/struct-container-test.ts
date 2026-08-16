import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
let fail = 0
function eq(a: string, b: string, n: string) { const A=a.replace(/\s+/g,' ').trim(), B=b.replace(/\s+/g,' ').trim(); if(A===B){console.log('PASS  '+n)}else{fail++;console.log('FAIL  '+n+' got='+JSON.stringify(a)+' want='+JSON.stringify(b))} }
function out(code: string): string { const p = parse(code); let l: any = null; for (const s of run(p)) l = s; return l.output }

// array 存 struct
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nstruct Point {\n int x;\n int y;\n};\nint main(){\n Point arr[3];\n arr[0].x = 1;\n arr[1].y = 2;\n cout << arr[0].x + arr[1].y << endl;\n}\n'), '3', 'array 存 struct')

// tree 存 struct
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nstruct Point {\n int x;\n int y;\n};\nint main(){\n tree<Point> t(3);\n t[1].x = 5;\n t[2].y = 7;\n cout << t[1].x + t[2].y << endl;\n}\n'), '12', 'tree 存 struct')

// vector 存 struct
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nstruct Point {\n int x;\n};\nint main(){\n vector<Point> v(2);\n v[0].x = 3;\n cout << v[0].x << endl;\n}\n'), '3', 'vector 存 struct')

// array 存 struct + 初始化
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nstruct P { int v; };\nint main(){\n P a[2] = {{1}, {2}};\n cout << a[0].v << a[1].v << endl;\n}\n'), '12', 'array 存 struct + 初始化')

console.log(fail === 0 ? '==== 全部通过 ====' : '==== 有失败 ====')
if (fail > 0) process.exit(1)
