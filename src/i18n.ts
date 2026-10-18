// 介面文字的多語系（簡體 / 繁體）。
//
// 為什麼用「簡體原文當 key」而不是 key 代號：
// 專案裡的中文字串大多直接寫在 JSX 裡，用原文當 key 可以一個字都不改地包上 t()，
// 之後要加第三種語言（例如英文）再加一層字典就好；字典沒收錄的字串會原樣顯示。
//
// 繁體用香港／台灣的慣用語，不是逐字轉換：
// 變數 / 陣列 / 函式 / 記憶體 / 迴圈 / 佇列 / 堆疊 / 遞迴 / 字串。
//
// 語言選擇存在 localStorage（cpp-viz.locale）；第一次開啟時看瀏覽器語言
// （zh-HK / zh-TW / zh-MO / 任何 Hant → 繁體，其餘 → 繁體以外的預設簡體）。
import { useSyncExternalStore } from 'react'

export type Locale = 'zh-CN' | 'zh-Hant'

const STORAGE_KEY = 'cpp-viz.locale'

/** 只有「繁體和簡體不一樣」的字串才需要收進來。 */
const HANT: Record<string, string> = {
  // ---- 品牌 / 工具列 ----
  '代码可视化': '程式碼視覺化',
  '载入示例': '載入範例',
  '示例…': '範例…',
  '▶ 运行': '▶ 執行',
  '⏸ 暂停': '⏸ 暫停',
  '⏭ 单步': '⏭ 單步',
  '⏮ 后退': '⏮ 後退',
  '⟲ 重置': '⟲ 重設',
  '播放速度（每步间隔）': '播放速度（每步間隔）',
  '设置 ▾': '設定 ▾',
  '运行前设置，改动后需重新运行': '執行前設定，改動後需重新執行',
  'if 判断': 'if 判斷',
  'while 判断': 'while 判斷',
  'for 判断': 'for 判斷',
  'bool 输出 1/0': 'bool 輸出 1/0',
  '编辑器': '編輯器',
  'Tab 缩排': 'Tab 縮排',
  '按 Tab 缩排 {0} 格': '按 Tab 縮排 {0} 格',
  '{0} 格': '{0} 格',
  '整行加减缩排：Tab / Shift-Tab，或 Ctrl+] / Ctrl+[': '整行加減縮排：Tab / Shift-Tab，或 Ctrl+] / Ctrl+[',
  '跳到': '跳到',
  '步': '步',
  '跳转': '跳轉',
  '语言': '語言',
  '简体': '簡體',
  '繁體': '繁體',
  '界面语言（默认跟随浏览器）': '介面語言（預設跟隨瀏覽器）',

  // ---- 播放器 / 步數 ----
  '未运行': '未執行',
  '第 {0} / {1} 步': '第 {0} / {1} 步',
  '第 {0} 行：{1}': '第 {0} 行：{1}',

  // ---- 主版面 ----
  '代码编辑器 · C++': '程式碼編輯器 · C++',
  '拖动调整代码框高度': '拖動調整程式碼框高度',
  'cin 输入': 'cin 輸入',
  '预填 cin 输入，支持空格/换行分隔': '預填 cin 輸入，支援空格/換行分隔',
  '拖动调整 cin / 输出高度': '拖動調整 cin / 輸出高度',
  '变量 / 数据结构': '變數 / 資料結構',
  '当前行': '目前行',
  '读取': '讀取',
  '判断': '判斷',
  '写入': '寫入',
  '⇔ 自动并排': '⇔ 自動並排',
  '把右側面板調寬到卡片剛好兩欄並排，並把樹 / 遞歸樹的「整行」與放大重設':
    '把右側面板調寬到卡片剛好兩欄並排，並把樹 / 遞歸樹的「整行」與放大重設',
  '螢幕不夠寬：面板已放到最大（編輯器 {0}%），卡片區仍放不下两栏':
    '螢幕不夠寬：面板已放到最大（編輯器 {0}%），卡片區仍放不下兩欄',

  // ---- 輸出面板 ----
  '输出': '輸出',
  '(无输出)': '(無輸出)',
  '(尚未运行)': '(尚未執行)',


  '点击上方「运行」或「单步」开始。': '點擊上方「執行」或「單步」開始。',
  '支持：int / long long / char / bool / string / double 变量、数组、二维数组、vector、for / while / if、四则运算、cout 输出。':
    '支援：int / long long / char / bool / string / double 變數、陣列、二維陣列、vector、for / while / if、四則運算、cout 輸出。',
  // ---- 變數面板 ----
  '还没有变量。': '還沒有變數。',
  '排序': '排序',
  '⚠ 比较函数不满足严格弱序': '⚠ 比較函式不滿足嚴格弱序',
  '✓ 为真 · 继续': '✓ 為真 · 繼續',
  '✗ 为假 · 退出': '✗ 為假 · 離開',
  '按住拖动这张卡片，放到别的卡片上就换位置': '按住拖動這張卡片，放到別的卡片上就換位置',
  '上移': '上移',
  '下移': '下移',
  '缩小这张卡片': '縮小這張卡片',
  '点一下还原成 100%': '點一下還原成 100%',
  '放大这张卡片（放大时卡片会自动占整行）': '放大這張卡片（放大時卡片會自動佔整行）',
  '放大時自動佔整行；按這裡回到 100% 半宽': '放大時自動佔整行；按這裡回到 100% 半寬',
  '改成半宽': '改成半寬',
  '改成整行宽': '改成整行寬',
  '这是引用参数：与调用方的变量共用同一份数据': '這是引用參數：與呼叫方的變數共用同一份資料',
  '参数（别名）': '參數（別名）',
  '这是引用/数组形参：与调用方的变量共用同一份数据': '這是引用／陣列形參：與呼叫方的變數共用同一份資料',

  // ---- 卡片摘要（viz/format）----
  'string · 长度 {0}': 'string · 長度 {0}',
  'stack<{0}> · 长度 {1}': 'stack<{0}> · 長度 {1}',
  'queue<{0}> · 长度 {1}': 'queue<{0}> · 長度 {1}',
  'priority_queue<{0}> · 小根堆 · 长度 {1}': 'priority_queue<{0}> · 小根堆 · 長度 {1}',
  'priority_queue<{0}> · 大根堆 · 长度 {1}': 'priority_queue<{0}> · 大根堆 · 長度 {1}',
  'tree<{0}> · 节点 {1}': 'tree<{0}> · 節點 {1}',
  'bst<{0}> · 节点 {1}': 'bst<{0}> · 節點 {1}',
  'set<{0}> · 元素 {1}': 'set<{0}> · 元素 {1}',
  'map<{0},{1}> · 元素 {2}': 'map<{0},{1}> · 元素 {2}',
  'unordered_map<{0},{1}> · 元素 {2}': 'unordered_map<{0},{1}> · 元素 {2}',
  'deque<{0}> · 长度 {1}': 'deque<{0}> · 長度 {1}',
  '{0} · 成员 {1}': '{0} · 成員 {1}',
  '引用 → {0}': '引用 → {0}',
  'vector<{0}> · 长度 {1}': 'vector<{0}> · 長度 {1}',

  // ---- 樹 / 呼叫樹（viz/tree）----
  '缩小': '縮小',
  '放大': '放大',
  '自动缩放到能放下整棵树': '自動縮放到能放下整棵樹',
  '恢复 100%': '恢復 100%',
  '放大到整屏（Esc 退出）': '放大到整螢幕（Esc 離開）',
  '还原': '還原',
  '关闭 (Esc)': '關閉 (Esc)',
  '调用树 · {0}': '呼叫樹 · {0}',
  '完整树 / 仅当前调用路径': '完整樹 / 僅目前呼叫路徑',
  '调用栈': '呼叫堆疊',
  '完整树': '完整樹',
  '当前调用栈': '目前呼叫堆疊',

  // ---- 二維/一維視窗（viz/window）----
  '行': '行',
  '列': '列',
  '[{0}..{1}] / 共 {2}': '[{0}..{1}] / 共 {2}',

  // ---- 圖（viz/graph）----
  '查看图': '檢視圖',
  '查看表格': '檢視表格',

  // ---- 錯誤邊界 ----
  '内部错误（这是本工具的 bug，不是你程式写错）': '內部錯誤（這是本工具的 bug，不是你程式寫錯）',
  '渲染错误': '渲染錯誤',

  // ---- 內建示例名稱 ----
  'fib 递归': 'fib 遞迴',
  '阶乘递归': '階乘遞迴',
  '二分查找': '二分搜尋',
  '二叉搜索树': '二元搜尋樹',
  '全排列 dfs': '全排列 dfs',
  '归并排序': '合併排序',
  'set/map 容器': 'set/map 容器',
  '图的 DFS': '圖的 DFS',
  '带权图（有向）': '帶權圖（有向）',
  'Dijkstra 最短路': 'Dijkstra 最短路徑',
  '数组求和 (递归)': '陣列求和 (遞迴)',
  '数组反转 (递归)': '陣列反轉 (遞迴)',
  '汉诺塔': '河內塔',
  '选择排序': '選擇排序',
  '冒泡排序': '氣泡排序',
  '插入排序': '插入排序',
  '合并两个有序数组': '合併兩個有序陣列',
  'stack / queue 模拟': 'stack / queue 模擬',
  'linked list（数组模拟）': 'linked list（陣列模擬）',
  'do-while 示範': 'do-while 示範',
  '陣列形參（不會被複製）': '陣列形參（不會被複製）',
  'sort + 自訂 cmp': 'sort + 自訂 cmp',
  '读入 n 个数求和': '讀入 n 個數求和',
  'while(cin) 读到 EOF': 'while(cin) 讀到 EOF',
  'getline 读整行': 'getline 讀整行',
  'switch 分级': 'switch 分級',
}

const listeners = new Set<() => void>()
let current: Locale = readInitialLocale()

function readInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'zh-CN' || saved === 'zh-Hant') return saved
  } catch {
    // 無痕模式 / SSR：沒有 localStorage 就往下判斷
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : ''
  return /-(HK|TW|MO)\b|Hant/i.test(nav) ? 'zh-Hant' : 'zh-CN'
}

export function getLocale(): Locale {
  return current
}

export function setLocale(locale: Locale): void {
  if (locale === current) return
  current = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // 存不了就算了，這次瀏覽有效
  }
  for (const fn of listeners) fn()
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 訂閱語言變化：元件開頭呼叫一次，切換語言時就會重畫。 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale)
}

/** 翻譯單一字串；字典沒收錄就原樣回傳（所以可以安全地包在所有字串外層）。 */
export function t(text: string): string {
  if (current === 'zh-CN') return text
  return HANT[text] ?? text
}

/** 帶參數的版本：模板裡用 {0} {1} 佔位，例如 tf('第 {0} 行：{1}', line, msg)。 */
export function tf(template: string, ...args: (string | number)[]): string {
  const base = t(template)
  return args.reduce<string>((acc, arg, i) => acc.split('{' + i + '}').join(String(arg)), base)
}
