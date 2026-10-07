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
- 构建/运行：一般直接跑即可。**注意政策會變**：2026-08-17 起本會話的檔案政策是 `danger-full-access` 且核准提示已停用 → **不要再傳 `sandbox_permissions`（會被自動拒絕）**；若哪天回到 workspace-write，Vite/rolldown/node/git 這類要 spawn 子程序的指令才需要加 `sandbox_permissions="danger-full-access"`。
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
- [x] 右侧卡片自由拖拽 + 缩放 —— 已做（**拖动排序**（拖到谁身上占谁的位置，虚线落点提示 + 拖动把手⠿）、**单卡缩放** 70%~160%（CSS `zoom` 属性 + `width: calc(100% / var(--card-zoom))` 宽度补偿，才能连 `.cell` 写死的字号一起缩放又不溢出）、**整行宽切换**（⤢/⤡）、**顺序/缩放/全宽持久化**在 `localStorage['cpp-viz.panel-layout']`；纯函数抽到 `src/components/panelLayout.ts` → test/panellayout-test.ts 24 项 + render-test 4 项 DOM 断言）
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
- [x] 容器当值不再显示「?」+ 修 `vector<int>()` 崩溃 + 不支援组合给明确错误 —— 已做（渲染层 15 处「不是标量就给 `?`」的退路改成递归摘要 `formatCellShort`；空 vector 构造式；`g.push_back({1,2})`；`set<容器>`/`sort(容器)` 给明确错误；test/summary-test.ts 23 项 + container 36 项 + render 4 项）
- [x] 发布 v0.6.1 —— 容器当值摘要修正
- [x] HKOI 缺口提案第一优先 —— 已做（**输入模型改成游标**：`while (cin >> x)` 读到 EOF、`getline`、`cin >> char`、`cin.ignore()`；C 风格转型 `(int)/(char)/(long long)`；`sqrt/pow/floor/ceil`；`sort(v, greater<int>())`；`fixed + setprecision(n)`；`const T&` 参数；**字符算术** `c-'a'`/`c+1`/`c-32`（含赋值与 ++/-- 照目标型别隐式转换）；容器与 pair 比较（含 `sort(vector<pair>)`）；test/gap-test.ts 92 项）
- [x] 发布 v0.7.0 —— HKOI 缺口提案第一优先
- [x] HKOI 缺口提案第二优先 —— 已做（`#define`（物件式巨集，文字層展開，等長空白保留行號）、`typedef` / `using` 型別別名、`size_t`、三目 `?:`、`sizeof`（動態容器刻意不支援並給教學說明）、`memset`（逐位元組語意）、`fill` / `v.assign` / `min({...})` / `INT_MAX` / `cin.get()`、區間寫法 `sort(v.begin(),v.end())` / `sort(a,a+n)` / `lower_bound(a,a+n,x)`；**踩坑：內建 `fill` 搶走使用者自訂函式名 → 加 `shadowed` 守衛，使用者函式優先**；test/gap-test.ts 127 項）
- [x] 发布 v0.8.0 —— HKOI 缺口提案第二优先
- [x] 发布 v0.9.0 —— 右侧卡片拖动排序 + 单卡缩放 + 整行宽 + 持久化
- [x] 「黑屏」防護 —— 已做（`src/components/ErrorBoundary.tsx`：渲染期错误变成「内部错误 + 訊息 + 堆疊 + 重置」的卡片，不再白屏；App 右側面板已包住 + `resetKey={code}`；面板讀 localStorage 包 try/catch（隱私模式下連讀都會拋 SecurityError，而它在 useState 初始化式裡 → 會炸掉整棵樹）；初始化列表尾逗號 `{1,2,3,}` 是合法 C++，已修；test/crash-test.ts 15 項含契約測試）
- [x] 发布 v0.9.1 —— 黑屏防護 + 尾逗號
- [x] 卡片放大到 160% 時不夠寬（圖被裁掉 + 橫向捲軸）—— 已做（根因：寬度補償在放大時把卡片佈局寬壓成 1/z，但固定像素的 SVG 不會跟著縮 → 撐出格子。修法：**放大 → 自動佔整行**（`panelLayout.isWide`）+ **圖的 SVG 加 viewBox 與 max-width:100%** 讓它縮進卡片內 + ⤡ 在放大時順便回到 100%（不然按了沒反應）；test/panellayout +5、render-test +3）
- [x] 发布 v0.9.2 —— 放大時自動佔整行 + 圖自適應寬度
- [x] 複查第二／三優先 + 修「函式多載」的靜默錯答案 —— 已做（第二優先 12 項中 11 項可用、第三優先 8 項中 2 項可用；**同名函式定義兩次以前是直接覆蓋 → 後定義的默默生效**（`f(3)` 印 1 而 C++ 是 30）→ 改成解析期明確報錯；`__builtin_*` 訊息說明位元運算不做；gap-test +2）
- [x] 发布 v0.9.3 —— 第二／三優先複查 + 関数多載靜默錯誤修正
- [x] 501×501 的 DP 表讓畫面卡死 —— 已做（**根因不在解釋器**（99 幀 10ms 跑完），而是面板把 `vector<vector<int>>` 當成鄰接表畫圖：501 節點、251k 條邊 → 40.8MB 的 HTML、node 端渲染 2.9~4.5 秒、瀏覽器卡死。修法：新增 `graphLimit.ts` **畫圖前檢查規模**（節點 ≤80、邊 ≤800，超過改顯示說明）+ `AdjListView` 預設走表格 + **stack/queue/deque/set/map 五個逐項視圖補上 `VIEW_MAX_ITEMS = 300` 截斷與「还有 N 项未显示」**。效果 40.8MB → 5.5KB。test/render-limit-test.ts 12 項用「HTML 大小」當卡死門檻）
- [x] 发布 v0.9.4 —— 大表格/長容器不再讓面板卡死
- [x] 編輯器 Tab 縮排改 4 格 + 加減縮排快捷鍵 —— 已做（根因：CodeMirror 的 `indentUnit` 預設 2 格。新增 `src/components/editorSetup.ts`：DEFAULT_INDENT_SIZE=4、`editorIndentExtensions(size)`（indentUnit + tabSize + Tab/Shift-Tab/**Ctrl+]**/**Ctrl+[** → indentMore/indentLess）、CodeEditor 用 Compartment 動態重設、App 在「設置」選單可切 2/4 格並存 localStorage；test/editor-setup-test.ts 19 項含契約測試）
- [x] 发布 v0.9.5 —— Tab 縮排 4 格 + 加減縮排快捷鍵
- [x] 多個變數並排（右側不再一張卡片一行）—— 已做（根因：`.viz-main` 在 ≤1440px 硬退成單欄 + 大部分卡片形狀寫死 `shape-horizontal`＝佔整行（一維陣列/字串/set/map/queue/deque 全都是）。修法：網格改 `repeat(auto-fill, minmax(360px,1fr))`、`shapeClass` 改成**預設一欄**（只有樹/堆/BST 與行長 > 12 的寬二維表佔整行）、新增 `useFit()` 讓 1D/2D/struct 視窗欄數跟著卡片寬度走（以前寫死 5/10 格，窄卡片會把陣列擠成兩行）。render-test +6 用 DOM 斷言卡片形狀）
- [x] 发布 v0.9.6 —— 多个变量卡片并排
- [x] 2D 視窗改回固定 5×5 —— 已做（使用者要可預期的大小 + 寫入自動跳轉就夠；`Windowed2D`/`StructArrayView` 拿掉 `useFit`／`winRows`／`cols` 回到 `WIN_2D = 5`，focus 跟隨保留。**1D 視窗仍自適應**（半寬卡片固定 10 格會把陣列擠成兩行）。render-limit-test +4 原始碼契約鎖住「不准再 useFit(WIN_2D」）
- [x] 发布 v0.9.7 —— 2D 视窗固定 5×5
- [x] 遞歸樹與 2D array 卡片也能並排 —— 已做（2D 卡片不再佔整行（視窗固定 5×5 後自然寬度只有 ~250px），移除「行長 > 12 就整行」；樹/BST/堆/呼叫樹改成**面板 ≥ `TREE_PACK_MIN = 800px` 才只佔一欄**，用 ResizeObserver 量 `.viz-body`；`isWide(layout, key, auto)` 手動優先（⤢/⤡ 按鈕永遠有效）＋放大 >100% 強制整行；移除 `shapeClass`，CSS 只留 `.card-wide`。panellayout +6、render-test 改寫 +3 契約；35 檔全過）
- [x] 发布 v0.9.8 —— 树/2D 卡片并排（面板 ≥800px 自动）
- [x] 解耦重構第一批 —— 已做（`VariablesPanel.tsx` 1983 → 487 行，拆成 `src/components/viz/{format,window,containers,graph,tree}`（依賴單向、無循環）；`Windowed2D`/`StructArrayView` 的視窗偏移共用 `useWindowOffset()`；測試改從純函式模組匯入。**盤點與後續計畫寫在 `ARCHITECTURE.md`**：下一個該拆的是 `interpreter.ts`（2930 行））
- [x] 发布 v0.10.0 —— 解耦重構第一批 + ARCHITECTURE.md

## 下一步
1. 从待办里挑一项开始（建议：快照增量存储 或 set/map 容器）。
2. 每完成一项更新 HANDOFF.md。

## 工作纪律（强制）
- 每完成一个里程碑更新 HANDOFF.md；状态永远在文件里，不在对话里。
- 同一问题最多尝试 3 次；第 3 次失败必须停止并记录 DEBUG.md 后向用户汇报，绝不无限重试。
- 卡住的 bug 一律进 DEBUG.md。
