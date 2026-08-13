/**
 * dsh-expression — selfloom 表情包层作为 DeepSeek Harness 的插件。
 *
 * 图库:直接读 selfloom 的表情包库(~/.hermes/meme-packs/official-001/index.db,
 * SQLite 索引 + memes/<tag>/ 图片文件),数据零迁移;搜索用 bigram Dice 相似度
 * + 口语同义词兜底(「摸鱼」→「下班 工作」)。
 *
 * 发送:消费 dsh-companion 提供的 `companionQq` 服务(sendImage/isOnline);
 * 没有 QQ 通道时不注册 send_meme,避免挂空工具。
 *
 * 管理操作(上传/删除/改元数据)不移植——那是控制台的活,模型只需"选图发送"。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { MemesStore, defaultMemeRoot, registerSendMemeTool } from './memes.js'

export const name = 'dsh-expression'
export const inject = ['tools']

export function apply(ctx, config) {
  let memes = null
  try {
    memes = new MemesStore(config?.memeRoot || defaultMemeRoot())
  } catch (error) {
    console.error('[dsh-expression] meme store unavailable:', error && error.message)
    return
  }

  // 消费 companionQq 服务(由 dsh-companion 的 QQ 通道提供)。
  const register = () => {
    const qq = ctx.get('companionQq')
    if (qq !== undefined && typeof qq.sendImage === 'function') {
      registerSendMemeTool(ctx, memes, (path, caption) => qq.sendImage(path, caption))
    } else {
      console.log('[dsh-expression] companionQq 服务不可用,未注册 send_meme(需要 dsh-companion 启用 qq.enabled)')
    }
  }
  register()
  ctx.on('companionQq/available', register)
}
