# DEBUG.md（模板 — 由项目 AI 填充为正式文件）

> 用途：卡住的问题档案，每个问题一节。失败预算在此记录。
> 填充完成后，保存为项目根目录的 `DEBUG.md`（本模板文件可删除）。

## 问题：编辑器高度 / 滚动 / 覆盖（CodeMirror 布局）

### 现象（用户观察）
- cin/output 面板"覆盖"编辑器而非并排合并；无垂直滚动条；拖拽分割条时编辑器不缩放。

### 期望行为
- 三段（代码 / cin / 输出）按百分比并排，拖拽时此消彼长；编辑器随容器缩放并出现滚动条。

### 相关文件
- `src/App.tsx`、`src/components/CodeEditor.tsx`、`src/index.css`（.editor-body / .cm-editor / .cm-scroller）

### 已尝试方案（每个：做法 → 结果）
1. `height:100%` → 失败
2. absolute `inset:0` → 失败
3. flex `1 1 0%` → 失败
4. `.cm-scroller` flex 覆盖 → 失败
5. 三段百分比布局 → 失败
6. （新方向）ResizeObserver + 显式像素高度 → 待尝试

### 当前假设
- flexbox 对 flex item 的 `height:100%` 解析不可靠，是根因。

### 尚未尝试方向
- ResizeObserver 测量容器，把显式像素高度传给 CodeMirror
- 先排除浏览器缓存（Ctrl+Shift+R 硬刷新）
- 隔离验证：最小化复现，确认 .cm-editor 是 .editor-body 的直接子元素

### 失败预算记录
- 同一方案最多 3 次；达上限停止并汇报，绝不无限重试。
- 记录每次尝试的日期 / 方案 / 结果：
