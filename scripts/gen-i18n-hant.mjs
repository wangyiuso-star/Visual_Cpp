// 掃描 src/ 裡的中文字串，用 OpenCC 轉成繁體、再套「港台用語」覆蓋表，
// 產生 src/i18n-messages.ts（給執行期做「整句/片段」翻譯用）。
//
// 為什麼不是逐條手改 250 條報錯：報錯字串大量是「字面量 + 插值」拼出來的，
// 逐條改成 tf('...{0}...') 要動 250 個呼叫點，風險高；
// 改成「把靜態片段收集成對照表、顯示時做片段替換」，呼叫點一個都不用動，
// 而且之後新增報錯只要重跑這支腳本就會自動補上。
//
// 用法：node scripts/gen-i18n-hant.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import OpenCC from 'opencc-js'

const root = 'C:\\Users\\hy\\Desktop\\VisualCode'
const srcRoot = join(root, 'src')

const toTw = OpenCC.Converter({ from: 'cn', to: 'tw' })

// OpenCC 只做字形轉換（會留下「變量 / 數組 / 函數」這種大陸用語），
// 這裡再按香港／台灣的習慣用語覆蓋。順序很重要：長詞先換。
const TERMS = [
  ['堆棧', '堆疊'],
  ['棧', '堆疊'],
  ['變量', '變數'],
  ['數組', '陣列'],
  ['函數', '函式'],
  ['隊列', '佇列'],
  ['遞歸', '遞迴'],
  ['內存', '記憶體'],
  ['字符串', '字串'],
  ['字元串', '字串'],
  ['下標', '索引'],
  ['節點', '節點'],
  ['遍歷', '走訪'],
  ['默認', '預設'],
  ['支持', '支援'],
  ['用戶', '使用者'],
  ['數據', '資料'],
  ['類型', '型別'],
  ['聲明', '宣告'],
  ['賦值', '賦值'],
  ['調用', '呼叫'],
  ['內置', '內建'],
  ['編譯', '編譯'],
  ['指針', '指標'],
  ['返回', '回傳'],
  ['返回值', '回傳值'],
  ['循環', '迴圈'],
  ['打印', '列印'],
  ['總計', '總計'],
  ['運行', '執行'],
  ['加載', '載入'],
  ['保存', '儲存'],
  ['文件', '檔案'],
  ['屏幕', '螢幕'],
  ['鼠標', '滑鼠'],
  ['點擊', '點擊'],
  ['匹配', '符合'],
  ['斷言', '斷言'],
]

function hant(s) {
  let out = toTw(s)
  for (const [from, to] of TERMS) out = out.split(from).join(to)
  return out
}

const CJK = /[\u3400-\u9fff]/
const files = []
function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(tsx?|js)$/.test(e.name) && !p.endsWith('.d.ts')) files.push(p)
  }
}
walk(srcRoot)

// 抓 '...' "..." 與 `...`（模板字串只取 ${} 以外的靜態片段）
const LITERAL_RE = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g

const phrases = new Map() // 簡體片段 -> 繁體片段
for (const f of files) {
  if (f.includes('i18n-messages')) continue
  const src = readFileSync(f, 'utf8')
  const lines = src.split(/\r?\n/)
  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue
    LITERAL_RE.lastIndex = 0
    let m
    while ((m = LITERAL_RE.exec(line)) !== null) {
      const body = m[1] ?? m[2] ?? m[3] ?? ''
      if (!CJK.test(body)) continue
      // 模板字串切出靜態片段
      const pieces = m[3] !== undefined ? body.split(/\$\{[^}]*\}/) : [body]
      for (const piece of pieces) {
        const p = piece.trim()
        if (p.length < 2 || !CJK.test(p)) continue
        // 跳過程式碼（preset 的整段 C++）與超長字串：那些不是給人看的介面文字
        if (p.length > 120) continue
        if (p.indexOf(';') >= 0 || p.indexOf('{') >= 0) continue
        const h = hant(p)
        if (h !== p) phrases.set(p, h)
      }
    }
  }
}

const entries = [...phrases.entries()].sort((a, b) => b[0].length - a[0].length)
const banner = `// 由 scripts/gen-i18n-hant.mjs 自動產生，請勿手改。
// 內容：src/ 裡出現過的「簡體片段 → 繁體（港台用語）」對照表，供 i18n.ts 的 localize() 做顯示期替換。
// 重新產生：node scripts/gen-i18n-hant.mjs
export const HANT_MESSAGES: [string, string][] = [
`
const body = entries.map(([a, b]) => '  [' + JSON.stringify(a) + ', ' + JSON.stringify(b) + '],').join('\n')
writeFileSync(join(srcRoot, 'i18n-messages.ts'), banner + body + '\n]\n', 'utf8')
console.log('寫出 src/i18n-messages.ts：' + entries.length + ' 條片段')
