import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
import { PRESETS } from '../src/presets'

// 每個 preset 都必須能 parse + 執行完且不報錯。
// 新增 preset 後跑這個檔案即可驗證（不需要動 UI）。
let fail = 0
for (const p of PRESETS) {
  try {
    let last: any = null
    for (const s of run(parse(p.code), { input: p.input ?? '' })) last = s
    if (last && last.error) {
      console.log('FAIL ' + p.name + ' → ' + last.error)
      fail++
      continue
    }
    const out = String((last && last.output) ?? '').replace(/\n/g, '\\n')
    console.log('PASS ' + p.name + ' → 輸出 ' + JSON.stringify(out.slice(0, 60)))
  } catch (e) {
    console.log('FAIL ' + p.name + ' → ' + (e as Error).message)
    fail++
  }
}
// 需要 cin 的范例必须自带 input：否则使用者选中示例、按「运行」，只会先看到一次
// 「cin 输入不足」，误以为示例坏了。（历史上三个 cin 示例就是这样踩到的。）
for (const p of PRESETS) {
  if (/(cin\s*>>|getline\s*\()/.test(p.code) && p.input === undefined) {
    console.log('FAIL ' + p.name + ' 用了 cin/getline 却没有自带 input')
    fail++
  }
}
console.log('==== presets-test: ' + (PRESETS.length - fail) + ' 通過, ' + fail + ' 失敗 ====')
if (fail > 0) process.exit(1)
