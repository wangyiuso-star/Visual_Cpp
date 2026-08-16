import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
let fail = 0
function eq(a: string, b: string, n: string) { const A=a.replace(/\s+/g,' ').trim(), B=b.replace(/\s+/g,' ').trim(); if(A===B){console.log('PASS  '+n)}else{fail++;console.log('FAIL  '+n+' got='+JSON.stringify(a)+' want='+JSON.stringify(b))} }
function out(code: string): string { const p = parse(code); let l: any = null; for (const s of run(p)) l = s; return l.output }

// struct 返回值
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nstruct Point {\n int x;\n int y;\n};\nPoint make(int a, int b) {\n Point p = {a, b};\n return p;\n}\nint main(){\n Point q = make(3, 4);\n cout << q.x << " " << q.y << endl;\n}\n'), '3 4', 'struct 返回值')

// struct 返回值 + 成员读写组合
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nstruct P { int x; };\nP f(P p) {\n p.x = p.x * 2;\n return p;\n}\nint main(){\n P a = {5};\n P b = f(a);\n cout << a.x << " " << b.x << endl;\n}\n'), '5 10', 'struct 返回值 + 参数')

console.log(fail === 0 ? '==== 全部通过 ====' : '==== 有失败 ====')
if (fail > 0) process.exit(1)
