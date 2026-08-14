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
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { MemesStore, defaultMemeRoot, registerSendMemeTool } from './memes.js'

export const name = 'dsh-expression'
export const inject = ['tools', 'webServer']

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
}
const ROUTE = '/dsh-memes'

export function apply(ctx, config) {
  let memes = null
  try {
    memes = new MemesStore(config?.memeRoot || defaultMemeRoot())
  } catch (error) {
    console.error('[dsh-expression] meme store unavailable:', error && error.message)
    return
  }

  // ---- Web 通道:图片 HTTP 路由(白名单,只放行索引内路径) ----
  // 容错:同一进程内路由可能已被动态版插件注册(全局共享),冲突则复用。
  // urlPrefix 用绝对 URL:前端 markdown 渲染器不显示相对路径图片。
  let urlPrefix = null
  const webServer = ctx.webServer ?? ctx.get('webServer')
  if (webServer) {
    const allowed = new Set(memes.list().memes.map((m) => m.path))
    const host = webServer.host === '0.0.0.0' ? '127.0.0.1' : webServer.host
    const base = 'http://' + host + ':' + webServer.port
    try {
      webServer.register({
        kind: 'prefix',
        path: ROUTE,
        handler(req, res) {
          const pathname = String(req.url || '').split('?')[0]
          const stored = pathname.startsWith(ROUTE + '/') ? pathname.slice(ROUTE.length + 1) : null
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
    const adminDb = new DatabaseSync(join(memes.root, 'index.db')) // 可写连接
    const validTagRe = /^[a-z0-9_-]+$/
    const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
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
            memes: rows.map((m) => ({ ...m, url: urlPrefix ? urlPrefix + '/' + m.path : null })),
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
            if (!tag || !validTagRe.test(tag)) throw new Error('tag 只能是小写字母/数字/-/_')
            const ext = fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : ''
            if (!IMAGE_EXTS.includes(ext)) throw new Error('仅支持 jpg/png/gif/webp')
            if (!data) throw new Error('缺少图片数据')
            const name = Date.now() + '_' + Math.floor(Math.random() * 1000) + ext
            const rel = 'memes/' + tag + '/' + name
            mkdirSync(join(memes.root, 'memes', tag), { recursive: true })
            writeFileSync(join(memes.root, rel), Buffer.from(data, 'base64'))
            adminDb.prepare('INSERT INTO memes (path, tag, file_name, caption, keywords, mtime, captioned_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .run(rel, tag, name, '', '', Date.now(), Date.now())
            json(res, { ok: true, meme: { path: rel, tag, file_name: name, caption: '', keywords: '', url: urlPrefix ? urlPrefix + '/' + rel : null } })
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
          } else {
            json(res, { ok: false, error: '未知操作: ' + op }, 400)
          }
        } catch (error) {
          json(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400)
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
