import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      // 编辑器/工具的原子写入会留下 CodeEditor.tsx~RFxxxx.TMP 之类临时文件；
      // 一旦被 watcher 监听会以 EBUSY/EPERM 直接崩掉 dev server，这里全部排除。
      ignored: ['**/node_modules/**', '**/*.tmpdir/**', '**/*.tmp', '**/*.TMP', '**/*~*'],
    },
  },
})
