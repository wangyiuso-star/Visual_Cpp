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

**语句**：声明、赋值（`= += -= *= /= %=`）、`++` / `--`、`for` / **范围 for `for (T x : c)`** / `while` / `do-while` / `if-else` / `break` / `continue` / `return` / `cout` / `cin`

**函数**：自定义函数、递归、全局变量、引用参数 `int&`、**数组形参 `int a[]`（共享/别名语义，等同 C++ 数组退化为指针）**、容器按值参数、结构体参数 / 返回值

**内建**：`min` / `max` / `abs` / `make_pair` / `sort` / `reverse` / `lower_bound` / `swap`

**字元函数**：`toupper` / `tolower`（回 char）、`isdigit` / `isalpha` / `isupper` / `islower` / `isalnum` / `isspace`（回 bool）

**string / vector 方法**：`s.size()` / `s.length()` / `s.empty()` / `s.at(i)` / `s.front()` / `s.back()` / `s.substr(pos[, len])` / `s.find(str[, pos])` / `s.rfind(str[, pos])` / `s.compare(str)` / `s.push_back(c)` / `s.pop_back()` / `s.append(str)` / `s.insert(pos, str)` / `s.erase(pos[, len])` / `s.replace(pos, len, str)` / `s.clear()`
｜ `v.size()` / `v.empty()` / `v.at(i)` / `v.front()` / `v.back()` / `v.push_back(x)` / `v.pop_back()` / `v.insert(pos, x)` / `v.erase(pos[, len])` / `v.resize(n)` / `v.clear()`
（方法可以串接：`s.substr(1).size()`；但**不能对临时值调用修改方法**，会明确报错）

**字串 ↔ 数字**：`stoi` / `stol` / `stoll` / `stod` / `stof`（照 C++ 语义：跳前导空白、可选正负号、读到第一个不合法字符就停；`stoi(s, 0, base)` 支持 2..36 进制；一个数字都没有会明确报错）、`to_string`（int / double / char / string → string）

**表达式**：花括号初始化列表（如 `v.push_back({1,2,3})`）

## 可视化（右侧面板）

- **当前行高亮** + 读写/判断着色（读=蓝、写=绿、判断=橙）
- **作用域标签**：global / local
- **容器视图**：数组窗口（1D/2D，固定窗口 + 滑动条 + 访问自动跳转）、栈竖排、队列/deque 横排、堆/树/BST 树形图、set 列表、map 键值对、struct 成员列表、struct 矩阵（行=元素下标、列=成员名）
- **递归树 / 调用树**：节点高亮，返回后变暗 + 显示返回值
- **图**：邻接表识别为图（节点+连线）、带权边显示权重、有向图自动画箭头、节点值覆盖（圆圈里显示 dist 值、上方显示下标）
- **参数（别名）徽章**：引用参数 / 数组形参的卡片或纯量格会标上「参数（别名）」，学生才知道它既是一个名字、也是别名。**注意：写入高亮仍然只落在「被指向的那个名字」上**（函数内写 `a[i]` 时亮的是呼叫方的 `g`），这本身是「a 就是 g」的直观证据
- **排序统计**：用自定义比较函数排序时，顶部显示「比较次数 / n」（可直接拿来讲复杂度）
- **树形视图缩放**：调用树与数据结构树都有工具条（−/＋/适应/1:1/放大整屏，Esc 退出）；「调用栈」模式只画「根→当前活动节点」的路径，深递归也放得下；缩放变小时自动隐藏局部变量
- **布局**：右侧按「形状」分格（方形大块并排在上、横长条在下），每张卡片可用 ↑/↓ 调顺序

## 交互

- 运行 / 暂停 / 单步 / 后退 / 跳转指定步 / 速度滑条
- 断点（点行号左侧设置，运行到断点自动停）
- cin 输入预填
- 预设示例一键载入
- localStorage 自动保存草稿
- 键盘快捷键（空格=播放/暂停，←/→=单步，R=重置）
- bool 显示 1/0 开关
- if / while / for 条件判断显示开关
- 可拖拽垂直分割（代码区 ↔ 数据区）

## 预设示例

fib 递归、阶乘递归、二分查找、二叉搜索树、全排列 dfs、归并排序、set/map 容器、图的 DFS、带权图（有向）、Dijkstra 最短路。

## 目录结构

- `src/interpreter/` — 迷你 C++ 解释器：lexer → parser → ast → interpreter（生成器式逐步执行）+ memory（递归 Cell 模型 + 写时复制结构共享）
- `src/components/` — CodeEditor（CodeMirror + 当前行高亮 + 断点 gutter）、VariablesPanel（各类数据结构可视化）
- `src/App.tsx` — 主壳（布局、步进控制、快捷键、预设、localStorage）
- `src/index.css` — 样式
- `src/presets.ts` — 预设示例
- `test/` — 解释器冒烟测试

## 架构要点

- **快照模型**：每执行一步 yield 一份「变量快照 + 读写/判断格子 + 调用树 + 输出」。
- **写时复制（结构共享）**：cell 不可变，只复制改动路径、共享未改子树，`dumpAll` / `cloneCallTree` 引用共享——大数组 × 多步时内存不再爆炸。

## 已知限制

> 这份清单由 `test/compat-test.ts`（47 项断言）逐条锁定，改动解释器后跑它即可验证。

**语法**
- 无 `switch`、无三目 `?:`、无位运算（`^` / `&` / `|` / `<<` / `>>`）
- **支持 range-based for**：`for (int x : v)` / `for (auto x : v)`（值拷贝）/ `for (auto& x : v)`（引用，写回原容器）。可迭代 array / `vector` / `deque` / `set` / `map`（元素是 pair）/ `string`（元素是 char）/ `tree`（1 基层级顺序）/ `bst`（中序＝升序）；`stack` / `queue` / `priority_queue` 在 C++ 里没有 begin/end，会明确报错
- **无强制类型转换**：`(double)a` 与 `double(a)` 都不支持（`(int)x` 会被当成函数调用、报「未定义的函数 int」）；`double` 与 `int` 之间的隐式转换可用
- 无指针、类成员函数 / 构造 / 析构、运算符重载、函数重载、模板

**函数**
- 数组形参 `int f(int a[], int n)` **可用且是共享/别名语义**（等同 C++ 的数组退化为指针）：函数内 `a[i]=x` 调用方立刻可见。声明里的长度被忽略（`int a[10]` 与 `int a[]` 等效，与 C++ 一致），多维写 `int a[][3]` 也可用
- 注意区分：`vector<int> v` 这类**容器形参仍是按值拷贝**（不是引用），要共享需写 `vector<int>& v`。数组形参之所以共享，是因为 C++ 里数组退化为指针，工具不这么做就会教错心智模型
- 函数内局部数组（含 2D、含递归逐帧独立）可用，声明后默认全 0（C++ 里是未定义值）——讲「局部变量未初始化」时要注意
- 数组形参收到非数组实参（纯量 / vector / 算式）时给明确错误「数组形参 a 需要传入数组（int a[]）」，不会抛内部错误

**输入输出**
- 无 `getline(cin, s)`，也**不支持 `cin >> char`**（`cin` 只按空白分词读数值/字符串）——因此**「读入一整行含空格的内容」无法演示**。变通：用 `cin >> s` 逐个读 token，再用 `s = a + " " + b` 拼回；或把题目设计成 token 式输入
- 无 <iomanip> 的 `setprecision` / `fixed`，无 `printf`。`double` 按 JS 默认全精度输出（`0.1+0.2` 打印 `0.30000000000000004`），保留几位小数只能手工算（见 compat-test 里的 0.33 例子）
- `#include <iomanip>` 这一行本身不报错（`#include` 被跳过），只是里面的东西用不了

**内建函数**
- `sort` / `reverse` / `lower_bound` 只接受「容器 (+ 个数)」形式：`sort(v)`、`sort(v, n)`、`reverse(v[, n])`、`lower_bound(v, x)`、`lower_bound(v, n, x)`（`v` 为数组或 vector，升序）
- `find` / `rfind` 找不到时回 **-1**（本工具没有 `string::npos` 那个巨大值；但**接受写 `string::npos`，它等於 -1**，所以 `if (s.find(x) == string::npos)` 这种惯用写法可以跑）
- 会改到内容的方法（`at` / `insert` / `erase` / `replace` / `resize` 等）下标越界会**明确报错**（真实 C++ 是未定义行为）
- 不支持迭代器形式的方法重载（`insert(iter, ...)` / `erase(iter)` / `s.begin()`）
- **支持自定义比较函数**：`sort(v, cmp)` / `sort(v, n, cmp)`（`cmp(a,b)==true` 表示 a 排前面）。内部是手写的**稳定**归并排序（不是 `Array.prototype.sort`），比较时真的调用用户的 cmp；**比较次数会显示在右侧面板顶部**（教学用，可对复杂度讨论），若 cmp 违反严格弱序会给出警告。旧版会静默忽略第 3 个参数按升序排——那个才是 bug
- `swap` 仅支持标量（含 `a[i]`、`s[i]` 等下标形式），不支持整个容器互换

**数值 / 规模**
- `long long` 用 JS number 存储，精度约 2^53
- 步数上限 20000（防死循环 / 递归过深）
- 递归树根节点（main）若无显式 `return` 不标记 returned
- 函数参数默认按值传；引用需显式 `&`

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
