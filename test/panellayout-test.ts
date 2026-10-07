import { readFileSync } from 'node:fs'
import { check, report } from './_helpers'
import {
  EDITOR_PCT_MAX,
  EDITOR_PCT_MIN,
  EMPTY_LAYOUT,
  TREE_PACK_MIN,
  isWide,
  treeAutoWideOf,
  twoColumnMinWidth,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  loadLayout,
  moveKeyBy,
  moveKeyTo,
  serializeLayout,
  zoomOf,
} from '../src/components/panelLayout'

// 右侧面板的卡片布局：顺序 / 单卡缩放 / 全宽。
// 拖动与 localStorage 要真浏览器才能测，所以这里把「顺序怎么算、缩放怎么夹、存档怎么读」逐条锁住。

function eqArr(name: string, got: string[], want: string[]) {
  check(name, JSON.stringify(got) === JSON.stringify(want), '期望 ' + JSON.stringify(want) + ' 实际 ' + JSON.stringify(got))
}

// ---------- 缩放夹取 ----------
check('clampZoom 夹住下限', clampZoom(0.1) === ZOOM_MIN, String(clampZoom(0.1)))
check('clampZoom 夹住上限', clampZoom(9) === ZOOM_MAX, String(clampZoom(9)))
check('clampZoom 非数字回 1', clampZoom(Number.NaN) === 1)
check('clampZoom 取到两位小数', clampZoom(0.8234) === 0.82, String(clampZoom(0.8234)))
check('clampZoom 原值在范围内不动', clampZoom(1.2) === 1.2)
check('zoomOf 没设定就是 100%', zoomOf(EMPTY_LAYOUT, 'a') === 1)
check('zoomOf 会夹住存档里的离谱值', zoomOf({ order: [], zoom: { a: 5 }, wide: {} }, 'a') === ZOOM_MAX)

// ---------- 放大 → 自动占整行 ----------
// 半宽的格子在放大时会被宽度补偿压窄，固定尺寸的内容（例如图）就会撑出横向卷轴，
// 所以放大超过 100% 的卡片一律占整行。
check('100% 不占整行', isWide(EMPTY_LAYOUT, 'g') === false)
check('放大到 160% 自动占整行', isWide({ order: [], zoom: { g: 1.6 }, wide: {} }, 'g') === true)
check('缩小到 80% 不占整行', isWide({ order: [], zoom: { g: 0.8 }, wide: {} }, 'g') === false)
check('使用者按过整行宽就一直是整行', isWide({ order: [], zoom: {}, wide: { g: true } }, 'g') === true)
check('别的卡片的关键字不会互相影响', isWide({ order: [], zoom: { g: 1.6 }, wide: {} }, 'h') === false)
// auto = 树/调用树在「面板不够宽」时的预设行为
check('树在窄面板时占整行（auto）', isWide(EMPTY_LAYOUT, 't', true) === true)
check('面板够宽时树不占整行（auto=false）', isWide(EMPTY_LAYOUT, 't', false) === false)
check('手动按过半宽 → 就算 auto 要它占整行也听手动的', isWide({ order: [], zoom: {}, wide: { t: false } }, 't', true) === false)
check('手动按过整行 → 就算 auto 说不用也占整行', isWide({ order: [], zoom: {}, wide: { t: true } }, 't', false) === true)
check('放大 >100% 一律占整行（就算手动选过半宽）', isWide({ order: [], zoom: { t: 1.6 }, wide: { t: false } }, 't', false) === true)
check('并排门槛是个合理的数字（≥800px）', TREE_PACK_MIN >= 800, String(TREE_PACK_MIN))

// ---------- 拖动排序 ----------
eqArr('拖到谁身上就占谁的位置（往前）', moveKeyTo(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b'])
eqArr('拖到谁身上就占谁的位置（往后）', moveKeyTo(['a', 'b', 'c'], 'a', 'c'), ['b', 'c', 'a'])
eqArr('拖到自己身上不动', moveKeyTo(['a', 'b', 'c'], 'b', 'b'), ['a', 'b', 'c'])
eqArr('拖动的 key 不在列表里就原样回传', moveKeyTo(['a', 'b'], 'z', 'a'), ['a', 'b'])
eqArr('目标不在列表里也原样回传', moveKeyTo(['a', 'b'], 'a', 'z'), ['a', 'b'])
eqArr('相邻互换（往上）', moveKeyBy(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c'])
eqArr('相邻互换（往下）', moveKeyBy(['a', 'b', 'c'], 'b', 1), ['a', 'c', 'b'])
eqArr('已经在最上面再往上不动', moveKeyBy(['a', 'b'], 'a', -1), ['a', 'b'])
eqArr('已经在最下面再往下不动', moveKeyBy(['a', 'b'], 'b', 1), ['a', 'b'])
check('moveKeyTo 不会改到原本的阵列', (() => { const k = ['a', 'b', 'c']; moveKeyTo(k, 'a', 'c'); return k.join(',') === 'a,b,c' })())

// ---------- 存档 ----------
check('沒有存档 → 空布局', loadLayout(null).order.length === 0)
check('空字串 → 空布局', loadLayout('').order.length === 0)
check('坏掉的 JSON → 空布局（不能让旧存档把面板弄坏）', loadLayout('{oops').order.length === 0)
check('型别不对的栏位一律忽略', (() => { const l = loadLayout('{"order":123,"zoom":[],"wide":"x"}'); return l.order.length === 0 && Object.keys(l.zoom).length === 0 && Object.keys(l.wide).length === 0 })())
check('读回缩放时会夹取', loadLayout('{"zoom":{"a":99}}').zoom.a === ZOOM_MAX)
check('顺序 / 全宽都读得回来', (() => { const l = loadLayout('{"order":["b","a"],"wide":{"b":true}}'); return l.order.join(',') === 'b,a' && l.wide.b === true })())
check('序列化 → 读取 是一圈（round trip）', (() => {
  const l = { order: ['x', 'y'], zoom: { x: 1.3 }, wide: { y: true } }
  const back = loadLayout(serializeLayout(l))
  return back.order.join(',') === 'x,y' && back.zoom.x === 1.3 && back.wide.y === true
})())

// ---------- 樹 / 呼叫樹什麼時候占整行（v0.11.1 修的「沒辦法並排」）----------
// 症狀：不管面板多寬，樹 / BST / 堆 / 呼叫樹都占整行。
// 根因：寬度是量 .viz-body 來的，但「還沒跑」那一帧走的是另一棵沒有掛 ref 的子樹，
//       舊寫法 useEffect([]) 在那時就看到 ref.current === null 直接 return，
//       之後也不會再掛 → panelW 永遠 0 → treeAutoWideOf(0) 永遠是「占整行」。
check('量不到寬度（0）→ 先占整行', treeAutoWideOf(0) === true)
check('負數（異常測量）→ 占整行', treeAutoWideOf(-5) === true)
check('門檻下方（799px）→ 占整行', treeAutoWideOf(TREE_PACK_MIN - 1) === true)
check('剛好到門檻（800px）→ 可以並排', treeAutoWideOf(TREE_PACK_MIN) === false)
check('夠寬（1600px）→ 可以並排', treeAutoWideOf(1600) === false)

const vpSrc = readFileSync('src/components/VariablesPanel.tsx', 'utf8')
const refCount = vpSrc.split('ref={panelRef}').length - 1
check('面板寬度改用 callback ref 量（節點換掉會重新掛 observer）', vpSrc.indexOf('useCallback((el: HTMLDivElement | null)') >= 0 && vpSrc.indexOf('roRef') >= 0)
check('兩個 .viz-body 分支都掛了 panelRef（少一個就會永遠量不到寬度）', refCount === 2, '實際掛了 ' + refCount + ' 個')
check('不再用舊寫法（useEffect([]) 裡讀 panelRef.current）', vpSrc.indexOf('const el = panelRef.current') < 0)
check('VariablesPanel 走 treeAutoWideOf（判斷只有一份）', vpSrc.indexOf('treeAutoWideOf(panelW)') >= 0)
// v0.9.8 的「面板夠寬才並排」只做了一半：treeAutoWide 算出來了，呼叫端卻傳死的 true
// （cardView('@calltree', true) / cardView(name, isTreeLike(cell))）→ 樹永遠占整行。
check('呼叫端真的用了 treeAutoWide（不能傳死的 true）', vpSrc.indexOf("cardView('@calltree', true)") < 0 && vpSrc.indexOf('cardView(item.v.name, isTreeLike(item.v.cell) && treeAutoWide)') >= 0, '仍有人傳死的 true')
check('樹類卡片是 isTreeLike && treeAutoWide', vpSrc.indexOf('isTreeLike(item.v.cell) && treeAutoWide') >= 0)
check('呼叫樹卡片用 treeAutoWide', vpSrc.indexOf("cardView('@calltree', treeAutoWide)") >= 0)

// ---------- 「⇔ 自動並排」按鈕（v0.11.2）----------
// 使用者回報「把中線往左拖還是不會並排」：多半是卡片有「手動整行（⤢）」或「放大 >100%」
// 存在 localStorage 裡 —— 這兩者會讓 isWide() 無視面板寬度。按鈕要做三件事：
//   1. 清掉樹/遞歸樹的手動 wide 與 >100% 的縮放（VariablesPanel 收到 packSignal）
//   2. 依量到的實際寬度把中線往左移，直到卡片區放得下兩欄
//   3. 真做不到就顯示原因（不靜默）
check('兩欄最小寬度：寬螢幕 = 2*360+12', twoColumnMinWidth(1920) === 732, String(twoColumnMinWidth(1920)))
check('兩欄最小寬度：≤1440 用 300/10', twoColumnMinWidth(1440) === 610 && twoColumnMinWidth(1200) === 610)
check('拖曳與自動並排共用同一組夾制（15%~80%）', EDITOR_PCT_MIN === 15 && EDITOR_PCT_MAX === 80)

const appSrc = readFileSync('src/App.tsx', 'utf8')
check('App 有「自動並排」按鈕', appSrc.indexOf('自動並排') >= 0 && appSrc.indexOf('twoColumnMinWidth(window.innerWidth)') >= 0)
check('App 用 gridTemplateColumns 量「現在是幾欄」', appSrc.indexOf('gridTemplateColumns') >= 0)
check('App 把 packSignal 傳給面板', appSrc.indexOf('packSignal={packSignal}') >= 0)
check('中線拖曳與按鈕共用 EDITOR_PCT_MIN/MAX', appSrc.indexOf('useVerticalDrag(setEditorPct, EDITOR_PCT_MIN, EDITOR_PCT_MAX)') >= 0)
check('App 做不到時會說明原因（packHint）', appSrc.indexOf('setPackHint(') >= 0 && appSrc.indexOf('packHint &&') >= 0)
check('VariablesPanel 收到 packSignal 會清掉樹的手動整行與放大', vpSrc.indexOf('packSignal') >= 0 && vpSrc.indexOf('delete wide[k]') >= 0 && vpSrc.indexOf('isTreeLike(v.cell)') >= 0)

report('panellayout-test')