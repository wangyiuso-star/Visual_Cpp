import { useState } from 'react'
import { INDENT_SIZES } from './editorSetup'
import { PRESETS } from '../presets'
import { getLocale, setLocale, t, tf, useLocale } from '../i18n'

export interface TopbarProps {
  playing: boolean
  /** 「後退」是否可用（還沒跑過就沒有東西可以退） */
  canBack: boolean
  /** 是否已經有快照（跳步 / 跳轉要用） */
  canJump: boolean
  /** 跳步輸入框的上限（＝快照總數） */
  maxStep: number
  stepLabel: string
  speed: number
  jumpVal: string
  showIf: boolean
  showWhile: boolean
  showFor: boolean
  boolAsInt: boolean
  indentSize: number
  onPickPreset: (name: string) => void
  onTogglePlay: () => void
  onStepForward: () => void
  onStepBack: () => void
  onReset: () => void
  onSpeedChange: (v: number) => void
  onShowChange: (kind: 'if' | 'while' | 'for', val: boolean) => void
  onBoolAsIntChange: (v: boolean) => void
  onIndentSizeChange: (n: number) => void
  onJumpValChange: (v: string) => void
  onJump: () => void
}

/**
 * 頂部工具列：執行控制、播放速度、設定選單（顯示開關 + Tab 縮排 + 介面語言）、步數與跳步。
 * 從 App.tsx 抽出來（重構 S7）；「設定」選單開不開是純 UI 狀態，就留在這裡。
 */
export default function Topbar(props: TopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  // 訂閱語言：切換時整個工具列（含示例名稱）跟著重畫
  const locale = useLocale()
  return (
    <div className="topbar" data-locale={locale}>
      <span className="brand">
        <span className="logo">C++</span> {t('代码可视化')}
      </span>
      <select
        className="preset-select"
        value=""
        onChange={(e) => props.onPickPreset(e.target.value)}
        title={t('载入示例')}
      >
        <option value="" disabled>
          {t('示例…')}
        </option>
        {PRESETS.map((p) => (
          <option key={p.name} value={p.name}>
            {t(p.name)}
          </option>
        ))}
      </select>
      <button className="btn primary" onClick={props.onTogglePlay}>
        {t(props.playing ? '⏸ 暂停' : '▶ 运行')}
      </button>
      <button className="btn" onClick={props.onStepForward} disabled={props.playing}>
        {t('⏭ 单步')}
      </button>
      <button className="btn" onClick={props.onStepBack} disabled={props.playing || !props.canBack}>
        {t('⏮ 后退')}
      </button>
      <button className="btn" onClick={props.onReset}>
        {t('⟲ 重置')}
      </button>
      <div className="speed-control" title={t('播放速度（每步间隔）')}>
        <input
          type="range"
          min={50}
          max={2000}
          step={50}
          value={props.speed}
          onChange={(e) => props.onSpeedChange(Number(e.target.value))}
          className="speed-slider"
        />
        <span className="speed-label">{props.speed}ms</span>
      </div>
      <span className="spacer" />
      <div className="cond-toggle">
        <button className="btn" onClick={() => setMenuOpen((o) => !o)}>
          {t('设置 ▾')}
        </button>
        {menuOpen && (
          <div className="cond-menu">
            <div className="cond-menu-hint">{t('运行前设置，改动后需重新运行')}</div>
            <label>
              <input type="checkbox" checked={props.showIf} onChange={(e) => props.onShowChange('if', e.target.checked)} />
              {t('if 判断')}
            </label>
            <label>
              <input type="checkbox" checked={props.showWhile} onChange={(e) => props.onShowChange('while', e.target.checked)} />
              {t('while 判断')}
            </label>
            <label>
              <input type="checkbox" checked={props.showFor} onChange={(e) => props.onShowChange('for', e.target.checked)} />
              {t('for 判断')}
            </label>
            <label>
              <input type="checkbox" checked={props.boolAsInt} onChange={(e) => props.onBoolAsIntChange(e.target.checked)} />
              {t('bool 输出 1/0')}
            </label>
            <div className="cond-menu-hint">{t('编辑器')}</div>
            <div className="indent-choice">
              <span>{t('Tab 缩排')}</span>
              {INDENT_SIZES.map((s) => (
                <button
                  key={s}
                  className={props.indentSize === s ? 'on' : ''}
                  onClick={() => props.onIndentSizeChange(s)}
                  title={tf('按 Tab 缩排 {0} 格', s)}
                >
                  {tf('{0} 格', s)}
                </button>
              ))}
            </div>
            <div className="cond-menu-note">
              {t('整行加减缩排：Tab / Shift-Tab，或 Ctrl+] / Ctrl+[')}
            </div>
            <div className="cond-menu-hint">{t('语言')}</div>
            <div className="indent-choice" title={t('界面语言（默认跟随浏览器）')}>
              <button
                className={getLocale() === 'zh-CN' ? 'on' : ''}
                onClick={() => setLocale('zh-CN')}
                title="简体中文"
              >
                {t('简体')}
              </button>
              <button
                className={getLocale() === 'zh-Hant' ? 'on' : ''}
                onClick={() => setLocale('zh-Hant')}
                title="繁體中文（香港／台灣用語）"
              >
                {t('繁體')}
              </button>
            </div>
          </div>
        )}
      </div>
      <span className="step-badge">
        {props.stepLabel}
      </span>
      <div className="jump-control">
        <span className="jump-label">{t('跳到')}</span>
        <input
          type="number"
          className="jump-input"
          min={1}
          max={props.maxStep}
          placeholder={t('步')}
          value={props.jumpVal}
          disabled={!props.canJump}
          onChange={(e) => props.onJumpValChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') props.onJump()
          }}
        />
        <button className="btn btn-sm" onClick={props.onJump} disabled={!props.canJump}>
          {t('跳转')}
        </button>
      </div>
    </div>
  )
}
