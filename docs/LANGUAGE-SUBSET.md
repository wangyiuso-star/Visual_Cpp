# 语言子集参考（支持什么 / 不支持什么）

> 本工具跑的是**自制的迷你 C++ 解释器**，不是真正的编译器。这份文件是「学生能写什么」的可执行规格说明。
> 对应版本 **v0.14.0**。每一条「支持 / 不支持」都有测试锁定：
> - `test/compat-test.ts` —— 兼容性矩阵（`yes(...)` 可用且输出正确、`no(...)` 必须报错）
> - `test/gap-test.ts` —— 缺口提案的逐項驗證
> - `test/*-test.ts` —— 各特性的语义测试
>
> 改了语言行为，**先改这份文件与测试，再改实现**。

---

## 1. 一页速查

| 类别 | 支持 ✅ | 不支持 ❌（会给明确错误） |
|---|---|---|
| 型别 | `int` `long long` `char` `bool` `string` `double` `float` `size_t` | 无符号 ±、`__int128`、`wchar_t` |
| 数组 | 1D / 2D / 大小推断 `int a[]={...}` / `int a[][3]` 形参 | VLA `int a[n]`（n 是变量） |
| vector | 1D / 2D / 多维 `vector<vector<int>> g(n, vector<int>(m))` / 邻接表 `vector<int> g[N]` | 迭代器遍历（只认固定搭配）、`vector<容器>` 的某些方法 |
| 其他容器 | `stack` `queue` `deque` `priority_queue`（含 `greater<T>`）`tree` `bst` `set` `map` `unordered_map` `pair` | 自定义容器、`multiset`/`multimap` |
| struct | 定义、成员读写、初始化、参数、返回值、放在 array/tree/vector 里 | 构造函数、成员函数、`struct` 嵌套自身（指针） |
| 语句 | 声明、`=`/`+=`/`-=`/`*=`/`/=`/`%=`、`++`/`--`、`for`、range-for、`while`、`do-while`、`if-else`、`switch`（case/default/fallthrough）、`break`/`continue`、`return`、`cout`、`cin`、块 | `goto`、逗号表达式（`for` 标头） |
| 函数 | 自订函数、递归、全局变量、引用 `int&`、`const T&`、数组形参 `int a[]`、容器按值参数、struct 参数/返回、容器返回 | 重载（同名两次 = 明确报错）、默认参数、lambda、模板、可变参数 |
| 内建 | `min`/`max`/`abs`/`swap`/`sort`/`reverse`/`lower_bound`/`make_pair`、数学函数、`memset`/`fill`/`assign`、`stoi`…`to_string`、字元函数、`#define`/`typedef`/`using`、`sizeof`、三目 | `printf`、完整 `<iomanip>`、位运算内建 |
| 运算符 | 算术、比较、逻辑 `&& || !`、三目 `?:`、复合赋值、camel cast `(int)x` | 位运算 `& | ^ << >> ~`、`++` 前缀/后缀都支持但**不能**对临时值用 |
| 输入 | `cin >> x`、`while (cin >> x)`（读到 EOF）、`cin >> char`、`getline(cin, s)`、`cin.ignore()`、`cin.get()` | 檔案输入（`freopen`）、`scanf` |
| 输出 | `cout << ... << endl`、`fixed` + `setprecision(n)`、`double` 照 C++ 格式 | `printf`、`setw`/`setfill`、`\n` 以外的格式控制 |

---

## 2. 型别与数值

- **标量**：`int`（32 位语义但不溢出报错，见下）、`long long`、`char`、`bool`、`string`、`double`、`float`。
- `long long` 以 JS number 存放，**安全范围约 ±2^53**（约 9.007×10¹⁵）。超出会失真，目前**没有**警告——这是已知缺口（见 `docs/AI-HANDOFF.md` §9.2）。
- `char` 就是数字：`c-'a'`、`c+1`、`c-32`、`'A'+32`、`c == 97` 都照 C++ 语义（赋值/自增会按目标型别回转成字元）。
- **隐式转换**：`int`/`double` 之间可用（赋值、参数、返回都会照目标型别转换）；`char` 与 `int` 互通。
- **强制转型**：`(int)x`、`(char)(c+1)`、`(long long)x`、`(double)a/b`、`(int)v.size()`。
  **不支持**函数式写法 `double(x)`（会被当成函数调用 → 「未定义的函数 double」）；需要时写 `(double)x`。

---

## 3. 容器

### 数组
- `int a[5]`、`int a[3][4]`、`int a[] = {1,2,3}`（大小推断）、`int a[3] = {1,2}`（补 0）、尾逗号 `{1,2,3,}`（合法 C++）。
- 局部数组**宣告后预设全 0**（真实 C++ 是未定义值——讲「未初始化」时要提醒）。
- 数组形参 `void f(int a[], int n)` 是**共享/别名**语义（= 指针退化），函数内写入呼叫方立刻可见；声明里的长度被忽略。
- 多维形参写 `void f(int a[][3])`。

### vector
- `vector<int> v`、`vector<int> v(n)`、`vector<int> v(n, x)`、`vector<int> v = {1,2,3}`、`v.push_back({...})`（初始化列表）。
- 二维：`vector<vector<int>> g(n, vector<int>(m))`、`g[i].push_back(x)`、`g[i][j]`。
- 邻接表：`vector<int> g[N]` / `vector<pair<int,int>> g[5]` 会被面板识别成**图**。
- **迭代器**：只认固定搭配 `sort(v.begin(), v.end())`、`reverse(v.begin(), v.end())`、`lower_bound(v.begin(), v.end(), x)`、`fill(...)`。单独出现 `v.begin()` 会给指引（改用 range-for 或 `.size()`）。

### 其他
| 容器 | 说明 |
|---|---|
| `stack` | `push/pop/top/size/empty`；面板画竖排；**不能** range-for / 下标 |
| `queue` | `push/pop/front/back/size/empty` |
| `deque` | `push_back/push_front/pop_back/pop_front/front/back/at/size/empty/clear`；可下标 |
| `priority_queue` | `push/pop/top/size/empty`；`priority_queue<T>` 大根堆、`priority_queue<T, greater<T>>` 小根堆；面板画堆树 |
| `tree` | 数组式**完全二叉树**，**1 基下标**（`t[1]` 是根）；`size()`；可 range-for（层级顺序） |
| `bst` | `insert/find/erase/size/empty`；可 range-for（中序 = 升序） |
| `set` | 排序去重；`insert/erase/find/count/size/empty/clear`；可 range-for；**不能下标** |
| `map` / `unordered_map` | `m[k]` 读写（`map` 会插入不存在的键；**读**不存在的键回同型别默认值且**不插入**——这是本工具的既定行为）、`erase/find/count/size/empty/clear`；元素 `pair<const K,V>` 用 `.first/.second` |
| `pair` | `make_pair(a,b)`、`.first/.second`；比较可用 |
| `struct` | 成员读写、初始化（`{...}`）、参数/返回；可放进 array/tree/vector |

**容器可以当值传递**：函数可以回传容器、`T x = f();`、把容器赋给容器元素（`m["k"] = v`）、按值传参、临时值下标 `f()[0]`、临时值成员 `mk().x`。
**容器不能当标量用**：`int x = v;`、`cout << v;`、`v + 1`、`a[0] = v;` 都会**明确报错**（不会静默变 0）。

---

## 4. 语句与控制流

- 声明、赋值、复合赋值、`++`/`--`（前缀与后缀）。
- `for (init; cond; incr)`、`while`、`do-while`、`if / else if / else`、`break`/`continue`、`return`。
- **range-for**：`for (int x : v)` / `for (auto x : v)`（拷贝）/ `for (auto& x : v)`（引用，写回）。可迭代 array / vector / deque / set / map（元素 pair）/ string（元素 char）/ tree / bst。`stack`/`queue`/`priority_queue` 明确报错（C++ 也没有 begin/end）。
- **条件显示**：`if`/`while`/`for` 的条件会以「判断」横幅显示并标出真假（可在设置菜单关掉某类，减少快照）。
- **不支持**：`goto`、`for` 标头的逗号表达式、lambda。

---

## 5. 函数与参数

```cpp
int f(int a, int b) { return a + b; }          // 值传递
void inc(int& x) { x++; }                       // 引用
int sum(const vector<int>& v) { ... }           // const 引用（可绑临时值/常数）
void fill(int a[], int n) { ... }               // 数组形参：共享/别名
vector<int> make(int n) { ... return v; }       // 回传容器
struct P mk() { ... }                           // 回传 struct
```

- 参数默认**按值**；要共享必须写 `&`。
- `const T&`：与 `T&` 同义（工具不做 const 正确性检查），但**可以绑常数/临时值**（`f(5)`）；非 const 的 `int&` 绑常数会**明确报错**并提示改用 `const int&`。
- **不支持**：函数重载（同名定义两次 = 解析期报错）、默认参数、lambda、模板、可变参数。
- 递归深度/步数上限由 `MAX_STEPS = 20000` 控管（超过给错误快照）。

---

## 6. 内建函数

| 类别 | 内容 |
|---|---|
| 基本 | `min(a,b)`、`max(a,b)`、`min({a,b,c})`、`max({...})`、`abs(x)`、`swap(a,b)`（仅标量，含 `a[i]`） |
| 排序 | `sort(v)`、`sort(v, n)`、`sort(a, a+n)`、`sort(v, greater<int>())`、`sort(v, less<int>())`、`sort(v, cmp)`（自订比较函数，稳定排序，**会比较次数**并检查严格弱序） |
| 查找/反转 | `reverse(v[, n])`、`lower_bound(v, x)`、`lower_bound(v, n, x)` |
| 数组工具 | `memset(a, v, sizeof(a))`（**逐字节**，`0x3f` 会变 `0x3f3f3f3f`，这是 C++ 真实语义）、`fill(v.begin(), v.end(), x)` / `fill(a, a+n, x)`、`v.assign(n, x)` |
| 数学 | `sqrt` `pow` `floor` `ceil` `round` `fabs`（都回 double；`sqrt(-1)` → `nan`） |
| 常量 | `INT_MAX` / `INT_MIN` / `LLONG_MAX` / `LLONG_MIN` / `UINT_MAX` / `true`/`false` |
| 字串↔数字 | `stoi` `stol` `stoll` `stod` `stof`（前缀语义；`stoi(s, 0, base)` 2..36；没有数字 → 明确报错）、`to_string` |
| 字元 | `toupper`/`tolower`（回 char）、`isdigit`/`isalpha`/`isupper`/`islower`/`isalnum`/`isspace`（回 bool） |
| 预处理/型别 | `#define NAME value`（对象式巨集，文字展开且保留行号；函数式巨集忽略）、`typedef` / `using ll = long long;`、`sizeof` |
| I/O | `cin`/`cout`（见 §7） |

**`sizeof`**：`sizeof(a)`、`sizeof(int)`、`sizeof(a)/sizeof(a[0])`、struct（成员相加，不算对齐填充）。
⛔ `sizeof(vector/string/set/...)` **刻意不支持**：C++ 回的是对象大小（约 24 bytes）而不是元素个数，回一个假数字会教出 `sizeof(v)/sizeof(v[0])` 这个经典错误 → 工具会说明并要你用 `.size()`。

---

## 7. 输入 / 输出

### cin
- `cin >> a >> b;`（语句形式）：读不够时**明确报错**「要读第 N 个但只有 M 个」，不会静默停。
- `while (cin >> x)`：读到 EOF 时条件为 false（C++ 的 istream→bool）；`while (!(cin >> x))` 也通。
- `cin >> c`（char）：只吃**一个**非空白字元（C++ 的 char 重载）。
- `getline(cin, s)`：读一整行（不含 `\n`）。
  ⚠️ 照 C++ 的真实行为：`cin >> n; getline(cin, s);` 会读到**空字串**（换行还在缓冲区）→ 要接 `cin.ignore()`（或 `cin.ignore(n, c)`）。
- `cin.ignore()` / `cin.ignore(n, c)`、`cin.get()`（读一个字符含空白）。
- **不支持**：`scanf`、`freopen`、檔案输入。

### cout
- `cout << x << endl;`、字串/字元/数字混排、`bool` 预设印 `1/0`（可在设置切换）。
- `fixed` + `setprecision(n)`：固定小数位；单独 `setprecision(n)`：有效位数。
- `double` 预设输出照 C++：**6 位有效数字**，指数 < -4 或 ≥ 6 用科学记号（`0.1+0.2` → `0.3`、`1.0/3` → `0.333333`、`1e9` → `1e+09`）。
- **不支持**：`printf`、`setw`/`setfill`、完整 `<iomanip>`。

---

## 8. 表达式与运算符

- 算术 `+ - * / %`；`%` 只对整数；除零 → **明确报错**（不是 NaN/inf）。
- 比较 `== != < <= > >=`：标量、字符串（字典序）、**容器之间**（vector/deque/set/pair/map；unordered_map 只能比相等）。
  - ⚠️ C 数组的 `a == b` 在真实 C++ 比的是**指针地址**：工具不假装它是逐元素比较，会明确说明。
  - `stack`/`queue`/`priority_queue` 不支持比较。
- 逻辑 `&& || !`（短路）、三目 `?:（只求值被选中的那一边）`。
- 复合赋值 `= += -= *= /= %=`（照目标型别隐式转换：`char c; c += 1;` 存字元）。
- **不支持**：位运算 `& | ^ << >> ~`、`++`/`--` 作用在临时值上。

---

## 9. string / vector 方法

```
string: size() length() empty() at(i) front() back()
        substr(pos[, len]) find(str[, pos]) rfind(str[, pos]) compare(str)
        push_back(c) pop_back() append(str) insert(pos, str) erase(pos[, len])
        replace(pos, len, str) clear()
vector: size() empty() at(i) front() back() push_back(x) pop_back()
        insert(pos, x) erase(pos[, len]) resize(n) clear()
```

- 方法可以**串接**：`s.substr(1).size()`。但**不能对临时值调用修改方法**（会明确报错）。
- `find`/`rfind` 找不到回 **-1**（本工具没有 `string::npos` 那个巨大值；但**接受写 `string::npos`，它等于 -1**，所以 `if (s.find(x) == string::npos)` 可以跑）。
- `append/insert/replace/compare` **只吃字串**（C++ 没有单一字元的重载）：`s.append('!')` → 明确报错并提示改用 `push_back` 或 `+=`。反过来 `find/rfind/push_back/+=` 可以吃字元。
- `substr(pos)` 在 `pos > s.size()` 时**明确报错**（`pos == s.size()` 合法 → 空字串）。
- 会改内容的方法（`at/insert/erase/replace/resize`）下标越界 → **明确报错**（真实 C++ 是未定义行为）。
- **不支持**迭代器形式的重载（`insert(iter, ...)`、`erase(iter)`）。

---

## 10. 「故意报错」的安全阀清单

这些写法在真实 C++ 里也编不过，或者语义上与直觉不同；工具**一律明确报错**（而不是猜一个值）：

1. 用未宣告的变量/函数；对非容器取下标（含 `set`/`stack`/`queue`）。
2. 下标越界（数组、vector、string、map 的 `at`）。
3. 把容器当标量：`int x = v`、`cout << v`、`v + 1`、`a[0] = v`。
4. 容器当值的形状不匹配：`vector<int> v = s`（类型不同）、`set<vector<int>>`、`sort(容器)`（不是可排序元素）。
5. `s.append('!')` 之类的错重载（会提示正确写法）。
6. 同名函数定义两次（不支援重载）。
7. `sizeof(vector)`（会教你用 `.size()`）。
8. 数组形参收到非数组实参（纯量 / vector / 算式）。
9. `int& ` 绑常数（提示改用 `const int&` 或按值）。
10. 除零、`stoi` 没有数字、`substr` 越界、cin 读不够。

> 这条原则的由来：曾经有三个「静默给错答案」的真 bug（函数重载覆盖、`find` 忽略第二参、对 set 取下标 undefined 崩溃）。详见 `docs/AI-HANDOFF.md` §5.1。

---

## 11. 永久排除项（为什么不加）

| 项目 | 原因 |
|---|---|
| 位运算 `& | ^ << >> ~`、`__builtin_popcount` 等 | 教材编辑决定不做；出错时会说明「本工具不做位元运算」 |
| 指针、`*p`、`&` 取址、动态内存 | 内存模型是「具名 Cell」，没有地址概念；做了会误导 |
| 类 / 构造 / 析构 / 成员函数 / 运算符重载 | 解释器成本高、OI 入门几乎不用 |
| 模板（自订 `template<typename T>`） | 同上；`vector<int>` 这类标准容器是内建的 |
| 迭代器遍历（`for (auto it = v.begin(); ...)`） | 只认固定搭配；给明确指引 |
| `printf` / `scanf` | 只做 `cin/cout`，避免两套 I/O 的行为差异 |
| 完整 `<iomanip>` | 只做 `fixed` + `setprecision` |
| 函数重载、默认参数、lambda、`goto`、`for` 逗号表达式 | 目前未做（见 `docs/AI-HANDOFF.md` §10） |

---

## 12. 教学陷阱（工具刻意照 C++ 语义呈现）

1. `cin >> n; getline(cin, s);` → 读到空字串（缓冲区还有换行）→ 教 `cin.ignore()`。
2. `sizeof(v)/sizeof(v[0])` 对 vector 是错的 → 工具拒绝 `sizeof(vector)`。
3. `memset(a, 0x3f, sizeof(a))` 每个 int 变 `0x3f3f3f3f`（不是 `0x3f`）→ 逐字节语义。
4. 局部数组在本工具里预设全 0（C++ 是未定义值）→ 讲「未初始化」时要说明。
5. `s.find(x) == string::npos` 可用，但 `string::npos` 在本工具里是 `-1`（不是 `size_t(-1)` 的巨大值）。
6. 数组参数是共享的、vector 参数是拷贝的 → 讲「传参」时正好可以对比。
7. `sort` 的自订比较函数违反严格弱序时会给**警告**（并显示比较次数，可用来讲复杂度）。
8. `double` 输出是 C++ 的 6 位有效数字，不是 JS 的全精度。
