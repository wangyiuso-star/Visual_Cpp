import { parse } from '../src/interpreter/parser'
import { run } from '../src/interpreter/interpreter'
import { PRESETS } from '../src/presets'

// 每個 preset 都必須能 parse + 執行完且不報錯。
// 新增 preset 後跑這個檔案即可驗證（不需要動 UI）。
let fail = 0
for (const p of PRESETS) {
  try {
    let last: any = null
    for (const s of run(parse(p.code), { input: '' })) last = s
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
console.log('==== presets-test: ' + (PRESETS.length - fail) + ' 通過, ' + fail + ' 失敗 ====')
if (fail > 0) process.exit(1)
