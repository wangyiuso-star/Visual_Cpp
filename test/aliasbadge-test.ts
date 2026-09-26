import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
import VariablesPanel from '../src/components/VariablesPanel'

// 鎖住兩件事：
//  (1) 引用/陣列形參的卡片要有「參數（別名）」徽章
//  (2) 寫入高亮**維持原樣**——只亮被指向的那個名字（決策 ①b：不改高亮）

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; return }
  fail++
  console.log('FAIL ' + name + (detail ? ' | ' + detail : ''))
}

function render(s: any) { return renderToStaticMarkup(createElement(VariablesPanel, { snapshot: s })) }

// 把 HTML 依卡片切開：{ name, hasAlias, writes }
function cards(html: string) {
  const out: { name: string; hasAlias: boolean; writes: number }[] = []
  for (const part of html.split('<div class="var ').slice(1)) {
    const name = (part.match(/class="caret">[^<]*<\/span>([A-Za-z_][A-Za-z0-9_]*)/) || [])[1] || '?'
    out.push({ name, hasAlias: part.indexOf('alias-badge') >= 0, writes: (part.match(/class="cell write"/g) || []).length })
  }
  return out
}
function scalarHasAliasBadge(html: string) {
  const i = html.indexOf('alias-badge')
  if (i < 0) return false
  const before = html.slice(Math.max(0, i - 400), i)
  return before.lastIndexOf('sv-name') > before.lastIndexOf('var-name')
}

// 找「在函式內」的那一帧（變數裡有 n）
function insideSnap(code: string, marker: string) {
  let hit: any = null
  for (const s of run(parse(code), {})) if (s.vars.some((v: any) => v.name === marker)) hit = s
  return hit
}

// ---------- 1. 區域陣列：參數卡片有徽章 ----------
{
  const snap = insideSnap('void doubleAll(int a[], int n){ for(int i=0;i<n;i++) a[i]=a[i]*2; }\nint main(){ int a[5]={1,2,3,4,5}; doubleAll(a,5); return 0; }\n', 'n')
  const cs = snap ? cards(render(snap)) : []
  const a = cs.find((c) => c.name === 'a')
  check('區域陣列形參：a 卡片有「參數（別名）」徽章', !!a && a.hasAlias, JSON.stringify(cs))
  check('區域陣列形參：面板只有一張 a（呼叫方那份不出現）', cs.filter((c) => c.name === 'a').length === 1)
}

// ---------- 2. 全域陣列：只有別名那張有徽章 ----------
{
  const snap = insideSnap('int g[3]={1,2,3};\nvoid f(int a[], int n){ a[0]=99; }\nint main(){ f(g,3); return 0; }\n', 'n')
  const cs = snap ? cards(render(snap)) : []
  const a = cs.find((c) => c.name === 'a')
  const g = cs.find((c) => c.name === 'g')
  check('全域陣列：a（別名）有徽章', !!a && a.hasAlias, JSON.stringify(cs))
  check('全域陣列：g（本體）沒有徽章', !!g && !g.hasAlias, JSON.stringify(cs))
  // ---- 決策 ①b：高亮不變，只亮 g ----
  check('★ 高亮維持原樣：亮的是 g', !!g && g.writes > 0, g ? 'g writes=' + g.writes : 'no g')
  check('★ 高亮維持原樣：a 不亮', !!a && a.writes === 0, a ? 'a writes=' + a.writes : 'no a')
}

// ---------- 3. 普通區域陣列（不是參數）：不該有徽章 ----------
{
  const snap = insideSnap('int main(){ int b[3]={1,2,3}; int n=3; return 0; }\n', 'n')
  const cs = snap ? cards(render(snap)) : []
  const b = cs.find((c) => c.name === 'b')
  check('普通區域陣列：沒有徽章', !!b && !b.hasAlias, JSON.stringify(cs))
}

// ---------- 4. int& 引用參數（純量欄）也有徽章 ----------
{
  const snap = insideSnap('void inc(int& x){ x++; }\nint main(){ int a=5; inc(a); return 0; }\n', 'x')
  const h = snap ? render(snap) : ''
  check('int& 純量引用參數：純量欄有別名徽章', !!h && scalarHasAliasBadge(h))
}

// ---------- 5. vector& 引用參數：卡片有徽章 ----------
{
  // main 的 v 也叫 v，所以不能取「最後一個含 v 的畫面」——直接找帶 alias 標記的那一帧
  let snap: any = null
  for (const s of run(parse('void add(vector<int>& v){ v.push_back(9); }\nint main(){ vector<int> v; add(v); return 0; }\n'), {})) {
    if (s.vars.some((x: any) => x.name === 'v' && x.alias)) snap = s
  }
  const cs = snap ? cards(render(snap)) : []
  check('vector& 引用參數：卡片有徽章', cs.some((c) => c.hasAlias), JSON.stringify(cs))
}

// ---------- 6. 徽章文字一致：四種別名都必須是「参数（别名）」----------
// 這條是為了鎖住一致性：以後不得有人為了「省空間」把純量欄偷偷改回短版。
{
  const programs = [
    'void inc(int& x){ x++; }\nint main(){ int a=5; inc(a); return 0; }\n',
    'void bang(string& s){ s = s + "!"; }\nint main(){ string s="hi"; bang(s); return 0; }\n',
    'void add(vector<int>& v){ v.push_back(9); }\nint main(){ vector<int> v; add(v); return 0; }\n',
    'void f(int a[]){ a[0]=1; }\nint main(){ int b[2]={1,2}; f(b); return 0; }\n',
  ]
  const texts: string[] = []
  let rail = 0
  let card = 0
  for (const code of programs) {
    let snap: any = null
    for (const s of run(parse(code), {})) if (s.vars.some((v: any) => v.alias)) snap = s
    if (!snap) continue
    const h = render(snap)
    const re = /class="alias-badge"[^>]*>\s*([^<]+?)\s*</g
    let m: RegExpExecArray | null = re.exec(h)
    while (m) {
      if (texts.indexOf(m[1].trim()) < 0) texts.push(m[1].trim())
      const before = h.slice(0, m.index)
      if (before.lastIndexOf('sv-name') > before.lastIndexOf('var-name')) rail++
      else card++
      m = re.exec(h)
    }
  }
  check('徽章文字只有一種：参数（别名）', texts.length === 1 && texts[0] === '参数（别名）', JSON.stringify(texts))
  check('四種別名都有徽章（1 純量欄 + 3 卡片）', rail === 1 && card === 3, 'rail=' + rail + ' card=' + card)
}

console.log('==== aliasbadge-test: ' + pass + ' 通過, ' + fail + ' 失敗 ====')
if (fail > 0) process.exit(1)
