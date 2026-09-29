# Aster `codex/0928` 前端评估报告

> 范围：替换 DSH WebUI 的前端壳，重点看交互体验、动画、UI 和插件可视化管理。本轮只评估，不修改代码。
> 基线：`codex/0928` @ `b41be04`（Save Aster desktop snapshot for 0928）。
> 配套文档：[02-optimization-proposal.md](02-optimization-proposal.md)（优化建议与目标布局）、[03-implementation-plan.md](03-implementation-plan.md)（实施计划）。

## 0. 评估方法与环境

| 项 | 说明 |
| --- | --- |
| 代码阅读 | `dist/plugin-library.{js,css}` 全量；`dist/app.js` 中路由、首页、对话、插件、对话框、事件委托部分；`dist/aster-backend.js` 中插件 RPC；`macos/Web/*` 中动效时长与减弱动效处理；`script/prepare_web.py` |
| 自动检查 | `node script/verify_plugin_library.cjs` → PASS（现有隔离回归） |
| 实际运行 | 用 `script/prepare_web.py` 生成桌面版 Web 资源，将 `aster-backend.js` 替换为一次性 mock（72 个插件、3 个牌盒、1 个 Agent 预设，含 failed/pending/关闭/只读/关联），在 Chromium 中以 1280×733（接近默认桌面窗口）和 1440×900、820×700 运行 |
| 局限 | 没有真实 DSH Host，也没有 WKWebView；mock 数据是合成的，数量和字段参照 `plugin-library.js` 的分类表与 `plugin-inventory` 类型。凡是依赖真实 Host 行为的结论都标注了 `[INFERENCE]` |

优先级定义：**P0** 阻碍核心任务或有误操作风险；**P1** 明显降低效率或造成困惑；**P2** 体验或一致性问题；**P3** 打磨、技术债。

---

## 1. 插件管理：现状概览

当前实现（`dist/plugin-library.js`）：

- **数据**：`pluginInventory/list`，再加上 `pluginManager/listPlugins`、`pluginManager/listBundles`（`dist/aster-backend.js:742-750`）。
- **分组**：前端硬编码职责分类（Core/System/Feature/Unclassified），规则在 `plugin-library.js:11-25`。Extension 是按来源叠加的视图（`plugin-library.js:32-44`）。
- **展示**：4:7 塔罗卡网格，每页 16 张（`plugin-library.js:100`，`plugin-library.css:39,43`）。启用的插件显示“正面”（纯色面加名称），关闭的显示插画“背面”（`plugin-library.js:131-135`）。
- **筛选**：两个标签（Cards/Boxes）、分类块、搜索框、Scope 下拉、State 下拉、收藏开关（`plugin-library.js:177`）。
- **操作**：点卡片打开模态详情，在详情里启停或收藏（`plugin-library.js:217-230`，`app.js:316-343`）。牌盒可安装和卸载（`app.js:221-315`）。

已经做得好的地方（保留）：

- 权威状态始终来自 DSH：没有乐观成功；变更串行执行（`app.js:321`）；变更后强制重新读取；`pluginStale` 期间只读（`plugin-library.js:105-109`）。
- 只读原因解释完整（`plugin-library.js:68-77`），Conditional 不计入启用或关闭。
- IME 组合输入、刷新合并、详情同步、焦点与选区恢复都有回归覆盖（`script/verify_plugin_library.cjs`）。
- 动效克制：只在状态真的变化后做一次 340ms 翻牌（`plugin-library.js:188-190`），同时遵守 `prefers-reduced-motion` 和应用内“动效”开关。

问题不在数据正确性，而在**浏览效率、状态可读性和操作路径**。

---

## 2. 插件管理：核心问题（按优先级）

### P0-1 信息密度过低，首屏看不到一张完整的卡

- **位置**：`plugin-library.css:39`（`minmax(165px,1fr)`）、`:43`（`aspect-ratio:4/7`）；`plugin-library.js:100`（`PAGE_SIZE = 16`）；`plugin-library.js:177`（页头、两行分类块、工具栏和说明段落都在网格上方）。
- **实测**：桌面版 1280×733 下，`#main` 可视高度 536px，页面总高 2256px；首屏只露出第一排卡的上半部分，名称和状态都在视口外。72 个插件分成 5 页，每页要滚动约 4 屏。5 列时每页最后一行只剩 1 张（16 不是列数的整数倍）。
- **影响**：用户想“看一眼哪些开着、哪些有问题”，需要翻 5 页、滚 20 屏。
- **根因**：浏览（展示美术）和管理（扫读状态）共用一种大卡片视图，没有高密度视图。

### P0-2 状态不可扫读，异常插件和正常插件看起来一样

- **位置**：`plugin-library.js:120-129`（`status()` 返回英文短语）、`:150`（状态只写在卡片下方标题行）；`plugin-library.css:63`（`.plugin-caption-line` 11px）。
- **实测**：mock 里的 `LLM`（failed）和 `Agent Loop`（running）在网格中只有 11px 小字不同（"Needs attention" 和 "Running"），卡面、边框、颜色完全一样。`attention` 筛选能找出 7 张，但页面上没有任何汇总提示它们存在。
- **显著性反了**：关闭的插件显示彩色插画，启用的插件显示纯色面，视觉上关闭的反而更抢眼。
- **影响**：故障插件被淹没，用户也无法一眼区分开、关、异常。

### P1-1 启停没有风险分级，Core 插件一键关闭

- **位置**：`plugin-library.js:226-227`（Core 只显示一段提示文字，按钮仍是主按钮样式）；`app.js:316-343`（`toggleBackendPlugin` 直接调用，没有确认步骤）。
- **实测**：在 mock 中点击 LLM（Core）详情里的 “Turn off · 关闭”，立即生效，toast 显示 “Applied.”；也没有撤销入口。
- **影响**：关闭运行核心插件可能中断 Agent（详情里自己也写了这句提示），但 UI 允许单击完成。`[INFERENCE]` 真实 DSH 中有一部分核心组件标记为 `management-required` 只读，不过前端对 Core 显示提示文字本身就说明存在可写的 Core 条目。

### P1-2 分组重叠：各分类计数之和大于总数，同一插件“换色”

- **位置**：`plugin-library.js:40-44`（Extension 由来源决定并覆盖显示色）、`:166`（`categoryMatch` 中 extension 按 `c.extra` 匹配）、`:171`（Extension 与职责分类并列成同级标签）。
- **实测**：All 72；Core 10 + System 30 + Feature 28 + Extension 13 + Unclassified 4 = 85。`Subprocess Local` 在 System 下计数，卡面却是紫色 Extension。
- **影响**：分组本来是为了帮助理解，现在反而需要读 README 才明白。“职责”和“来源”两个维度被塞进同一排标签。

### P1-3 搜索只在当前分类内生效，计数不跟随筛选

- **位置**：`plugin-library.js:167`（搜索和分类是 AND 关系）、`:177`（分类标签计数 `rows.filter(categoryMatch)` 忽略搜索和状态）；`app.js:189`（`localizedPluginText` 只取 `.en`）。
- **实测**：选中 Core 后搜 “tool”，只得到 1 条；标签仍显示 Core 10 / System 30 / Feature 28，没有“其他分类中还有 N 条”的提示。
- **其他**：搜索结果不高亮匹配；没有排序；描述只取英文，中文用户用中文关键词很难命中（分类名是中文，插件名和描述是英文）。

### P1-4 操作路径长：任何启停都要打开模态框

- **位置**：`plugin-library.js:150`（卡片整体是“打开详情”按钮）、`:226`（开关只在详情里）。
- **影响**：启停一个插件需要“点卡 → 等模态 → 点按钮 → 等刷新 → 关模态”5 步。模态遮住列表，连续处理多个插件时要反复开关。卡片上的 “点击详情 · 管理这张牌” 提示每张都重复一遍。

### P1-5 启停后键盘焦点丢失

- **位置**：`app.js:322`（请求期间 `button.disabled = true`）→ 焦点落到 `body`；`plugin-library.js:251`（`syncDetail` 读取 `document.activeElement` 已经是 `body`，无法恢复）。`pin()` 在 `plugin-library.js:243` 直接重建对话框，问题相同。
- **实测**：键盘启停后 `document.activeElement` 是 `<body>`；此时按 Esc 关闭对话框，焦点也回不到原卡片（未变更时 Esc 可以正常恢复）。
- **影响**：键盘和读屏用户在最核心的操作后失去位置。

### P2-1 详情为模态，关联导航没有历史

- **位置**：`plugin-library.js:231-238`（关联对话框直接替换详情内容）；`app.js:401`（`openDialog` 单实例）。
- **影响**：“A → 关联 B → 返回”只能靠按钮手动跳转；从 B 的详情再跳 C 后无法回到 A。模态也挡住了列表，无法边看列表边看详情。

### P2-2 牌盒与插件割裂

- **位置**：`plugin-library.js:145-149`（牌盒卡）、`:161-162`（Boxes 是独立标签）。
- **影响**：想知道“这个牌盒启用了哪些插件”，要进 Boxes → 打开模态 → 看成员 → 点成员再开一个模态。牌盒卡片启用和关闭用同一套绿色视觉（`plugin-library.css:71`），只有 “Open/Resting collection” 文字不同。
- 另外，Cards 页的搜索词切到 Boxes 后仍然保留，空状态提示却写着“试试其他分类、作用范围”，而 Boxes 页并没有这些控件（`plugin-library.js:176`）。

### P2-3 冗余文字与混排语言

- **位置**：`plugin-library.js:134`（卡面名称）与 `:150`（标题 `h2` 重复名称；分类名出现 3 次：丝带、标题行、颜色）；`:173`（每次都显示的说明段落）。
- **语言**：分类块和提示用中文；状态（Running/Off/Needs attention）、按钮（Refresh/Add bundle/Previous/Next）、toast（`app.js:329,336` 的 "Applied."、"Could not change plugin"）用英文。

### P2-4 对比度不足

用 `#f3ecdc` 近似纸面背景计算（WCAG AA 正文要求 4.5:1）：

| 元素 | 选择器 | 颜色 | 对比度 |
| --- | --- | --- | --- |
| 卡片提示 | `.plugin-card-hint`（css:70） | `#9d8b6b` | 2.81 |
| 本地说明 | `.plugin-detail-local-note`（css:118） | `#a18c6b` | 2.75 |
| 结果行 | `.plugin-results-line`（css:38） | `#948268` | 3.16 |
| 关闭状态 | `.dormant .plugin-live-status` | `#8e7b63` | 3.46 |
| 来源行 | `.plugin-card-caption p` | `#827660` | 3.79 |

### P2-5 失败没有原因（需后端）

- **位置**：`plugin-library.js:121`。只有当 `item.error` 存在时，才在只读原因里显示诊断。
- **影响**：`fiberPhase === 'failed'` 但没有 `error` 对象时，详情里只有 “Needs attention” 标签，没有原因，也没有可做的操作。

### P2-6 分类规则硬编码（需后端）

- **位置**：`plugin-library.js:11-25`，三个 Set 共约 70 个名称，再加正则。
- **影响**：DSH 新增或改名插件就会掉进 Unclassified，前端必须跟着发版维护。

### P3

- **整页重建**：每次按键、切换筛选、翻页都会通过 `innerHTML` 重建整页，包括页头、标签和工具栏（`plugin-library.js:177`，`app.js:470-476`）。16 张卡还没有性能问题，但会让焦点、选区和滚动恢复逻辑越来越复杂。
- **筛选状态不在 URL 中**：无法深链到某个插件或筛选结果（`app.js:39,483` 只识别页面名）。
- **死代码**：`backendPluginStatus`（`app.js:210`）没有被调用；`expandedBundles` 与 `[data-backend-bundle]`（`app.js:12,433`）没有产生方；`role="tab"` 键盘处理的 backend 分支（`app.js:497`）不可达，因为插件页标签是 `role="group"` 加 `aria-pressed`；`style.css` 中旧版清单的 `dsh-plugin-card/-control/-copy/-detail/-expand/-feedback/-list/-mark/-members/-more/-remove/-toolbar` 共 12 个类在 JS 中已经没有使用。
- **两套插件 UI 并存**：离线演示用的 `pluginLibrary` / `renderPlugins` / `openPlugin`（`app.js:19-31,344-354,442-444`）和 DSH 牌库是两套独立实现。

---

## 3. 前端主要流程：明显交互问题

| # | 级别 | 问题 | 位置 | 实测与影响 |
| --- | --- | --- | --- | --- |
| M1 | P1 | **离开首页会丢失输入草稿** | `app.js:41`（`main.innerHTML = homeMarkup`）、`app.js:42`（`initHome` 不恢复草稿） | 在输入框写入 “半句草稿 draft” → 去 Memories → 点邮票回来，输入框为空。附件变量保留，文本丢失 |
| M2 | P2 | **转场期间的点击被静默丢弃** | `app.js:39`（`transitioning` 在 960ms 内直接 `return`） | 点 Atelier 后 200ms 再点 Settings，最终停在 `#plugins`，第二次点击没有任何反馈 |
| M3 | P2 | 连接状态只在首页显示 | `app.js:96`（`renderBackendStatus` 在 `page !== 'home'` 时直接返回） | 在插件、设置、Memories 页断线时，只有插件页有警告条；其他页没有全局提示 |
| M4 | P2 | Toast 单槽位、礼貌播报、3.6s、没有动作 | `app.js:34`、`index.html:82`（`role="status"`） | 错误与成功样式相同；连续消息互相覆盖；DSH 长诊断被截断时间内读不完；无法“撤销”或“查看详情” |
| M5 | P2 | 每次启动开信约 3.1s，关信约 3.8s，不可跳过 | `macos/Web/postage.js:142`、`envelope.js:184,236` | 实测点击封蜡到 `postage-delivered` 约 3.2s。减弱动效已支持，但默认用户每次启动都要等，二次点击不能快进 |
| M6 | P2 | 右侧导航只有图标，悬停标签是隐喻词且会遮挡内容 | `index.html:79` | 4 颗几乎相同的星，悬停才出现 “The atelier / Your world”；Memories 页的悬停标签盖住了 “Archived” 按钮（截图可见） |
| M7 | P2 | 中英混排 | 全局 | 插件页以中文为主；首页、toast、对话框（Add bundle、Uninstall、Could not…）为英文 |
| M8 | P2 | 邮票素材疑似商标 | `macos/Web/envelope.js:40`（`paramont-logo-original.png`） | 图形与文字接近 Paramount 标识，发布前需确认授权 |
| M9 | P2 | 插件描述只取英文 | `app.js:189` | 中文界面下，DSH 如果提供了 `zh` 文本也不会用上 `[INFERENCE: 取决于 DSH meta 是否带 zh]` |
| M10 | P3 | 桌面版子页出现双层框 | `app.js:38`（`pageHeader` 含 “Back to your thoughts”） | 信纸里再嵌一张网页版米色面板；返回链接与邮票功能重复 |
| M11 | P3 | Memories 空状态文案错误 | `app.js:143` | 没有任何会话且未搜索时，仍显示 “No matching conversations.” |
| M12 | P3 | 加载会话没有进行中反馈 | `app.js:116`（`sessionLoading` 期间的点击被静默忽略） | 慢 Host 下重复点击没有响应，也没有 loading 提示 |

动效总体评价：时长和缓动集中定义，减弱动效覆盖完整（`prefers-reduced-motion` 与 `.reduce-motion` 在 8 个样式文件中都有处理），插件页没有常驻动画，这些都很好。问题集中在**长动画阻塞任务**（M2、M5），而不是动画本身的质量。

---

## 4. 问题与优化建议对照

| 问题 | 建议（详见 02） | 是否需后端 |
| --- | --- | --- |
| P0-1 密度 | 新增“清单视图”作为管理默认视图，卡牌视图保留用于浏览；分页改为按列数自适应；插件页压缩页头 | 否 |
| P0-2 状态 | 状态汇总条；卡面和行首加状态徽标；failed 用红色边角；关闭的插件去饱和 | 否 |
| P1-1 风险 | 按风险分级：Core、有存活关联的插件、牌盒弹出确认，并列出受影响的关联；成功 toast 带撤销 | 否（影响范围用已有 `relatedPlugins`） |
| P1-2 分组 | 左栏拆成“职责”和“来源”两个维度；Extension 改为来源筛选；计数改为分面计数 | 否 |
| P1-3 搜索 | 全局搜索，并提示其他分类中的命中；高亮匹配；排序；优先取 `zh` | 否；中文元数据需后端 |
| P1-4 路径 | 行内开关；详情改为右侧抽屉 | 否 |
| P1-5 焦点 | 请求期间不禁用聚焦中的按钮（改用 `aria-disabled`），完成后恢复焦点 | 否 |
| P2-1 关联 | 抽屉内导航加面包屑和返回栈 | 否 |
| P2-2 牌盒 | 牌盒并入左栏，选中即按成员过滤；牌盒操作放在结果区头部 | 否 |
| P2-5/2-6 | 失败诊断字段、分类元数据 | **是** |
| M1–M12 | 见 02 第 5 节 | 否（M8 需法务确认） |
