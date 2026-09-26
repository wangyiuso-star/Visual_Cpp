# HANDOFF.md — 项目详细状态档案

## 最近更新
- 2026-08-16：**v0.2.1** —— 徽章文字統一。
  - 純量欄的徽章原本是短版「别名」（當初怕在 116px 窄欄換行），但卡片是「參數（別名）」，造成教材編輯那張四列表（純量/string/vector/array）**出現一致、文字卻不一致**。對方量過 `.alias-badge` 為 8px 字級、「參數（別名）」6 個全形字約 56–64px、純量欄內寬約 104px，確實放得下 → 統一為「參數（別名）」。
  - `test/aliasbadge-test.ts` 補上**文字斷言**：四種別名（int& x / string& s / vector<int>& v / int a[]）的徽章文字必須只有一種「參數（別名）」，且分佈為 rail 1 + card 3。用意是防止以後有人為了省空間又改回短版。
  - `scripts/run-tests.mjs` 改為**忽略底線前綴**的檔案並列出被忽略者；`.gitignore` 加 `tmp/`；診斷腳本約定已寫進 AGENTS.md。起因：我之前把兩個診斷腳本 `badge-check.ts` / `badge-check2.ts` 放進 test/，害測試檔數從 24 變 26、而且探針印出的「NO badge for …」看起來像功能壞掉。
- 2026-08-16：**发布 v0.2.0**（含三项课堂安全修正 + do-while + 数组形参 + 自订比较函数）。
  - **数组形参徽章**：VarView 加 `alias`（dumpAll 在解引用 ref cell 前记下，ref 只可能来自引用/数组形参），卡片与纯量栏渲染「参数（别名）」徽章（index.css 的 .alias-badge）。**刻意不改写入高亮**——决策是「只亮被指向的那个名字」本身即教学证据（test/aliasbadge-test.ts 9 项把它锁住：含「亮的是 g、a 不亮」）。
  - 新增 test/aliasbadge-test.ts（9 项）。测试档共 24 个。
  - 位元运算**确定不做**（教材编辑决定：初赛是笔试、且 << >> 与 cout/cin 共用 token，风险大于收益）；Unit 2 §6 改用 `x % 2` 演示奇偶。
  - 版本交付：package.json 0.2.0 + git tag v0.2.0；`npm test` 一键验证。
- 2026-08-16：**实现 HKOI 建议书（plan/07-VisualCode改進建議.md）的优先 1-3 项**。
  - **优先 2 补完**：数组形参的边界情况——非数组实参（纯量 / vector / 算式）现在给明确错误「数组形参 a 需要传入数组（int a[]）」，不再抛内部的「非法的下标访问」。另确认建议书要求的可视化已满足：全域阵列做实参时，帧内 vars 同时有 `g(global,array)` 与 `a(local,array)`（同一份资料两个名字）。**容器形参（vector<int> v）仍是按值拷贝**，有回归断言。
  - **优先 3 完成**：自定义比较函数 `sort(v, cmp)` / `sort(v, n, cmp)`。实作要点：(1) 手写**自底向上稳定归并排序**（不用 Array.prototype.sort，保证多关键字示范不抖动）；(2) 比较时把两个元素挂到隐藏变量 `__sort_a/__sort_b` 再合成 `cmp(__sort_a, __sort_b)` 调用——复用既有绑定路径，所以**标量 / struct / pair 元素都能比**（C711 那种按关联数据排序可行），且隐藏变量在 dumpAll/collectLocals 被过滤；(3) **比较次数**写进 Snapshot.sortInfo（每帧拷贝，快照隔离），面板顶部显示「排序 · a · 比较 N 次 · n = M」；(4) 排序后检查相邻元素是否逆序 → 违反严格弱序时警告（抓到 cmp 写成 <= 或恒 true）；(5) 保护：步数沿用 20000 上限（实测 n=100 用 cmp 排序不超）。实测 n=8 比较 12 次（上界 24）。
  - **优先 4（位元运算）未做**，仍是加分项，理由见对谈。
  - 新增 test/sortcmp-test.ts（24 项，含稳定排序／比较次数／弱序警告／步数保护／数组形参错误）、test/hkoi-presets-test.ts（直接引用 HKOI 那边的 presets.ts 21 个 preset，执行+渲染+视觉断言 60 项全过）；test/render-test.ts 增测排序横幅。
  - 已知限制：**位元运算、switch、三目、强制转换**仍不支持；cmp 排序会比较慢（每次比较都进调用树、产生步数），课堂建议 n ≤ 8。
- 2026-08-16：**新增 do-while 与数组形参（共享语义）**，均为课程/题库需要的能力。
  - **do-while**：ast 加 do 节点（含 condLine）、parser 加 parseDo、interpreter 加 case 'do'。★关键规格：在 body 执行完、**求值条件之前**产出一个快照（`yield* mark(rt, s.condLine)`，高亮 while 行、右侧已是 body 之后的状态、尚无判断横幅），随后才 markCondition 出判断横幅。实测 fib 风格序列为：line6 i=1（body 完）→ line7 无横幅 i=1（检查前）→ line7 条件=真。continue 会落到条件判断（正确），break 直接跳出；死循环由 MAX_STEPS 兜住（注意 run 不 throw，错误放在最后一个快照的 error 字段）。
  - **数组形参 int a[] / int a[10] / int a[][3]**：parser 参数循环消费 `[]`/`[N]` 后缀并置 isArray；interpreter 把 isArray 与 byRef 同等对待（resolveTarget 取调用方 lvalue + newMem.declare 为 ref cell）。**共享/别名语义**（等同 C++ 数组退化为指针），函数内 a[i]=x 调用方立刻可见。dumpAll 会解引用 ref（interpreter.ts:555/561），所以面板直接显示真实数组。**容器形参 vector<int> v 仍是按值拷贝**（未改动，有回归断言）。
  - 新增 test/do-while-test.ts（14 项，含「检查条件之前必须有快照」的 6 条断言与快照序列打印）、test/arrayparam-test.ts（11 项，含 3 条容器/int&/标量按值的回归）。
- 2026-08-16：**新增 test/render-test.ts —— 渲染层验证**。用 react-dom/server 的 renderToStaticMarkup 把 VariablesPanel 真渲染成 HTML（不用 JSX，用 createElement，避免 rolldown 的 JSX 配置问题），对每个 preset 采样渲染所有快照，断言「不崩」「有变量时不是空壳」「关键结构齐全」（call-label/graph-svg/tree-node-wrap/map-key/graph-weight 等）。能抓到「输出对但画面爆掉」的 bug（如历史上 struct 进容器的黑屏）。10 个 preset / 30 项断言全过。注意：参数被 collectLocals 排除（interpreter.ts:590），所以 fib(int n) 无 call-locals，参数值靠节点内联标签 fib(6) 呈现。
- 2026-08-16：**为「语言子集相容性」提问做逐条核查，并修掉 2 个真 bug**。核查结论固化为 test/compat-test.ts（44 项断言，可用/不可用两侧都断言）。确认**不支持**：do-while、switch、三目 ?:、位运算（^ & | << >>）、auto、range-based for、迭代器形式、强制类型转换（(double)a 与 double(a)）、数组作函数参数、getline、cin>>char、setprecision/fixed、printf。确认**支持**：局部数组（含 2D、递归逐帧独立、声明后默认全 0——与 C++ 的未定义值不同）、sort(v)/sort(v,n)/lower_bound(v,x)/lower_bound(v,n,x)/reverse(v[,n])/swap（仅标量，含 a[i] 形式）、引用参数、容器按值参数、cin 链式读入。修的 bug：(1) lower_bound(v, x) 二参形式把 x 当成 n，抛 JS 内部 TypeError（Cannot read properties of undefined）——改为正确区分二参/三参；(2) sort(a, n, cmp) 静默忽略第三个参数并按升序排序（给出错误结果且无提示）——改为明确报错；(3) sort(v.begin(), v.end()) 报误导性的「非法的下标访问」——改为明确提示不支持迭代器形式。另新增 test/presets-test.ts：逐个执行 src/presets.ts 全部 preset 并断言不报错（新增 preset 后跑它即可验证）。README「已知限制」「测试」两节按实测重写。
- 2026-08-16：**数据结构的树也套用同一套缩放/放大/跟随**（tree<T> / BST / 堆共用 TreeGraph）。做法：把「缩放 + 自动适应 + 放大整屏 + 跟随」抽成共享的 useTreeViewport hook 与 TreeViewport 视口组件，调用树与数据树共用一套实现；顺带把调用树原先的 .calltree-section.magnified + .viz-body.no-contain 方案换成 createPortal 到 document.body（既不受 .viz-body 的 overflow 裁切，也不受其 container-type 产生的 layout containment 影响），并移除了 magnified/onToggleMagnify 两个透传 props。数据树额外获得「跟随本步读写的节点（写优先）」。节点尺寸与字号随缩放：.tree-graph .tree-node 改回 em 可继承（.cell 里写死的 13px/内边距会覆盖继承）。
- 2026-08-16：**调用树窗口太小 → 放大 + 缩放 + 调用栈视图**。根因：树宽 = 叶子数 × SLOT(130) + 180，fib(5) 就 1220px、fib(10) 有 89 个叶子约 11750px；而卡片是 shape-square（>1440px 屏只有半宽）且高度被 max-height:min(420px,42vh) 卡死。做法：(1) 卡片改整行 shape-horizontal，高度上限提到 min(62vh,560px)；(2) 工具栏 完整树/调用栈、−/＋、适应（自动适应）、1:1、放大（fixed 整屏 + Esc 退出）；(3) 缩放直接作用于 SLOT/NH/DH 与字号本身（不用 CSS transform，文字清晰且滚动几何精确），z<0.7 触发 LOD 隐藏局部变量/返回值；(4) 新增「调用栈」模式只画 根→活动节点 路径，宽度由 O(叶子数) 降为 O(深度)，深递归才真正能一屏放下。另修一个自己引入的坑：.viz-body 的 container-type 会施加 layout containment 从而成为 fixed 后代的包含块，会裁切整屏浮层，放大时加 .no-contain 关掉。
- 2026-08-16：**修复递归树不自动跟随**——CallTreeGraph 现在把当前活动调用节点自动滚进视野（含横向；树的宽度由叶子数决定，fib(5) 就有 8 个叶子约 1200px，远超卡片宽度，所以以前横向也会滚出视野）。顺带让编辑器把当前执行行滚进视野（此前只加高亮、从不滚动）。另修 vite.config.ts 的 watcher 忽略规则：原先只忽略小写 *.tmp，Windows 下原子写入产生的 CodeEditor.tsx~RFxxxx.TMP 会让 dev server 以 EBUSY 直接崩溃。
- 2026-08-16：**笔记本适配（数据结构大小不合理 / 工具栏被挤出屏幕）**——右侧固定两列网格在窄屏把数组挤成多行、卡片又高又窄；改为按可视宽度自动退化为单列（≤1440px 单列 + @container 拖窄自适应），格子尺寸分档收紧（≤1440/1180/980）。工具栏 topbar 允许换行并在窄屏压缩（Windows 125%/150% 缩放会把 CSS 视口压到约 1093/1280px，原先单行工具栏会被挤出视口）。调用树节点间距改为按真实标签宽度/局部变量行数自适应（原先固定 SLOT=130/DH=76，标签带真实参数值后相邻节点重叠）。默认分割比按窗口宽度选择（<1500px 用 50%）。
- 2026-08-16：**修复递归树显示变量名而非实际值**——调用节点标签原先用 expr.args.map(formatExpr)（源码文本，显示 fib(n - 1)）；改为标量实参取实际值（fib(5)/fib(4)…），容器/引用实参保留变量名。test/calllabel-test.ts 2 项通过，回归 15 个测试全过。
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

## 当前状态（完成度估算：约 90%）
- 已完成：解释器语言子集（struct/引用/STL/set/map/图/pair/deque/multivec/string）、变量/容器/调用树可视化、步进与断点、cin、预设、快捷键、bool 开关、条件开关、可拖拽垂直分割、窄屏与笔记本自适应。
- 进行中：（无）
- 未开始：右侧卡片自由拖拽 + 缩放（画布化）、导出 SVG、明暗主题、.in 文件导入。

## 文件清单与职责
| 文件 | 职责 | 状态 |
|---|---|---|
| src/App.tsx | 主壳：布局/拖拽/步进/快捷键/预设/localStorage；含 ResizeObserver 像素高度 | 编辑器方案已改 |
| src/components/CodeEditor.tsx | CodeMirror 封装：当前行高亮 + 断点 gutter；height="100%" | 稳定 |
| src/components/VariablesPanel.tsx | 变量/容器/调用树/树图渲染 | 稳定 |
| src/index.css | 样式；编辑器高度链 + 窄屏媒体查询（≤1440/1180/980px）+ @container 自适应 | 稳定 |
| src/interpreter/*.ts | lexer/parser/ast/interpreter/memory | 稳定 |
| src/presets.ts | 示例预设 | 稳定 |
| test/ | 回归测试 15 个（数组/快照隔离/set·map/pair/图/多 vector/STL/struct/initlist/string/调用树标签） | 全通过 |

## 进行中 / 卡住的问题
- （无卡住问题）编辑器布局 bug 已解决，详见 DEBUG.md。

## 下一步执行计划（精确到文件）
1. 从待办里挑一项开始（建议：src/interpreter 快照增量存储，或 set/map 容器）。
2. 每完成一项，更新本文件与 AGENTS.md。

## 已知坑 / 环境事项
- Windows 沙箱 EPERM → npm run dev/build 必须 sandbox_permissions="danger-full-access"（Vite spawn 原生二进制）。
- 改代码后必须 npm run build + 重启 dev，再探 http://localhost:5173/ 期待 200。
- 编辑器布局 bug 详见 DEBUG.md。
- npm run typecheck 当前有约 90 个既存类型错误（interpreter.ts 71 / VariablesPanel.tsx 17 / parser.ts 1 / CodeEditor.tsx 1），全是联合类型未收窄，不影响 vite build 与运行；详见 DEBUG.md。
- 工作区已迁移到笔记本：C:\Users\wangy\Desktop\VisualCode（旧 C:\Users\hy\... 路径作废）。
- **除錯教訓（徽章探針事件，值得記住）**：自己寫的診斷腳本若回報「功能不見了」，**先懷疑探針的抽取邏輯，再懷疑功能**。當時 badge-check.ts 用 `class="caret">([A-Za-z_]\w*)` 抽卡片名，但實際 HTML 是 `class="caret">▾</span>a`（caret 的內容是 ▾、不是空的），所以四種別名只抓到 1 個，印出「NO badge for …」看起來像功能壞掉；換成不依賴取名的寫法（只看 alias-badge 的文字與所在容器）後立刻全數通過——**功能一直是好的**。兩個探針檔中間隔的 32 秒，就是換寫法所花的時間。
- 另一條同類教訓：`run` 不是 throw，而是把執行期錯誤放進**最後一個快照的 `error` 欄位**，寫斷言要讀 `snapshot.error`。
- 自动压缩 checkpoint：CHECKPOINT-2026-08-16.md
