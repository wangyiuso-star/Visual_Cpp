# AGENTS.md — OI 代码可视化 (cpp-viz)

> 每个新会话自动读入的上下文核心。详细状态见 HANDOFF.md；卡住的问题见 DEBUG.md。

## 项目
面向 OI / 算法教学的 C++ 代码逐步可视化工具：左边写代码 + cin 输入 + 输出，右边实时显示变量/数组/vector/栈/队列/堆/树/BST，逐步高亮当前行与读写格子，函数/递归以调用树显示。形态 = 浏览器内迷你 C++ 解释器（lexer → parser → 生成器式 stepper），非 GDB/调试器方案。

## 技术栈
React 19 + Vite 8 + TypeScript + CodeMirror 6（@uiw/react-codemirror + @codemirror/lang-cpp + theme-one-dark）。

## 目录结构
- src/interpreter/ — lexer → parser → interpreter（生成器式逐步执行）+ memory（递归 Cell 模型）+ ast
- src/components/ — CodeEditor（代码编辑器 + 当前行高亮 + 断点 gutter）、VariablesPanel（变量/容器/调用树可视化）
- src/App.tsx — 主壳（布局、拖拽、步进、快捷键、预设、localStorage、ResizeObserver 像素高度）
- src/index.css — 样式；编辑器布局规则在 .editor-body / .cm-editor 处
- src/presets.ts — 示例预设（fib / 阶乘 / 二分 / BST / 全排列 / 归并）
- test/run.ts — 解释器冒烟测试

## 关键约定
- 构建/运行（Windows 沙箱必加 sandbox_permissions="danger-full-access"，否则 Vite spawn 原生二进制 EPERM）：
  - npm run build（改完必重新构建）
  - npm run dev（后台 job；改完 kill 旧 job 再重启，然后探 http://localhost:5173/ 期待 200）
- 验证：改后 npm run build 应 exit 0 → 重启 dev → Invoke-WebRequest 探 200。
- 编辑约定：edit/write 前必须先 read（fs-observation 策略）。tools.write 用 String.raw 保留换行，避免反引号与美元花括号插值冲突。
- 响应语言：中文。

## 已完成（简述）
- 语言：int/long long/char/bool/string/double/float；数组(1D/2D)、vector(1D/2D/邻接表)、stack、queue、priority_queue(大根堆+greater 小根堆)、tree(完全二叉树)、bst。
- 语句：声明/赋值(= += -= *= /= %=)/++--/for/while/if-else/break/continue/return/cout；自定义函数+递归+全局变量；内建 min/max/abs。
- 可视化：当前行高亮、读写/判断着色、global/local 标签、递归树返回变暗+返回值、堆/树/BST 树形图、数组窗口。
- 交互：运行/暂停/单步/后退/跳步/速度、断点（点 gutter）、cin 预填、可拖拽垂直分割、预设、localStorage、键盘快捷键、bool 1/0 开关、if/while/for 条件开关。

## 进行中 / 未完成
- [x] 编辑器高度/滚动/覆盖 bug —— 已解决（根因：.cm-theme 包裹层缺高度；修复 .editor-body > .cm-theme{height:100%}）。
- [x] 快照增量存储 —— 已做（写时复制结构共享，cell 不可变，dumpAll/cloneCallTree 改引用共享；test/cw-test.ts 19 项通过）
- [x] set / map / unordered_map —— 已做（set 排序去重；map/umap 支持 operator[] 键索引 + erase/find/count/size/empty/clear；渲染 set 列表 + map 键值对；test/setmap-test.ts 7 项通过）
- [x] 图可视化 —— 已做（邻接表 vector<int> g[N] / vector<vector<int>> 识别为图，SVG 节点+连线，节点/边读写高亮，图/表切换；带权图 pair<int,int> 边权重显示；有向图自动画箭头；右侧容器两列并排；新增「图的 DFS」「带权图（有向）」预设）
- [x] pair / make_pair —— 已做（pair<A,B> 类型、make_pair(a,b)、.first/.second 成员读写；test/pair-test.ts + dijkstra-test.ts 通过）
- [ ] 右侧卡片自由拖拽 + 缩放（画布化：拖动摆放位置、缩放大小）
- [x] struct + 容器参数 + 引用传递 + 结构体返回值 —— 已做（struct 定义/成员读写/初始化、int& 引用传递、容器按值参数、struct 参数/返回值；另支持 array/tree/vector 存 struct（含初始化）；test/struct-test.ts 5 项 + struct-return-test.ts 2 项 + struct-container-test.ts 4 项通过）
- [x] 多维 vector 完善 —— 已做（vector<vector<int>> g(n, vector<int>(m)) 矩阵填充 + 结构共享隔离；int a[] = {...} 数组大小推断；test/multivec-test.ts 4 项通过）
- [x] 常用 STL —— 已做（deque 容器 + sort/reverse/lower_bound/swap 函数；test/stl-test.ts 6 项通过）

## 下一步
1. 从待办里挑一项开始（建议：快照增量存储 或 set/map 容器）。
2. 每完成一项更新 HANDOFF.md。

## 工作纪律（强制）
- 每完成一个里程碑更新 HANDOFF.md；状态永远在文件里，不在对话里。
- 同一问题最多尝试 3 次；第 3 次失败必须停止并记录 DEBUG.md 后向用户汇报，绝不无限重试。
- 卡住的 bug 一律进 DEBUG.md。
