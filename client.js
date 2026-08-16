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
      const [upCaption, setUpCaption] = React.useState('')
      const [upKeywords, setUpKeywords] = React.useState('')
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
            const res = await apiPost({
              op: 'upload',
              tag: upTag.trim().toLowerCase(),
              caption: String(upCaption || '').trim(),
              keywords: String(upKeywords || '').trim(),
              fileName: file.name,
              dataBase64: data,
            })
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
        onChange: (e) => { setTagFilter(e.target.value); load(q, e.target.value) },
      }, [
        h('option', { key: '', value: '' }, '全部分类'),
        tags.map((t) => h('option', { key: t, value: t }, t)),
      ])
      const uploadInput = h('input', {
        type: 'text',
        placeholder: '新图分类(如 happy)',
        value: upTag,
        onChange: (e) => setUpTag(e.target.value),
        style: { width: 110 },
      })
      const captionInput = h('input', {
        type: 'text',
        placeholder: '描述(如:无语)',
        value: upCaption,
        onChange: (e) => setUpCaption(e.target.value),
        style: { width: 120 },
      })
      const keywordsInput = h('input', {
        type: 'text',
        placeholder: '关键词(空格分隔)',
        value: upKeywords,
        onChange: (e) => setUpKeywords(e.target.value),
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
          captionInput,
          keywordsInput,
          h('button', { onClick: () => fileRef.current && fileRef.current.click(), disabled: uploading }, uploading ? '上传中…' : '上传表情包'),
          fileInput,
        ),
        notice ? h('div', { className: 'notice' }, notice) : null,
        memes.length === 0 && !busy
          ? h('div', { className: 'empty' }, '没有匹配的表情包')
          : h('div', { className: 'meme-grid' }, cards),
      )
    }

    // ---- 输入框快捷发图(QQ 式):😊 按钮 + 悬浮面板 ----
    const memePickerCSS = [
      '.meme-trigger{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;cursor:pointer;color:var(--dsw-alias-label-secondary);background:transparent;border:none;font-size:17px;line-height:1;outline:none}',
      '.meme-trigger:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.meme-trigger.active{color:var(--dsw-alias-brand-primary)}',
      '.meme-picker{position:absolute;bottom:calc(100% + 8px);left:0;width:min(340px,88vw);z-index:30;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:8px;padding:10px;max-height:42vh;overflow:hidden;font-size:12px;color:var(--dsw-alias-label-primary)}',
      '.meme-picker .mp-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
      '.meme-picker input[type=text]{flex:1;min-width:120px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:4px 8px;font-size:12px;outline:none}',
      '.meme-picker input[type=text]:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.meme-picker .mp-tags{display:flex;gap:4px;flex-wrap:wrap;max-width:100%}',
      '.meme-picker .mp-tag{padding:2px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);cursor:pointer;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.meme-picker .mp-tag.on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-layer-1)}',
      '.meme-picker .mp-grid{overflow-y:auto;display:flex;flex-wrap:wrap;gap:6px;max-height:36vh}',
      '.meme-picker .mp-cell{width:74px;height:74px;flex:0 0 74px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;cursor:pointer;background:var(--dsw-alias-bg-layer-2);padding:0;display:block;transition:border-color .12s}',
      '.meme-picker .mp-cell:hover{border-color:var(--dsw-alias-brand-primary)}',
      '.meme-picker .mp-empty{color:var(--dsw-alias-label-secondary);text-align:center;padding:24px 0}',
    ].join('')

    function makeMemeStore() {
      let open = false
      let base = ''
      const subs = new Set()
      return {
        get: () => open,
        set: (v) => { open = !!v; subs.forEach((fn) => fn()) },
        toggle: () => { open = !open; subs.forEach((fn) => fn()) },
        subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn) },
        setBase: (s) => { base = s || '' },
        getBase: () => base,
      }
    }

    function makeMemeButton(store) {
      return function MemeButton(props) {
        const open = React.useSyncExternalStore(store.subscribe, store.get)
        return React.createElement('button', {
          className: open ? 'meme-trigger active' : 'meme-trigger',
          title: '表情包',
          onClick: (e) => {
            e.preventDefault(); e.stopPropagation()
            if (!store.get()) {
              const d = props && props.input && typeof props.input.draft === 'string' ? props.input.draft : ''
              store.setBase(d)
            }
            store.toggle()
          },
        }, '😊')
      }
    }

    function MemeBoard(props) {
      const h = React.createElement
      const store = props.store
      const actions = props.inputActions
      const open = React.useSyncExternalStore(store.subscribe, store.get)
      const [memes, setMemes] = React.useState([])
      const [q, setQ] = React.useState('')

      React.useEffect(() => {
        if (!open) return
        let alive = true
        const qs = new URLSearchParams()
        if (q) qs.set('q', q)
        fetch('/dsh-memes-api?' + qs.toString())
          .then((r) => r.json())
          .then((res) => {
            if (!alive || !res || !res.ok) return
            setMemes(res.memes || [])
          })
          .catch(() => {})
        return () => { alive = false }
      }, [open, q])

      // 点外部(非面板、非 😊 按钮)自动收起。
      React.useEffect(() => {
        if (!open) return
        const onDown = (e) => {
          const t = e && e.target
          if (t && t.closest && !t.closest('.meme-picker') && !t.closest('.meme-trigger')) {
            store.set(false)
          }
        }
        document.addEventListener('pointerdown', onDown)
        return () => document.removeEventListener('pointerdown', onDown)
      }, [open])

      if (!open) return null

      // 点击:直接发送(QQ 式)。优先发真图(附件管线),失败再退回文字。
      // 不附带任何 caption/描述文字,也不触发识图——就安静发图。
      const send = async (m) => {
        if (!m || !m.url) return
        // m.url 是相对路径(/dsh-memes/...),绝对化成当前页面的 origin:
        // 服务端不知道用户从 localhost 还是局域网 IP 访问,硬编码 127.0.0.1 会
        // 跨源且无 CORS → fetch 必失败(历史教训:点击发图退回一串 markdown 字符串)。
        const absUrl = (u) => { try { return new URL(u, window.location.origin).href } catch (e) { return u } }
        const md = '![' + (m.tag || 'meme') + '](' + absUrl(m.url) + ')'
        const setText = (text) => { try { if (actions && actions.setDraft) actions.setDraft(text) } catch (e) {} }

        // 走附件管线发真图:fetch URL → File → createDraftImages → addImages → submit
        try {
          const conv = (typeof props.getConversation === 'function' && props.getConversation()) || null
          const doAdd = actions && typeof actions.addImages === 'function'
          if (conv && doAdd && typeof conv.createDraftImages === 'function') {
            const blob = await fetch(absUrl(m.url)).then((r) => r.blob())
            const name = (m.file_name || String(m.path || '').split('/').pop() || 'meme.jpg')
            let file
            try { file = new File([blob], name, { type: blob.type || 'image/jpeg' }) }
            catch (e) { file = null }
            if (file) {
              let imgs
              try { imgs = conv.createDraftImages([file]) } catch (e) { imgs = null }
              if (imgs && imgs.length && imgs[0].id && actions.addImages([imgs[0].id])) {
                // 保留用户已打的文本(不附加描述)。
                const cur = store.getBase() || ''
                setText(cur || '')
                try { if (actions.submit) actions.submit() } catch (e) {}
                store.setBase('')
                store.set(false)
                return
              }
            }
          }
        } catch (e) {}
        // 兜底:文字 markdown
        const cur = store.getBase() || ''
        setText(cur ? (cur.trim() ? cur + '\n' + md : md) : md)
        try {
          if (actions && actions.submit) actions.submit()
        } catch (e) {}
        store.setBase('')
        store.set(false)
      }

      const searchInput = h('input', {
        type: 'text', placeholder: '搜表情/情绪', value: q,
        onChange: (e) => setQ(e.target.value),
      })
      const clearBtn = h('button', {
        className: 'mp-tag', style: { marginLeft: 'auto' },
        onClick: () => { setQ('') },
      }, '复位')
      const cells = memes.map((m) => h('div', {
        key: m.path, className: 'mp-cell', title: m.caption || m.file_name, onClick: () => send(m),
        style: {
          width: '74px', height: '74px',
          backgroundImage: 'url(' + m.url + ')',
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
        },
      }))

      return h('div', { className: 'meme-picker', onClick: (e) => e.stopPropagation() },
        h('div', { className: 'mp-row' }, searchInput, clearBtn),
        memes.length === 0
          ? h('div', { className: 'mp-empty' }, '没有匹配的表情包')
          : h('div', { className: 'mp-grid' }, cells),
      )
    }

    const inject = ['slots']

    function apply(ctx) {
      const styleEl = document.createElement('style')
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
      ctx.effect(() => () => { styleEl.remove() }, 'dsh-expression-entry: styles')

      const pickerStyle = document.createElement('style')
      pickerStyle.textContent = memePickerCSS
      document.head.appendChild(pickerStyle)
      ctx.effect(() => () => { pickerStyle.remove() }, 'dsh-expression-entry: meme-picker styles')

      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'memes', order: 25, label: '表情包' },
        () => React.createElement(MemePanel),
      ))

      // 输入框快捷发图(QQ 式)。
      const store = makeMemeStore()
      slots.inject('conversation.input.left', () => slots.register(
        { name: 'conversation.input.left', id: 'meme-picker', order: 5, label: '表情包' },
        (props) => React.createElement(makeMemeButton(store), { input: props.input }),
      ))
      slots.inject('conversation.input.overlay', () => slots.register(
        { name: 'conversation.input.overlay', id: 'meme-picker', order: 5, label: '表情包' },
        (props) => React.createElement(MemeBoard, {
          store,
          inputActions: props.inputActions,
          getConversation: () => ctx.get('conversation'),
        }),
      ))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
