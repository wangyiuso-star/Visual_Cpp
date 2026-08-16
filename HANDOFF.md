# HANDOFF.md — 项目详细状态档案

## 最近更新
- 2026-08-16：支持容器存 struct——array/tree/vector 存 struct（元素分配 + 成员访问 + 初始化列表）；test/struct-container-test.ts 4 项通过。
- 2026-08-16：完成「struct + 引用」——struct 定义/成员读写/初始化/参数/返回值、int& 引用传递（ref cell 解引用）、容器按值参数（结构共享）；test/struct-test.ts 5 项 + struct-return-test.ts 2 项通过，回归 19/19。
- 2026-08-16：完成「STL」——deque 容器（push_back/push_front/pop_back/pop_front/front/back/size/empty/clear）+ sort/reverse/lower_bound/swap 函数；test/stl-test.ts 6 项通过。
- 2026-08-16：完成「多维 vector 完善」——vector<vector<int>> g(n, vector<int>(m)) 矩阵填充（模板结构共享）、int a[] = {...} 数组大小推断；test/multivec-test.ts 4 项通过 + 回归 19/19。
- 2026-08-16：编辑器布局 bug 已解决（根因：.cm-theme 包裹层缺高度；修复：.editor-body > .cm-theme{height:100%}）。
- 2026-08-16：完成「快照增量存储」——memory/interpreter 改写时复制（cell 不可变、路径式 setAtPath/updateAt、堆/BST/调用树函数式），dumpAll/cloneCallTree 改引用共享；test/cw-test.ts 19 项全过（含快照隔离验证）。
- 2026-08-16：完成「set/map/unordered_map」——类型/解析/memory/interpreter/渲染全链路；map 支持 operator[] 键索引（读缺键不插入、写缺键插入）；set 排序去重；test/setmap-test.ts 7 项通过 + map 隔离验证。
- 2026-08-16：完成「图可视化」——邻接表识别为图（SVG 节点+连线、节点/边读写高亮、图/表切换）；新增「图的 DFS」预设；test/graph-test.ts DFS 输出验证通过。
- 2026-08-16：图可视化增强 + pair——带权图 pair<int,int> 边权重显示、有向图自动箭头、右侧容器两列并排；pair<A,B>/make_pair/.first/.second 全链路；test/pair-test.ts + dijkstra-test.ts（Dijkstra 0 2 3 9 6）通过。

## 项目目标与成功标准
OI/算法教学用的 C++ 逐步可视化工具。左半 = 代码编辑器 + cin 输入 + 输出（三段垂直堆叠，拖拽横条调整百分比、此消彼长）；右半 = 变量/数据结构。成功标准：常见 OI 代码（数组/vector/栈/队列/堆/树/递归）可逐步演示，变量实时可读，教师/学生能直观看到执行过程。

## 当前状态（完成度估算：约 85%）
- 已完成：解释器语言子集、变量/容器/调用树可视化、步进与断点、cin、预设、快捷键、bool 开关、条件开关、可拖拽垂直分割。
- 进行中：编辑器高度/滚动/覆盖 bug（ResizeObserver 方案已落地，待确认）。
- 未开始：快照增量存储、struct/引用/模板、set/map/图可视化、更多 STL。

## 文件清单与职责
| 文件 | 职责 | 状态 |
|---|---|---|
| src/App.tsx | 主壳：布局/拖拽/步进/快捷键/预设/localStorage；含 ResizeObserver 像素高度 | 编辑器方案已改 |
| src/components/CodeEditor.tsx | CodeMirror 封装：当前行高亮 + 断点 gutter；height="100%" | 稳定 |
| src/components/VariablesPanel.tsx | 变量/容器/调用树/树图渲染 | 稳定 |
| src/index.css | 样式；.editor-body/.cm-editor/.cm-scroller 布局规则 | 已改为像素方案 |
| src/interpreter/*.ts | lexer/parser/ast/interpreter/memory | 稳定 |
| src/presets.ts | 示例预设 | 稳定 |
| test/run.ts | 冒烟测试 | 稳定 |

## 进行中 / 卡住的问题
- （无卡住问题）编辑器布局 bug 已解决，详见 DEBUG.md。

## 下一步执行计划（精确到文件）
1. 从待办里挑一项开始（建议：src/interpreter 快照增量存储，或 set/map 容器）。
2. 每完成一项，更新本文件与 AGENTS.md。

## 已知坑 / 环境事项
- Windows 沙箱 EPERM → npm run dev/build 必须 sandbox_permissions="danger-full-access"（Vite spawn 原生二进制）。
- 改代码后必须 npm run build + 重启 dev，再探 http://localhost:5173/ 期待 200。
- 编辑器布局 bug 详见 DEBUG.md。
- 会话完整日志备份：C:\Users\hy\Desktop\DSH会话备份\VisualCode-project-session-full.jsonl
- 自动压缩 checkpoint：CHECKPOINT-2026-08-16.md
