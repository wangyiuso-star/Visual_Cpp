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
- **Git 發版紀律**：**先 commit、後 tag**；PowerShell 傳 commit 訊息用**雙引號**（單引號會被訊息裡的 `'` 打斷，害 commit 沒執行）；每個 git 步驟檢查 `$LASTEXITCODE`；打完 tag 必驗 `git rev-list -n 1 <tag>` == `git rev-list -n 1 main`。（這症狀出現過兩次：v0.2.2 與 v0.5.1）
- **診斷/臨時腳本約定**：test/ 底下**每個 .ts 都會被 npm test 當成測試檔**，所以診斷腳本請放 `tmp/`（已 gitignore）或加 `_` 前綴（scripts/run-tests.mjs 會忽略 `_` 開頭的檔案，並列出被忽略者）。

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
- [x] 笔记本 / 窄屏适配 —— 已做（右侧网格按宽度自动退化为单列 + 格子分档收紧 + topbar 换行压缩 + 调用树按标签宽度自适应间距；调用树标签改为显示真实参数值；test/calllabel-test.ts 2 项通过）
- [x] 递归树自动跟随 —— 已做（活动调用节点自动滚进视野，含横向；编辑器当前执行行也自动滚进视野；vite watcher 忽略规则补 *.TMP/~* 避免 EBUSY 崩 dev server）
- [x] 调用树窗口放大 / 缩放 / 调用栈视图 —— 已做（整行宽 + 高度上限 min(62vh,560px) + 工具栏 −/＋/适应/1:1/放大整屏(Esc 退出)；缩放作用于 SLOT/NH/DH 与字号；z<0.7 触发 LOD；「调用栈」模式宽度由 O(叶子数) 降为 O(深度)）
- [x] 数据结构的树（tree / BST / 堆）同等能力 —— 已做（抽出共享 useTreeViewport + TreeViewport，调用树与数据树共用缩放/自动适应/放大整屏/跟随；放大改用 createPortal 到 body；数据树额外跟随本步读写节点）
- [x] 语言子集相容性矩阵 + 两个内建 bug 修复 —— 已做（test/compat-test.ts 44 项断言；修 lower_bound(v,x) 二参崩溃、sort 第三参静默忽略、迭代器形式误导报错；新增 test/presets-test.ts 逐个跑 preset）
- [x] do-while（含「body 跑完、检查条件前」的关键快照）+ 数组形参（共享/别名语义）—— 已做（test/do-while-test.ts 14 项、test/arrayparam-test.ts 11 项；容器形参仍按值拷贝，有回归断言）
- [x] 渲染层验证 —— 已做（test/render-test.ts：react-dom/server 把 VariablesPanel 渲染成 HTML，逐个 preset 断言不崩/非空壳/关键结构齐全）
- [x] 自定义比较函数排序 —— 已做（sort(v,cmp)/sort(v,n,cmp)，手写稳定归并排序，面板显示比较次数，违反严格弱序会警告；元素支持标量/struct/pair；test/sortcmp-test.ts 24 项）
- [x] 数组形参边界 —— 已做（非数组实参给明确错误；全域阵列实参时别名与本体同屏可见）
- [x] HKOI 教学项目 preset 验证 —— 已做（test/hkoi-presets-test.ts 直接引用对方 presets.ts 的 21 个 preset，执行+渲染+视觉断言 60 项全过）
- [x] 参数（别名）徽章 —— 已做（VarView.alias + .alias-badge；卡片与纯量栏都标；**刻意不改写入高亮**，test/aliasbadge-test.ts 9 项锁定）
- [x] 发布 v0.2.0 —— package.json 0.2.0 + git tag v0.2.0（含三项课堂安全修正）
- [x] range-based for —— 已做（`for (int/auto x : c)` 值拷贝、`for (auto& x : c)` 引用写回；可迭代 array/vector/deque/set/map/string/tree/bst，stack/queue/pqueue 明确报错；ref cell 加 `origin` 以免循环变量被误标「参数（别名）」；test/rangefor-test.ts 30 项）
- [x] 发布 v0.3.0 —— range-based for
- [x] 字串 ↔ 数字内建 —— 已做（`stoi/stol/stoll/stod/stof` 照 C++ 前缀语义 + `stoi(s,0,base)` 2..36 + `to_string`；没数字会明确报错；test/stoi-test.ts 32 项）
- [x] 发布 v0.4.0 —— stoi / to_string
- [x] string/vector 常用方法 + 字元函数 —— 已做（**修 find 忽略第二参的静默错误**；补 empty/at/front/back/rfind/push_back/pop_back/append/insert/erase/replace/compare 与 vector 的 front/back/at/resize/insert/erase；toupper/tolower/isdigit 等；方法可串接；string::npos = -1；test/strfunc-test.ts 58 项）
- [x] 测试执行器加固 —— 打包失败不再一律 SKIP：相依外部档不存在才 SKIP，语法错误算 FAIL（起因：一个语法错误的测试档被 SKIP 掩盖，还跑到旧 .mjs 显示通过）
- [x] 发布 v0.5.0 —— string/vector 方法 + 字元函数 + find 修正
- [x] 收紧字元参数 + substr 越界 —— 已做（`append/insert/replace/compare` 只吃字串，拒绝单字元并提示用 `push_back`/`+=`；`find/rfind/push_back/+=` 保留吃字元因为是合法 C++ 重载；`substr(pos)` 越界改为明确报错，与 `at` 一致；strfunc-test 74 项）
- [x] 发布 v0.5.1 —— 收紧字元参数 + substr 越界报错
- [x] 修「cin 输入不足」偶发 bug —— 已做（**根因：改 cin 输入没有让快照失效**，只有改 code/显示开关才会 → 「先运行再填输入」会重播旧错误、刷新才好；新增 `onInputChange` 一并失效；错误讯息改为讲清楚「要读第 N 个但只有 M 个」；test/cin-test.ts 14 项）
- [x] 发布 v0.5.2 —— cin 输入失效修正 + 讯息改善
- [x] 容器当值传递 —— 已做（**修三个缺口**：evalExpr 拒绝容器识别字/下标 → 回传带 cell 的容器值；execDecl 静默忽略容器初始化式 → 要求回传同类容器；map 的值是容器不支援 → allocFromType + operator[] 会插入。另加 `assertScalarRV` 守衛避免放宽后静默变 0；临时值下标 `f()[0]` 与临时成员 `mk().x`；test/container-test.ts 28 项含使用者原题）
- [x] 发布 v0.6.0 —— 容器可以当值传递（回传 / 赋值 / 按值传参）

## 下一步
1. 从待办里挑一项开始（建议：快照增量存储 或 set/map 容器）。
2. 每完成一项更新 HANDOFF.md。

## 工作纪律（强制）
- 每完成一个里程碑更新 HANDOFF.md；状态永远在文件里，不在对话里。
- 同一问题最多尝试 3 次；第 3 次失败必须停止并记录 DEBUG.md 后向用户汇报，绝不无限重试。
- 卡住的 bug 一律进 DEBUG.md。
