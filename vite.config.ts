import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      // 编辑器/工具的原子写入会留下 CodeEditor.tsx~RFxxxx.TMP 之类临时文件；
      // 一旦被 watcher 监听会以 EBUSY/EPERM 直接崩掉 dev server，这里全部排除。
      // tmp/ 是放诊断/临时脚本的地方（.gitignore 已排除）：它里面可能出现别人开著锁的
      // 档案（例如 headless Chrome 的 user-data-dir：Cookies 会被锁住），一样会 EBUSY 崩掉，
      // 所以整个 tmp/ 都不监听。
      ignored: ['**/node_modules/**', '**/*.tmpdir/**', '**/*.tmp', '**/*.TMP', '**/*~*', '**/tmp/**'],
    },
  },
})
