/**
 * 表情包存储与搜索(dsh-expression 插件)。
 *
 * MemesStore 移植自 selfloom src/memes.ts:索引为 SQLite(index.db),
 * Node 侧用内置 node:sqlite 只读打开,数据零迁移(直接读 selfloom 的库);
 * 搜索用 bigram Dice 相似度 + 口语同义词兜底(「摸鱼」→「下班 工作」)。
 * send_meme 工具:搜索图库 → 经 QQ 通道发图(消费 dsh-companion 的 companionQq 服务)。
 *
 * 管理操作(上传/删除/改元数据)不移植——那是控制台的事,模型只需"选图发送"。
 */
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { existsSync } from 'node:fs'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** 默认图库根(~/.hermes/meme-packs/official-001,与 selfloom 一致)。 */
export function defaultMemeRoot() {
  return join(homedir(), '.hermes', 'meme-packs', 'official-001')
}

/** 字符 bigram 集合(Dice 相似度搜索,与 selfloom 同款)。 */
function bigramSet(text) {
  const t = [...String(text).toLowerCase()].filter((c) => /[a-z0-9]|\u4e00-\u9fff/.test(c))
  const set = new Set()
  for (let i = 0; i < t.length - 1; i++) set.add(t[i] + t[i + 1])
  return set
}

function diceSimilarity(a, b) {
  let inter = 0
  for (const item of a) if (b.has(item)) inter += 1
  return inter === 0 ? 0 : (2 * inter) / (a.size + b.size)
}

function searchMemeRows(rows, q) {
  const qSet = bigramSet(q)
  if (qSet.size < 2) {
    return rows.filter((m) => String(m.caption ?? '').toLowerCase().includes(q) || String(m.keywords ?? '').toLowerCase().includes(q))
  }
  return rows
    .map((m) => {
      const score = Math.max(
        diceSimilarity(qSet, bigramSet(m.caption ?? '')),
        diceSimilarity(qSet, bigramSet(m.keywords ?? '')),
      )
      return { m, score }
    })
    .filter((x) => x.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m)
}

/** 口语词 → 图库关键词扩展(搜索兜底,移植自 memes.ts)。 */
const QUERY_SYNONYMS = {
  摸鱼: '摸鱼 上班 工作 下班 偷懒 躺',
  上班: '上班 工作',
  工作: '工作 上班 加班',
  下班: '下班 工作 摸鱼',
  困: '困 睡觉 熬夜 犯困',
  睡觉: '睡觉 困 熬夜',
  熬夜: '熬夜 困 睡觉',
  生气: '生气 愤怒 暴躁 无语',
  无语: '无语 叹气 翻白眼',
  开心: '开心 高兴 兴奋',
  害怕: '害怕 惊恐 慌张',
  尴尬: '尴尬 无语 捂脸',
}

export class MemesStore {
  constructor(root = defaultMemeRoot()) {
    this.root = resolve(root)
    const indexPath = join(this.root, 'index.db')
    if (!existsSync(indexPath)) {
      throw new Error('缺少表情包索引: ' + indexPath)
    }
    this.db = new DatabaseSync(indexPath, { readOnly: true })
  }

  /** 列表情包:可过滤 tag,支持 caption/keywords 搜索(含同义词兜底)。 */
  list(tag, query) {
    const rows = this.db
      .prepare('SELECT path, tag, file_name, caption, COALESCE(keywords, \'\') AS keywords FROM memes')
      .all()
    const tags = [...new Set(rows.map((r) => r.tag))].sort()
    let memes = rows
    if (tag) {
      memes = memes.filter((m) => m.tag === String(tag).toLowerCase())
    }
    if (query && String(query).trim()) {
      const base = String(query).trim().toLowerCase()
      const expanded = Object.entries(QUERY_SYNONYMS)
        .filter(([word]) => base.includes(word))
        .map(([, words]) => words)
        .join(' ')
      const candidates = expanded && expanded !== base ? [base, expanded] : [base]
      const pool = memes
      for (const q of candidates) {
        const hits = searchMemeRows(pool, q)
        if (hits.length > 0) {
          memes = hits
          break
        }
      }
    }
    return { memes, tags }
  }

  /** 把索引内相对路径解析为绝对路径(不允许逃出图库根)。 */
  resolveStored(stored) {
    const target = resolve(this.root, stored)
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new Error('路径超出表情包目录')
    }
    if (!existsSync(target)) {
      throw new Error('文件不存在: ' + stored)
    }
    return target
  }
}

/** 注册 send_meme 工具:搜索图库 → sendImage 发送。 */
export function registerSendMemeTool(ctx, memes, sendImage) {
  ctx.tools.register(defineTool({
    name: 'send_meme',
    description: 'Send an image meme (表情包) to the chat. When the vibe hits, just send one — ' +
      'spontaneous memes are welcome, no need to wait for a request. Pass `query` for ' +
      'the emotion/content (e.g. 无语/下班/生气) or `tag` for a category. ' +
      'If nothing matches, the error lists the categories — try another word. ' +
      'After sending, keep it brief and let the image speak (don\'t describe it back).',
    parameters: {
      query: { type: 'string', description: '描述想要的表情(情绪/内容/配文),如「无语」「下班」' },
      tag: { type: 'string', description: '按分类筛选(angry/happy/sleep/…)' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    execute(args) {
      const { memes: hits, tags } = memes.list(args.tag, args.query)
      if (hits.length === 0) {
        return {
          ok: false,
          message: '没找到匹配的表情包' + (args.query ? '（' + args.query + '）' : '') +
            '。图库分类: ' + tags.join('/') + ' —— 从这些分类里选一个贴切的词重试',
        }
      }
      const pick = hits[0]
      try {
        sendImage(memes.resolveStored(pick.path))
        return { ok: true, message: '已发送表情包', path: pick.path }
      } catch (error) {
        return { ok: false, message: '发送失败: ' + (error instanceof Error ? error.message : String(error)) }
      }
    },
  }))
}
