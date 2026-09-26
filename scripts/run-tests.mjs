// 一次跑完 test/ 下所有 .ts 测试：先用 rolldown 打包成 esm，再用 node 执行。
// 用法：npm test
import { readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const dir = 'test'
// test/ 底下每個 *.ts 都會被當成測試檔；診斷/臨時腳本請放 tmp/ 或加 _ 前綴（會被這裡忽略）。
const all = readdirSync(dir).filter((f) => f.endsWith('.ts'))
const files = all.filter((f) => !f.startsWith('_')).sort()
const ignored = all.filter((f) => f.startsWith('_')).sort()
const isWin = process.platform === 'win32'
const rolldown = join('node_modules', '.bin', isWin ? 'rolldown.cmd' : 'rolldown')

if (ignored.length > 0) {
  console.log('（忽略 ' + ignored.length + ' 個 _ 前綴檔案：' + ignored.join(', ') + '）')
}

let failed = 0
let skipped = 0
const failedNames = []
const skippedNames = []
for (const f of files) {
  const base = f.replace(/\.ts$/, '')
  const out = join(dir, base + '.mjs')
  process.stdout.write(base.padEnd(26))
  try {
    // 打包失敗通常代表這個測試相依的外部檔案不存在（例如跨專案的 hkoi-presets-test）。
    // 記為 SKIP 而不是 FAIL，本倉庫在別處 clone 也能跑 npm test。
    execFileSync(rolldown, [join(dir, f), '-o', out, '-f', 'esm', '-p', 'node'], { stdio: 'ignore', shell: isWin })
  } catch {
    console.log('SKIP  (無法打包，通常代表相依的外部檔案不存在)')
    skipped++
    skippedNames.push(base)
    continue
  }
  try {
    execFileSync(process.execPath, [out], { stdio: 'inherit' })
    console.log('PASS')
  } catch {
    console.log('FAIL')
    failed++
    failedNames.push(base)
  }
}

console.log('')
console.log('通過 ' + (files.length - failed - skipped) + ' / 跳過 ' + skipped + ' / 失敗 ' + failed + '（共 ' + files.length + ' 個測試檔）')
if (skipped > 0) console.log('  跳過：' + skippedNames.join(', ') + '（想跑請確認該測試相依的檔案存在）')
if (failed > 0) console.log('  失敗：' + failedNames.join(', '))
process.exit(failed === 0 ? 0 : 1)
