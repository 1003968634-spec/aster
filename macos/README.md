# Aster · macOS 桌面界面

一个透明原生窗口中的剪纸工作区。启动时是一封信，点击封蜡后，四芒星先揭起邮票，上盖再展开、信纸升起。邮票落在信纸右上角，点击可从其他页面回到主对话。收信时四芒星将邮票送回，信纸收起，上盖连续合拢；展开的信封平放，不使用透视。主对话、明信片历史、塔罗插件、定时任务和设置沿用现有 Aster 界面。

## 打开

首次请从项目根目录运行 `./script/build_and_run.sh`。脚本将 `~/Desktop/dsh` 作为用户选择的目录交给 Aster，使 macOS 允许应用及其 DSH 子进程读取这个项目。之后可双击 `macos/dist/Aster.app` 打开。Aster 借助回环地址加载同一套信纸界面；没有 DSH 或 Host 启动失败时仍可打开打包的离线演示。字体与图片始终从应用包加载，不依赖公网资源。

- 点击封蜡：拆信，进入工作区。
- 点击信纸右上角邮票：返回主对话；点击左侧 `Hello, Sandman.`：管理个人资料。
- 送达邮票的四芒星停留在邮票左上侧，动画终点与按钮位置连续衔接；点击新建对话。
- 附件图标右侧横排两张小型手写便签：`Workspaces` 和 `Access mode`，与附件图标等高。
- 对话内容直接呈现在信纸上，输入区以带纸面颗粒的铅笔线分隔。右侧四芒星导航不带竖线及尾部装饰星星。
- 首页左上方的 Rituals 是胶带便签：显示当前会话的定时任务，点击便签或加号可在居中编辑框修改或创建任务。DSH 模式保存到会话日志，支持指定时间、延迟和至少五分钟的重复间隔；删除也由 DSH 确认。当前 DSH 没有持久暂停接口，因此不显示暂停开关。离线演示的便签仍只保存在本机，不执行任务。
- 原定时任务导航改为 Dashboard，展示会话数、模型数及当前会话的提醒数，为后续数据看板留出区域。旧 `#schedule` 链接会进入 Dashboard。
- Memories 页只保留一叠明信片，移除顶部说明、返回和新建按钮。堆叠间距随窗口高度与记录数量自动收紧，全部卡片留在同一窗口内，不需要下拉；悬停或键盘聚焦可将卡片抽到顶层。方向键及 Home / End 可逐张浏览，点击查看完整记录或继续对话。
- 点击工作空间便签，等宽的目录和添加便签从主标签下方原位向上扇形展开；主标签始终处于最上层。支持 macOS 文件夹多选、置顶和从右向左撕除。移除只取消选择，不会删除目录或文件。
- 访问模式同样在便签原位展开，选中项排在最上层；收起时只显示 `Access mode`。连接 DSH 时，工作空间与模式从 Host 读取并应用到真实会话；离线演示才使用本机偏好。
- 点击左上角关闭按钮：先将信纸收入信封，邮票回到信封，四芒星返回封蜡，然后关闭窗口。
- 左上角纸签：关闭窗口、最小化到 Dock、缩放窗口。
- 拖动信封空白或上方纸签：移动窗口。
- `⌘M` 最小化，`⌘W` 关闭窗口，`⌘Q` 退出。
- 关闭窗口后应用和 DSH Host 一同退出；再次点击 Dock 的 Aster 图标可重新启动。标准复制、粘贴、撤销快捷键可用。

DSH 连接可用时，真实会话、历史和权限状态由 DSH Host 保存；离线模式才使用本机演示数据。收信（`⌘W`）会播放关信动画并退出应用；`⌘Q` 直接退出。退出时会有界地停止 Host，避免窗口消失后继续占用资源。

定时任务沿用 DSH 的会话内执行语义，需要 Host 与所属会话运行；应用关闭后不会继续计时或唤醒冷会话。Aster 通过自己的临时配置启用 DSH Schedule 插件，不修改用户的基础配置。编辑会先确认新记录持久化，再移除旧记录；若持久化结果不确定，编辑框保留输入并提示核对刷新后的便签，阻止重复提交。首页仅在进入、会话切换和变更事件后读取，不新增定时轮询。

## 重新构建

在项目根目录执行：

```sh
./script/build_and_run.sh
```

需要 Xcode 或 Command Line Tools、Swift 5.9 及以上和 Python 3。脚本编译 SwiftPM 目标、生成 `.app`、打包离线资源，并优先使用本机 Apple Development 身份签名，以便 macOS 保留所选 DSH 目录的访问授权；没有此身份时使用临时签名。可用 `ASTER_CODESIGN_IDENTITY` 指定签名身份。Codex 的 Run 按钮调用同一个脚本。

可选参数：`--verify` 检查启动进程，`--logs` 查看应用日志，`--telemetry` 查看窗口日志，`--debug` 启动后附加 LLDB，`--offline` 强制使用离线演示。开发时可指定 `ASTER_DSH_REPO=/path/to/dsh`、`ASTER_DSH_NODE=/path/to/node`；`ASTER_DSH_SOURCE=1` 使用 DSH 的 TypeScript 源码入口。直接启动应用二进制时对应参数为 `--dsh-repo`、`--dsh-node`、`--dsh-source`、`--offline`。

DSH 需要 Node.js 22.19+ 或 24+，以及已经安装并构建的工作区依赖。Swift 壳只启动一个 Node Host 和一个 WKWebView，不启动 Electron。Host 启动期间窗口保持隐藏；连接成功后 WebKit 直接加载 Host 页面，等真实信封图片、字体与样式就绪再显示窗口，避免简笔占位闪现及先加载 `file://` 再切换所产生的额外网页进程。Host 使用操作系统分配的回环端口；Aster 将应用包内 `Resources/Web/index.html` 作为 DSH 静态入口，使界面和 `/api` 保持同源。启动 URL 的一次性令牌由 Swift URLSession 换成 HttpOnly Cookie，再将 Cookie 交给 WebKit；WebKit 只加载无令牌 URL。原生桥只接受当前回环 Host 或离线包内页面的消息。Host 意外退出后，壳会回到离线页面并有限重试。

当前包为本机 Apple Silicon 架构，最低部署目标 macOS 14；它是本地预览包，尚未做商店发布或公证。可以直接将 `.app` 拖到 Applications 文件夹。

## 文件

- `Sources/Aster/Aster.swift`：原生透明窗口、WebKit 容器、菜单、拖动和窗口按钮桥接。
- `Sources/Aster/DSHHost.swift`：DSH Node Host 启动、同源静态入口、一次性 URL 校验和进程生命周期。
- `Web/envelope.css`、`Web/envelope.js`：信封层、拆信动画和桌面工作区适配。
- `Web/postage.css`、`Web/postage.js`：四芒星运送邮票、邮票返回对话，以及随窗口尺寸调整的信封边界。
- `Web/envelope-materials.css`、`Web/letterpress.css`、`Web/letterpress.js`：信封与信纸材质、字体剪纸和纸上日期。
- `Web/context-notes.css`、`Web/context-notes.js`：输入区手写便签、工作空间与访问模式的原位扇形展开和撕除动画。
- `Web/stationery.css`、`Web/stationery.js`：信纸上的无框对话和右侧统一对齐的导航。
- `Web/memories.css`、`Web/memories.js`：自然错层的明信片堆叠、悬停抽出与聚焦预览。
- `../dist/ritual-board.css`、`../dist/ritual-board.js`：首页定时便签、居中编辑与 Dashboard；使用 `aster-backend.js` 的会话定时任务接口。
- `Web/fonts/`：附带许可的离线字体。
- `Tools/make_icon.swift`：应用图标的可复现绘制源码。
- `../script/prepare_web.py`：复制原网页资源并改写为本地相对路径，不修改 `dist/` 网站。

原生层只接受当前打包页面或本机回环 Host 同源页面发送的固定窗口和文件夹选择指令；不执行任意前端脚本命令。整个界面位于一个窗口中，纸片和信封由前端分层绘制。

当前 macOS WebKit 的透明页面仍需 `drawsBackground` 兼容开关，正式上架前需要复核此实现。构建时设置 `ASTER_SMOKE_REPORT=/tmp/aster-smoke.json` 可导出原生页面截图与透明度、离线资源、存储检查结果。
设置 `ASTER_HOST_SMOKE_REPORT=/tmp/aster-host-smoke.json` 则等待 DSH 同源页面加载后再导出相同检查。

## Git 历史与回滚

完整源码及已有提交历史保存在 [GitHub](https://github.com/1003968634-spec/aster)。当前便签层叠与铅笔线版本为 `macos-v0.8.0`；单窗口明信片堆叠版本为 `macos-v0.7.0`（`90c8d42`）；紧凑手写便签与常驻邮递星版本为 `macos-v0.6.0`（`6b148a3`）；信纸与明信片版本为 `macos-v0.5.0`（`4b5e7be`）。纵向便签与开合动画版本为 `macos-v0.4.0`（`688e8e2`）。便签调整前为 `macos-v0.3.0`（`c7c95f2`）。邮票导航调整前保留标签 `macos-before-stamp-navigation`（`949e8ea`）。

可以在独立目录打开旧版本，不改动当前工作目录：

```sh
git worktree add ../aster-before-stamp macos-before-stamp-navigation
cd ../aster-before-stamp
./script/build_and_run.sh
```
