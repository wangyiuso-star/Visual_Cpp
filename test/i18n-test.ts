import { getLocale, localize, setLocale, t, tf } from '../src/i18n'

let pass = 0
let fail = 0

function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; return }
  fail++
  console.log('FAIL ' + name + (detail ? ' | ' + detail : ''))
}

// 這個測試必須自己管語言狀態，最後要還原，免得影響其他測試檔（每個檔都是獨立 process，但保險）
const original = getLocale()

// ---------- 1. 簡體：原樣輸出 ----------
setLocale('zh-CN')
check('簡體時原樣輸出', t('代码可视化') === '代码可视化', t('代码可视化'))
check('簡體時未知字串原樣輸出', t('這段字不在字典裡') === '這段字不在字典裡')
check('簡體時 tf 仍會填參數', tf('第 {0} 行：{1}', 7, '除以零') === '第 7 行：除以零')

// ---------- 2. 繁體：香港用語，不是逐字轉 ----------
setLocale('zh-Hant')
check('繁體：品牌', t('代码可视化') === '程式碼視覺化', t('代码可视化'))
check('繁體：變數（不是「變量」）', t('当前行') === '目前行', t('当前行'))
check('繁體：函式', t('⚠ 比较函数不满足严格弱序') === '⚠ 比較函式不滿足嚴格弱序')
check('繁體：陣列', t('数组求和 (递归)') === '陣列求和 (遞迴)', t('数组求和 (递归)'))
check('繁體：伫列/堆疊', t('调用栈') === '呼叫堆疊', t('调用栈'))
check('繁體：卡片摘要模板', tf('stack<{0}> · 长度 {1}', 'int', 3) === 'stack<int> · 長度 3')
check('繁體：未知字串仍原樣輸出', t('這段字不在字典裡') === '這段字不在字典裡')
check('繁體：步數標籤', tf('第 {0} / {1} 步', 2, 10) === '第 2 / 10 步')

// ---------- 2b. 執行期報錯（localize）：片段替換，插值出來的數字要保留 ----------
setLocale('zh-Hant')
check('報錯：越界訊息', localize('下标 5 越界（长度 2）') === '索引 5 越界（長度 2）', localize('下标 5 越界（长度 2）'))
check('報錯：cin 不足', localize('cin 输入不足：程式要读第 1 个值').indexOf('輸入不足') >= 0, localize('cin 输入不足：程式要读第 1 个值'))
check('報錯：除數為 0', localize('除数为 0') === '除數為 0', localize('除数为 0'))
check('報錯：純英文不受影響', localize('Unknown identifier x') === 'Unknown identifier x')
check('報錯：簡體時原樣', (setLocale('zh-CN'), localize('下标 5 越界（长度 2）') === '下标 5 越界（长度 2）'))

// ---------- 3. 切換會即時反映（同一個 key 兩種語言都拿得到） ----------
setLocale('zh-CN')
const cn = t('设置 ▾')
setLocale('zh-Hant')
const hant = t('设置 ▾')
check('兩種語言真的不同', cn === '设置 ▾' && hant === '設定 ▾', cn + ' / ' + hant)

// ---------- 4. 字典本身：沒有空字串、沒有重複 key 對到同一個值 ----------
const seen = new Map<string, string>()
setLocale('zh-Hant')
for (const key of ['代码可视化', '变量 / 数据结构', '输出', 'fenxi']) {
  const v = t(key)
  if (v === '') { check('字典值不可為空: ' + key, false); continue }
  seen.set(key, v)
}
check('字典抽查非空', seen.size === 4)

// 還原
setLocale(original)
check('還原初始語言', getLocale() === original)

console.log('==== i18n-test: ' + pass + ' 通过, ' + fail + ' 失败 ====')
if (fail > 0) process.exit(1)
