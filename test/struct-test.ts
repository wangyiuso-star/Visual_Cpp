import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
let fail = 0
function eq(a: string, b: string, n: string) { const A=a.replace(/\s+/g,' ').trim(), B=b.replace(/\s+/g,' ').trim(); if(A===B){console.log('PASS  '+n)}else{fail++;console.log('FAIL  '+n+' got='+JSON.stringify(a)+' want='+JSON.stringify(b))} }
function out(code: string): string { const p = parse(code); let l: any = null; for (const s of run(p)) l = s; return l.output }

// 1) struct 成员读写
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nstruct Point {\n int x;\n int y;\n};\nint main(){\n Point p;\n p.x = 3;\n p.y = 4;\n cout << p.x + p.y << endl;\n}\n'), '7', 'struct 成员读写')

// 2) struct 初始化
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nstruct Point {\n int x;\n int y;\n};\nint main(){\n Point p = {1, 2};\n cout << p.x << " " << p.y << endl;\n}\n'), '1 2', 'struct 初始化')

// 3) 引用传递 int&
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nvoid inc(int& x) {\n x = x + 1;\n}\nint main(){\n int a = 5;\n inc(a);\n cout << a << endl;\n}\n'), '6', '引用传递 int&')

// 4) 容器参数 vector 按值
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nint sum(vector<int> v) {\n int s = 0;\n for (int i = 0; i < v.size(); i++) s += v[i];\n return s;\n}\nint main(){\n vector<int> a(3);\n a[0] = 1; a[1] = 2; a[2] = 3;\n cout << sum(a) << endl;\n}\n'), '6', '容器参数 vector')

// 5) struct 参数（按值）
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nstruct P { int x; };\nint get(P p) { return p.x; }\nint main(){\n P p = {9};\n cout << get(p) << endl;\n}\n'), '9', 'struct 参数')

console.log(fail === 0 ? '==== 全部通过 ====' : '==== 有失败 ====')
if (fail > 0) process.exit(1)
