import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
let fail = 0
function eq(a: string, b: string, n: string) { const A=a.replace(/\s+/g,' ').trim(), B=b.replace(/\s+/g,' ').trim(); if(A===B){console.log('PASS  '+n)}else{fail++;console.log('FAIL  '+n+' got='+JSON.stringify(a)+' want='+JSON.stringify(b))} }
function out(code: string, opts?: any): string { const p = parse(code); let l: any = null; for (const s of run(p, opts)) l = s; return l.output }

eq(out('#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n string s = "hello";\n cout << s.length() << endl;\n cout << s[1] << endl;\n s[0] = s[1];\n cout << s << endl;\n reverse(s);\n cout << s << endl;\n cout << s.substr(1, 2) << endl;\n cout << s.find("l") << endl;\n}\n'), '5 e eello ollee ll 1', 'string 全套')

eq(out('#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n string s;\n cin >> s;\n cout << s.size() << " " << s[0] << endl;\n}\n', { input: 'abc' }), '3 a', 'string cin + size + 下标')

console.log(fail === 0 ? '==== 全部通过 ====' : '==== 有失败 ====')
if (fail > 0) process.exit(1)
