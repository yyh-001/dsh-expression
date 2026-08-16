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
      '.meme-panel{display:flex;flex-direction:column;gap:14px;padding:4px 0;font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.meme-panel .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.meme-panel .section-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.04em;margin:2px 0 -4px}',
      '.meme-panel input[type=text],.meme-panel select,.meme-panel textarea{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 10px;font-size:13px;outline:none;transition:border-color .12s ease}',
      '.meme-panel input[type=text]:focus,.meme-panel select:focus,.meme-panel textarea:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.meme-panel textarea{resize:vertical;font-family:inherit}',
      '.meme-panel button{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 12px;font-size:13px;cursor:pointer;transition:border-color .12s ease,background .12s ease}',
      '.meme-panel button:hover{border-color:var(--dsw-alias-brand-primary)}',
      '.meme-panel button:disabled{opacity:.5;cursor:default}',
      '.meme-panel .btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}',
      '.meme-panel .btn-primary:hover{opacity:.9}',
      '.meme-panel .notice{padding:7px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.meme-panel .meme-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}',
      '.meme-panel .meme-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:transform .12s ease,box-shadow .12s ease}',
      '.meme-panel .meme-card:hover{transform:translateY(-2px);box-shadow:0 5px 14px rgba(0,0,0,.12)}',
      '.meme-panel .meme-card img{width:100%!important;height:120px!important;object-fit:contain!important;display:block;background:var(--dsw-alias-bg-base);padding:4px;box-sizing:border-box}',
      '.meme-panel .meta{padding:8px 10px;display:flex;flex-direction:column;gap:5px;min-height:80px}',
      '.meme-panel .tag{display:inline-block;align-self:flex-start;font-size:11px;color:var(--dsw-alias-brand-primary);text-transform:lowercase;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);border-radius:999px;padding:1px 8px}',
      '.meme-panel .cap{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '.meme-panel .acts{display:flex;gap:6px;margin-top:auto}',
      '.meme-panel .acts button{padding:3px 10px;font-size:12px;border-radius:6px}',
      '.meme-panel .acts button.danger:hover{border-color:#e5484d;color:#e5484d}',
      '.meme-panel .empty{color:var(--dsw-alias-label-secondary);padding:24px;text-align:center}',
      '.meme-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px}',
      '.meme-modal{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px;width:340px;max-width:100%;box-shadow:0 10px 36px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:10px}',
      '.meme-modal h3{margin:0;font-size:14px;font-weight:600}',
      '.meme-modal img{width:100%!important;height:220px!important;object-fit:contain!important;border-radius:8px;background:var(--dsw-alias-bg-base);padding:6px;box-sizing:border-box}',
      '.meme-modal .field{display:flex;flex-direction:column;gap:4px}',
      '.meme-modal input[type=text],.meme-modal select,.meme-modal textarea{box-sizing:border-box;width:100%}',
      '.meme-modal .field label{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.meme-modal .modal-acts{display:flex;gap:8px;justify-content:flex-end}',
    ].join('')

    // 分类中文显示(仅 UI,存储/搜索仍是英文 tag)
    const TAG_ZH = {
      angry: '生气', happy: '开心', sad: '难过', shy: '害羞', confused: '困惑',
      surprised: '惊讶', sleep: '睡觉', meow: '喵喵', morning: '早上好', work: '上班',
      like: '喜欢', see: '看看', reply: '回复', sigh: '叹气', baka: '笨蛋',
      fool: '傻瓜', givemoney: '给钱', color: '彩色', cpu: 'CPU',
    }
    const tagZh = (t) => TAG_ZH[t] || t

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
      const [uploadOpen, setUploadOpen] = React.useState(false)
      const [upNewTag, setUpNewTag] = React.useState('')
      const [upFile, setUpFile] = React.useState(null)
      const [upData64, setUpData64] = React.useState('')
      const [upPreview, setUpPreview] = React.useState('')
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

      const onDeleteTag = async (tagArg) => {
        const tag = tagArg || (upTag === '__new__' ? '' : String(upTag || '').trim())
        if (!tag) return
        if (!window.confirm('删除分类「' + tagZh(tag) + ' (' + tag + ')」及其中所有表情包?此操作不可恢复')) return
        try {
          const res = await apiPost({ op: 'deleteTag', tag })
          setNotice(res && res.ok ? '已删除分类,共 ' + (res.deleted || 0) + ' 张' : '删除失败: ' + (res && res.error || ''))
          setUpTag('')
          setUpNewTag('')
          await load(q, tagFilter === tag ? '' : tagFilter)
        } catch (error) {
          setNotice('删除失败: ' + (error && error.message ? error.message : String(error)))
        }
      }

      const onPickFile = (ev) => {
        const file = ev.target.files && ev.target.files[0]
        ev.target.value = ''
        if (!file) return
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)) {
          setNotice('仅支持 jpg/png/gif/webp')
          return
        }
        setUpFile(file)
        setUpPreview(URL.createObjectURL(file))
        const reader = new FileReader()
        reader.onload = () => setUpData64(String(reader.result || '').split(',')[1] || '')
        reader.readAsDataURL(file)
      }

      const onConfirmUpload = async () => {
        const file = upFile
        if (!file) { setNotice('先选择图片文件'); return }
        const tag = upTag === '__new__' ? String(upNewTag || '').trim().toLowerCase() : String(upTag || '').trim()
        if (!tag) { setNotice('先选择或填写分类'); return }
        if (!/^[a-z0-9_-]+$/.test(tag)) { setNotice('分类只能是小写字母/数字/-/_'); return }
        setUploading(true)
        const reader = new FileReader()
        reader.onload = async () => {
          const data = String(reader.result || '').split(',')[1] || ''
          try {
            const res = await apiPost({
              op: 'upload',
              tag,
              caption: String(upCaption || '').trim(),
              keywords: String(upKeywords || '').trim(),
              fileName: file.name,
              dataBase64: data,
            })
            setNotice(res && res.ok && res.meme ? '已上传: ' + res.meme.path : '上传失败: ' + (res && res.error || ''))
            if (res && res.ok) {
              setUploadOpen(false)
              setUpFile(null)
              setUpPreview('')
              setUpTag('')
              setUpNewTag('')
              setUpCaption('')
              setUpKeywords('')
              await load(q, tagFilter)
            }
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
          const tag = edit.tag === '__new__' ? String(edit.newTag || '').trim().toLowerCase() : String(edit.tag || '').trim().toLowerCase()
          const res = await apiPost({
            op: 'update',
            path: edit.path,
            tag,
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
        tags.map((t) => h('option', { key: t, value: t }, tagZh(t) + ' (' + t + ')')),
      ])

      const fileInput = h('input', {
        ref: fileRef,
        type: 'file',
        accept: 'image/*',
        style: { display: 'none' },
        onChange: onPickFile,
      })

      const cards = memes.map((m) => h('div', { key: m.path, className: 'meme-card' },
        h('img', { src: m.url, alt: m.path, loading: 'lazy' }),
        h('div', { className: 'meta' },
          h('div', { className: 'tag' }, tagZh(m.tag)),
          h('div', { className: 'cap' }, m.caption || m.file_name),
          h('div', { className: 'acts' },
            h('button', { onClick: () => setEdit({ path: m.path, tag: m.tag, caption: m.caption || '', keywords: m.keywords || '' }) }, '编辑'),
            h('button', { className: 'danger', onClick: () => onDelete(m) }, '删除'),
          ),
        ),
      ))

      return h('div', { className: 'meme-panel' },
        h('div', { className: 'section-title' }, '上传新表情包'),
        h('div', { className: 'row' },
          h('button', { className: 'btn-primary', onClick: () => setUploadOpen(true) }, '上传表情包'),
        ),
        h('div', { className: 'section-title' }, '图库 (' + total + ' 张)'),
        h('div', { className: 'row' },
          searchInput,
          tagSelect,
          h('button', { onClick: () => load(q, tagFilter), disabled: busy }, '搜索'),
          h('button', { onClick: () => { setQ(''); setTagFilter(''); load('', '') } }, '重置'),
        ),
        notice ? h('div', { className: 'notice' }, notice) : null,
        memes.length === 0 && !busy
          ? h('div', { className: 'empty' }, '没有匹配的表情包')
          : h('div', { className: 'meme-grid' }, cards),
        // 编辑弹窗
        edit ? h('div', { className: 'meme-modal-mask', onClick: () => setEdit(null) },
          h('div', { className: 'meme-modal', onClick: (e) => e.stopPropagation() },
            h('h3', null, '编辑表情包'),
            h('img', { src: memes.find((m) => m.path === edit.path)?.url, alt: edit.path }),
            h('div', { className: 'field' },
              h('label', null, '分类'),
              h('div', { className: 'row', style: { width: '100%' } },
                h('select', { value: edit.tag, onChange: (e) => setEdit({ ...edit, tag: e.target.value }), style: { flex: 1 } },
                  (tags.includes(edit.tag) ? tags : [edit.tag, ...tags]).map((t) => h('option', { key: t, value: t }, tagZh(t) + ' (' + t + ')')),
                  h('option', { value: '__new__' }, '+ 新建分类'),
                ),
                h('button', { onClick: () => onDeleteTag(edit.tag), disabled: !edit.tag || edit.tag === '__new__', title: '删除该分类及其中所有表情包' }, '删除分类'),
              ),
              edit.tag === '__new__'
                ? h('input', { type: 'text', value: edit.newTag || '', placeholder: '新分类名,小写字母/数字/-/_', onChange: (e) => setEdit({ ...edit, newTag: e.target.value }), style: { width: '100%' } })
                : null,
            ),
            h('div', { className: 'field' },
              h('label', null, '描述'),
              h('textarea', { value: edit.caption, placeholder: '如:无语', rows: 2, onChange: (e) => setEdit({ ...edit, caption: e.target.value }) }),
            ),
            h('div', { className: 'field' },
              h('label', null, '关键词(空格分隔)'),
              h('input', { type: 'text', value: edit.keywords, placeholder: '搜索用', onChange: (e) => setEdit({ ...edit, keywords: e.target.value }) }),
            ),
            h('div', { className: 'modal-acts' },
              h('button', { onClick: () => setEdit(null) }, '取消'),
              h('button', { className: 'btn-primary', onClick: onSaveEdit }, '保存'),
            ),
          ),
        ) : null,
        // 上传弹窗
        uploadOpen ? h('div', { className: 'meme-modal-mask', onClick: () => setUploadOpen(false) },
          h('div', { className: 'meme-modal', onClick: (e) => e.stopPropagation() },
            h('h3', null, '上传表情包'),
            upFile
              ? h('img', { src: upPreview, alt: upFile.name })
              : h('div', { className: 'empty', style: { padding: '24px', border: '1px dashed var(--dsw-alias-border-l1)', borderRadius: 8 } },
                  h('button', { onClick: () => fileRef.current && fileRef.current.click() }, '选择图片'),
                ),

            h('div', { className: 'field' },
              h('label', null, upFile ? '已选: ' + upFile.name + ' (点击更换)' : '文件'),
              h('input', { type: 'text', placeholder: upFile ? '' : '先选图片', value: '', readOnly: true, style: { display: 'none' } }),
            ),
            h('div', { className: 'field' },
              h('label', null, '分类(必填)'),
              h('div', { className: 'row', style: { width: '100%' } },
                h('select', { value: upTag, onChange: (e) => setUpTag(e.target.value), style: { flex: 1 } },
                  h('option', { value: '' }, '选择分类'),
                  tags.map((t) => h('option', { key: t, value: t }, tagZh(t) + ' (' + t + ')')),
                  h('option', { value: '__new__' }, '+ 新建分类'),
                ),
                h('button', { onClick: onDeleteTag, disabled: !upTag || upTag === '__new__', title: '删除该分类及其中所有表情包' }, '删除分类'),
              ),
              upTag === '__new__'
                ? h('input', { type: 'text', value: upNewTag, placeholder: '新分类名,小写字母/数字/-/_', onChange: (e) => setUpNewTag(e.target.value), style: { width: '100%' } })
                : null,
            ),
            h('div', { className: 'field' },
              h('label', null, '描述'),
              h('textarea', { value: upCaption, placeholder: '如:无语', rows: 2, onChange: (e) => setUpCaption(e.target.value) }),
            ),
            h('div', { className: 'field' },
              h('label', null, '关键词(空格分隔)'),
              h('input', { type: 'text', value: upKeywords, placeholder: '搜索用', onChange: (e) => setUpKeywords(e.target.value) }),
            ),
            h('div', { className: 'modal-acts' },
              h('button', { onClick: () => setUploadOpen(false) }, '取消'),
              h('button', { className: 'btn-primary', onClick: onConfirmUpload, disabled: uploading }, uploading ? '上传中…' : '上传'),
            ),
          ),
        ) : null,
        fileInput,
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
