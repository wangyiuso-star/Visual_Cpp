import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'

let pass = 0
let fail = 0
function run1(code: string) {
  try {
    let last: any = null
    for (const s of run(parse(code), {})) last = s
    return { err: String((last && last.error) ?? ''), out: String((last && last.output) ?? '') }
  } catch (e) { return { err: 'PARSE: ' + (e as Error).message, out: '' } }
}
function eq(name: string, code: string, want: string) {
  const r = run1(code)
  if (r.err) { fail++; console.log('FAIL ' + name + ' | 报错 ' + r.err); return }
  if (r.out === want) { pass++; return }
  fail++
  console.log('FAIL ' + name + ' | 期望 "' + want + '" 实际 "' + r.out + '"')
}
function err(name: string, code: string, wantPart: string) {
  const r = run1(code)
  if (r.err && r.err.indexOf(wantPart) >= 0) { pass++; return }
  fail++
  console.log('FAIL ' + name + ' | 期望错误含 "' + wantPart + '"，实际 ' + (r.err ? '"' + r.err + '"' : '没报错，输出 "' + r.out + '"'))
}
const S = (inner: string) => 'int main(){ string s="hello"; ' + inner + ' return 0; }'
const V = (inner: string) => 'int main(){ vector<int> v; v.push_back(10); v.push_back(20); v.push_back(30); ' + inner + ' return 0; }'

// ---------- ★ find：第二参 pos 以前被忽略（静默错误），这里锁住 ----------
eq('find 基本', S('cout<<s.find("l");'), '2')
eq('★ find(str, 4) 从索引 4 找 → 找不到回 -1', S('cout<<s.find("l",4);'), '-1')
eq('★ find(str, 3) → 3', S('cout<<s.find("l",3);'), '3')
eq('find 找不到 → -1', S('cout<<s.find("z");'), '-1')
eq('find 空字串 → 0', S('cout<<s.find("");'), '0')
eq('find 整个字串', S('cout<<s.find("hello");'), '0')
eq('rfind', S('cout<<s.rfind("l");'), '3')
eq('rfind(str, 2)', S('cout<<s.rfind("l",2);'), '2')
eq('rfind 找不到 → -1', S('cout<<s.rfind("z");'), '-1')

// ---------- substr（本来就有，两形式都验） ----------
eq('substr(pos)', S('cout<<s.substr(1);'), 'ello')
eq('substr(pos,len)', S('cout<<s.substr(1,3);'), 'ell')
eq('substr(0,0) 空', S('cout<<"["<<s.substr(0,0)<<"]";'), '[]')
eq('substr 长度超界会截断', S('cout<<s.substr(3,99);'), 'lo')

// ---------- at / front / back / empty ----------
eq('at', S('cout<<s.at(1);'), 'e')
eq('front / back', S('cout<<s.front()<<s.back();'), 'ho')
eq('empty 非空', S('cout<<s.empty();'), 'false')
eq('empty 空字串', 'int main(){ string s=""; cout<<s.empty(); return 0; }', 'true')
err('at 越界', S('cout<<s.at(9);'), '越界')

// ---------- 会改到字串本身的方法 ----------
eq('push_back', S('s.push_back(\'!\'); cout<<s;'), 'hello!')
eq('pop_back', S('s.pop_back(); cout<<s;'), 'hell')
eq('append', S('s.append("!!"); cout<<s;'), 'hello!!')
eq('insert(pos,str)', S('s.insert(1,"X"); cout<<s;'), 'hXello')
eq('insert(0,str)', S('s.insert(0,"X"); cout<<s;'), 'Xhello')
eq('erase(pos,len)', S('s.erase(1,2); cout<<s;'), 'hlo')
eq('erase(pos) 删到结尾', S('s.erase(2); cout<<s;'), 'he')
eq('replace(pos,len,str)', S('s.replace(1,3,"Y"); cout<<s;'), 'hYo')
eq('compare 相等', S('cout<<s.compare("hello");'), '0')
eq('compare 较大', S('cout<<s.compare("hell");'), '1')
eq('compare 较小', S('cout<<s.compare("hellp");'), '-1')

// ---------- vector ----------
eq('v.front / v.back', V('cout<<v.front()<<v.back();'), '1030')
eq('v.at', V('cout<<v.at(1);'), '20')
eq('v.resize 变大（补 0）', V('v.resize(5); cout<<v.size()<<v[3]<<v[4];'), '500')
eq('v.resize 变小', V('v.resize(1); cout<<v.size()<<v[0];'), '110')
eq('v.insert(pos,val)', V('v.insert(1,99); cout<<v.size()<<v[0]<<v[1]<<v[2];'), '4109920')
eq('v.erase(pos)', V('v.erase(1); cout<<v.size()<<v[0]<<v[1];'), '21030')
eq('v.erase(pos,len)', V('v.erase(0,2); cout<<v.size()<<v[0];'), '130')
err('v.at 越界', V('cout<<v.at(9);'), '越界')
err('v.erase 越界', V('v.erase(9);'), '越界')

// ---------- ctype 函式 ----------
eq('toupper', 'int main(){ cout<<toupper(\'a\'); return 0; }', 'A')
eq('tolower', 'int main(){ cout<<tolower(\'A\'); return 0; }', 'a')
eq('toupper 非字母不变', 'int main(){ cout<<toupper(\'1\'); return 0; }', '1')
eq('isdigit', 'int main(){ cout<<isdigit(\'7\')<<isdigit(\'a\'); return 0; }', 'truefalse')
eq('isalpha', 'int main(){ cout<<isalpha(\'a\')<<isalpha(\'7\'); return 0; }', 'truefalse')
eq('isupper / islower', 'int main(){ cout<<isupper(\'A\')<<islower(\'a\'); return 0; }', 'truetrue')
eq('isalnum', 'int main(){ cout<<isalnum(\'7\')<<isalnum(\'!\'); return 0; }', 'truefalse')
eq('isspace', 'int main(){ cout<<isspace(\' \')<<isspace(\'a\'); return 0; }', 'truefalse')

// ---------- 实用组合（Unit 6 的经典题） ----------
eq('把字串全部转大写',
  'int main(){ string s="Hello, World!"; string t=""; for (char c : s) t = t + toupper(c); cout<<t; return 0; }',
  'HELLO, WORLD!')
eq('统计数字字元个数',
  'int main(){ string s="a1b2c3"; int n=0; for (char c : s) if (isdigit(c)) n++; cout<<n; return 0; }',
  '3')
eq('判断回文（用 at/back）',
  'int main(){ string s="abcba"; int ok=1; for (int i=0;i<s.size()/2;i++) if (s[i]!=s[s.size()-1-i]) ok=0; cout<<ok; return 0; }',
  '1')
eq('find 找不到时用 -1 判断',
  'int main(){ string s="hello"; if (s.find("z") == -1) cout<<"not found"; return 0; }',
  'not found')

// ---------- 串接：在临时值上调用方法（以前报误导性的「非法的下标访问」） ----------
eq('s.substr(1).size() 串接', S('cout<<s.substr(1).size();'), '4')
eq('to_string(5).size() 串接', 'int main(){ cout<<to_string(5).size(); return 0; }', '1')
eq('s.substr(1).find("l") 串接', S('cout<<s.substr(1).find("l");'), '1')
eq('to_string(1234).substr(0,2) 串接', 'int main(){ cout<<to_string(1234).substr(0,2); return 0; }', '12')
eq('串接用在条件里', S('if (s.substr(0,3).size()==3) cout<<"ok";'), 'ok')
err('不能对临时值调用修改方法', "int main(){ to_string(5).push_back('1'); return 0; }", '不能对临时值调用修改方法')

// ---------- string::npos（= -1，与 find 一致） ----------
eq('find == string::npos', S('if (s.find("z")==string::npos) cout<<"nf";'), 'nf')
eq('find != string::npos', S('if (s.find("l")!=string::npos) cout<<"found";'), 'found')

// ---------- 收紧：append/insert/replace/compare 不接受单一字元 ----------
// C++ 里这四个方法只有「字串」重载（push_back 与 += 才是吃字元的），
// 工具以前会用 char 直接跑，会让学生学到编译不过的写法。
err('append 拒绝字元', S("s.append('!');"), '需要字串参数')
err('insert 拒绝字元', S("s.insert(1,'X');"), '需要字串参数')
err('replace 拒绝字元', S("s.replace(0,1,'X');"), '需要字串参数')
err('compare 拒绝字元', S("s.compare('a');"), '需要字串参数')
err('append 拒绝整数', 'int main(){ string s="a"; s.append(65); return 0; }', '需要字串参数')
eq('append 仍吃字串', S('s.append("!!"); cout<<s;'), 'hello!!')
eq('insert 仍吃字串', S('s.insert(1,"X"); cout<<s;'), 'hXello')
eq('replace 仍吃字串', S('s.replace(0,1,"X"); cout<<s;'), 'Xello')
eq('compare 仍吃字串', S('cout<<s.compare("hello");'), '0')
eq('append 配 to_string', 'int main(){ string s="n="; s.append(to_string(5)); cout<<s; return 0; }', 'n=5')
eq('保留：push_back 吃字元（C++ 合法）', S("s.push_back('!'); cout<<s;"), 'hello!')
eq('保留：+= 吃字元（C++ 合法）', S("s += 'x'; cout<<s;"), 'hellox')
eq('保留：find 吃字元（C++ 有此重载）', S("cout<<s.find('l');"), '2')

// ---------- substr 越界：以前静默回空字串，现在与 at 一致要报错 ----------
err('substr 起点越界', S('cout<<s.substr(99);'), '越界')
err('substr 起点越界(带长度)', S('cout<<s.substr(99,2);'), '越界')
eq('substr(pos == size) 合法 → 空字串', S('cout<<"["<<s.substr(5)<<"]";'), '[]')

console.log('==== strfunc-test: ' + pass + ' 通過, ' + fail + ' 失敗 ====')
if (fail > 0) process.exit(1)
