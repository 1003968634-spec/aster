# Aster · macOS 信封原型

一个透明原生窗口中的剪纸工作区。启动时是一封信，点击封蜡后，四芒星先揭起邮票，上盖再展开、信纸升起。邮票落在信纸右上角，点击可从其他页面回到主对话。收信时四芒星将邮票送回，信纸收起，上盖连续合拢；展开的信封平放，不使用透视。主对话、明信片历史、塔罗插件、定时任务和设置沿用现有 Aster 界面。

## 打开

双击 `macos/dist/Aster.app`。不需要启动网页服务，也不需要联网下载字体或图片。

- 点击封蜡：拆信，进入工作区。
- 点击信纸右上角邮票：返回主对话；点击左侧 `Hello, Sandman.`：管理个人资料。
- 问候语下方的三张纵向便签：新建对话、工作空间、访问模式。
- 工作空间支持 macOS 文件夹多选；点击叠放便签可展开全部目录、置顶某个目录或撕走对应便签。移除只取消选择，不会删除目录或文件。
- 访问模式在展开后选择，选中项显示在最上层。工作空间和模式保存在本机，重启后恢复。当前模式只是原型偏好，还未接入 Agent 的权限执行逻辑。
- 点击 `Fold letter`：收起工作区，保留当前页面和未发送文字。
- 左上角纸签：关闭窗口、最小化到 Dock、缩放窗口。
- 拖动信封空白或上方纸签：移动窗口。
- `⌘M` 最小化，`⌘W` 关闭窗口，`⌘Q` 退出，`⇧⌘L` 收信。
- 关闭窗口后，点击 Dock 的 Aster 图标重新显示。标准复制、粘贴、撤销快捷键可用。

这仍是交互原型：AI 回复、连接器和任务调度是本地演示。历史、设置等使用本机 WebKit 存储；网页版本的数据不会自动迁入。收信不会退出应用。

## 重新构建

在项目根目录执行：

```sh
./script/build_and_run.sh
```

需要 Xcode 或 Command Line Tools、Swift 5.9 及以上和 Python 3。脚本编译 SwiftPM 目标、生成 `.app`、打包离线资源、进行本地临时签名并启动。Codex 的 Run 按钮调用同一个脚本。

可选参数：`--verify` 检查启动进程，`--logs` 查看应用日志，`--telemetry` 查看窗口日志，`--debug` 启动后附加 LLDB。

当前包为本机 Apple Silicon 架构，最低部署目标 macOS 14；它是本地预览包，尚未做商店发布或公证。可以直接将 `.app` 拖到 Applications 文件夹。

## 文件

- `Sources/Aster/Aster.swift`：原生透明窗口、WebKit 容器、菜单、拖动和窗口按钮桥接。
- `Web/envelope.css`、`Web/envelope.js`：信封层、拆信动画和桌面工作区适配。
- `Web/postage.css`、`Web/postage.js`：四芒星运送邮票、邮票返回对话，以及随窗口尺寸调整的信封边界。
- `Web/envelope-materials.css`、`Web/letterpress.css`、`Web/letterpress.js`：信封与信纸材质、字体剪纸和纸上日期。
- `Web/context-notes.css`、`Web/context-notes.js`：纵向便签、工作空间与访问模式的扇形展开和撕除动画。
- `Web/fonts/`：附带许可的离线字体。
- `Tools/make_icon.swift`：应用图标的可复现绘制源码。
- `../script/prepare_web.py`：复制原网页资源并改写为本地相对路径，不修改 `dist/` 网站。

原生层只接受本地页面发送的固定窗口和文件夹选择指令；不执行任意脚本命令或访问远程代理服务。整个界面位于一个窗口中，纸片和信封由前端分层绘制。

当前 macOS WebKit 的透明页面仍需 `drawsBackground` 兼容开关，正式上架前需要复核此实现。构建时设置 `ASTER_SMOKE_REPORT=/tmp/aster-smoke.json` 可导出原生页面截图与透明度、离线资源、存储检查结果。

## Git 历史与回滚

完整源码及已有提交历史保存在 [GitHub](https://github.com/1003968634-spec/aster)。本次便签调整前的版本为 `macos-v0.3.0`（`c7c95f2`）；便签版本为 `macos-v0.4.0`。邮票导航调整前的版本已独立提交，并保留标签 `macos-before-stamp-navigation`（`949e8ea`）。

可以在独立目录打开旧版本，不改动当前工作目录：

```sh
git worktree add ../aster-before-stamp macos-before-stamp-navigation
cd ../aster-before-stamp
./script/build_and_run.sh
```
