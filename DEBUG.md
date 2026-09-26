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
## ✅ 已解决：笔记本上「数据结构大小不合理」+ 工具栏被挤出屏幕（2026-08-16）

**现象**：搬到笔记本后右侧数据结构「大小不合理」，递归树显示变量名而非实际值。
**根因（3 处固定尺寸假设）**：
1. .viz-main 是固定两列 repeat(2, minmax(0,1fr))，全表无任何 @media。笔记本右侧面板仅占 45% 宽，两列后每列约 280px；vector<int>（10 格、每格约 45px）被挤成 2~5 行，卡片被撑得又高又窄。
2. .topbar 单行不换行；Windows 笔记本常见 125%/150% 缩放会把 CSS 视口压到约 1093/1280px，工具栏控件被挤出视口、点不到。
3. 调用树 SLOT=130 / DH=76 为常量；标签改用真实参数值后（如 solve(10, 3, 1000000)）变长，相邻节点重叠，局部变量多时竖向也挤压。
**修复**：
- src/index.css：.shape-horizontal 改 grid-column: 1 / -1；.viz-body 加 container-type: inline-size；新增 @media (max-width: 1440/1180/980px)（右侧退化为单列 + 分档收紧格子与工具栏）+ @container (max-width: 680px)（面板被手动拖窄时同样退化单列）；.topbar 加 flex-wrap: wrap 与 row-gap: 8px；.tree-scroll 的 max-height 改 min(420px, 42vh)。
- src/components/VariablesPanel.tsx：CallTreeGraph 按真实标签字符数与局部变量行数计算 SLOT/NH/DH。
- src/App.tsx：首次进入按 window.innerWidth < 1500 决定默认分割比（50% / 55%）。
**验证**：npm run build exit 0；dev 探 http://localhost:5173/ 返回 200；产物 CSS 含 3 组媒体查询 + @container (width<=680px) + container-type:inline-size；回归 15 个测试全过；test/calllabel-test.ts 验证标签为 fib(5)/show(7)。

## ⚠️ 已知既存问题（非本次引入）：npm run typecheck 约 90 个类型错误
分布：interpreter.ts 71 / VariablesPanel.tsx 17 / parser.ts 1 / CodeEditor.tsx 1。全部是联合类型未收窄（访问 expr.args、cell.cells、cell.elemType、Event.button）。原因是 vite build 只做转译不做类型检查，所以一直未被发现。不影响运行；清理时需逐个加 kind 判断收窄或类型谓词。
## ✅ 已解决：递归树调用时无法自动跟随（2026-08-16）

**现象**：递归/调用树在递归调用时不会自动跟随当前活动节点，节点跑到视野外就看不见了。
**根因**：CallTreeGraph 用固定 SLOT 横向铺开节点，容器 .tree-scroll 是 overflow:auto 且宽度只有卡片那么宽。宽度 = 叶子数 * SLOT + 180，fib(5) 有 8 个叶子即约 1220px，fib(10) 更宽，所以活动节点几乎总会横向（深层时还有纵向）滚出视野；而全项目没有任何自动滚动逻辑（全 src 搜 scrollIntoView 为 0 处）。
**修复**：CallTreeGraph 加 scrollRef，useEffect 里按当前 activeCallId 找到对应节点坐标，仅在越界时（留 18px 边距）横向/纵向 scrollTo 到可见位置（behavior smooth）。依赖为 activeCallId / nodes.length / width / height / NW / NH，全是数字，不会触发渲染循环。
**顺带修复**：CodeEditor 的当前执行行此前只 dispatch 高亮、从不滚动，行滚出编辑器可视区后就看不到执行位置了；现在追加 EditorView.scrollIntoView(line.from, { y: 'nearest', yMargin: 40 })，仅在越界时滚动。
**顺带修复（环境）**：vite.config.ts 的 watch.ignored 原先只排除 **/*.tmp（小写），Windows 下编辑器原子写入会留下 CodeEditor.tsx~RFxxxx.TMP，被 watcher 监听后 dev server 直接以 EBUSY 崩溃（也解释了此前编辑文件时的 ReplaceFileW EIO 1175）。已补 **/*.TMP 与 **/*~*。
**验证**：npm run build exit 0；dev 探 http://localhost:5173/ 200。


