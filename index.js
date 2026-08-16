/**
 * dsh-expression — selfloom 表情包层作为 DeepSeek Harness 的插件。
 *
 * 图库:直接读随插件分发内置的默认图库(memes/official-001/index.db,
 * SQLite 索引 + memes/<tag>/ 图片文件),数据零迁移;搜索用 bigram Dice 相似度
 * + 口语同义词兜底(「摸鱼」→「下班 工作」)。
 *
 * 发送(双通道):
 *   1. QQ 通道:消费 dsh-companion 提供的 `companionQq` 服务(sendImage/isOnline);
 *   2. Web 通道:注册 webServer 前缀路由 `/dsh-memes`,以 HTTP 提供图库图片,
 *      send_meme 返回相对 URL,模型在回复里用 markdown ![](url) 展示。
 * 两者皆无时不注册 send_meme,避免挂空工具。
 *
 * 管理操作(上传/删除/改元数据)不移植——那是控制台的活,模型只需"选图发送"。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { MemesStore, defaultMemeRoot, registerSendMemeTool } from './memes.js'

// ---- 极简 ZIP(store 无压缩)读写:零依赖导出/导入图库包 ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/** 打包文件列表为 ZIP(store 无压缩):[{name, data}] → Buffer */
function zipStore(files) {
  const parts = []
  const central = []
  let offset = 0
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8')
    const crc = crc32(f.data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0x0800, 6)          // UTF-8 文件名
    lh.writeUInt16LE(0, 8)               // store
    lh.writeUInt32LE(0, 10)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(f.data.length, 18)
    lh.writeUInt32LE(f.data.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28)
    parts.push(lh, nameBuf, f.data)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(0, 10)
    ch.writeUInt32LE(0, 12)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(f.data.length, 20)
    ch.writeUInt32LE(f.data.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt16LE(0, 30)
    ch.writeUInt16LE(0, 32)
    ch.writeUInt16LE(0, 34)
    ch.writeUInt16LE(0, 36)
    ch.writeUInt32LE(0, 38)
    ch.writeUInt32LE(offset, 42)
    central.push(ch, nameBuf)
    offset += lh.length + nameBuf.length + f.data.length
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...parts, ...central, eocd])
}

/** 解析 ZIP(仅 store/无压缩条目):Buffer → Map<name, Buffer> */
function unzipStore(buf) {
  const out = new Map()
  // EOCD:从尾部找签名
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件')
  const count = buf.readUInt16LE(eocd + 10)
  let pos = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('ZIP 中央目录损坏')
    const method = buf.readUInt16LE(pos + 10)
    const compSize = buf.readUInt32LE(pos + 20)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const localOffset = buf.readUInt32LE(pos + 42)
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen)
    // local header
    const lNameLen = buf.readUInt16LE(localOffset + 26)
    const lExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    const data = method === 0
      ? Buffer.from(buf.subarray(dataStart, dataStart + compSize))
      : null
    if (data === null) throw new Error('ZIP 含压缩条目(仅支持未压缩): ' + name)
    out.set(name, data)
    pos += 46 + nameLen + extraLen + commentLen
  }
  return out
}

export const name = 'dsh-expression'
export const inject = ['tools', 'webServer', 'agentDefaultModel', 'attachments']

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
}
const ROUTE = '/dsh-memes'

export function apply(ctx, config) {
  // 图库目录设置存 ~/.dsh(稳定,不受包升级/图库变化影响):
  // 优先级 用户设置(settings) > patch 配置(config.memeRoot) > 包内默认
  const settingsFile = join(process.env.HOME || '.', '.dsh', 'dsh-expression.json')
  const readSettings = () => {
    try { return JSON.parse(readFileSync(settingsFile, 'utf8')) } catch (e) { return {} }
  }
  const writeSettings = (s) => {
    try {
      mkdirSync(join(process.env.HOME || '.', '.dsh'), { recursive: true })
      writeFileSync(settingsFile, JSON.stringify(s, null, 2))
    } catch (e) {}
  }
  const userMemeRoot = readSettings().memeRoot
  const memeRoot = userMemeRoot || config?.memeRoot || defaultMemeRoot()
  let memes = null
  try {
    memes = new MemesStore(memeRoot)
  } catch (error) {
    console.error('[dsh-expression] meme store unavailable:', error && error.message)
    return
  }

  // ---- 陪伴模式:系统提示注入,模型根据对话情绪主动斗图 ----
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    assembled.sections.push({
      name: 'dsh-expression:companion',
      text: '【陪伴模式 · 斗图】主动斗图,不要等用户开口:\n' +
        '- 聊天气氛合适就主动用 send_meme 发一张贴题的表情包,不用等用户要求,发图优先于纯文字;\n' +
        '- 情绪到点、接梗、吐槽、卖萌时都主动甩图,别冷场;对方说正事/干活时克制;\n' +
        '- 发完保持简短,让图自己说话,不啰嗦不复述。',
    })
    return assembled
  })

  // ---- Web 通道:图片 HTTP 路由(白名单,只放行索引内路径) ----
  // 容错:同一进程内路由可能已被动态版插件注册(全局共享),冲突则复用。
  // urlPrefix 用绝对 URL:前端 markdown 渲染器不显示相对路径图片。
  let urlPrefix = null
  const webServer = ctx.webServer ?? ctx.get('webServer')
  if (webServer) {
    const host = webServer.host === '0.0.0.0' ? '127.0.0.1' : webServer.host
    const base = 'http://' + host + ':' + webServer.port
    try {
      webServer.register({
        kind: 'prefix',
        path: ROUTE,
        handler(req, res) {
          const pathname = String(req.url || '').split('?')[0]
          const stored = pathname.startsWith(ROUTE + '/') ? pathname.slice(ROUTE.length + 1) : null
          // 每次请求动态构建白名单:静态快照会漏掉新上传的图(历史教训:上传后 404 图片不显示)
          const allowed = new Set(memes.list().memes.map((m) => m.path))
          if (!stored || !allowed.has(stored)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('not found')
            return
          }
          try {
            const file = join(memes.root, stored)
            const bytes = readFileSync(file)
            const ext = stored.includes('.') ? stored.split('.').pop().toLowerCase() : ''
            res.writeHead(200, {
              'Content-Type': MIME[ext] || 'application/octet-stream',
              'Content-Length': String(bytes.byteLength),
              'Cache-Control': 'public, max-age=3600',
            })
            res.end(bytes)
          } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('not found')
          }
        },
      })
    } catch (error) {
      console.log('[dsh-expression] 路由已存在,复用:', error && error.message)
    }
    urlPrefix = base + ROUTE
  }

  // ---- 发送通道:QQ 优先,Web 兜底 ----
  const qq = ctx.get('companionQq')
  const sendImage = qq !== undefined && typeof qq.sendImage === 'function'
    ? (path, caption) => qq.sendImage(path, caption)
    : null
  if (sendImage || urlPrefix) {
    try {
      registerSendMemeTool(ctx, memes, sendImage, urlPrefix)
      console.log(`[dsh-expression] send_meme 已注册(${sendImage ? 'QQ' : 'Web'}通道,${urlPrefix || '无路由'})`)
    } catch (error) {
      console.error('[dsh-expression] send_meme 注册失败(不影响 API/面板):', error instanceof Error ? error.message : String(error))
    }
  } else {
    console.log('[dsh-expression] 无可用发送通道(需要 dsh-companion 的 QQ 或 webServer),未注册 send_meme')
  }

  // companionQq 迟到时补挂(静态插件与 companion 装载顺序不定)。
  const register = () => {
    if (sendImage || urlPrefix) return
    const qqNow = ctx.get('companionQq')
    if (qqNow !== undefined && typeof qqNow.sendImage === 'function') {
      registerSendMemeTool(ctx, memes, (path, caption) => qqNow.sendImage(path, caption), urlPrefix)
    }
  }
  ctx.on('companionQq/available', register)

  // ---- 管理 API + 自包含管理面板(HTTP,重启不丢,任何会话可访问) ----
  if (webServer) {
    let adminDb = new DatabaseSync(join(memes.root, 'index.db')) // 可写连接
    // 运行时切换图库目录:校验 → 持久化设置 → 原子替换 memes/adminDb。
    // 工具/路由/API 闭包引用变量,替换后立即指向新图库,无需重启。
    const reloadMemeStore = (dir) => {
      // 目录不存在则创建;没有 index.db 则初始化空图库(用户可传图/学图逐步填充)
      mkdirSync(dir, { recursive: true })
      const indexPath = join(dir, 'index.db')
      if (!existsSync(indexPath)) {
        const initDb = new DatabaseSync(indexPath)
        initDb.exec('CREATE TABLE IF NOT EXISTS memes (path TEXT PRIMARY KEY, tag TEXT, file_name TEXT, caption TEXT, keywords TEXT, mtime REAL, captioned_at REAL)')
        initDb.close()
      }
      const next = new MemesStore(dir)
      const nextDb = new DatabaseSync(indexPath)
      writeSettings({ memeRoot: dir })
      memes = next
      adminDb = nextDb
    }

    const validTagRe = /^[a-z0-9_-]+$/
    const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

    // ---- AI 自动学表情包:模型给图片 URL,下载收录进图库 ----
    ctx.tools.register(defineTool({
      name: 'learn_meme',
      description: '把一张图片收录进表情包图库(自动学图)。' +
        '仅当用户明确要求收藏/收录/保存这张图时使用(如「收藏这个表情」「收进图库」)。' +
        '用户发表情/发图是斗图,不是收藏请求——不要自动收录,正常回应即可。' +
        '插件会自动识别图片内容(分类/描述/关键词)后存入图库;tag/caption/keywords 可选,手动指定优先。' +
        '支持对话附件 attachmentId 或 imageUrl(图库内 /dsh-memes/... 或任意 http(s) 链接)。',
      parameters: {
        attachmentId: { type: 'string', description: '对话中上传的图片附件 id(用户上传图片时给出,如 sha256:...)' },
        imageUrl: { type: 'string', description: '图片的可下载 URL(/dsh-memes/... 或 http(s)),与 attachmentId 二选一' },
        tag: { type: 'string', description: '手动指定分类,如 angry/happy(可选,默认自动识别)' },
        caption: { type: 'string', description: '手动指定描述(可选,默认自动识别)' },
        keywords: { type: 'string', description: '手动指定搜索关键词,空格分隔(可选,默认自动识别)' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: value.message }],
      },
      async execute(args, exec) {
        const imageUrl = typeof args.imageUrl === 'string' ? args.imageUrl.trim() : ''
        const attachmentId = typeof args.attachmentId === 'string' ? args.attachmentId.trim() : ''
        let tag = typeof args.tag === 'string' ? args.tag.trim().toLowerCase() : ''
        let caption = String(args.caption || '').trim().slice(0, 200)
        let keywords = String(args.keywords || '').trim().slice(0, 200)
        if (!attachmentId && !imageUrl) return { ok: false, message: '需要 attachmentId(对话里的图片附件)或 imageUrl' }
        try {
          let buf
          let mime
          let fileName
          let ext
          if (attachmentId) {
            // 附件模式:从会话消息历史解析图片附件(不依赖任何第三方插件)
            const session = exec && exec.agent && exec.agent.session
            let ref = null
            if (session && typeof session.deriveMessages === 'function') {
              for (const msg of session.deriveMessages()) {
                const blocks = (msg && msg.content) || []
                for (const b of blocks) {
                  if (b && b.type === 'image' && b.attachment && String(b.attachment.attachmentId) === attachmentId) {
                    ref = b.attachment
                    break
                  }
                }
                if (ref) break
              }
            }
            if (!ref) return { ok: false, message: '找不到附件 ' + attachmentId + '(必须是本次对话上传的图片)' }
            const stored = await ctx.get('attachments').readImage(ref)
            buf = stored.data
            mime = stored.ref.mediaType
            fileName = stored.ref.name || 'meme' + (mime === 'image/png' ? '.png' : mime === 'image/gif' ? '.gif' : mime === 'image/webp' ? '.webp' : '.jpg')
            ext = fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : '.jpg'
          } else {
            if (!/^https?:\/\//i.test(imageUrl)) return { ok: false, message: 'imageUrl 必须是 http(s) 链接' }
            const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000), redirect: 'follow' })
            if (!res.ok) return { ok: false, message: '下载失败: HTTP ' + res.status }
            const ctype = String(res.headers.get('content-type') || '')
            const m = /image\/(jpeg|png|gif|webp)/.exec(ctype)
            mime = m ? { jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[m[1]] : ''
            if (!mime) return { ok: false, message: '该 URL 不是图片(jpg/png/gif/webp)' }
            buf = Buffer.from(await res.arrayBuffer())
            if (buf.byteLength === 0 || buf.byteLength > 8 * 1024 * 1024) return { ok: false, message: '图片大小超限(≤8MB)' }
            ext = m ? { jpeg: '.jpg', png: '.png', gif: '.gif', webp: '.webp' }[m[1]] : ''
            fileName = imageUrl.split('/').pop() || 'meme.jpg'
          }
          if (buf.byteLength === 0 || buf.byteLength > 8 * 1024 * 1024) return { ok: false, message: '图片大小超限(≤8MB)' }
          // 未指定分类时自动识图(学图即识图)
          let auto = false
          if (!tag) {
            const sel = ctx.agentDefaultModel && typeof ctx.agentDefaultModel.currentSelection === 'function'
              ? ctx.agentDefaultModel.currentSelection() : null
            const r = await recognizeImageBytes(ctx.get('llm'), sel, buf, mime, fileName)
            auto = true
            if (!tag) tag = r.tag
            if (!caption) caption = r.caption
            if (!keywords) keywords = r.keywords
          }
          if (!tag || !validTagRe.test(tag)) return { ok: false, message: '分类无效(tag 只能小写字母/数字/-/_),请手动指定 tag' }
          const name = Date.now() + '_' + Math.floor(Math.random() * 1000) + ext
          const rel = 'memes/' + tag + '/' + name
          mkdirSync(join(memes.root, 'memes', tag), { recursive: true })
          writeFileSync(join(memes.root, rel), buf)
          adminDb.prepare('INSERT INTO memes (path, tag, file_name, caption, keywords, mtime, captioned_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(rel, tag, name, caption, keywords, Date.now(), Date.now())
          return { ok: true, path: rel, tag, url: ROUTE + '/' + rel, message: '已收录: [' + tag + '] ' + (caption || name) + (auto ? ' (AI 自动识别)' : '') + ' → ' + rel }
        } catch (error) {
          return { ok: false, message: '收录失败: ' + (error instanceof Error ? error.message : String(error)) }
        }
      },
    }))

    // ---- AI 识图核心:当前默认模型识别图片 → 分类/描述/关键词 ----
    async function recognizeImageBytes(llm, sel, buf, mime, fileName) {
      const provider = sel && sel.provider
      const model = sel && sel.model
      if (!llm || !provider || !model) throw new Error('未配置模型,无法识图')
      const info = await llm.resolveModelInfo(provider, model)
      const modalities = info && info.inputModalities
      if (!Array.isArray(modalities) || !modalities.includes('image')) {
        throw new Error('当前模型「' + model + '」不支持图片输入,无法识图')
      }
      // 先 materialize 默认配置(reasoningEffort 等),否则 stream 时配置比对不一致报错
      // (历史教训: prepared LLM call config changed before adapter dispatch)
      const base = await llm.resolveCallConfig({ provider, model, maxTokens: 1024 })
      const prepared = await llm.prepareCall(base)
      const prompt = '你是表情包分类助手。识别这张表情包图片,只输出 JSON(不要任何其他文字):\n' +
        '{"tag":"分类(小写英文,参考: angry生气 happy开心 sad难过 shy害羞 confused困惑 surprised惊讶 sleep睡觉 work上班 like喜欢 see看看 meow喵喵 speechless无语),选最贴切的一个","caption":"一句话中文描述这张图表达的情绪/梗","keywords":"3-5个中文搜索词,空格分隔"}\n'
      let out = ''
      let reason = ''
      for await (const chunk of prepared.stream({
        ...base,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image', attachment: await ctx.get('attachments').saveImage({ data: buf, mediaType: mime, name: fileName }) },
          ],
        }],
      })) {
        if (chunk.type === 'text-delta') out += chunk.text
        else if (chunk.type === 'reasoning-delta') reason += chunk.text
        else if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') {
          throw new Error('模型调用失败: ' + (chunk.reason.failure && chunk.reason.failure.message || JSON.stringify(chunk.reason.failure)))
        }
      }
      // 思考型模型可能把 JSON 写在 reasoning 里,正文为空时兜底解析
      const m = /\{[\s\S]*\}/.exec(out) || /\{[\s\S]*\}/.exec(reason)
      if (!m) throw new Error('模型未返回有效 JSON')
      const parsed = JSON.parse(m[0])
      const tag = String(parsed.tag || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20)
      const caption = String(parsed.caption || '').trim().slice(0, 200)
      const keywords = String(parsed.keywords || '').trim().slice(0, 200)
      if (!tag) throw new Error('模型未给出分类')
      return { tag, caption, keywords }
    }

    const readBody = (req) => new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
    const json = (res, obj, status = 200) => {
      const body = JSON.stringify(obj)
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(body)
    }
    webServer.register({
      kind: 'exact',
      path: '/dsh-memes-api',
      async handler(req, res) {
        if (req.method === 'GET') {
          const u = new URL(req.url || '/', 'http://localhost')
          const { memes: rows, tags } = memes.list(u.searchParams.get('tag') || undefined, u.searchParams.get('q') || undefined)
          const all = memes.list().memes.length
          json(res, {
            ok: true, total: all, tags,
            memes: rows.map((m) => ({ ...m, url: ROUTE + '/' + m.path })),
          })
          return
        }
        let body
        try {
          body = JSON.parse(await readBody(req))
        } catch {
          json(res, { ok: false, error: '无效的 JSON 请求体' }, 400)
          return
        }
        try {
          const op = String(body.op || '')
          if (op === 'upload') {
            const tag = String(body.tag || '').trim().toLowerCase()
            const fileName = String(body.fileName || '').trim()
            const data = String(body.dataBase64 || '')
            const caption = String(body.caption || '').trim().slice(0, 200)
            const keywords = String(body.keywords || '').trim().slice(0, 200)
            if (!tag || !validTagRe.test(tag)) throw new Error('tag 只能是小写字母/数字/-/_')
            const ext = fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : ''
            if (!IMAGE_EXTS.includes(ext)) throw new Error('仅支持 jpg/png/gif/webp')
            if (!data) throw new Error('缺少图片数据')
            const name = Date.now() + '_' + Math.floor(Math.random() * 1000) + ext
            const rel = 'memes/' + tag + '/' + name
            mkdirSync(join(memes.root, 'memes', tag), { recursive: true })
            writeFileSync(join(memes.root, rel), Buffer.from(data, 'base64'))
            adminDb.prepare('INSERT INTO memes (path, tag, file_name, caption, keywords, mtime, captioned_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .run(rel, tag, name, caption, keywords, Date.now(), Date.now())
            json(res, { ok: true, meme: { path: rel, tag, file_name: name, caption, keywords, url: ROUTE + '/' + rel } })
          } else if (op === 'update') {
            const path = String(body.path || '')
            const row = memes.list().memes.find((m) => m.path === path)
            if (!row) throw new Error('未知路径: ' + path)
            const tag = body.tag != null ? String(body.tag).trim().toLowerCase() : row.tag
            if (!validTagRe.test(tag)) throw new Error('tag 只能是小写字母/数字/-/_')
            const caption = body.caption != null ? String(body.caption).trim() : row.caption
            const keywords = body.keywords != null ? String(body.keywords).trim() : row.keywords
            adminDb.prepare('UPDATE memes SET tag = ?, caption = ?, keywords = ? WHERE path = ?').run(tag, caption, keywords, path)
            json(res, { ok: true })
          } else if (op === 'delete') {
            const path = String(body.path || '')
            if (!memes.list().memes.some((m) => m.path === path)) throw new Error('未知路径: ' + path)
            adminDb.prepare('DELETE FROM memes WHERE path = ?').run(path)
            try { unlinkSync(join(memes.root, path)) } catch { /* 文件已不存在 */ }
            json(res, { ok: true })
          } else if (op === 'deleteTag') {
            const tag = String(body.tag || '').trim().toLowerCase()
            if (!tag || !validTagRe.test(tag)) throw new Error('tag 只能是小写字母/数字/-/_')
            const n = adminDb.prepare('DELETE FROM memes WHERE tag = ?').run(tag).changes
            rmSync(join(memes.root, 'memes', tag), { recursive: true, force: true })
            json(res, { ok: true, deleted: n })
          } else if (op === 'importMemePack') {
            const data = String(body.dataBase64 || '')
            const name = String(body.name || 'meme-pack').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'meme-pack'
            if (!data) throw new Error('缺少 ZIP 数据')
            const entries = unzipStore(Buffer.from(data, 'base64'))
            const indexPath = entries.get('index.db')
            if (!indexPath) throw new Error('ZIP 里没有 index.db,不是有效的表情包包')
            // 解包到 ~/.dsh/meme-packs/<name>(包外,持久)
            const target = join(process.env.HOME || '.', '.dsh', 'meme-packs', name)
            rmSync(target, { recursive: true, force: true })
            mkdirSync(target, { recursive: true })
            for (const [rel, bytes] of entries) {
              const full = join(target, rel)
              mkdirSync(dirname(full), { recursive: true })
              writeFileSync(full, bytes)
            }
            reloadMemeStore(target)
            json(res, { ok: true, memeRoot: target, total: memes.list().memes.length, message: '导入成功,已切换到新图库' })
          } else if (op === 'getMemeRoot') {
            json(res, { ok: true, memeRoot: memes.root, configured: !!readSettings().memeRoot })
          } else if (op === 'setMemeRoot') {
            const dir = String(body.memeRoot || '').trim()
            if (!dir) throw new Error('目录不能为空')
            reloadMemeStore(dir)
            json(res, { ok: true, memeRoot: memes.root, message: '已切换图库,立即生效' })
          } else {
            json(res, { ok: false, error: '未知操作: ' + op }, 400)
          }
        } catch (error) {
          json(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400)
        }
      },
    })
    // 导出图库为 ZIP 包(分享用):遍历图库目录全部文件打包
    webServer.register({
      kind: 'exact',
      path: '/dsh-memes-export',
      handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' })
          res.end()
          return
        }
        try {
          // 只导出索引内的文件(index.db + manifest.json + 索引图片),
          // 不打包 .git/备份/缩略图等无关内容(历史教训:整目录遍历会带出 200MB 杂物)
          const files = [{ name: 'index.db', data: readFileSync(join(memes.root, 'index.db')) }]
          if (existsSync(join(memes.root, 'manifest.json'))) {
            files.push({ name: 'manifest.json', data: readFileSync(join(memes.root, 'manifest.json')) })
          }
          for (const m of memes.list().memes) {
            const full = join(memes.root, m.path)
            if (existsSync(full)) files.push({ name: m.path, data: readFileSync(full) })
          }
          const zip = zipStore(files)
          const stamp = new Date().toISOString().slice(0, 10)
          res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Length': String(zip.byteLength),
            'Content-Disposition': 'attachment; filename="dsh-meme-pack-' + stamp + '.zip"',
          })
          res.end(zip)
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('导出失败: ' + (error instanceof Error ? error.message : String(error)))
        }
      },
    })

    // 自包含管理面板页面(无构建链、重启不丢)。
    webServer.register({
      kind: 'exact',
      path: '/memes-panel',
      handler(req, res) {
        try {
          const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'panel.html'))
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(html)
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('panel.html 缺失: ' + (error instanceof Error ? error.message : String(error)))
        }
      },
    })
    // 对话里表情包小图展示:只限制 /dsh-memes 图片,避免大图贴脸,不影响其他 UI。
    // 选择器必须用 src*= 子串匹配:send_meme 返回的是绝对 URL
    // (http://host:port/dsh-memes/...),src^= 前缀匹配只对相对路径生效,
    // 会漏掉所有真实表情(历史教训:之前的 240px 规则因此从未生效)。
    // 尺寸可用 config.memeSize 覆盖(px,默认 160)。
    const memeSize = Number(config?.memeSize) > 0 ? Number(config.memeSize) : 160
    try {
      webServer.tapIndex((html) => html.replace(
        '</head>',
        '<style>img[src*="/dsh-memes/"]{max-width:' + memeSize + 'px!important;max-height:' + memeSize + 'px!important;width:auto!important;height:auto!important;object-fit:contain;border-radius:8px}</style></head>',
      ))
    } catch (error) {
      console.error('[dsh-expression] tapIndex 失败:', error instanceof Error ? error.message : String(error))
    }
    console.log('[dsh-expression] 管理 API: /dsh-memes-api , 管理面板: /memes-panel , 小图 CSS 已注入(' + memeSize + 'px)')
  }
}
