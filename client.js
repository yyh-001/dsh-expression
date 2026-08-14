/**
 * dsh-expression — 设置页表情包管理面板(Client 半边)。
 *
 * 以 dsh.client bundle 格式加载(与 dsh-ssh 同款):注册 settings.section
 * 「表情包」页,渲染完整管理面板(列表/上传/编辑/删除)。
 * 数据走 dsh-expression 的 HTTP API(/dsh-memes-api,静态、重启不丢)。
 */
window.__ModuleLoader__.load({
  id: 'dsh-expression',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    const CSS = [
      '.meme-panel{display:flex;flex-direction:column;gap:10px;padding:4px 0;font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.meme-panel .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.meme-panel .total{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.meme-panel input[type=text],.meme-panel select,.meme-panel textarea{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:5px 8px;font-size:13px;outline:none}',
      '.meme-panel input[type=text]:focus,.meme-panel select:focus,.meme-panel textarea:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.meme-panel textarea{resize:vertical;font-family:inherit}',
      '.meme-panel button{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:5px 10px;font-size:13px;cursor:pointer}',
      '.meme-panel button:hover{border-color:var(--dsw-alias-brand-primary)}',
      '.meme-panel button:disabled{opacity:.5;cursor:default}',
      '.meme-panel .notice{padding:6px 10px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.meme-panel .meme-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}',
      '.meme-panel .meme-card{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column}',
      '.meme-panel .meme-card img{width:100%;height:110px;object-fit:cover;display:block;background:var(--dsw-alias-bg-base)}',
      '.meme-panel .meta{padding:6px 8px;display:flex;flex-direction:column;gap:5px;min-height:74px}',
      '.meme-panel .tag{font-size:11px;color:var(--dsw-alias-brand-primary);text-transform:lowercase}',
      '.meme-panel .cap{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '.meme-panel .acts{display:flex;gap:6px;margin-top:auto}',
      '.meme-panel .acts button{padding:3px 8px;font-size:12px}',
      '.meme-panel .empty{color:var(--dsw-alias-label-secondary);padding:20px;text-align:center}',
    ].join('')

    async function apiGet(params) {
      const qs = new URLSearchParams()
      if (params.tag) qs.set('tag', params.tag)
      if (params.q) qs.set('q', params.q)
      return (await fetch('/dsh-memes-api?' + qs.toString())).json()
    }
    async function apiPost(payload) {
      return (await fetch('/dsh-memes-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })).json()
    }

    function MemePanel() {
      const h = React.createElement
      const [memes, setMemes] = React.useState([])
      const [tags, setTags] = React.useState([])
      const [total, setTotal] = React.useState(0)
      const [q, setQ] = React.useState('')
      const [tagFilter, setTagFilter] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [edit, setEdit] = React.useState(null)
      const [upTag, setUpTag] = React.useState('')
      const [uploading, setUploading] = React.useState(false)
      const fileRef = React.useRef(null)

      const load = async (query, tagf) => {
        setBusy(true)
        try {
          const res = await apiGet({ q: query || '', tag: tagf || '' })
          if (res && res.ok) {
            setMemes(res.memes)
            setTags(res.tags)
            setTotal(res.total)
            setNotice('')
          } else {
            setNotice('加载失败' + (res && res.error ? ': ' + res.error : ''))
          }
        } catch (error) {
          setNotice('加载失败: ' + (error && error.message ? error.message : String(error)))
        }
        setBusy(false)
      }
      React.useEffect(() => { load('', '') }, [])

      const onPickFile = (ev) => {
        const file = ev.target.files && ev.target.files[0]
        ev.target.value = ''
        if (!file) return
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)) {
          setNotice('仅支持 jpg/png/gif/webp')
          return
        }
        if (!upTag.trim()) {
          setNotice('先填新图分类(tag)')
          return
        }
        setUploading(true)
        const reader = new FileReader()
        reader.onload = async () => {
          const data = String(reader.result || '').split(',')[1] || ''
          try {
            const res = await apiPost({ op: 'upload', tag: upTag.trim().toLowerCase(), fileName: file.name, dataBase64: data })
            setNotice(res && res.ok && res.meme ? '已上传: ' + res.meme.path : '上传失败: ' + (res && res.error || ''))
            await load(q, tagFilter)
          } catch (error) {
            setNotice('上传失败: ' + (error && error.message ? error.message : String(error)))
          }
          setUploading(false)
        }
        reader.onerror = () => { setUploading(false); setNotice('读取文件失败') }
        reader.readAsDataURL(file)
      }

      const onSaveEdit = async () => {
        if (!edit) return
        try {
          const res = await apiPost({
            op: 'update',
            path: edit.path,
            tag: String(edit.tag || '').trim().toLowerCase(),
            caption: String(edit.caption || ''),
            keywords: String(edit.keywords || ''),
          })
          setNotice(res && res.ok ? '已保存' : '保存失败: ' + (res && res.error || ''))
          setEdit(null)
          await load(q, tagFilter)
        } catch (error) {
          setNotice('保存失败: ' + (error && error.message ? error.message : String(error)))
        }
      }

      const onDelete = async (m) => {
        if (!window.confirm('删除 ' + m.path + ' ?')) return
        try {
          const res = await apiPost({ op: 'delete', path: m.path })
          setNotice(res && res.ok ? '已删除' : '删除失败: ' + (res && res.error || ''))
          await load(q, tagFilter)
        } catch (error) {
          setNotice('删除失败: ' + (error && error.message ? error.message : String(error)))
        }
      }

      const searchInput = h('input', {
        type: 'text',
        placeholder: '搜索描述/关键词',
        value: q,
        onChange: (e) => setQ(e.target.value),
        onKeyDown: (e) => { if (e.key === 'Enter') load(q, tagFilter) },
        style: { width: 180 },
      })
      const tagSelect = h('select', {
        value: tagFilter,
        onChange: (e) => setTagFilter(e.target.value),
      }, [
        h('option', { key: '', value: '' }, '全部分类'),
        tags.map((t) => h('option', { key: t, value: t }, t)),
      ])
      const uploadInput = h('input', {
        type: 'text',
        placeholder: '新图分类(如 happy)',
        value: upTag,
        onChange: (e) => setUpTag(e.target.value),
        style: { width: 140 },
      })
      const fileInput = h('input', {
        ref: fileRef,
        type: 'file',
        accept: 'image/*',
        style: { display: 'none' },
        onChange: onPickFile,
      })

      const cards = memes.map((m) => {
        if (edit && edit.path === m.path) {
          return h('div', { key: m.path, className: 'meme-card' },
            h('img', { src: m.url, alt: m.path }),
            h('div', { className: 'meta' },
              h('input', { type: 'text', value: edit.tag, placeholder: '分类', onChange: (e) => setEdit({ ...edit, tag: e.target.value }) }),
              h('textarea', { value: edit.caption, placeholder: '描述', rows: 2, onChange: (e) => setEdit({ ...edit, caption: e.target.value }) }),
              h('input', { type: 'text', value: edit.keywords, placeholder: '关键词', onChange: (e) => setEdit({ ...edit, keywords: e.target.value }) }),
              h('div', { className: 'acts' },
                h('button', { onClick: onSaveEdit }, '保存'),
                h('button', { onClick: () => setEdit(null) }, '取消'),
              ),
            ),
          )
        }
        return h('div', { key: m.path, className: 'meme-card' },
          h('img', { src: m.url, alt: m.path, loading: 'lazy' }),
          h('div', { className: 'meta' },
            h('div', { className: 'tag' }, m.tag),
            h('div', { className: 'cap' }, m.caption || m.file_name),
            h('div', { className: 'acts' },
              h('button', { onClick: () => setEdit({ path: m.path, tag: m.tag, caption: m.caption || '', keywords: m.keywords || '' }) }, '编辑'),
              h('button', { onClick: () => onDelete(m) }, '删除'),
            ),
          ),
        )
      })

      return h('div', { className: 'meme-panel' },
        h('div', { className: 'row' },
          searchInput,
          tagSelect,
          h('button', { onClick: () => load(q, tagFilter), disabled: busy }, '搜索'),
          h('button', { onClick: () => { setQ(''); setTagFilter(''); load('', '') } }, '重置'),
          h('span', { className: 'total' }, total + ' 张'),
        ),
        h('div', { className: 'row' },
          uploadInput,
          h('button', { onClick: () => fileRef.current && fileRef.current.click(), disabled: uploading }, uploading ? '上传中…' : '上传表情包'),
          fileInput,
        ),
        notice ? h('div', { className: 'notice' }, notice) : null,
        memes.length === 0 && !busy
          ? h('div', { className: 'empty' }, '没有匹配的表情包')
          : h('div', { className: 'meme-grid' }, cards),
      )
    }

    const inject = ['slots']

    function apply(ctx) {
      const styleEl = document.createElement('style')
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
      ctx.effect(() => () => { styleEl.remove() }, 'dsh-expression-entry: styles')

      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'memes', order: 25, label: '表情包' },
        () => React.createElement(MemePanel),
      ))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
