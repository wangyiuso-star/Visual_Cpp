# OI 代码可视化（cpp-viz）

面向 OI / 算法教学的 **C++ 代码逐步可视化**工具。在浏览器里写 C++，点「运行 / 单步」，右侧实时显示变量、数组、容器、图、递归树等数据结构，并高亮当前行与正在读写的格子，把程序执行过程「演」给学生看。

形态 = 浏览器内迷你 C++ 解释器（lexer → parser → 生成器式逐步执行），非编译器 / 调试器方案，因此轻量、可控、可逐行演示。

## 快速开始

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:5173 ，顶部「预设」下拉选一个示例，点「运行」即可。支持输入用顶部「cin 输入」文本框预填。

## 语言支持（C++ 子集）

**标量类型**：`int` / `long long` / `char` / `bool` / `string` / `double` / `float`

**容器**：
- 数组：一维 `int a[N]`、二维 `int a[N][M]`、大小推断 `int a[] = {1,2,3}`
- vector：一维 / 二维 / 邻接表 `vector<int> g[N]` / 多维 `vector<vector<int>> g(n, vector<int>(m))`
- `stack` / `queue` / `deque`
- `priority_queue`（大根堆 + `greater<T>` 小根堆）
- `tree`（数组式完全二叉树，1 基下标）、`bst`（二叉搜索树）
- `set`（排序去重）、`map` / `unordered_map`（键值对，支持 `m[k]` 读写）
- `pair`（`make_pair`、`.first` / `.second`）
- `struct`（定义、成员读写、初始化、作参数、作返回值）
- 容器存结构体：`array` / `tree` / `vector` 里放 struct

**语句**：声明、赋值（`= += -= *= /= %=`）、`++` / `--`、`for` / **范围 for `for (T x : c)`** / `while` / `do-while` / `if-else` / `break` / `continue` / `return` / `cout` / `cin`（含 **`while (cin >> x)` 读到 EOF**）

**函数**：自定义函数、递归、全局变量、引用参数 `int&`、**`const T&` 参数**（可绑常数：`f(5)`）、**数组形参 `int a[]`（共享/别名语义，等同 C++ 数组退化为指针）**、容器按值参数、结构体参数 / 返回值

**容器可以当值传递**（v0.6.0 起）：函数回传容器（`vector<int> f(){ ... return v; }`）、`T x = f();`、把容器赋给容器的元素（`m["k"] = v`，含 `unordered_map<string,vector<int>>`）、按值传容器参数、临时值下标 `f()[0]`、临时值成员 `mk().x`、整行当参数 `f(g[u])`

**内建**：`min` / `max` / `abs` / `make_pair` / `sort` / `reverse` / `lower_bound` / `swap`

**数学函数**：`sqrt` / `pow` / `floor` / `ceil` / `round` / `fabs`（都回 double，照 C++ 语义）

**数组工具（v0.8.0）**：`memset(a, v, sizeof(a))`（**逐位元组**，`memset(a,0x3f,sizeof(a))` 会让每个 int 变 `0x3f3f3f3f`，这是 C++ 的真实语义）、`fill(v.begin(), v.end(), x)` / `fill(a, a+n, x)`、`v.assign(n, x)`、`min({a,b,c})` / `max({a,b,c})`、`INT_MAX` / `INT_MIN`（另 `LLONG_MAX` / `UINT_MAX` 等）

**区间写法（v0.8.0）**：`sort(v.begin(), v.end())` / `sort(a, a+n)` / `sort(a, a+n, greater<int>())` / `reverse(v.begin(), v.end())` / `lower_bound(v.begin(), v.end(), x)` / `fill(a, a+n, x)` 都会化简成「整个容器 / 前 n 个」。**除了这些固定搭配，本工具不做迭代器**（`v.begin()` 单独出现会给出指引：用 range-for 或 `.size()`）

**输入**：`getline(cin, s)`（读一整行含空白）、`cin >> c`（单一字元）、`cin.ignore()` / `cin.ignore(n, c)`、`while (cin >> x)`（读到 EOF）

**类型转换**：C 风格 `(int)x` / `(char)(c+1)` / `(long long)x` / `(double)a/b`

**字元算术**：`c - 'a'` / `c + 1` / `c++` / `c - 32` / `'A' + 32`（`char` 就是数字，Unit 6 用）

**输出格式**：`cout << fixed << setprecision(n)`（小数字数）、单独 `setprecision(n)`（有效位数）；`double` 预设输出照 C++（6 位有效数字 + 科学记号）

**字元函数**：`toupper` / `tolower`（回 char）、`isdigit` / `isalpha` / `isupper` / `islower` / `isalnum` / `isspace`（回 bool）

**string / vector 方法**：`s.size()` / `s.length()` / `s.empty()` / `s.at(i)` / `s.front()` / `s.back()` / `s.substr(pos[, len])` / `s.find(str[, pos])` / `s.rfind(str[, pos])` / `s.compare(str)` / `s.push_back(c)` / `s.pop_back()` / `s.append(str)` / `s.insert(pos, str)` / `s.erase(pos[, len])` / `s.replace(pos, len, str)` / `s.clear()`
｜ `v.size()` / `v.empty()` / `v.at(i)` / `v.front()` / `v.back()` / `v.push_back(x)` / `v.pop_back()` / `v.insert(pos, x)` / `v.erase(pos[, len])` / `v.resize(n)` / `v.clear()`
（方法可以串接：`s.substr(1).size()`；但**不能对临时值调用修改方法**，会明确报错）

**字串 ↔ 数字**：`stoi` / `stol` / `stoll` / `stod` / `stof`（照 C++ 语义：跳前导空白、可选正负号、读到第一个不合法字符就停；`stoi(s, 0, base)` 支持 2..36 进制；一个数字都没有会明确报错）、`to_string`（int / double / char / string → string）

**表达式**：花括号初始化列表（如 `v.push_back({1,2,3})`、`vector<pair<int,int>>` 的 `v.push_back({1,2})`）、**`cin >> x` 当条件**、**比较子 `greater<int>()` / `less<int>()`**、**容器之间比大小**（`v < w`、`a == b` 的 pair 比较，字典序，元素也可以是容器）

## 可视化（右侧面板）

- **当前行高亮** + 读写/判断着色（读=蓝、写=绿、判断=橙）
- **作用域标签**：global / local
- **容器视图**：数组窗口（1D/2D，固定窗口 + 滑动条 + 访问自动跳转）、栈竖排、队列/deque 横排、堆/树/BST 树形图、set 列表、map 键值对、struct 成员列表、struct 矩阵（行=元素下标、列=成员名）
- **递归树 / 调用树**：节点高亮，返回后变暗 + 显示返回值
- **图**：邻接表识别为图（节点+连线）、带权边显示权重、有向图自动画箭头、节点值覆盖（圆圈里显示 dist 值、上方显示下标）
- **参数（别名）徽章**：引用参数 / 数组形参的卡片或纯量格会标上「参数（别名）」，学生才知道它既是一个名字、也是别名。**注意：写入高亮仍然只落在「被指向的那个名字」上**（函数内写 `a[i]` 时亮的是呼叫方的 `g`），这本身是「a 就是 g」的直观证据
- **排序统计**：用自定义比较函数排序时，顶部显示「比较次数 / n」（可直接拿来讲复杂度）
- **树形视图缩放**：调用树与数据结构树都有工具条（−/＋/适应/1:1/放大整屏，Esc 退出）；「调用栈」模式只画「根→当前活动节点」的路径，深递归也放得下；缩放变小时自动隐藏局部变量
- **不会画爆**（v0.9.4）：**图超过 80 个节点或 800 条边就不画**（改显示 5×5 表格视窗并说明原因，例如 501×501 的 DP 表不该当图看）；`stack` / `queue` / `deque` / `set` / `map` 一次最多列 **300 项**，其余显示「… 还有 N 项未显示」。数组 / 2D / struct 本来就有滑动窗口（`WIN_1D` / `WIN_2D`）
- **布局（v0.9.6）**：**多张卡片自动并排** —— 网格用 `auto-fill`（宽屏幕多几栏、拖窄了自然变单栏），而每张卡片**预设只占一栏**；只有**树 / BST / 堆**与**很宽的二维表**（行 > 12 列）才占整行。一维数组 / 字符串 / set / map / queue 这些会与别的卡片并排。**二维数组窗口固定 5×5**（大小可预期；写入/读取到的那一格会**自动滚进窗口**，也能用滑杆移动）；**一维数组窗口**会跟着卡片实际宽度决定显示几格（半宽卡片才不会把数组挤成两行）。想单独给某张卡片整行，用卡片上的 `⤢`（方形大块并排在上、横长条在下），每张卡片可用 ↑/↓ 调顺序

## 交互

- 运行 / 暂停 / 单步 / 后退 / 跳转指定步 / 速度滑条
- 断点（点行号左侧设置，运行到断点自动停）
- cin 输入预填（**改动它会让快照失效**，跟改代码一样需要重新运行；错误讯息会告诉你「要读第几个值、输入框给了几个」）
- 预设示例一键载入
- localStorage 自动保存草稿
- 键盘快捷键（空格=播放/暂停，←/→=单步，R=重置）
- **编辑器缩排**：Tab 预设缩排 **4 个空格**（CodeMirror 预设是 2，可在「设置 ▾」切回 2 格，选择会记住）；**整行加/减缩排**用 **Tab / Shift-Tab**，或 **Ctrl+]** / **Ctrl+[**（VS Code 风格，Mac 为 Cmd+]，不用先选取整行；选多行时整批处理）
- bool 显示 1/0 开关
- if / while / for 条件判断显示开关
- 可拖拽垂直分割（代码区 ↔ 数据区）
- **卡片拖动排序 + 单卡缩放 + 整行宽（v0.9.0）**：卡片标题列的 ⠿ 是拖动把手（拖到哪张卡片上就佔那張的位置）；`− 100% ＋` 缩放该卡片（70%~160%，点百分比还原；用 CSS `zoom`，会连格子字号与内距一起缩放）；`⤢` 在「半宽／整行宽」之间切换（**放大超过 100% 时会自动占整行**，这样放大的内容才有空间；这时按 `⤡` 会顺便回到 100%）。图（graph）是向量图，会自己缩到卡片宽度内（带 `viewBox` + `max-width:100%`），所以窄卡片不会长出横向卷轴把节点裁掉。**顺序 / 缩放 / 全宽会存在浏览器里**（`localStorage` 键 `cpp-viz.panel-layout`），下次打开还在

## 预设示例

fib 递归、阶乘递归、二分查找、二叉搜索树、全排列 dfs、归并排序、set/map 容器、图的 DFS、带权图（有向）、Dijkstra 最短路。

## 目录结构

- `src/interpreter/` — 迷你 C++ 解释器：lexer → parser → ast → interpreter（生成器式逐步执行）+ memory（递归 Cell 模型 + 写时复制结构共享）
- `src/components/` — CodeEditor（CodeMirror + 当前行高亮 + 断点 gutter）、VariablesPanel（各类数据结构可视化）
- `src/App.tsx` — 主壳（布局、步进控制、快捷键、预设、localStorage）
- `src/index.css` — 样式
- `src/presets.ts` — 预设示例
- `test/` — 解释器 / 渲染层测试（`npm test`，31 个测试档；相容性矩阵在 `compat-test.ts`，本轮新功能在 `gap-test.ts`）

## 架构要点

- **快照模型**：每执行一步 yield 一份「变量快照 + 读写/判断格子 + 调用树 + 输出」。
- **写时复制（结构共享）**：cell 不可变，只复制改动路径、共享未改子树，`dumpAll` / `cloneCallTree` 引用共享——大数组 × 多步时内存不再爆炸。

## 已知限制

> 这份清单由 `test/compat-test.ts`（63 项断言）逐条锁定，改动解释器后跑它即可验证。新功能的细节另有 `test/gap-test.ts`（92 项）。

**语法**
- **支持三目 `?:`**（v0.8.0，只求值被选中的那一边）；**无 `switch`**、**无位运算**（`^` / `&` / `|` / `<<` / `>>`）、无 lambda、无默认参数、无函数重载、无 `for` 标头里的逗号表达式
- **支持 `#define`（物件式巨集，v0.8.0）**：`#define MAXN 100005`、`#define N 10` 这类文字展开；函式式巨集（`#define f(x) ...`）忽略。**支持 `typedef` / `using ll = long long;`**（型别别名，`vector<ll>` 也通）；`size_t` 当 `int`
- **支持 `sizeof`（v0.8.0）**：`sizeof(a)`、`sizeof(int)`、`sizeof(a)/sizeof(a[0])`、struct（成员相加，不算对齐填充）。`sizeof(vector/string/set)` **刻意不支援** —— C++ 回的是物件大小（约 24 bytes）而不是元素个数，回一个假数字会教出 `sizeof(v)/sizeof(v[0])` 这个经典错误，工具会直接说明并要你用 `.size()`
- **支持 range-based for**：`for (int x : v)` / `for (auto x : v)`（值拷贝）/ `for (auto& x : v)`（引用，写回原容器）。可迭代 array / `vector` / `deque` / `set` / `map`（元素是 pair）/ `string`（元素是 char）/ `tree`（1 基层级顺序）/ `bst`（中序＝升序）；`stack` / `queue` / `priority_queue` 在 C++ 里没有 begin/end，会明确报错
- 容器**不能当标量用**：`int x = v;` / `cout << v;` / `v + 1` / `a[0] = v;` 都会**明确报错**（不会静默变 0）
- **容器的比较可用（v0.7.0）**：`vector` / `deque` / `set` / `pair` / `map` 之间有 C++ 的 `==` / `!=` / `<` / `<=` / `>` / `>=`（字典序），元素也可以是容器（`vector<vector<int>>` 能比、能 `sort`）。`unordered_map` 只能比相等（它没有顺序）。**特例**：C 数组的 `a == b` 在真实 C++ 比的是指针地址，工具不假装它是逐元素比较，会明确说明；`stack` / `queue` / `priority_queue` 不支援
- **有强制类型转换（v0.7.0）**：`(int)x` / `(char)(c+1)` / `(long long)x` / `(double)a/b` / `(int)v.size()`。函数式写法 `double(a)` 仍不支持（会被当函数调用）
- **无强制类型转换**：`(double)a` 与 `double(a)` 都不支持（`(int)x` 会被当成函数调用、报「未定义的函数 int」）；`double` 与 `int` 之间的隐式转换可用
- 无指针、类成员函数 / 构造 / 析构、运算符重载、模板
- **无函数重载**：同名函数定义两次会**明确报错**（以前是「后定义的默默生效」→ 会静默给出错答案，例如 `int f(int)` 与 `int f(double)` 并存时 `f(3)` 跑到 double 版本）
- `__builtin_popcount` 这类内建会明确说明「本工具不做位元运算」（位元运算是永久排除项）

**函数**
- 数组形参 `int f(int a[], int n)` **可用且是共享/别名语义**（等同 C++ 的数组退化为指针）：函数内 `a[i]=x` 调用方立刻可见。声明里的长度被忽略（`int a[10]` 与 `int a[]` 等效，与 C++ 一致），多维写 `int a[][3]` 也可用
- 注意区分：`vector<int> v` 这类**容器形参仍是按值拷贝**（不是引用），要共享需写 `vector<int>& v`。数组形参之所以共享，是因为 C++ 里数组退化为指针，工具不这么做就会教错心智模型
- 函数内局部数组（含 2D、含递归逐帧独立）可用，声明后默认全 0（C++ 里是未定义值）——讲「局部变量未初始化」时要注意
- 数组形参收到非数组实参（纯量 / vector / 算式）时给明确错误「数组形参 a 需要传入数组（int a[]）」，不会抛内部错误

**输入输出**
- **`getline(cin, s)` 可用（v0.7.0）**，读一整行到 `\n`（不含），所以「读含空格的句子」能演示。注意 C++ 的经典行为照实呈现：`cin >> n; getline(cin, s);` 会读到**空字串**（换行还留在缓冲区）——要接 `cin.ignore()`（也可用 `cin.ignore(n, c)`）
- **`while (cin >> x)` 读到 EOF 可用（v0.7.0）**：`cin >> x` 在输入用完时传回 false（C++ 的 istream 转 bool），可用于 `while` / `if`；反过来的 `while (!(cin >> x))` 也通。**语句形式** `cin >> a >> b;` 读不够时**仍然明确报错**（会讲「要读第 N 个但只有 M 个」），不会静默停
- **`cin >> c`（单一字元）可用（v0.7.0）**：只吃一个非空白字元（照 C++ 的 char 重载），所以「逐字元处理一行」能演示
- **`fixed` + `setprecision(n)` 可用（v0.7.0）**（只做这两个，不做完整 `<iomanip>`）：`cout << fixed << setprecision(2) << x`。单独写 `setprecision(n)` 照 C++ 是「有效位数」。`printf` 仍不支持
- **`double` 预设输出改成 C++ 语义（v0.7.0）**：6 位有效数字、指数 < -4 或 ≥ 6 时用科学记号（`0.1+0.2` → `0.3`、`1.0/3` → `0.333333`、`1e9` → `1e+09`）。旧版是 JS 全精度（`0.30000000000000004`）
- 数学函数（v0.7.0）：`sqrt` / `pow` / `floor` / `ceil` / `round` / `fabs`（都回 double，照 C++ 语义；`sqrt(-1)` 印 `nan`）
- **字元算术可用（v0.7.0）**：`c - 'a'` / `c + 1` / `c = c + 1` / `c += 1` / `c++` / `c - 32` / `'A' + 32`、`c == 97`（char 与 int 混比照字元码）。Unit 6「字元就是数字」的写法都能跑
- `#include <iomanip>` 这一行本身不报错（`#include` 被跳过），里面的东西只有 fixed / setprecision 能用

**内建函数**
- `sort` / `reverse` / `lower_bound` 只接受「容器 (+ 个数)」形式：`sort(v)`、`sort(v, n)`、`reverse(v[, n])`、`lower_bound(v, x)`、`lower_bound(v, n, x)`（`v` 为数组或 vector；不写比较子就是升序、字典序）
- **降序比较子（v0.7.0）**：`sort(v, greater<int>())` / `sort(v, less<int>())` / `sort(v, n, greater<int>())`。元素可以是容器（`sort(vector<pair<int,int>>)` 是 OI 常客），`lower_bound` 也一样
- `find` / `rfind` 找不到时回 **-1**（本工具没有 `string::npos` 那个巨大值；但**接受写 `string::npos`，它等於 -1**，所以 `if (s.find(x) == string::npos)` 这种惯用写法可以跑）
- **`append` / `insert` / `replace` / `compare` 只接受字串参数**（C++ 没有接受单一字元的重载）：`s.append('!')` 会明确报错并提示改用 `push_back` 或 `+=`。反过来，`find` / `rfind` / `push_back` / `+=` **可以吃字元**（那些在 C++ 是合法重载）
- `substr(pos)` 在 `pos > s.size()` 时**明确报错**（与 `at` 一致；`pos == s.size()` 合法，回空字串）
- 会改到内容的方法（`at` / `insert` / `erase` / `replace` / `resize` 等）下标越界会**明确报错**（真实 C++ 是未定义行为）
- 不支持迭代器形式的方法重载（`insert(iter, ...)` / `erase(iter)` / `s.begin()`）
- **支持自定义比较函数**：`sort(v, cmp)` / `sort(v, n, cmp)`（`cmp(a,b)==true` 表示 a 排前面）。内部是手写的**稳定**归并排序（不是 `Array.prototype.sort`），比较时真的调用用户的 cmp；**比较次数会显示在右侧面板顶部**（教学用，可对复杂度讨论），若 cmp 违反严格弱序会给出警告。旧版会静默忽略第 3 个参数按升序排——那个才是 bug
- `swap` 仅支持标量（含 `a[i]`、`s[i]` 等下标形式），不支持整个容器互换

**数值 / 规模**
- `long long` 用 JS number 存储，精度约 2^53
- 步数上限 20000（防死循环 / 递归过深）
- 递归树根节点（main）若无显式 `return` 不标记 returned
- 函数参数默认按值传；引用需显式 `&`。**`const T&` 可用（v0.7.0）**：`const vector<int>& v` 与 `vector<int>& v` 同义（工具不做 const 正确性检查），而且照 C++ 可以绑常数/临时值 `f(5)`；非 const 的 `int&` 绑常数会明确报错（C++ 也编不过），并提示改用 `const int&` 或按值。`const` 用在宣告（`const int N = 10;`）本来就可以

## 疑难排解

- **画面突然变成一片空白／黑屏**：先按 **Ctrl+Shift+R 强制重新载入**（开发时 Vite 的 HMR 偶尔会留下对不上的模组图）。
  若还是一片空白，请开浏览器 Console（F12）看红色讯息回报给我们。
  新版本（v0.9.1 起）已经加了 **ErrorBoundary**：任何渲染期的错误都会显示成一张「⚠ 内部错误（这是本工具的 bug，不是你程式写错）」
  + 错误内容 + 堆叠前 5 行的卡片，并有「重置」按钮 —— 不会再无声无息地白屏。

## 测试

测试是「源码片段 → 期望输出 / 期望报错」的断言脚本，用 rolldown 打包成 esm 后由 node 运行：

```powershell
# 单个测试
node_modules\.bin\rolldown.cmd test/cw-test.ts -o test/cw-test.mjs -f esm -p node
node test/cw-test.mjs

# 全部测试
Get-ChildItem test -Filter *.ts | ForEach-Object {
  $m = "test\$($_.BaseName).mjs"
  node_modules\.bin\rolldown.cmd $_.FullName -o $m -f esm -p node *> $null
  node $m
}
```

两个「契约型」测试最值得先跑：

- `test/compat-test.ts` —— 语言子集相容性矩阵，44 项断言逐条锁定「可用 / 不可用」，改解释器后必跑
- `test/presets-test.ts` —— 逐个执行 `src/presets.ts` 里全部 preset 并断言不报错；**新增 preset 后跑它即可验证**
- `test/render-test.ts` —— **渲染层**验证：用 `react-dom/server` 把 VariablesPanel 渲染成 HTML，逐个 preset 断言「不崩 / 不是空壳 / 关键结构齐全」（能抓到输出对但画面爆掉的 bug）
- `test/hkoi-presets-test.ts` —— 直接引用 HKOI 教学项目那边 `presets/presets.ts` 的全部 21 个 preset，做执行 + 渲染 + 视觉断言（呼叫树、swap 读写著色、多阵列同屏、stack/queue 排列）

其余按功能分文件：`cw-test`（快照写时复制隔离）、`struct-*`、`setmap`、`pair`、`graph`、`dijkstra*`、`multivec`、`stl`、`string`、`calllabel`、`initlist`、`pushvar`
