# DEBUG.md — 卡住的问题档案

## ✅ 已解决：编辑器高度 / 滚动 / 覆盖（CodeMirror 布局）

**最终根因与修复（2026-08-16）**：@uiw/react-codemirror 在 .editor-body 与 .cm-editor 之间插了一层 .cm-theme 包裹层（默认 height:auto），打断了百分比高度链——.cm-editor/.cm-scroller 的 height:100% 相对 auto 父级被解析成 auto，编辑器随内容撑开、无垂直滚动条、被 cin/output 覆盖。修复 = 在 index.css 加 .editor-body > .cm-theme { height: 100%; }。用户刷新后确认正常。

（以下为排查过程的完整记录，供归档参考。）


### 现象（用户观察）
- cin / output 面板"覆盖"编辑器而非并排合并（用户诊断：覆盖 overlay 而非合并 merge，不是滚动问题）。
- 无垂直滚动条；拖拽分割条时编辑器不缩放。
- 细节：往下拖时代码区灰色背景变长（容器在变）但行号止于内容末尾；往上拖时代码框缩不回去。

### 期望行为
- 三段（代码 / cin / 输出）按百分比并排，拖拽此消彼长；编辑器随容器缩放，内容超高时出现垂直滚动条。

### 相关文件
- src/App.tsx（.left-body/.editor-body/.cin-pane/.output-pane + 拖拽 + ResizeObserver）
- src/components/CodeEditor.tsx（height="100%"）
- src/index.css（.editor-body / .cm-editor / .cm-scroller / .left-body）

### 根因（已确认）
- flexbox 对 flex item 的 height:100% / flex-basis:% 解析不可靠：.left-body 高度未被 CSS 明确解析成确定值，导致 48% 等百分比无法计算，编辑器始终按内容高度撑开。→ 已放弃所有 flexbox/百分比布局，改用 ResizeObserver 实测像素高度。

### 已尝试方案（做法 → 结果）
1. .cm-editor height:100%（原始） → 失败（覆盖/不缩放）
2. .cm-editor absolute inset:0; height:auto → 失败
3. .editor-body flex:1 1 0% → 失败
4. .cm-scroller flex:1 1 auto; overflow-y:auto 覆盖 → 失败
5. 三段 .left-body + flex:0 0 X% 百分比布局 → 失败
6. .cm-editor absolute + .cm-scroller flex 组合 → 失败
7. ResizeObserver + 显式像素高度（当前方案）→ 已构建/运行 200，待用户硬刷新确认

### 当前方案（第 7 次，ResizeObserver 像素高度）
- App.tsx：leftBodyRef 指向 .left-body；useEffect 用 ResizeObserver 读 clientHeight 存入 leftBodyHeight；availH = max(0, leftBodyHeight - 12)（减两个 6px 分隔条）。
- 三段 inline 高度：height: availH*codePct/100、availH*cinPct/100、availH*outPct/100（像素，非百分比）。
- index.css：.editor-body/.cin-pane/.output-pane 均 flex:0 0 auto（不参与伸缩），.cm-editor{height:100%}。
- 效果：父级是确定像素高度，.cm-editor height:100% 必能填满并出滚动条；三段之和严格等于容器高度，此消彼长精确。

### 尚未尝试方向
- 先排除浏览器缓存：用户 Ctrl+Shift+R 硬刷新（源码+dist 已确认一致，怀疑缓存）。
- 若仍坏：在 CodeEditor 内加 ResizeObserver 直接测 .editor-body 并给 CodeMirror 传显式像素 height（而非 CSS 100%）。
- 隔离验证：最小化复现，确认 .cm-editor 是 .editor-body 直接子元素、高度链 .app→.main→.editor-pane→.left-body 是否都有确定高度。

### 失败预算记录
- 规则：同一方案最多 3 次；达上限停止并汇报，绝不无限重试。
- 当前：ResizeObserver 方案 = 第 1 次（已落地）。若用户硬刷新后仍坏 → 第 2 次（CodeEditor 内直接传像素高度）；仍坏 → 第 3 次（隔离最小复现定位高度链）；第 3 次失败即停止汇报。
