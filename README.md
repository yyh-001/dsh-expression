# dsh-expression

selfloom 表情包层作为 DeepSeek Harness 插件：模型随时选一张表情包发出去，情绪到了就发，不用等要求。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 特性

- **数据零迁移**：直接读 selfloom 的表情包库（`~/.hermes/meme-packs/official-001/`，SQLite 索引 `index.db` + `memes/<tag>/` 图片文件）
- **语义搜索**：bigram Dice 相似度 + 口语同义词兜底（说「摸鱼」能搜到「下班/工作」分类的图）；无命中时返回图库分类清单引导重试
- **主动性设计**：工具描述鼓励"情绪到了直接发"，发完不啰嗦、不复述图
- **零第三方依赖**：只用 Node 内置 `node:sqlite` + DSH 的 `tools` 服务；发图走 `companionQq` 服务（由 `dsh-companion` 的 QQ 通道提供）

## 安装

```bash
# 在 DSH profile 目录
pnpm add file:/path/to/dsh-expression
# 或从 GitHub:
pnpm add github:yyh-001/dsh-expression
```

## 配置

agent preset 里加一行（需要 `dsh-companion` 先行并启用 `qq.enabled`，否则 `send_meme` 不注册）：

```yaml
- id: selfloom-expression
  name: dsh-expression
  config:
    memeRoot: /home/you/.hermes/meme-packs/official-001   # 可选,默认 ~/.hermes/meme-packs/official-001
```

## 工具

| 工具 | 说明 |
|---|---|
| `send_meme` | 按情绪/内容搜索图库（`query` 如「无语」「下班」，或 `tag` 分类），选最佳匹配经 QQ 通道发图；无命中列出分类让模型换词重试 |

## 工作原理

- 索引只读打开（`DatabaseSync` readOnly），搜索在内存做 Dice 相似度排序；
- 发送依赖 `companionQq` 服务的 `sendImage(path, caption?)`——`dsh-companion` 的 QQ 通道启用时自动提供，`dsh-expression` 监听 `companionQq/available` 事件注册工具；
- 路径安全：索引内相对路径解析时禁止逃出图库根。

## 已知限制

- 管理操作（上传/删除/改元数据）未移植——图库维护仍走原 selfloom 控制台或直接操作目录；
- 发送目标是 QQ 通道的"最近聊天"（与 `dsh-companion` 的单目标 MVP 一致）。

## License

[MIT](LICENSE)
