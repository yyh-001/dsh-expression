/**
 * dsh-expression-entry — 设置页入口(Host 半边)。
 *
 * 挂载在 host loader(profile bundles)以让 dsh-client-modules 扫描到本包的
 * client 半边;Host 半边无副作用。管理能力本体由 dsh-expression 提供
 * (/memes-panel 页面 + /dsh-memes-api)。
 */
export const name = 'dsh-expression-entry'
export const inject = []

export function apply() {
  // 无 host 逻辑:入口与面板都由 webServer 路由与 client 半边承担。
}
