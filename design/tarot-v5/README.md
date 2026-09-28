# Aster 分类塔罗牌背 v5

这版只放大底部金色绶带与花体英文分类名，保持 I–VIII、四色分类、八个主图及边框构图。

## 交付内容

| 序号 | 分类 | 底色 | 图案 | 完整原图 |
| --- | --- | --- | --- | --- |
| I | Core | wine red | 日轮 | [01-core-sun.png](01-core-sun.png) |
| II | Core | wine red | 火种 | [02-core-spark.png](02-core-spark.png) |
| III | System | indigo | 月衡 | [03-system-moon.png](03-system-moon.png) |
| IV | System | indigo | 秘典 | [04-system-grimoire.png](04-system-grimoire.png) |
| V | Feature | emerald | 罗盘 | [05-function-compass.png](05-function-compass.png) |
| VI | Feature | emerald | 羽笔 | [06-function-quill.png](06-function-quill.png) |
| VII | Extension | purple | 星门 | [07-extension-gate.png](07-extension-gate.png) |
| VIII | Extension | purple | 信使 | [08-extension-messenger.png](08-extension-messenger.png) |

## 图片与运行资源

- 原图通过内置 `image_gen` 编辑，完整输出保存在本目录。原图为 RGB，948 × 1659/1660。
- Aster 运行用 WebP 位于 `../../dist/assets/tarot/`，同名 `.webp`。运行派生仅等比例缩小及 WebP 编码；没有通过代码更改图案、文字、颜色或抠图。
- 运行图片宽 560 px、高 980/981 px，WebP quality 88、method 6；适配约 220 px 宽卡片的 2x 显示。
- 八张运行图片总计 **434,940 字节（约 425 KiB）**；全部解码为 RGBA 约 **16.75 MiB**，具体由浏览器加载与缓存控制。无需新增常驻依赖、运行时 canvas 或图像处理进程。
- 原图自带不透明白色外缘；未做代码抠图。卡框大致占 x=4.7%–95.3%、y=3.1%–97.0%。界面可通过容器裁切外缘，避免白底矩形干扰。

## 视觉检查

逐张确认：顶部罗马数字正确；Core / System / Feature / Extension 拼写正确；主图与对应四色保持；绶带在卡框内且没有盖住主体；花体字位于绶带中段，没有挤进卷边。另检查了压缩后的 Extension 长词可读性。

## 追溯

- `prompts.md`：逐张完整提示词及输入角色。
- `generation.json`：每次生成的默认输出路径、编辑目标、参考图与原始提示词。
- `manifest.json`：分类、序号、尺寸、字节数和运行文件 SHA-256。

本版本由 Aster 插件管理界面采用；运行时只需要 WebP 文件，不需要将原始 PNG 一并打包。

`archive:tarot-v4/` and `imagegen-output:` in the generation records identify earlier local references and generation runs. Historical draft images are not bundled in this snapshot; all eight final PNGs and runtime WebP files are included.
