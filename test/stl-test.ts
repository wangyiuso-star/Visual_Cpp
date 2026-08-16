import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
let fail = 0
function eq(a: string, b: string, n: string) { const A=a.replace(/\s+/g,' ').trim(), B=b.replace(/\s+/g,' ').trim(); if(A===B){console.log('PASS  '+n)}else{fail++;console.log('FAIL  '+n+' got='+JSON.stringify(a)+' want='+JSON.stringify(b))} }
function out(code: string): string { const p = parse(code); let l: any = null; for (const s of run(p)) l = s; return l.output }

// deque
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n deque<int> d;\n d.push_back(2);\n d.push_front(1);\n d.push_back(3);\n cout<<d.front()<<" "<<d.back()<<endl;\n d.pop_front();\n cout<<d.front()<<" "<<d.size()<<endl;\n}\n'), '1 3 2 2', 'deque push/pop/front/back')

// sort
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n int a[5] = {5,3,1,4,2};\n sort(a, 5);\n for(int i=0;i<5;i++) cout<<a[i]<<" ";\n cout<<endl;\n}\n'), '1 2 3 4 5', 'sort')

// reverse
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n int a[5] = {1,2,3,4,5};\n reverse(a, 5);\n for(int i=0;i<5;i++) cout<<a[i]<<" ";\n cout<<endl;\n}\n'), '5 4 3 2 1', 'reverse')

// lower_bound
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n int a[5] = {1,3,5,7,9};\n cout<<lower_bound(a, 5, 6)<<endl;\n cout<<lower_bound(a, 5, 1)<<endl;\n}\n'), '3 0', 'lower_bound')

// swap 标量
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n int x=1, y=2;\n swap(x, y);\n cout<<x<<" "<<y<<endl;\n}\n'), '2 1', 'swap 标量')

// swap 数组元素
eq(out('#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n int a[3] = {1,2,3};\n swap(a[0], a[2]);\n cout<<a[0]<<a[1]<<a[2]<<endl;\n}\n'), '321', 'swap 数组元素')

console.log(fail === 0 ? '==== 全部通过 ====' : '==== 有失败 ====')
if (fail > 0) process.exit(1)
