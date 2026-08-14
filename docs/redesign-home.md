# 首页改造规格：全量手绘食物插画风 + 新增「喝什么」

给执行方（Codex）的实现说明。目标页面：`miniprogram/pages/newspaper/`。

> 实施注意：若工作区已有未提交改动，先用 `git diff` 核对；`randomSettleDirection` 是现有落定动画状态，后续调整不得覆盖相关逻辑。

---

## 0. 现状诊断

当前页面的问题是三套设计语言叠在一起：

1. **新粗野主义**：`--border-width: 3rpx solid #1c1b1b`，几乎每个元素都套黑粗边。
2. **玻璃拟态**：`backdrop-filter: blur(24rpx)` 出现在 6 处。但页面是纯色底，底下没内容可透 —— **视觉零效果，只白交 Skyline 的合成开销**。
3. **微信原生蓝** `#2170e4` 实心按钮。

具体症状：

- **色温打架（最隐蔽也最致命）**：四张菜品插画的底色是暖奶油 `#FAEBC7` / `#FBEAC7` / `#FCE9C2` / `#FDEAC1`，页面底色却是冷灰 `#F4F3F2`。每张图放上去都像贴纸，矩形边界清晰可见。
- 一屏 6 种强色（米底 + 亮黄卡 + 蓝按钮 + 红标签 + 绿标签 + 纯黑按钮），视线无处落。
- 「今日首选」与「风味榜」第 1 名是同一道菜，重复展示，吃掉首屏近 40% 高度。
- 字号有 18/20/21/22/23/24/25/26/27/28/34/36/52 共 13 级，一堆只差 1rpx。
- 核心价值是"帮我决定吃什么"，但打开要先过日期、公告才到决定卡，然后立刻被两个同权重按钮打断。

**注意区分**：黑粗边本身不是原罪，问题是"黑"（冷色，和暖插画打架）+ "无差别"（所有元素同一种边，没有层级）。本次改造保留描边语言，但换色、分级。

---

## 1. 目标风格与层次策略

**全量手绘食物插画风**：暖奶油底、棕色描边、高饱和平涂、圆润手绘感、贴纸阴影。控件层同样描边。

参考 `miniprogram/images/dishes/` 下现有四张插画 —— **素材侧已达标，本次不需要重画**。

### 1.1 全描边风格的层次从哪来（核心）

既然所有元素都有边框，"有边/无边"就不能再当层次手段。层次改由四个维度共同建立，**每个元素必须明确落在某一档**：

| 维度 | 强调层 | 主要层 | 次要层 |
|---|---|---|---|
| **描边粗细** | `4rpx` | `3rpx` | `2rpx` |
| **填充饱和度** | 高饱和实心（暖橙/青绿） | 暖白 `--color-surface` | 低饱和奶油 `--color-surface-sunken` |
| **贴纸阴影** | `6rpx 6rpx 0` 硬阴影 | `3rpx 3rpx 0` 硬阴影 | 无 |
| **周围留白** | `--sp-5`(48rpx) | `--sp-4`(32rpx) | `--sp-2`(16rpx) |

**归档表（照此执行）：**

| 元素 | 档位 |
|---|---|
| 决定卡、「换一个」按钮 | 强调层 |
| feature 卡、快捷操作两个按钮、submit-sheet 主按钮 | 主要层 |
| 榜单行、chip、rating 按钮、输入框、profile 按钮、徽标 | 次要层 |
| topbar、状态行、公告行、footer | **不描边**（见 1.2） |

### 1.2 唯一的例外：文本流不描边

topbar、状态行、公告、footer、section 标题这些**纯文本行不加框**。理由：参考图里桌布上的文字标注也没有框，全部加框会让页面变成表格。这条不是"少做"，是风格本身的规则。

### 1.3 让 CSS 真的显得"手绘"的三个技巧

纯粹加个 `border` 只会得到"棕色方框"，不会有手绘感。以下三条是关键，**必须实施**：

**① 不对称圆角** —— 手画的框四角不可能一样圆：

```scss
.decision-card { border-radius: 32rpx 26rpx 34rpx 28rpx; }
.feature       { border-radius: 26rpx 30rpx 24rpx 28rpx; }
.ranking-row   { border-radius: 20rpx 24rpx 18rpx 22rpx; }
```

同类元素之间也可以再差几 rpx，避免整齐得像模板。

**② 微旋转** —— 只给"贴纸"性质的小元素，角度控制在 1.5° 以内，多了会显得坏掉：

```scss
.feature-badge { transform: rotate(-2deg); }
.notice-tag    { transform: rotate(-1deg); }
```

**③ 按下 = 压进阴影里** —— 贴纸风的正确按压反馈是位移到硬阴影的位置、同时阴影消失，比 `scale` 贴切得多：

```scss
.decision-button:active {
  transform: translate(6rpx, 6rpx);
  box-shadow: 0 0 0 var(--color-stroke);
}
/* 次级元素用 3rpx 版本 */
```

### 1.4 文字不用纯黑

参考图里所有线条都是棕色系。纯黑 `#1c1b1b` 压在暖奶油底上会发脏。**所有文字改用深棕 `#4A3524`**，描边用 `#6B4A32`。

---

## 2. 设计令牌层：`miniprogram/app.scss`

`page {}` 块整体替换。**所有旧令牌名保留为别名**，`admin` / `register` 两页不用逐行改也能跟着变。

```scss
page {
  /* 底：对齐菜品插画的奶油底，让插画无缝融进页面 */
  --color-page: #fbeac5;
  --color-surface: #fffbf2;        /* 主要层填充：提亮的暖白 */
  --color-surface-sunken: #f6e6c8; /* 次要层填充：比页面略深 */

  /* 文字：深棕三级，不用纯黑 */
  --color-ink: #4a3524;
  --color-ink-2: #8a6d52;
  --color-ink-3: #b39a7d;

  /* 描边：三级粗细，颜色统一 */
  --color-stroke: #6b4a32;
  --stroke-heavy: 4rpx;
  --stroke-base: 3rpx;
  --stroke-light: 2rpx;
  --color-border: #e0c9a0;         /* 仅用于榜单内部的分隔发丝线 */

  /* 主色：吐司/蛋黄的暖橙 */
  --color-brand: #e8843c;
  --color-brand-soft: #fce3c8;

  /* 插画取色板：同类元素靠色相区分时用 */
  --color-teal: #2e9b8f;           /* 参考图标题的青绿，做互补点缀 */
  --color-teal-soft: #d9efe9;
  --color-leaf: #6fbf3b;
  --color-berry: #d6453f;
  --color-berry-soft: #fbe0de;
  --color-yolk: #f5a623;

  /* 语义色，统一收编到插画色板 */
  --color-red: var(--color-berry);
  --color-red-soft: var(--color-berry-soft);
  --color-green: var(--color-leaf);
  --color-green-soft: #e4f4d6;
  --color-green-ink: #3d7a1f;
  --color-yellow: var(--color-yolk);

  /* 字号阶梯：六级 + 一个展示号 */
  --fs-1: 40rpx;
  --fs-2: 32rpx;
  --fs-3: 28rpx;
  --fs-4: 24rpx;
  --fs-5: 22rpx;
  --fs-6: 20rpx;
  --fs-hero: 56rpx;   /* 仅用于决定卡的结果文字 */

  /* 间距：8rpx 网格，禁止再出现 14/18/22/26rpx 这种游离值 */
  --sp-1: 8rpx;
  --sp-2: 16rpx;
  --sp-3: 24rpx;
  --sp-4: 32rpx;
  --sp-5: 48rpx;

  /* 圆角：手绘风整体加大；具体元素用 1.3① 的不对称写法覆盖 */
  --radius-xs: 12rpx;
  --radius-sm: 18rpx;
  --radius-md: 26rpx;
  --radius-lg: 32rpx;
  --radius-full: 999rpx;

  /* 贴纸硬阴影：手绘风的主力分层手段 */
  --shadow-sticker: 6rpx 6rpx 0 var(--color-stroke);
  --shadow-sticker-sm: 3rpx 3rpx 0 var(--color-stroke);
  /* 柔阴影：仅给不描边的浮层（sheet）用，暖褐调，不用中性灰 */
  --shadow-soft: 0 -8rpx 32rpx rgba(107, 74, 50, 0.14);

  /* 旧别名：admin / register 仍在引用，统一指向新值，避免逐行改动 */
  --border-width: var(--stroke-base);
  --color-field: var(--color-surface-sunken);
  --color-line: var(--color-border);
  --color-muted: var(--color-ink-3);
  --color-muted-strong: var(--color-ink-2);
  --color-blue: var(--color-brand);
  --shadow-small: var(--shadow-sticker-sm);
  --shadow-card: var(--shadow-sticker);
  /* 拟物内高光已废弃，置空让旧页面的 inset 阴影自动失效 */
  --glass-highlight: transparent;
  --glass-depth: transparent;

  min-height: 100%;
  background: var(--color-page);
  color: var(--color-ink);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
}
```

`--glass-highlight` / `--glass-depth` 置 `transparent` 是关键技巧：admin / register 里那些 `inset 0 3rpx 0 var(--glass-highlight)` 自动变成无操作，**不用逐行删就完成扁平化**。同理 `--shadow-small` / `--shadow-card` 重定向到贴纸阴影后，那两页的卡片和按钮会自动获得手绘风，无需逐条改。

### 2.1 格纹桌布肌理

呼应参考图的桌布。**必须极淡**，否则盖过内容：

```scss
.home-page {
  background-color: var(--color-page);
  background-image:
    repeating-linear-gradient(45deg, rgba(107, 74, 50, 0.035) 0 2rpx, transparent 2rpx 44rpx),
    repeating-linear-gradient(-45deg, rgba(107, 74, 50, 0.035) 0 2rpx, transparent 2rpx 44rpx);
}
```

**先在 Skyline 真机验证多重 `background-image` 是否生效**，不生效就退回纯色，不要为此引入图片资源。

### 2.2 同文件内其余要改的地方

| 位置 | 改法 |
|---|---|
| `page button:not([disabled]):active` | 换成 1.3③ 的压入式：`transform: translate(3rpx,3rpx); box-shadow: 0 0 0 var(--color-stroke);` |
| `.ui-topbar` | 删 `border-bottom`、`backdrop-filter`、`box-shadow`；背景 `transparent` |
| `.ui-icon-button` | `border: var(--stroke-light) solid var(--color-stroke)`；背景 `var(--color-surface)`；`box-shadow: var(--shadow-sticker-sm)`；删 `backdrop-filter` |
| `.ui-card` | `border: var(--stroke-base) solid var(--color-stroke)`；背景 `var(--color-surface)`；`box-shadow: var(--shadow-sticker)`；不对称圆角；删 `backdrop-filter`；`padding: var(--sp-3)` |
| `.ui-section-head` | 删 `border-bottom`（标题行属于文本流，不描边），`align-items: baseline` |
| `.ui-field input/textarea` | `border: var(--stroke-light) solid var(--color-stroke)`；背景 `var(--color-surface-sunken)`；`border-radius: var(--radius-sm)` |
| `.ui-primary-button` 等 | `border: var(--stroke-base) solid var(--color-stroke)`；`height: 88rpx`；`box-shadow: var(--shadow-sticker-sm)`；`font-weight: 600` |
| `.ui-primary-button` | 背景 `var(--color-brand)`，白字 |
| `.ui-danger-button` | 背景 `var(--color-berry)`，白字 |
| `.ui-sheet` | 删 `backdrop-filter`；顶部 `border-top: var(--stroke-base) solid var(--color-stroke)`；`border-radius: var(--radius-lg) var(--radius-lg) 0 0`；背景 `var(--color-surface)`；`box-shadow: var(--shadow-soft)` |
| focus 态 | 删蓝色，改 `border-color: var(--color-brand)` + `box-shadow: 0 0 0 3rpx var(--color-brand-soft)` |
| `[disabled]` | `opacity` 从 `0.58` 改 `0.45` |

**全局字重规则**：`font-weight: 900` 全部降到 `600`，`800` 降到 `500`。900 在 PingFang 下会掉进伪粗体，糊且脏，压在暖底上尤其明显 —— 手绘风的分量应该来自描边和色块，不是字重。

### 2.3 关于手写字体（限制说明）

参考图的标题是手写体。小程序里**中文手写字体不实用**：`wx.loadFontFace` 加载中文全字库通常 3–10MB，严重拖慢首屏，Skyline 下还有兼容性风险。

本次**不引入自定义字体**，风格靠描边 + 配色 + 插画 + 不对称圆角建立。

若确实想要手写标题，唯一划算的做法是把「今天吃什么」这五个固定字做成一张 SVG/PNG 当标题图（约 10KB）。本次不做，留作后续。

---

## 3. 连带处理：admin / register / 图标

**`miniprogram/pages/admin/index.scss` 第 1-4 行、`miniprogram/pages/auth/register/index.scss` 第 1-6 行**的局部令牌覆盖：

```scss
--glass-card: var(--color-surface);
--glass-strong: var(--color-surface);
--glass-field: var(--color-surface-sunken);
```

register 里 `.profile-page { background-color: #f4f3f2; }` → 改 `var(--color-page)`。

**两文件共 7 处** `border: var(--border-width) solid var(--color-ink);`（admin 第 145/256/314/446 行，register 第 54/141/192 行）→ 改成 `solid var(--color-stroke)`（这里保留描边，只换色）。

两页 `background: rgba(33, 112, 228, 0.82)` 的 `.ui-primary-button` 覆盖 → 改 `var(--color-brand)`。

两页所有 `backdrop-filter` / `-webkit-backdrop-filter` → 删。

**`miniprogram/images/icons/back.svg` / `close.svg`**：`stroke` 改 `#6b4a32`，`stroke-width` 加粗到 2.5–3，补 `stroke-linecap="round"` `stroke-linejoin="round"` —— 圆头线帽是手绘感的廉价来源。

---

## 4. 首页结构重排：`index.wxml`

新的首屏顺序：

```
1. topbar        —— 精简，不描边，背景透明
2. 状态行         —— 日期 + 网络状态，一行浅棕字，不描边
3. 公告           —— 降级为单行细提示，不描边
4. 决定卡         —— 强调层，首屏视觉中心，新增「吃什么 / 喝什么」切换
5. 快捷操作        —— 主要层，两个按钮主次分明
6. 风味榜         —— 合并原「今日首选」，第 1 名带图放大
7. 分类 chips     —— 次要层
8. footer
```

### 4.1 公告降级

```html
<view class="notice" wx:if="{{announcementText}}">
  <text class="notice-tag">公告</text>
  <text class="notice-text">{{announcementText}}</text>
</view>
```

单行 + `text-overflow: ellipsis`。整行不描边，只有 `notice-tag` 是个小贴纸：`--color-teal` 底、白字、`--radius-xs`、`--stroke-light` 描边、`rotate(-1deg)`。

### 4.2 去掉重复：合并「今日首选」与「风味榜」

**删除**原来独立的 `<view class="section">今日首选</view>` 整块。把 feature 卡移进 `ranking-section` 作为第 1 名的放大展示，列表跳过 index 0：

```html
<view class="section ranking-section">
  <view class="section-heading">
    <view>
      <text class="section-title">风味榜</text>
      <text class="section-subtitle">来自同学的真实评分</text>
    </view>
    <text class="section-count">{{rankingRows.length}} 道</text>
  </view>

  <!-- 第 1 名：原 feature 卡，加 TOP 1 贴纸 -->
  <view class="feature">
    <image class="feature-image" src="{{leadDish.imageUrl}}" mode="aspectFill" binderror="onLeadDishImageError"></image>
    <view class="feature-copy">
      <view class="feature-head">
        <text class="feature-badge">TOP 1</text>
        <text class="feature-category">{{leadDish.categoryName}}</text>
      </view>
      <text class="feature-title">{{leadDish.name}}</text>
      <text class="feature-description">{{leadDish.description}}</text>
      <text class="feature-place">{{leadDish.placeText}}</text>
      <view class="feature-meta">
        <view class="feature-score">
          <text class="feature-score-value">{{leadDish.scoreText}}</text>
          <text class="feature-score-label">{{leadDish.ratingText}}</text>
        </view>
        <view class="rating-strip" wx:if="{{leadDish.canRate}}"><!-- 原样保留 --></view>
      </view>
    </view>
  </view>

  <!-- 第 2 名起：wx:if 跳过 index 0 -->
  <view class="ranking-list">
    <block wx:for="{{rankingRows}}" wx:key="id">
      <view class="ranking-row" wx:if="{{index > 0}}">
        <!-- 内容原样保留，rank-number 仍用 {{index + 1}}，自然从 2 开始 -->
      </view>
    </block>
  </view>
</view>
```

`leadDish` 就是 `rankingRows[0]`（见 `index.ts` 的 `setHomeData`），`index > 0` 正好去重，**无需改 ts**。

### 4.3 快捷操作主次分明

决定卡的「换一个」是暖橙实心。为避免一屏两个橙实心打架：

- **`推荐菜品`** → `--color-teal` 青绿实心 + 白字。青绿是暖橙的互补色，一冷一暖，且呼应参考图的青绿标注。
- **`刷新榜单`** → `--color-surface` 暖白底 + `--color-ink` 字。

两者都是主要层：`--stroke-base` 描边 + `--shadow-sticker-sm`。

---

## 5. 首页样式：`index.scss` 关键规范

整体重写。逐块要点，档位见 1.1 归档表：

**全局**
- 删掉 `.home-page` 里 `--home-glass-*` 和 `--home-inset-highlight` 全部自定义令牌，改用 app.scss 统一令牌。
- 删掉第 40-48 行那组 `backdrop-filter` 批量声明。
- 页面左右 padding 从 `24rpx` 提到 `var(--sp-4)`。**留白必须给足** —— 全描边风格里，留白是唯一能让眼睛休息的地方，卡片之间用 `--sp-4`，大段落之间用 `--sp-5`。

**topbar / 状态行 / footer（不描边）**：背景 `transparent`。`brand-kicker` 用 `--fs-6` + `--color-ink-3`；`brand-title` 用 `--fs-1` + `font-weight: 600`（原 52rpx/900 太重）。保留 `bindlongpress="openAdmin"`。

**profile-button（次要层）**：`--stroke-light` 描边、`background: var(--color-surface)`、`--radius-full`、`color: var(--color-ink)`、`--fs-5`、`box-shadow: var(--shadow-sticker-sm)`。`profile-mark` 小圆点改 `--color-leaf`，`14rpx`，带 `--stroke-light` 棕描边（小圆点带描边非常出手绘感）。

**decision-card（强调层，首屏中心）**：
- `background: var(--color-surface)`、`border: var(--stroke-heavy) solid var(--color-stroke)`、`box-shadow: var(--shadow-sticker)`、`padding: var(--sp-4)`。
- 不对称圆角：`border-radius: 32rpx 26rpx 34rpx 28rpx;`
- 竖向布局：切换 tab → 结果 slot → 全宽「换一个」按钮。
- `decision-title` 用 `--fs-hero` / `font-weight: 600` / `--color-ink`；`decision-place` 用 `--fs-5` / `--color-ink-2`。
- `decision-slot` 去掉半透明白底和 inset 阴影，透明即可。
- `decision-button`（强调层）：`background: var(--color-brand)`、白字、`height: 88rpx`、全宽、`--stroke-base` 描边、`--radius-full`、`box-shadow: var(--shadow-sticker)`，按下走 1.3③ 的 6rpx 压入。
- **保留** `is-rolling` / `settle-up` / `settle-down` 三个状态类及其动画，只换配色，不动时序。

**feature 卡（主要层）**：
- `border: var(--stroke-base) solid var(--color-stroke)`、`box-shadow: var(--shadow-sticker)`、`overflow: hidden`、不对称圆角。
- 图片和文字之间保留一条 `--stroke-base` 竖描边（这里描边是对的，它模拟插画里盘子的分区线）。
- 图片区宽度提到 `240rpx`，**背景设成 `var(--color-page)`**（即插画底色 `#fbeac5`），让插画和容器无缝，边界只剩卡片圆角。
- `feature-badge`（TOP 1 贴纸）：`background: var(--color-yolk)`、白字、`--stroke-light` 描边、`--radius-xs`、`--fs-6`、`transform: rotate(-2deg)`。
- `feature-category`：`--color-green-soft` 底 + `--color-green-ink` 字 + `--stroke-light` 描边。
- `feature-score-value` 用 `--color-brand` + `--fs-2`。

**ranking-row（次要层）**：
- 从"共享一条分隔线的表格行"改成**独立小卡片流**：每行 `--stroke-light` 描边 + `--color-surface` 底 + 不对称圆角 + **无贴纸阴影**（有阴影会让 5 行全部跳出来，密度爆炸），行间 `gap: var(--sp-2)`。
- 删掉原来的 `border-bottom` 分隔线和 `.ranking-list` 的 `border-top`。
- `rank-number` 从红色 900 改 `--color-ink-3` / `--fs-3` / `font-weight: 500`（名次是索引，不是重点）。
- `rank-score-value` 用 `--color-brand`。

**rating-button（次要层）**：`44rpx` 圆形 —— `--stroke-light` 描边、`--radius-full`、`background: var(--color-surface-sunken)`、`color: var(--color-ink-2)`；`:active` 时 `background: var(--color-brand)` + 白字 + 3rpx 压入。

**category-chip（次要层）**：`--stroke-light` 描边、`--radius-full`、`color: var(--color-ink)`、无贴纸阴影。
- **按 `index % 4` 轮换四种底色**（`--color-brand-soft` / `--color-teal-soft` / `--color-green-soft` / `--color-berry-soft`）—— 直接对应参考图"相同物品改色相和明暗饱和度使其有所区别"的做法，是这一版最能出插画味的细节，别省。

**submit-sheet**：`var(--color-surface)` 底、顶部 `--stroke-base` 描边、`--radius-lg` 顶部圆角、`box-shadow: var(--shadow-soft)`、删 `backdrop-filter`。顶部加 `sheet-grabber` 拖拽条（`72rpx × 10rpx`、`--color-stroke` 实心、`--radius-full`、居中）。`image-picker` 虚线边框改 `3rpx dashed var(--color-stroke)`。

**字号自查**：改完 `grep -o 'font-size: [0-9]\+rpx' index.scss | sort -u`，字号只应出现 20/22/24/28/32/40/56 七个值。

---

## 6. 新增「喝什么」

### 6.1 交互

决定卡顶部加 segmented control，两个 tab：**吃什么 / 喝什么**。切换时只换数据源和结果文案，**复用现有滚动 + 落定动画**（`randomRolling` / `randomSettleDirection` 那套时序不要重写）。

```html
<view class="decision-card {{randomRolling || randomSettleDirection ? 'is-rolling' : ''}}">
  <view class="decision-tabs">
    <view
      class="decision-tab {{decisionMode === 'food' ? 'is-active' : ''}}"
      data-mode="food"
      bindtap="switchDecisionMode"
    >吃什么</view>
    <view
      class="decision-tab {{decisionMode === 'drink' ? 'is-active' : ''}}"
      data-mode="drink"
      bindtap="switchDecisionMode"
    >喝什么</view>
  </view>

  <view class="decision-slot {{randomSettleDirection}}" aria-live="polite">
    <!-- reel 原样 -->
  </view>

  <button class="decision-button" disabled="{{randomRolling || randomSettleDirection}}" bindtap="rollRandomPick">
    {{randomRolling || randomSettleDirection ? '转动中' : '换一个'}}
  </button>
</view>
```

tab 样式（手绘风）：容器 `--stroke-light` 描边 + `--color-surface-sunken` 底 + `--radius-full` + `padding: 4rpx`；选中项 `background: var(--color-brand)` + 白字 + `--radius-full`；未选中透明底 + `--color-ink-2`；`transition: 160ms`。

### 6.2 数据来源

不新增后端接口。饮品池按优先级取：

1. **优先**：从已加载的 `this.dishes` 里筛 `categoryName` 命中 `['饮品','饮料','奶茶','咖啡','果汁','冷饮']` 的条目。
2. **兜底**：本地常量 `sampleDrinks`，参照现有 `sampleDishes` 的写法放在 `index.ts` 顶部：

```ts
const sampleDrinks: RandomPick[] = [
  { shop: '珍珠奶茶', place: '南门 · 奶茶店', key: 'drink-milk-tea' },
  { shop: '生椰拿铁', place: '图书馆 · 咖啡吧', key: 'drink-latte' },
  { shop: '现磨豆浆', place: '一食堂 · 一楼', key: 'drink-soy-milk' },
  { shop: '柠檬水',   place: '二食堂 · 一楼', key: 'drink-lemon' },
  { shop: '酸奶',     place: '校内便利店',    key: 'drink-yogurt' },
  { shop: '冰美式',   place: '图书馆 · 咖啡吧', key: 'drink-americano' },
]
```

### 6.3 `index.ts` 改动

现有 `buildRandomReel(canteens, current)` 内部自己调 `buildRandomPool(resolveCanteenRows(canteens))`。**把 pool 提成入参**，让两种模式共用：

```ts
// 签名改成收 pool，其余逻辑不变
function buildRandomReel(pool: RandomPick[], current: RandomPick) { /* ... */ }

// 新增
function buildDrinkPool(dishes: DisplayDish[]): RandomPick[] {
  const keywords = ['饮品', '饮料', '奶茶', '咖啡', '果汁', '冷饮']
  const matched = dishes
    .filter((dish) => keywords.some((word) => dish.categoryName.includes(word)))
    .map((dish) => ({ shop: dish.name, place: dish.placeText, key: dish.id }))
  return matched.length ? matched : sampleDrinks
}
```

`rollRandomPick` 里取 pool：

```ts
const pool = this.data.decisionMode === 'drink'
  ? buildDrinkPool(this.dishes)
  : buildRandomPool(resolveCanteenRows(this.canteenRows))
const { items, final } = buildRandomReel(pool, this.data.randomPick)
```

空池 toast 文案跟模式走：`decisionMode === 'drink' ? '暂无饮品数据' : '暂无窗口数据'`。

data 新增字段：

```ts
decisionMode: 'food',   // 'food' | 'drink'
```

新增方法：

```ts
switchDecisionMode(event: WechatMiniprogram.TouchEvent) {
  const mode = event.currentTarget.dataset.mode as 'food' | 'drink'
  if (mode === this.data.decisionMode) return
  this.clearRandomRollTimers()
  this.randomRollSequence += 1        // 作废进行中的滚动
  this.randomRollActive = false
  this.setData({
    decisionMode: mode,
    randomRolling: false,
    randomSettleDirection: '',
    randomPick: EMPTY_RANDOM_PICK,
    randomReel: [toRandomReelItem(EMPTY_RANDOM_PICK, 0)],
    randomReelOffset: 0,
  }, () => this.rollRandomPick())     // 切完立刻摇一个，别让用户看空态
}
```

`EMPTY_RANDOM_PICK` 的文案对饮品模式不合适，改成中性的 `{ shop: '点一下换一个', place: '', key: '' }`，或按模式取文案。

`typings/index.d.ts` 不需要动（`decisionMode` 是页面 data，不是 globalData）。

### 6.4 与滚动高度的联动（最容易踩）

`RANDOM_REEL_ITEM_HEIGHT = 124` 必须和 `.decision-result` / `.decision-slot` 的 CSS 高度**完全一致**，否则滚动错位。第 5 节把结果字号提到 56rpx，需要同步改三处（建议 `148`）：

- `index.ts` 的 `RANDOM_REEL_ITEM_HEIGHT`
- `index.scss` 的 `.decision-slot { height }`
- `index.scss` 的 `.decision-result { height }`

**三处必须相等。**

---

## 7. 红线

- 不要动 `onRateTap` 里 `sample-` 前缀不允许评分的判断（防脏数据）。
- 不要动 `randomSettleDirection` 的落定动画时序，只换配色。
- 不要把 `wx.request` 写进页面，评分/投稿继续走 `utils/api.ts` 的 `request()`。
- 不要改 `app.json` 页面注册（本次不新增页面）。
- 不引入自定义中文字体（见 2.3）。
- Skyline 下避免只在 webview 端可用的 CSS；`backdrop-filter` 本次是删除而不是替换。
- `project.private.config.json` 不提交。

---

## 8. 验收清单

- [ ] 全仓库 `grep -rn 'backdrop-filter' miniprogram/` 结果为 0。
- [ ] 全仓库无 `#1c1b1b` / `#000` 描边或文字色；描边一律 `--color-stroke`，文字一律 `--color-ink` 系。
- [ ] **描边分三档可见**：决定卡明显比 feature 卡粗，feature 卡明显比榜单行粗。三档一样粗 = 没做到位。
- [ ] 主要元素都有**不对称圆角**（四角数值不等），不是清一色 `border-radius: 24rpx`。
- [ ] 按钮按下是**位移进阴影**（阴影消失），不是 `scale`。
- [ ] 菜品插画放进 feature 卡后**看不出矩形边界**（图片区底色 = 插画底色 `#fbeac5`）。
- [ ] 分类 chip 的四种底色轮换生效，相邻两个 chip 不同色。
- [ ] `index.scss` 里字号只剩 20/22/24/28/32/40/56 七个值。
- [ ] 首屏不再出现同一道菜两次；榜单第一行的名次是 **2**，不是 1。
- [ ] 暖橙实心只出现在「换一个」上；`推荐菜品` 是青绿实心。
- [ ] 决定卡两个 tab 可切换，切换后立即摇出结果，连续快速点 tab 不会出现两个滚动动画叠加。
- [ ] 饮品无数据时能回落到 `sampleDrinks`，不出现空白。
- [ ] `RANDOM_REEL_ITEM_HEIGHT` 与两处 CSS 高度一致，滚动停止时结果**垂直居中不偏移**。
- [ ] 格纹肌理若启用，真机 Skyline 下确认生效且足够淡；不生效则退回纯色。
- [ ] admin / register 两页打开无视觉塌陷（卡片可见、按钮为暖橙、描边为棕色而非黑色）。
- [ ] DevTools 编译无 TS 报错（严格模式全开，未用变量直接编译失败 —— 改签名后清理不再使用的 import / 局部变量）。
