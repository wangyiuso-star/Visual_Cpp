# HANDOFF.md — 项目详细状态档案

## 最近更新
- 2026-08-17：**v0.9.0 —— 右側卡片「畫布化」：拖動排序 + 單卡縮放 + 整行寬（+ 持久化）**。這是待辦清單上最後一項（`[ ] 右侧卡片自由拖拽 + 缩放`）。
  - **拖動排序**：卡片標題列左邊加一個拖动把手（⠿，`draggable`），拖到哪張卡片上就佔那張的位置（`moveKeyTo`），落點有虛線框提示、被拖的卡片半透明。原有的 ↑/↓ 按鈕保留（精確、方便鍵盤）。
  - **單卡縮放**：每張卡片有自己的 `−  100%  ＋`（70%~160%，步進 10%，點百分比還原 100%）。實作用 **CSS 的 `zoom` 屬性**而不是 `transform`：`zoom` 會連 `.cell` 裡寫死的 13px 字號與內距一起縮放，而且**參與佈局**（`transform` 會留下一塊空白）；另外補了 `width: calc(100% / var(--card-zoom))`，放大後才不會溢出格子。
  - **整行寬**：`⤢/⤡` 在「半寬」與「跨整行」之間切換（`grid-column: 1 / -1`）——筆電上把二維陣列/圖那張拉成整行很實用。
  - **持久化**：順序 / 縮放 / 全寬存在 `localStorage['cpp-viz.panel-layout']`（老師排一次就固定下來）。讀檔一律驗型別，壞掉就當空佈局（不能讓一份舊存檔把面板弄壞）。
  - **可測性**：拖動與 localStorage 在 node 端測不到（要真瀏覽器的 DOM 事件），所以把「順序怎麼算、縮放怎麼夾、存檔怎麼讀」抽成純函式 `src/components/panelLayout.ts`，新增 `test/panellayout-test.ts`（**24 項**：拖到誰身上、相鄰互換、邊界、夾取、壞存檔、round-trip）。`test/render-test.ts` 補 4 項 DOM 斷言（拖动把手 / 縮放控件 / `--card-zoom` / 按鈕數）。
  - ⚠️ **教訓（編碼）**：用 PowerShell 的 `Add-Content` 追加 CSS 時，中文註解被 ANSI 碼頁寫成 `?`（`/* ---- ??:???? ...`）。**寫檔案一律走 `tools.write` / `tools.edit`（UTF-8），不要用 PowerShell 的文字管線寫含非 ASCII 的檔案**；已用 node 腳本以 UTF-8 重寫該段。
  - 🔎 **跨專案測試修正**：HKOI 的 preset 已經從 21 個長到 **32 個**（多了 v0.7.0 的「讀到 EOF（while cin）」「getline 與 cin.ignore」「字元算術」「固定小數位數」「sort 降序」等）。`test/hkoi-presets-test.ts` 以前一律用**空輸入**跑 → 那些要讀 cin 的 preset 會撞上「cin 讀不足」的明確錯誤（正確行為，但測試要餵資料）。已加 `PRESET_INPUTS`（照他們註解給：EOF → `1 2 3`；getline 陷阱 → 第一行 `3`、第二行 `hello world`），**84 項全過**。
  - 測試檔 **32 個**（新增 `panellayout-test`），全過、0 跳過。
- 2026-08-17：**v0.8.0 —— HKOI 缺口提案的第二優先（他列為「有替代、不急」的那批，一次補齊）**。
  - **`#define`（物件式巨集）**：本工具沒有前置處理器，所以在 `tokenize` 之前加一趟文字層展開 `expandDefines(src)`。第一趟把所有井號開頭的行拿掉（`#include` 本來就被忽略），遇到 `#define NAME 內容` 就記下來；**用等長空白取代，行號/欄號不變**（錯誤訊息位置才對得上）。第二趟掃識別字換掉（跳過字串/字元常數與註解，最多 5 趟支援巨集套巨集）。`#define f(x) …`（名稱後緊接 `(`）＝函式式巨集，忽略。
  - **`typedef` / `using 別名`**：以前只是 `skipToSemi()` 跳過（所以 `typedef long long ll;` 不會報錯，但 `ll x;` 會壞）。現在 Parser 有 `typeAliases: Map<string, Type>`，`parseProgram` 真的解析 `typedef T NAME;` 與 `using NAME = T;`（`using namespace std;` 仍然跳過），`isTypeStart` / `parseType` 都查別名 → `ll x`、`vector<ll>` 都能用。`size_t` 當 `int`（`parseScalarTypeName` + `isTypeStart`）。
  - **三目運算子 `?:`**：`parseTernary()` 插在 `parseAssignment` 與 `parseBinary` 之間（右結合）；新增 `ternary` 節點，只求值被選中的那一邊。
  - **`sizeof` + `memset`**：新增 `sizeof` 節點（`sizeof(a)` / `sizeof(int)` / `sizeof a`）。`sizeof` 只認「陣列 / struct / pair / 純量」；**動態容器刻意不支援**（C++ 的 `sizeof(vector)` 是物件大小 ≈24 bytes 而不是元素個數，回假數字會教出 `sizeof(v)/sizeof(v[0])` 的經典錯誤，所以直接給教學說明並要你用 `.size()`）。`memset` 照 **逐位元組**語意（`memset(a,0x3f,sizeof(a))` → 每個 int 是 `0x3f3f3f3f` = 1061109567，不是 63）；`double/float` 填非 0 會得到垃圾位元 → 明確報錯。
  - **區間寫法**：新增 `resolveRange()`，把 `v.begin(), v.end()`（整個容器）與 `a, a+n`（前 n 個）化簡成「容器 + 個數」，於是 `sort(v.begin(), v.end())`、`sort(a, a+n)`、`sort(a, a+n, greater<int>())`、`reverse(v.begin(), v.end())`、`lower_bound(v.begin(), v.end(), x)`、`fill(a, a+n, x)` 都能跑（以前全部報「不支持迭代器形式」）。**除了這些固定搭配仍然不做迭代器**，`v.begin()` 單獨出現會給指引（range-for / `.size()` / `s.count(x) > 0`）。
  - **其他**：`fill(v.begin(), v.end(), x)`、`v.assign(n, x)`、`min({a,b,c})` / `max({a,b,c})`、`INT_MAX` / `INT_MIN`（另 `LLONG_MAX` / `UINT_MAX` / `LONG_MAX`）、`cin.get()`（讀字元含空白，與 `cin >> c` 不同）。
  - ⚠️ **踩到的坑（值得記）**：把 `fill` 做成內建之後，`test/arrayparam-test.ts` 裡那個**使用者自己取名 `fill` 的遞迴函式**被內建搶走了（它把 `fill(b,0,4)` 當成 std::fill）。修法：`execCall` 開頭算 `shadowed = rt.functions.has(name)`，我新加的內建（`memset` / `fill` / `getline` / 數學函式）都加 `!shadowed` 守衛 —— **使用者自己定義的函式優先**。
  - 測試：`test/gap-test.ts` 92 → **127 項**（新增第二優先那批，含 `sizeof(a)/sizeof(a[0])`、`memset 0x3f = 1061109567`、`sort(a,a+n)` 只排前 n 個、`#define` 名稱在字串/註解裡不被替換、`sizeof(vector)` 的教學錯誤訊息）；`compat-test` 63 → 68 項（`sort(v.begin(),v.end())` / 三目 / `cin.get()` / `using` 從「不可用」翻到「可用」）。**31 個測試檔全過、0 跳過**。
  - 仍未做（第三優先，提案說少用）：`switch`、lambda、預設參數、函式多載、`for` 標頭的逗號運算式、`__builtin_popcount`（位元運算永久排除）、`cin.get(buf, n)`、`fill` 之外的迭代器用法。
- 2026-08-17：**v0.7.0 —— 實作 HKOI 教材編輯的缺口提案（第一優先 6 項 + 兩個粗糙邊 + 字元算術）**。提案：`_工作檔/工作紀錄/13-給VisualCode的缺口提案.md`（他從 17 份教材反推、57 條實測：可用 28 / 不支援 29）。我把 57 條全部重跑一遍驗證，他的清單基本準確。
  - **1.1 `while (cin >> x)` 讀到 EOF**（他說這是唯一「不補就沒辦法好好上課」的兩項之一）。**根因是輸入模型**：舊版只有 `input: string[]`（用 `split(/\s+/)` 切好的 token），換行資訊早就沒了 → getline 根本不可能實作。改成**游標模型**：留原始字串 `inputText` + `textPos`，`cin >>` 跳過空白讀一個 token（**char 目標只吃一個字元**，照 C++ 的 char 重載），`getline` 讀到下一個 `\n`。新增 AST 節點 `cin_expr`（`cin >> x` 當運算式）：EOF 回 `false`，於是 `while (cin >> x)`、`while (!(cin >> x))`、`if (cin >> x)` 都能用；**語句形式 `cin >> a >> b;` 讀不足仍然是明確錯誤**（保留 v0.5.2 的「要读第 N 个值」訊息，兩種形式共用 `cinReadTargets`）。另加 `cin.ignore()` / `cin.ignore(n, c)`（getline 的搭檔），Windows 的 `\r\n` 會正規化。
  - **1.2 `getline(cin, s)` + `cin >> char`**：教材用量最大（10 次）。C++ 的經典行為**照實呈現**：`cin >> n; getline(cin, s);` 讀到**空字串**（換行還在緩衝區），要接 `cin.ignore()`——這是教學點，不是 bug，測試裡有一條專門鎖它。
  - **1.3 C 風格轉型** `(int)x` / `(char)(c+1)` / `(long long)x` / `(int)v.size()`：新增 `cast` 節點（parser 在 `(` 之後 lookahead 認純量型別名，不是型別就退回普通括號）。函數式寫法 `double(a)` 仍不支援。
  - **1.4 數學函式** `sqrt` / `pow` / `floor` / `ceil` / `round` / `fabs`（都回 double；`sqrt(-1)` 印 `nan`，`cppDefaultDouble` 補了 nan/inf）。
  - **1.5 `sort(v, greater<int>())`**：新增 `comparator` 節點；`sort` 的參數解析改成掃描（比較子/個數可任意順序），所以 `sort(v, greater<int>())`、`sort(v, n, greater<int>())`、`sort(v, cmp)`、`sort(v, n, cmp)` 都通。
  - **1.6 `fixed` + `setprecision(n)`**：他特別請求重新考慮（HKOJ 有對應題目 E1714C／E1715C，學生真的會被要求寫）。**用戶決定放寬「永久排除」，但只做這兩個**，不做完整 `<iomanip>`。實作：runtime 存 `floatFixed` / `floatPrecision`，`cout` 遇到 `fixed` / `setprecision(n)` 只改狀態不輸出，`toStringVal` 加 `FloatFmt`。**順帶把 double 的預設輸出改成 C++ 語意**（6 位有效數字、指數 < -4 或 ≥ 6 用科學記號）：`0.1+0.2` → `0.3`、`1.0/3` → `0.333333`、`1e9` → `1e+09`（舊版是 JS 全精度 `0.30000000000000004`）→ compat-test 一條斷言因此翻面。
  - **4.1 容器比較的誤導訊息 → 真的能比**：新增 `seqOf` / `cellOrder` / `cellEquals`，支援 `vector` / `deque` / `set` / `pair` / `map` 的 `==` `!=` `<` `<=` `>` `>=`（字典序，元素可再是容器），`unordered_map` 只能比相等（無序）。**C 陣列刻意不假裝**：`int a[3] == b[3]` 在 C++ 比的是指標地址，工具給明確說明而不是靜默逐元素比。`sort` / `lower_bound` 一併改用 `cellOrder` → **`sort(vector<pair>)` 也能跑了**（順手解掉提案第 2.4／2.5 兩條：`v.push_back({1,2})` 放 pair、pair 比大小）。
  - **4.2 `const T&` 參數**：新增 `constRef`；語意同 `T&`（不做 const 正確性檢查），但**照 C++ 可以綁常數/臨時值**（`f(5)`、`f(a*3)`、`f("abc")`）。非 const 的 `int&` 綁常數改成明確錯誤（C++ 也編不過）並提示改用 `const int&` 或按值——舊版的訊息是誤導性的「非法的下标访问」。
  - **字元算術（提案沒列，但我們自己探針抓到，而且它擋住 `(char)` 的教學用途）**：`'d' - 'a'`、`c + 1`、`c += 1`、`c++`、`c - 32` 以前全部報「字符串 \"d\" 不能转为数字」。三個修正：(1) `num` 對 char 取**字元碼**；(2) `cmp` / `eq` 改成「任一邊是 string 型別才字串比」，否則照數值 → 同時修掉 `'a' > 100`（舊版字串比給錯答案）與 `c == 97`；(3) **賦值與 `++`/`--` 照目標型別做隱式轉換**（`char c; c = c + 1;` 存 `'b'`、`int x; x = 3.7;` 存 3——舊版會把 3.7 原樣存進 int）。
  - **型別債清理**：`execCall` / `execMethodCall` 的參數從 `Expr` 改成 `Extract<Expr, {kind:'call'}>` / `method_call`（本來就一直在存取 `.args`）→ `tsc --noEmit` 的錯誤從 **149 降到 30**。`npm run build` 仍然只跑 vite（不型別檢查）。
  - 測試：新增 **`test/gap-test.ts`（92 項）**——逐條覆蓋上面每一項（含 `while(cin>>x)` 空輸入 0 圈、getline 的經典陷阱、`(int)(2.7+1.3)=4` 這種浮點細節、科學記號、字元算術、容器比較的支援/不支援兩側）；`cin-test` 14 項（char 從「不支援」翻面）、`compat-test` 63 項（getline / cin>>char / setprecision / fixed / C 風格轉型 五條從「不可用」翻到「可用」）、`container-test` 42 項。**全部 31 個測試檔通過、0 跳過**。
  - 尚未處理（提案的第二／第三優先，他說不急）：`#define` / `typedef` / `using ll` / `INT_MAX` / 三目 `?:` / `memset` / `fill(iter)` / `assign` / `size_t` / `s.find(x) != s.end()`（迭代器，永久排除）/ `cin.get()` / 預設參數 / `switch` / lambda。
- 2026-08-17：**v0.6.1 —— 容器当值时右边不再显示「?」+ 修 `vector<int>()` 崩溃 + 不支援的组合给明确错误**。
  - **使用者回报**：`map` 的值是 `vector` 时，画面上那一格显示 `?`（并猜是「写 set 的时候把 value 绑死成一个值」）。
  - **根因不在 set，而在渲染层**：`VariablesPanel.tsx` 有 **15 处**「不是标量就给 `?`」的退路（map 的键/值、struct 成员、pair 的成员、stack/queue/deque 的元素、数组窗口的格子……），而且 `formatCellShort` 本身也只认 scalar/pair/struct。v0.6.0 让容器能「当值」放进这些位置之后，这些退路就全被踩到了。
  - **修法**：`formatCellShort` 改成**递归摘要** —— 容器 `[1, 2, …]`、set `{…}`、map `{k: v, …}`、pair `(a, b)`、struct `{x:1, …}`、tree 层级序 / BST 中序、ref → `&名字`；带**深度上限 3** 与**长度上限 8**（超出显示 `…`），**永不回传光秃秃的 `?`**。15 处退路全部改呼叫它。
  - **顺带修掉一个真崩溃**：`vector<int>()`（合法的空 vector，常写成 `g.push_back(vector<int>())`、`v = vector<int>()`）以前拿 `undefined` 去求值，崩成 `Cannot read properties of undefined (reading 'kind')`。现在回传空 vector。
  - **顺带**：`g.push_back({1, 2})`（元素是 vector 时，`{…}` 就是内层 vector 的初始化列表，合法 C++）原本报「初始化列表只支持 struct 元素」，现在支援（可嵌套）。
  - **不再外泄内部讯息**：`run()` 的兜底分支把非 RuntimeError 的错误标成「内部错误（这是本工具的 bug，请把这段程序反馈给我们）」；`set<容器>` / `sort(vector<容器>)` / `lower_bound(vector<容器>)` 改为明确的「只支持标量 / 只能放进标量元素」（以前是 `cellScalar: 非标量` 这种看不懂的讯息）。
  - 新增 `test/summary-test.ts`（23 项：每种容器当值的摘要、深度/长度上限、ref、空容器，以及**所有 preset 的每一格容器都不能被画成 `?`** 的地毯式检查）；`test/container-test.ts` 28 → **36 项**；`test/render-test.ts` 增 4 项 DOM 断言（就是以前写死 `': ?'` 的那几个位置）。测试档共 **30 个**。
  - 注：`?` 仍有一个**合法**用途 —— 未初始化的纯量（`int a[10];` 的格子、`vector<int> v(3)` 的元素）本来就显示 `?`（`formatScalar` 的约定）。那与这个 bug 是两回事，测试刻意只抓「非纯量 cell 被画成 `?`」。
  - 工具链注记：`npm run build` 只跑 `vite build`（rolldown 只剥型别、**不做型别检查**），所以 TS 型别错误**不会挡住建置**；`tsc --noEmit` 目前有 **149 个既有错误**（改动前后同一个数）。以后改完可以跑一次确认「没有新增错误」，但不要以为 149 是这次弄坏的。
- 2026-08-16：**v0.6.0 —— 容器可以当值传递**（修掉三个缺口，使用者回报的「回传容器的递归跑不了」就是它們造成的）。
  - **缺口 A（核心）**：`evalExpr` 的 `ident` / `index` 分支以前直接拒绝容器（`变量 "res" 是容器，不能作为标量使用`）→ 现在回传「带 cell 的容器值」。于是 `m[k]=v`、函数回传容器、容器按值传参、`g[u]` 都能用。**这正是使用者 `return memo[expression]=res;` 的报错来源**（`execAssign` 本来就支援容器赋值，是 evalExpr 先挡掉的）。
  - **必要守衛**：新增 `assertScalarRV`，在 `num` / `cmp` / `coerceTo` / `execAssign` / `cout` / `+=` 字串分支都拦下容器——**不放宽就会从「明确报错」退化成「静默 0」**（`int x = v`、`string s = v`、`a[0]=v`、`s+=v` 实测都明确报错）。
  - **缺口 B**：`execDecl` 以前只处理 `array / pair / struct` 的初始化式，其他容器**静默留成空容器**（`vector<int> left = f();` 会得到空的！比报错更危险）→ 现在要求初始化式回传同类容器，否则给「不能用标量初始化 vector」/「初始化类型不匹配」。
  - **缺口 C**：map 的值是容器时不支援（`scalarName(valueType)` 要求纯量）→ 改用 `allocFromType` 建默认值（纯量情况刻意保持 `value: null` 的原样）；`m[不存在的键].push_back(x)` 照 C++ `operator[]` 会先插入（以前会爆 JS 内部错误 `Cannot read properties of undefined`）。纯读取 `m[k]` 仍维持「不插入」。
  - **另修**：临时值下标 `f()[0]`（`indexTempCell`）与临时值成员 `mk().x`（原本只支援 `f().first`）。
  - 新增 `test/container-test.ts`（**28 项**），内含**使用者回报的 LeetCode 241 原题**当回归：`2-1-1` → `2 0`、`2*3-4*5` → `-34 -10 -14 -10 10`。测试档 29 个。
- 2026-08-16：**v0.5.2 —— 修「cin 输入不足」的偶发 bug（根因是快照失效漏了 cin 输入）+ 错误讯息讲清楚差几个值**。
  - **使用者回报**：偶发出现「cin 输入不足」，**刷新一下就没了**。→ 这种「非决定性 + 刷新即好」通常是状态 bug，不是程式的 token 数问题。
  - **根因**：`collect()` 依赖 `code` / `showIf,showWhile,showFor` / `boolAsInt` / **`input`**；但只有前三个变更时才会 `setSnapshots(null)`，cin 输入框的 `onChange` 只做了 `setInput`。于是「**先按运行（输入框还空着）→ 快照里烙着错误 → 才填输入框 → 快照没失效 → 之后按单步/播放/←→ 都只是重播那个旧错误**」；刷新把 snapshots 清掉才会好。完全对应「偶发 + 刷新即好」。
  - **修法**：新增 `onInputChange`，改 cin 输入就跟改代码一样让快照失效（`setPlaying(false)` / `setSnapshots(null)` / `setIndex(-1)` / `setError(null)`）。
  - **讯息改善**：`cin 输入不足（读到输入末尾）` → 「`cin 输入不足：程式要读第 N 个值，但「cin 输入」框只提供了 M 个（用空白分隔）`」。
  - 新增 `test/cin-test.ts`（14 项：链式读入、多行、无空白→整串进 string、用 string 读运算子的变通、输入不足的三种情况、`cin >> char` 与 cin 目标的已知限制）。测试档 28 个。
  - 注：App 这一层的行为**没有自动化测试**（需要 DOM 互动），已用 build + 代码检视确认；手动验证法见下。
- 2026-08-16：**v0.5.1 —— 收紧字元参数 + substr 越界报错**（延续「不要静默、不要教出编译不过的写法」）。
  - `append / insert / replace / compare` 现在**只接受字串参数**：C++ 里这四个方法没有接受单一字元的重载，以前工具会用 char 跑（`s.append('!')`），学生学到的是**真实 C++ 编译不过**的写法。现在明确报错并提示改用 `push_back` / `+=`。
  - 保留宽松（因为 C++ 合法）：`find / rfind`（有 `find(CharT)` 重载）、`push_back`（`push_back(CharT)`）、`+=`（`operator+=(CharT)`）。
  - `substr(pos)` 在 `pos > s.size()` 时以前**静默回空字串**，而 `at` 同情况会报错 → 工具内部不一致；现在 substr 也明确报错（`pos == size()` 仍合法，回空字串）。
  - `test/strfunc-test.ts` 58 → **74 项**；`test/compat-test.ts` 补 2 项。
- 2026-08-16：**v0.5.0 —— string / vector 常用成员 + 字元函数，并修掉 `find` 的静默错误**。
  - ⚠️ **课堂安全修正**：`s.find(str, pos)` 以前**忽略第二参 pos**（`s.find("l",4)` 在 `"hello"` 上回 2，正解是找不到 → -1）。与当年 `sort` 忽略第三参同一类：静默给错答案。已修，并用测试锁住。
  - 补齐 string：`empty / at / front / back / rfind / push_back / pop_back / append / insert(pos,str) / erase(pos[,len]) / replace(pos,len,str) / compare`（`substr` 本来两形式就有）。
  - 补齐 vector：`front / back / at / resize / insert(pos,val) / erase(pos[,len])`。
  - 新增字元函数：`toupper / tolower`（回 char）＋ `isdigit / isalpha / isupper / islower / isalnum / isspace`（回 bool）→ Unit 6 的「大小写转换、判断字元类别」终于能演示。
  - **方法可以串接**：`s.substr(1).size()` 以前报误导性的「非法的下标访问」（interpreter 要求接收者是左值）→ 现在临时值上的唯读方法可用；对临时值呼叫**修改**方法给明确错误。
  - `string::npos` 现在被接受且等於 -1（与 `find` 的回传一致），所以 `if (s.find(x)==string::npos)` 可以直接跑。
  - 新增 `test/strfunc-test.ts`（58 项）；`test/compat-test.ts` 补 5 项 → 58 项。
  - ⚠️ **工具教训（这次的坑值得记）**：我加测试时漏了跳脱，写成 `push_back('1')` 的引号被吃掉 → 测试档语法错误 → 打包失败。而执行器把「打包失败」一律记成 **SKIP**，加上我手动跑的指令**没检查打包 exit code**，于是跑到了**旧的 .mjs**，显示 50 通过（实际是新档没打包成功）。**已修执行器**：打包失败要看错误内容——相依外部档不存在才 SKIP，语法的错要算 **FAIL**。教训：**SKIP 必须当作红旗**，且手动跑测试一定要检查打包是否成功（别只看 node 的输出）。
- 2026-08-16：**v0.4.0 —— 字串 ↔ 数字内建**（`stoi/stol/stoll/stod/stof` + `to_string`）。
  - 照 C++ 语义：跳过前导空白、可选正负号、**读到第一个不合法字符就停**（`stoi("12abc")==12`、`stoi("3.9")==3`）；一个数字都没有 → 明确报错「没有可解析的数字」（对应 std::invalid_argument）。
  - `stoi(s)` 十进制；`stoi(s, 0, base)` 支持 2..36（第 2 个参数 C++ 是 `size_t*` 出参指针，我们没有指针所以忽略它）。进制越界给明确错误。
  - `to_string`：int / long long / double / char / string → string，与 `cout` 的输出保持一致（bool 受 boolAsInt 开关影响）。
  - 新增 `test/stoi-test.ts`（32 项，含进制、前缀语义、错误、与 range-for 组合的数位和）；`test/compat-test.ts` 补 3 项。
- 2026-08-16：**v0.3.0 —— range-based for**（`for (int x : v)` / `for (auto x : v)` / `for (auto& x : v)`）。
  - 实作：`ast.ts` 新增 `range_for` 节点（`declType === null` 表示 auto）；`parser.ts` 在 `parseFor` 开头做**向前扫描 lookahead**（depth 0 先遇 `:` 即范围 for，先遇 `;`/`)` 则维持经典 for）——lexer **不用动**（`:` 本来就在 OPS1）；`interpreter.ts` 新增 `case 'range_for'` + `rangeForSequence()`。
  - 可迭代：array / vector / deque / set / map(元素是 pair) / string(元素是 char) / tree(1 基层级顺序) / bst(中序遍历＝升序)；stack / queue / priority_queue **明确报错**（C++ 没有 begin/end）。容器必须是可定位的变数或其下标/成员（`g[u]` 可以）。
  - 语义：`auto`/显式类型是**值拷贝**（cell 不可变，天然如此）；`auto&` 绑成 ref cell，写入回到原容器 → 正好是 Unit 8 §7「共享 vs 拷贝」的循环版。范围在进入循环时固定（end 只取一次，与 C++ 一致）。每个元素产生一个快照。
  - ⚠️ **耦合**：`auto&` 用 ref cell 实作，而「参数（别名）」徽章原本靠「是 ref cell」判定 → 会给循环变数误标。已给 ref cell 加 `origin: 'param' | 'loop'`，徽章只认 `param`（`test/aliasbadge-test.ts` 第 7 组断言锁住）。
  - 新增 `test/rangefor-test.ts`（30 项）。`test/compat-test.ts` 的 range-for 由「不可用」翻为「可用」（一般 `auto x = 5;` 仍不可用）。
  - 顺带修：**tag `v0.2.2` 原本指向 `127cae6`（＝v0.2.1）**，是「先打 tag、后 commit」造成的；已删除重打在 `6fa7def` 并推送。**教训：tag 要在 commit 之后打。**
  - 另一条教训（对方发现）：`test/hkoi-presets-test.ts` 的跨专案路径原本写成 `HKOI_teaching/presets/`，实际资料夹是 `VisualCode-preset/` → 该测试**从加入起一直被 SKIP**，等于从没验证过。SKIP 机制会让「路径错」看起来像成功，所以跑测试要**看 `通过 N / 跳過 M` 那一行**。
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
- **Git 紀律（兩次 tag 指錯的教訓，必看）**：
  - 症狀：`git checkout <tag>` 拿到的不是那個版本的程式碼。
  - 第一次（v0.2.2）：**先打 tag、後 commit** → tag 指向前一個 commit。規則：**永遠先 commit，再打 tag**。
  - 第二次（v0.5.1）：commit 訊息裡的 `s.append('!')` 含有**單引號**，打斷了 PowerShell 的單引號字串 → `git commit` 根本沒執行，但後面的 `git tag` 照樣跑（還推上去了）→ tag 又指向舊 commit。規則：**PowerShell 傳訊息用雙引號、訊息裡不要有單引號**；而且**每個 git 步驟都要檢查 `$LASTEXITCODE`**（`if ($LASTEXITCODE -ne 0) { exit 1 }`），不要讓後面的步驟在失敗後繼續跑。
  - ★ **打完 tag 一定要驗**：`git rev-list -n 1 <tag>` 必須等於 `git rev-list -n 1 main`；（若要發佈）再 `git ls-remote --tags origin <tag>` 比對遠端。
  - 修法（若已指錯且已推送）：`git tag -d <tag>` → 重新 `git tag -a <tag> <commit>` → `git push origin :refs/tags/<tag>`（刪遠端）→ `git push origin <tag>`。
- **除錯教訓（徽章探針事件，值得記住）**：自己寫的診斷腳本若回報「功能不見了」，**先懷疑探針的抽取邏輯，再懷疑功能**。當時 badge-check.ts 用 `class="caret">([A-Za-z_]\w*)` 抽卡片名，但實際 HTML 是 `class="caret">▾</span>a`（caret 的內容是 ▾、不是空的），所以四種別名只抓到 1 個，印出「NO badge for …」看起來像功能壞掉；換成不依賴取名的寫法（只看 alias-badge 的文字與所在容器）後立刻全數通過——**功能一直是好的**。兩個探針檔中間隔的 32 秒，就是換寫法所花的時間。
- 另一條同類教訓：`run` 不是 throw，而是把執行期錯誤放進**最後一個快照的 `error` 欄位**，寫斷言要讀 `snapshot.error`。
- 自动压缩 checkpoint：CHECKPOINT-2026-08-16.md
