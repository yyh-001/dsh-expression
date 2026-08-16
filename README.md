<p align="center">
  <img src="https://raw.githubusercontent.com/yyh-001/dsh-expression/main/docs/hero.jpg" alt="dsh-expression — 找得到、发得出" width="100%" />
</p>

<p align="center">
  <strong>表情包插件 dsh-expression</strong> — 找得到、发得出、学得会
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT" /></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-amber?style=flat-square" alt="dsh-plugin" /></a>
  <img src="https://img.shields.io/badge/Host-DeepSeek%20Harness-informational?style=flat-square" alt="DeepSeek Harness" />
  <img src="https://img.shields.io/badge/Deps-node%3Asqlite%20only-blue?style=flat-square" alt="zero third-party deps" />
  <a href="https://awesome-dsh-plugin.com"><img src="https://awesome-dsh-plugin.com/badge.svg" alt="awesome · DSH plugin" /></a>
</p>

---

**dsh-expression** 是 DeepSeek Harness 的表情包插件——找得到、发得出、学得会：

- **纯文本模型也能斗图**：界面显示表情图片，模型收到的是描述文字，无需图片输入能力
- **AI 自动学图**：对话里收到表情，`learn_meme` 自动识别内容（分类/描述/关键词）并入库，越聊越有货
- **情绪主动发图**：模型根据对话情绪主动甩一张贴题的表情包，陪伴式斗图
- **像 QQ/微信 一样发图**：输入框 😊 悬浮面板点选表情直接发出，体验和聊天软件一致
- **语义搜图**：口语 query → bigram Dice 相似度排序，搜不到绝不硬发
- **零第三方依赖**：仅 node:sqlite，装完即用

交流 / 反馈：**QQ 群 [993579665](https://qm.qq.com/q/7AD2g70HqS)**（[点击加入](https://qm.qq.com/q/7AD2g70HqS)）

---

## 安装

已发布到 **npm**（`dsh-expression@0.1.12`），一行装进任意 DSH profile（如 `~/.dsh/profiles/web/`）：

```bash
dsh plugin --profile web add dsh-expression
# 等价于:
pnpm add dsh-expression
```

或从 GitHub / 本地直接装：

```bash
pnpm add github:yyh-001/dsh-expression   # 或
pnpm add file:/path/to/dsh-expression
```

> 注意：pnpm 有「新包安全期」（默认 24h），刚发布的版本会被静默回落到旧版；急用可在 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 里加上版本号。

## 配置

默认内置图库（`memes/official-001`），开箱即用，**无需任何配置**。

图库目录在**设置页「图库目录」**里随时切换（浏览选择或输入路径，保存即生效，无需重启）——选择空目录会自动初始化成新图库，选择目录不存在时自动创建。设置存在 `~/.dsh/dsh-expression.json`，升级插件不丢。

## 装完即用

```text
用户: 发个无语的表情包
模型: 调 send_meme query=「无语」→ 拿到真实文件 → 发图并简短接话
```

输入框左侧点 **😊**（微信同款笑脸）直接选图一键发出，无需让模型代劳。

<p align="center">
  <img src="https://raw.githubusercontent.com/yyh-001/dsh-expression/main/docs/chat-example.png" alt="模型根据情绪主动发表情包" width="80%" />
</p>

## 工具

| 工具 | 作用 |
|------|------|
| `send_meme` | 语义搜图 / 发图（Web 模式返回可展示 URL） |
| `learn_meme` | **自动学图**：传对话附件 `attachmentId` 或图片 `imageUrl`，自动识别内容（分类/描述/关键词）后收录进图库，之后 `send_meme` 就能搜到 |

## 纯文本模式（默认）

**界面显示表情图片，模型实际收到的是描述文字**——兼容不支持图片的纯文本模型：

- 悬浮窗发表情 = 发送纯文本 `[表情: 描述](图片URL)`：模型读到文字，不触发 dsh 的图片准入检查（选纯文本模型也能用）
- 前端把这段文本实时渲染成表情图片（对话里看起来就是表情）
- 直接上传的图片不受影响（原样给模型）

## 界面

设置页「表情包」面板（已美化）：

- **图库目录**：浏览选择/输入路径，保存即生效（空目录自动初始化）
- **导出/导入图库**：打包成 ZIP 分享给别人，导入别人的包一键切换
- **上传弹窗**：选图预览 + 分类下拉（选择/新建/删除分类）+ 描述 + 关键词
- **编辑弹窗**：同款分类下拉，改分类/描述/关键词
- **分类中文显示**：下拉与卡片显示「生气 (angry)」式中文
- 分类筛选即时生效

<p align="center">
  <img src="https://raw.githubusercontent.com/yyh-001/dsh-expression/main/docs/settings-panel.png" alt="设置页表情包管理面板" width="80%" />
</p>

输入框 😊 一键发表情包：点开面板 → 搜索 / 浏览缩略图 → 点一张直接发出。

<p align="center">
  <img src="https://raw.githubusercontent.com/yyh-001/dsh-expression/main/docs/quick-picker.png" alt="输入框一键发表情包" width="80%" />
</p>

## 它做什么

| 能力 | 说明 |
|------|------|
| **语义搜图** | 口语 query → bigram Dice 相似度排序；口语词同义词兜底（「摸鱼」→ 下班/工作分类） |
| **自动学图** | `learn_meme` 收录对话附件/URL 图片，自动识别分类描述（当前默认模型需支持图片输入） |
| **纯文本模式** | 界面显示图片、模型收描述文字，兼容纯文本模型 |
| **输入框一键发图** | 会话输入框左侧 😊 按钮 → 悬浮面板选图 → 一点即发 |
| **情绪主动发图** | 工具描述鼓励"情绪到了直接发"；发完不啰嗦、不复述图 |
| **管理 API** | 上传 / 编辑 / 删除 / 删除分类，全部在设置页完成，数据持久 |
| **图库目录切换** | 设置页浏览选择图库目录，保存即时生效，空目录自动初始化 |
| **导出 / 导入** | 图库一键打包 ZIP 分享，导入别人的包自动切换（零依赖实现） |

## 日常命令（模型视角）

```text
send_meme query=「想下班」          # 语义检索 + 发送
send_meme tag=shy                  # 按分类发一张
learn_meme attachmentId="sha256:…" # 收录对话里上传的表情(自动识别)
learn_meme imageUrl="…"            # 收录任意图片 URL
```

## 给模型的三条铁律

完整约定见 `send_meme` 工具描述。

1. 只用 `MemesStore` 返回的真实路径，不手写路径、不自己 `ls` 挑图  
2. 搜失败就回文字、列分类让用户换词，别硬发  
3. 发完保持简短，让图自己说话——不复述、不描述图的内容

## 图库来源

内置默认图库（`id: official-001`，名「官方表情包1号」）来自 **Astrbot mememanager 官方初始表情包**：

- 上游仓库：[anka-afk/astrbot-meme-pack-official-01](https://github.com/anka-afk/astrbot-meme-pack-official-01)（`main` 分支），维护者 **anka-afk**
- 构成：`index.db`（SQLite 索引，含每张 caption/关键词，供语义检索）+ `manifest.json`（分类说明 + 来源标注）+ `memes/<tag>/` 图片 + `previews/`
- ⚠️ 上游**未提供 LICENSE**：这套图缺乏显式的再分发许可。随插件打包作为个人默认库使用没问题；如需公开对外分发，请保留 manifest.json 中的上游来源标注。

## 接到你的 Agent

| 组件 | 说明 |
|------|------|
| **dsh-expression** | 本插件：`MemesStore`（检索）+ `send_meme`（发送）+ `learn_meme`（学图）+ 管理 API |
| **[dsh-companion](https://github.com/yyh-001/dsh-companion)** | 人设 + Hermes 记忆 + 消息通道；提供发图服务 |
| **图库** | 内置默认图库 `memes/official-001/`（设置页可切换目录/导入分享包），源自 [astrbot-meme-pack-official-01](https://github.com/anka-afk/astrbot-meme-pack-official-01) |

```text
dsh-expression/
  index.js          插件入口：memeRoot 配置 + 管理 API + learn_meme/识图
  memes.js          MemesStore：SQLite 索引 + bigram Dice 检索 + 路径安全
  client.js         前端：设置页面板(上传/编辑/删除) + 😊 悬浮窗 + 表情文本渲染
  cordis.patch.yml  bundle patch(纯 insert,热挂载免重启)
  memes/
    official-001/   内置默认图库（index.db + manifest.json + memes/<tag>/）
  package.json      name / inject / peer deps
  README.md
  LICENSE
```

## 已知限制

- 图片/媒体入站未实现（`send_image` 未移植）；
- `learn_meme` 自动识图依赖当前默认模型支持图片输入（不支持时会提示）；
- 检索算法与 selfloom 原版一致（bigram Dice），部分口语词的匹配质量取决于图库 caption。

## License

[MIT](./LICENSE)
