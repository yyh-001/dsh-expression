/**
 * 表情包存储与搜索(dsh-expression 插件)。
 *
 * MemesStore 移植自 selfloom src/memes.ts:索引为 SQLite(index.db),
 * Node 侧用内置 node:sqlite 只读打开,数据零迁移(直接读 selfloom 的库);
 * 搜索用 bigram Dice 相似度 + 口语同义词逐词兜底。
 * send_meme 工具:QQ 通道可用时两步式(action=search 翻候选 → action=send 投递);
 * 纯 Web 模式只保留 search——候选自带白名单真实 URL,模型挑一张直接
 * 用 markdown ![](url) 嵌进回复,不再有冗余的 send 动作。无命中不硬发,
 * 返回分类建议。
 *
 * 管理操作(上传/删除/改元数据)不移植——那是控制台/管理面板的事。
 */
import { DatabaseSync } from 'node:sqlite'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** 内置默认图库根：随插件分发的 memes/official-001（零迁移）。可用 memeRoot 覆盖。 */
export function defaultMemeRoot() {
  return fileURLToPath(new URL('./memes/official-001', import.meta.url))
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
  无聊: '无聊 没意思 发呆 摸鱼',
  尴尬: '尴尬 无语 捂脸',
}

/** 候选交错:每分类最多 2 张,避免同类扎堆(最多 MAX_CANDIDATES 张)。 */
function interleaveCandidates(hits, max) {
  const perTag = new Map()
  const out = []
  for (const m of hits) {
    if (out.length >= max) break
    const used = perTag.get(m.tag) || 0
    if (used < 2) {
      perTag.set(m.tag, used + 1)
      out.push(m)
    }
  }
  return out
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

  /** 列表情包:可过滤 tag,支持 caption/keywords 搜索(含同义词逐词兜底)。 */
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
      // 同义词逐词展开:原词零命中才尝试扩展词,避免静默回退全量。
      const base = String(query).trim().toLowerCase()
      const expansions = Object.entries(QUERY_SYNONYMS)
        .filter(([word]) => base.includes(word))
        .flatMap(([, words]) => words.split(/\s+/).filter(Boolean))
      const candidates = [base, ...expansions]
      const pool = memes
      for (const q of candidates) {
        const hits = searchMemeRows(pool, q)
        if (hits.length > 0) {
          memes = hits
          break
        }
      }
      if (memes === rows) {
        // 所有候选词都零命中:返回空,绝不回退全量第一张硬发。
        memes = []
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

/**
 * 注册 send_meme 工具。
 *
 * 两种模式:
 * - Web 模式(无 QQ 通道,有 urlPrefix):只保留 search——返回的都是白名单
 *   校验过的真实 URL,模型挑一张直接用 markdown ![](url) 嵌进回复即可,
 *   不需要冗余的 send 动作(历史形态:两步式里 send 在 Web 下只是重复校验);
 * - QQ 模式(companionQq 可用):两步式,action=send 才是真正的投递动作。
 *
 * @param {object} ctx 插件上下文
 * @param {MemesStore} memes 图库
 * @param {(path: string, caption?: string) => void | null} sendImage QQ 通道发送
 *   (dsh-companion 的 companionQq.sendImage);传 null 时走 web 模式。
 * @param {string | null} urlPrefix webServer 图片路由前缀(如 '/dsh-memes'),无则 null
 */
export function registerSendMemeTool(ctx, memes, sendImage, urlPrefix = null) {
  const MAX_CANDIDATES = 10
  const webMode = !sendImage && !!urlPrefix

  const parameters = {
    query: { type: 'string', description: '描述想要的表情(情绪/内容/配文),如「无语」「下班」' },
    tag: { type: 'string', description: '按分类筛选(angry/happy/sleep/…)' },
  }
  if (!webMode) {
    parameters.action = {
      type: 'string',
      enum: ['search', 'send'],
      description: 'search: 翻图库看候选(含描述); send: 发送 search 挑中的 path',
    }
    parameters.path = { type: 'string', description: 'send 时要发的图路径(来自 search 候选列表)' }
  }

  ctx.tools.register(defineTool({
    name: 'send_meme',
    description: 'Send an image meme (表情包) to the chat. ' +
      (webMode
        ? 'search 翻图库看候选(每张带描述 caption 和 url),挑最贴题的一张,把它的 url 用 markdown 图片语法 ![](url) 写进回复正文展示给用户。'
        : '两步式:先 action=search 翻图库看候选(每张带描述 caption),挑最贴题的一张用 action=send + path 发出;The image is delivered through the chat channel automatically.') +
      'query 传情绪/内容口语描述(如「无语」「下班」「生气」「摸鱼」),tag 传分类(angry/happy/sad/…)精确筛。' +
      '气氛对了就主动发,别硬凑;没命中就回文字、列分类建议让用户换词,绝不硬发;发完保持简短,让图自己说话。',
    parameters,
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    execute(args) {
      const action = webMode ? 'search' : (args.action === 'send' ? 'send' : 'search')
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      const tag = typeof args.tag === 'string' ? args.tag.trim().toLowerCase() : ''
      const path = typeof args.path === 'string' ? args.path.trim() : ''

      // send:精确发送 search 挑中的一张(仅 QQ 模式)
      if (action === 'send') {
        if (!path) {
          return { ok: false, message: 'send 需要 path——先 action=search 看候选,再挑一张发' }
        }
        let absolute
        try {
          absolute = memes.resolveStored(path)
        } catch (error) {
          return { ok: false, message: '未知路径: ' + path + ' —— 用 search 的候选 path' }
        }
        if (sendImage) {
          try {
            sendImage(absolute)
            return { ok: true, message: '已发送表情包', path }
          } catch (error) {
            return { ok: false, message: '发送失败: ' + (error instanceof Error ? error.message : String(error)) }
          }
        }
        return { ok: false, message: '没有可用发送通道: ' + absolute }
      }

      // search:列出候选,让模型自己挑(像翻收藏)
      const { memes: hits, tags } = memes.list(tag, query)
      if (hits.length === 0) {
        return {
          ok: false,
          message: '没找到匹配的表情包' + (query ? '（' + query + '）' : '') +
            '。图库分类: ' + tags.join('/') + ' —— 回文字,从这些分类里选一个贴切的词重试,别硬发',
        }
      }
      const candidates = interleaveCandidates(hits, MAX_CANDIDATES)
      const lines = candidates.map((m, i) => {
        const caption = (m.caption || m.file_name).slice(0, 100)
        return (i + 1) + '. path=' + m.path + ' | [' + m.tag + '] ' + caption +
          (urlPrefix ? ' | ' + urlPrefix + '/' + m.path : '')
      })
      return {
        ok: true,
        hits: candidates.map((m) => ({
          path: m.path,
          tag: m.tag,
          caption: m.caption,
          url: urlPrefix ? urlPrefix + '/' + m.path : null,
        })),
        tags,
        message: '候选 ' + candidates.length + ' 张(按分类错开,共命中 ' + hits.length + ' 张),' +
          (webMode
            ? '挑最贴题的一张,把它的 url 用 markdown 图片语法 ![](url) 写进回复正文展示,发完不啰嗦'
            : '挑最贴题的一张用 action=send + path 发出') + ':\n' + lines.join('\n'),
      }
    },
  }))
}
