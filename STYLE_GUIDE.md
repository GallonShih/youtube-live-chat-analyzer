# Hermes Dashboard - 視覺風格指南

> **設計系統**: Glassmorphism + 數據儀表板專用配色
> **最後更新**: 2026-02-01

---

## 🎨 核心設計理念

### Glassmorphism（玻璃擬態）風格

現代、透明、有層次感的設計風格，特別適合數據密集型應用。

**核心特徵**:
- 🔲 毛玻璃背景模糊效果
- ✨ 半透明的白色卡片
- 🌈 微妙的邊框和陰影
- 🎯 清晰的視覺層次

**為什麼選擇 Glassmorphism？**
- ✅ 專業且現代
- ✅ 適合數據可視化（不會過度搶眼）
- ✅ 提供良好的視覺層次
- ✅ 在明暗模式下都表現優秀

---

## 🎨 色彩系統

### 主色調（Primary Colors）

```css
/* 深藍色系 - 主色調 */
--color-primary: #1E40AF;        /* Blue 700 - 主要按鈕、鏈接 */
--color-primary-light: #3B82F6;  /* Blue 500 - 次要元素、懸停 */
--color-primary-dark: #1E3A8A;   /* Blue 900 - 文字、深色背景 */
```

**使用場景**:
- 主要按鈕（Primary CTA）
- 活躍狀態的導航項
- 鏈接文字
- 圖表主線條顏色

### 強調色（Accent Colors）

```css
/* 琥珀色系 - 強調色 */
--color-accent: #F59E0B;         /* Amber 500 - CTA、重要提示 */
--color-accent-light: #FCD34D;   /* Amber 300 - 懸停狀態 */
--color-accent-dark: #D97706;    /* Amber 600 - 深色強調 */
```

**使用場景**:
- 主要行動按鈕（Call-to-Action）
- 重要數據高亮
- 金額/收入顯示
- 需要吸引注意的元素

### 語義色（Semantic Colors）

```css
/* 狀態顏色 */
--color-success: #10B981;  /* Green 500 - 成功、批准 */
--color-warning: #F59E0B;  /* Amber 500 - 警告 */
--color-danger: #EF4444;   /* Red 500 - 錯誤、刪除 */
--color-info: #3B82F6;     /* Blue 500 - 提示信息 */
```

### 中性色（Neutral Colors）

```css
/* 灰階 - 背景和文字 */
--color-bg-base: #F8FAFC;     /* Slate 50 - 頁面背景 */
--color-bg-card: rgba(255, 255, 255, 0.8);  /* 卡片背景 */

--color-text-primary: #0F172A;    /* Slate 900 - 主要文字 */
--color-text-secondary: #475569;  /* Slate 600 - 次要文字 */
--color-text-disabled: #94A3B8;   /* Slate 400 - 禁用文字 */

--color-border: #E2E8F0;          /* Slate 200 - 邊框 */
--color-divider: #CBD5E1;         /* Slate 300 - 分隔線 */
```

### 視覺化範例

```html
<!-- 色彩卡片示例 -->
<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
  <!-- 主色調 -->
  <div style="background: #1E40AF; padding: 24px; border-radius: 12px; color: white; text-align: center;">
    <div style="font-weight: 700; font-size: 18px;">Primary</div>
    <div style="font-size: 14px; opacity: 0.9;">#1E40AF</div>
  </div>

  <!-- 強調色 -->
  <div style="background: #F59E0B; padding: 24px; border-radius: 12px; color: white; text-align: center;">
    <div style="font-weight: 700; font-size: 18px;">Accent</div>
    <div style="font-size: 14px; opacity: 0.9;">#F59E0B</div>
  </div>

  <!-- 成功色 -->
  <div style="background: #10B981; padding: 24px; border-radius: 12px; color: white; text-align: center;">
    <div style="font-weight: 700; font-size: 18px;">Success</div>
    <div style="font-size: 14px; opacity: 0.9;">#10B981</div>
  </div>
</div>
```

---

## ✍️ 字體系統

### Fira Code + Fira Sans

專為數據和代碼設計的字體組合，清晰易讀且具有技術感。

```css
/* Google Fonts 導入 */
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');

/* 字體定義 */
body {
  font-family: 'Fira Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'Fira Code', monospace;
}

code, pre, .monospace {
  font-family: 'Fira Code', monospace;
}
```

### 字體大小階梯

| 用途 | 大小 | 行高 | 權重 | CSS Class |
|------|------|------|------|-----------|
| 頁面標題 | 30px (1.875rem) | 1.2 | 700 | `text-3xl font-bold` |
| 區塊標題 | 24px (1.5rem) | 1.3 | 600 | `text-2xl font-semibold` |
| 卡片標題 | 18px (1.125rem) | 1.4 | 600 | `text-lg font-semibold` |
| 正文 | 16px (1rem) | 1.5 | 400 | `text-base` |
| 小字 | 14px (0.875rem) | 1.5 | 400 | `text-sm` |
| 標籤 | 12px (0.75rem) | 1.5 | 500 | `text-xs font-medium` |

---

## 🧱 組件樣式

### 玻璃卡片（Glass Card）

核心 UI 組件，用於所有數據展示區域。

```jsx
// GlassCard.jsx
export function GlassCard({ children, className = '', hover = true }) {
  return (
    <div className={`
      bg-white/80
      backdrop-blur-md
      rounded-xl
      shadow-xl
      border border-white/20
      p-6
      ${hover ? 'hover:shadow-2xl hover:bg-white/90 transition-all duration-300' : ''}
      ${className}
    `}>
      {children}
    </div>
  );
}
```

**使用示例**:
```jsx
<GlassCard>
  <h2 className="text-xl font-semibold text-gray-900 mb-4">即時統計</h2>
  <p className="text-gray-600">觀看人數: 1,234</p>
</GlassCard>
```

### 主要按鈕（Primary Button）

```jsx
<button className="
  bg-blue-600
  text-white
  px-6 py-3
  rounded-lg
  font-semibold
  shadow-lg
  hover:bg-blue-700
  hover:shadow-xl
  active:scale-95
  transition-all duration-200
  cursor-pointer
  disabled:opacity-50
  disabled:cursor-not-allowed
  flex items-center gap-2
">
  <CheckIcon className="w-5 h-5" />
  <span>確認</span>
</button>
```

### 次要按鈕（Secondary Button）

```jsx
<button className="
  bg-white
  text-gray-700
  px-6 py-3
  rounded-lg
  font-semibold
  border border-gray-200
  hover:bg-gray-50
  hover:shadow-md
  active:scale-95
  transition-all duration-200
  cursor-pointer
  flex items-center gap-2
">
  <XMarkIcon className="w-5 h-5" />
  <span>取消</span>
</button>
```

### 危險按鈕（Danger Button）

```jsx
<button className="
  bg-red-500
  text-white
  px-6 py-3
  rounded-lg
  font-semibold
  shadow-lg
  hover:bg-red-600
  hover:shadow-xl
  active:scale-95
  transition-all duration-200
  cursor-pointer
  flex items-center gap-2
">
  <TrashIcon className="w-5 h-5" />
  <span>刪除</span>
</button>
```

### 輸入框（Input Field）

```jsx
<div className="flex flex-col gap-2">
  <label htmlFor="username" className="text-sm font-medium text-gray-700">
    用戶名稱
  </label>
  <input
    id="username"
    type="text"
    className="
      border border-gray-300
      rounded-lg
      px-4 py-3
      text-base
      focus:outline-none
      focus:ring-2
      focus:ring-blue-500
      focus:border-transparent
      transition-all duration-200
    "
    placeholder="請輸入用戶名稱"
  />
</div>
```

### 導航欄（Navbar）

```jsx
<nav className="
  fixed top-4 left-4 right-4
  z-50
  bg-white/80
  backdrop-blur-md
  rounded-2xl
  shadow-xl
  border border-white/20
  px-6 py-3
">
  <div className="max-w-7xl mx-auto flex justify-between items-center">
    {/* Logo */}
    <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
      Hermes 監控儀表板
    </h1>

    {/* Navigation Links */}
    <div className="flex gap-2">
      {/* Active State */}
      <Link className="
        flex items-center gap-2
        px-4 py-2
        bg-blue-600
        text-white
        rounded-lg
        font-semibold
        shadow-lg
        cursor-pointer
      ">
        <ChartBarIcon className="w-5 h-5" />
        <span>Dashboard</span>
      </Link>

      {/* Inactive State */}
      <Link className="
        flex items-center gap-2
        px-4 py-2
        bg-white/50
        text-gray-700
        rounded-lg
        font-semibold
        border border-gray-200/50
        hover:bg-white
        hover:shadow-md
        transition-all duration-200
        cursor-pointer
      ">
        <PlayIcon className="w-5 h-5" />
        <span>Playback</span>
      </Link>
    </div>
  </div>
</nav>
```

---

## 📐 間距系統

### 標準間距階梯

```css
/* Tailwind 標準間距 */
--space-0: 0px;       /* 無間距 */
--space-1: 4px;       /* 0.25rem - gap-1, p-1 */
--space-2: 8px;       /* 0.5rem - gap-2, p-2 */
--space-3: 12px;      /* 0.75rem - gap-3, p-3 */
--space-4: 16px;      /* 1rem - gap-4, p-4 */
--space-6: 24px;      /* 1.5rem - gap-6, p-6 */
--space-8: 32px;      /* 2rem - gap-8, p-8 */
--space-12: 48px;     /* 3rem - gap-12, p-12 */
--space-16: 64px;     /* 4rem - gap-16, p-16 */
```

### 使用指南

| 用途 | Gap | Padding |
|------|-----|---------|
| 區塊之間 | `gap-6` 或 `gap-8` | - |
| 卡片內部 | `gap-4` | `p-6` |
| 表單元素 | `gap-2` 或 `gap-3` | - |
| 按鈕內部 | `gap-2` | `px-4 py-2` 至 `px-6 py-3` |
| 頁面邊距 | - | `p-4 md:p-8` |

---

## 🎭 陰影系統

### 陰影階梯

```css
/* 微妙提升 - 用於小元素 */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);

/* 標準卡片陰影 */
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);

/* 懸停狀態陰影 */
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);

/* 強調元素陰影 */
--shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.15);

/* 最高層級（模態框） */
--shadow-2xl: 0 25px 50px rgba(0, 0, 0, 0.25);
```

### Tailwind 類名對應

```jsx
<div className="shadow-sm">   {/* 微妙 */}
<div className="shadow-md">   {/* 標準 */}
<div className="shadow-lg">   {/* 懸停 */}
<div className="shadow-xl">   {/* 強調 */}
<div className="shadow-2xl">  {/* 模態框 */}
```

---

## 🎬 動畫和過渡

### 標準過渡時長

```css
/* 微交互 - 快速反饋 */
transition-all duration-150  /* 150ms - 按鈕點擊 */

/* 標準過渡 - 大多數情況 */
transition-all duration-200  /* 200ms - 懸停、顏色變化 */

/* 平滑過渡 - 複雜動畫 */
transition-all duration-300  /* 300ms - 卡片移動、展開 */

/* 慢速動畫 - 用於特殊場合 */
transition-all duration-500  /* 500ms - 頁面切換 */
```

### 緩動函數（Easing）

```css
ease-in      /* 淡入 - 元素消失時使用 */
ease-out     /* 淡出 - 元素出現時使用（推薦） */
ease-in-out  /* 雙向緩動 - 循環動畫 */
linear       /* 線性 - 避免用於 UI 動畫 */
```

**推薦用法**:
```jsx
/* ✅ 元素進入 */
<div className="transition-all duration-200 ease-out">

/* ✅ 元素離開 */
<div className="transition-all duration-200 ease-in">

/* ❌ 不推薦 */
<div className="transition-all duration-200 linear">
```

### 響應式動畫（Accessibility）

**必須尊重用戶的動畫偏好**:

```css
/* 檢測用戶是否偏好減少動畫 */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

在 React 中實現:
```jsx
// useReducedMotion.js
import { useEffect, useState } from 'react';

export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return prefersReducedMotion;
}

// 使用
function MyComponent() {
  const reducedMotion = useReducedMotion();

  return (
    <div className={reducedMotion ? '' : 'transition-all duration-300'}>
      內容
    </div>
  );
}
```

---

## 🖼️ 圖標系統

### 推薦圖標庫: Heroicons

**安裝**:
```bash
npm install @heroicons/react
```

**使用示例**:
```jsx
import {
  ChartBarIcon,
  PlayIcon,
  TrendingUpIcon,
  CogIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  XMarkIcon,
  TrashIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';

// 24x24 outline (推薦用於 UI)
<ChartBarIcon className="w-6 h-6 text-blue-600" />

// 20x20 solid (用於填充圖標)
import { CheckIcon } from '@heroicons/react/20/solid';
<CheckIcon className="w-5 h-5 text-white" />
```

### 圖標尺寸指南

| 用途 | 尺寸 | Tailwind Class |
|------|------|----------------|
| 按鈕圖標 | 16px | `w-4 h-4` |
| 標準圖標 | 20px | `w-5 h-5` |
| 導航圖標 | 24px | `w-6 h-6` |
| 大型圖標 | 32px | `w-8 h-8` |
| 英雄圖標 | 48px+ | `w-12 h-12` |

### ❌ 禁止使用 Emoji 作為圖標

```jsx
// ❌ 不專業、不一致
<button>📊 Dashboard</button>
<button>🔍 搜尋</button>
<button>✕ 關閉</button>

// ✅ 專業、可控、一致
<button className="flex items-center gap-2">
  <ChartBarIcon className="w-5 h-5" />
  <span>Dashboard</span>
</button>

<button className="flex items-center gap-2">
  <MagnifyingGlassIcon className="w-5 h-5" />
  <span>搜尋</span>
</button>

<button className="flex items-center gap-2">
  <XMarkIcon className="w-5 h-5" />
  <span>關閉</span>
</button>
```

---

## 📱 響應式設計

### 斷點系統

```css
/* Tailwind 默認斷點 */
sm: 640px   /* 小型平板橫向 */
md: 768px   /* 平板直向 */
lg: 1024px  /* 桌面 */
xl: 1280px  /* 大桌面 */
2xl: 1536px /* 超大桌面 */
```

### 響應式模式

```jsx
/* 移動優先（推薦） */
<div className="
  grid
  grid-cols-1           // 移動端: 1 列
  md:grid-cols-2        // 平板: 2 列
  lg:grid-cols-4        // 桌面: 4 列
  gap-4
">

/* 隱藏/顯示 */
<div className="hidden lg:block">  {/* 僅桌面顯示 */}
<div className="block lg:hidden">  {/* 僅移動端顯示 */}

/* 間距響應式 */
<div className="p-4 md:p-8 lg:p-12">  {/* 間距隨螢幕增大 */}
```

### 測試斷點

必須在以下寬度測試:
- ✅ **375px** - iPhone SE (最小支援)
- ✅ **768px** - iPad 直向
- ✅ **1024px** - iPad 橫向 / 小筆電
- ✅ **1440px** - 標準桌面

---

## ♿ 無障礙設計

### 色彩對比度

**必須達到 WCAG AA 標準** (4.5:1 最小值)

```jsx
/* ✅ 良好對比度 */
<p className="text-gray-900 bg-white">  // 15:1 對比度
<p className="text-gray-600 bg-white">  // 4.54:1 對比度

/* ❌ 對比度不足 */
<p className="text-gray-400 bg-white">  // 2.8:1 - 不達標
<p className="text-gray-300 bg-white">  // 1.9:1 - 嚴重不達標
```

**檢測工具**:
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- Chrome DevTools Lighthouse

### 焦點狀態

**所有可交互元素必須有可見的焦點環**:

```jsx
/* ✅ 清晰的焦點環 */
<button className="
  focus:outline-none
  focus:ring-2
  focus:ring-blue-500
  focus:ring-offset-2
">
  按鈕
</button>

<input className="
  focus:outline-none
  focus:ring-2
  focus:ring-blue-500
  focus:border-transparent
" />
```

### 語義化 HTML

```jsx
/* ✅ 使用語義化標籤 */
<nav>...</nav>
<main>...</main>
<article>...</article>
<section>...</section>
<header>...</header>
<footer>...</footer>

/* ❌ 過度使用 div */
<div>
  <div>
    <div>...</div>
  </div>
</div>
```

### ARIA 標籤

```jsx
/* 圖標按鈕必須有 aria-label */
<button aria-label="關閉對話框">
  <XMarkIcon className="w-5 h-5" />
</button>

/* 裝飾性圖片使用空 alt */
<img src="decoration.png" alt="" />

/* 有意義的圖片必須有描述性 alt */
<img src="chart.png" alt="過去 7 天的觀看人數趨勢圖" />
```

---

## 📋 組件檢查清單

在創建任何新組件前，確保符合以下標準:

### 視覺品質
- [ ] 沒有使用 emoji 作為圖標
- [ ] 所有圖標來自 Heroicons
- [ ] Hover 狀態不會導致布局偏移
- [ ] 使用 Glassmorphism 卡片樣式
- [ ] 遵循色彩系統（主色、強調色、語義色）

### 交互
- [ ] 所有可點擊元素有 `cursor-pointer`
- [ ] Hover 狀態提供清晰視覺反饋
- [ ] 過渡動畫流暢（150-300ms）
- [ ] 鍵盤導航焦點狀態可見
- [ ] 按鈕在 loading 時禁用

### 無障礙
- [ ] 文字對比度 ≥ 4.5:1
- [ ] 所有表單輸入有關聯的 label
- [ ] 圖標按鈕有 aria-label
- [ ] 尊重 prefers-reduced-motion
- [ ] 使用語義化 HTML 標籤

### 響應式
- [ ] 在 375px 下正常顯示
- [ ] 在 768px、1024px、1440px 測試通過
- [ ] 無橫向滾動
- [ ] 固定元素不遮擋內容

---

## 🚀 快速開始

### 1. 安裝依賴

```bash
# 圖標庫
npm install @heroicons/react

# Toast 通知
npm install react-hot-toast

# (可選) Headless UI 組件
npm install @headlessui/react
```

### 2. 配置 Tailwind

```js
// tailwind.config.js
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Fira Sans', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      colors: {
        primary: {
          DEFAULT: '#1E40AF',
          light: '#3B82F6',
          dark: '#1E3A8A',
        },
        accent: {
          DEFAULT: '#F59E0B',
          light: '#FCD34D',
          dark: '#D97706',
        },
      },
      backgroundColor: {
        base: '#F8FAFC',
      },
    },
  },
  plugins: [],
}
```

### 3. 更新 CSS

```css
/* src/index.css */
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-base font-sans text-gray-900;
  }

  h1, h2, h3, h4, h5, h6 {
    @apply font-mono;
  }
}

/* 尊重用戶動畫偏好 */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 4. 創建基礎組件

```jsx
// src/components/GlassCard.jsx
export function GlassCard({ children, className = '', hover = true }) {
  return (
    <div className={`
      bg-white/80
      backdrop-blur-md
      rounded-xl
      shadow-xl
      border border-white/20
      p-6
      ${hover ? 'hover:shadow-2xl hover:bg-white/90 transition-all duration-300' : ''}
      ${className}
    `}>
      {children}
    </div>
  );
}
```

---

## 📚 參考資源

- [Heroicons 官網](https://heroicons.com/)
- [Tailwind CSS 文檔](https://tailwindcss.com/docs)
- [WebAIM 對比度檢查器](https://webaim.org/resources/contrastchecker/)
- [WCAG 無障礙指南](https://www.w3.org/WAI/WCAG21/quickref/)

---

**設計系統完整文檔**: `design-system/design-system/hermes-dashboard/MASTER.md`
**UX 審查報告**: `UX_AUDIT_REPORT.md`
