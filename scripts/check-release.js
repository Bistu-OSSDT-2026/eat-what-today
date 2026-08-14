const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const miniRoot = path.join(root, 'miniprogram')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath))
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(fullPath) : [fullPath]
  })
}

const app = readJson('miniprogram/app.json')
const project = readJson('project.config.json')
const routes = new Set(app.pages)

assert.equal(app.pages[0], 'pages/newspaper/index', '首页路由必须保持第一项')
assert.equal(project.projectname, 'eat-what-today', 'projectname 必须与仓库一致')
assert.equal(project.miniprogramRoot, 'miniprogram/', 'miniprogramRoot 配置错误')
assert.equal(project.cloudfunctionRoot, 'cloudfunctions/', 'cloudfunctionRoot 配置错误')
assert.equal(app.__usePrivacyCheck__, true, '必须启用微信隐私授权检查')

for (const route of routes) {
  for (const extension of ['.json', '.wxml', '.scss', '.ts']) {
    assert.ok(fs.existsSync(path.join(miniRoot, `${route}${extension}`)), `缺少页面文件: ${route}${extension}`)
  }

  const wxml = fs.readFileSync(path.join(miniRoot, `${route}.wxml`), 'utf8')
  const source = fs.readFileSync(path.join(miniRoot, `${route}.ts`), 'utf8')
  const eventNames = [...wxml.matchAll(/\b(?:bind|catch)[a-z:]*="([^"]+)"/g)].map((match) => match[1])
  for (const eventName of eventNames) {
    assert.ok(source.includes(`${eventName}(`), `${route} 缺少事件方法: ${eventName}`)
  }
}

const pageWxmlFiles = walk(path.join(miniRoot, 'pages')).filter((file) => file.endsWith('.wxml'))
for (const file of pageWxmlFiles) {
  const route = path.relative(miniRoot, file).replace(/\.wxml$/, '')
  assert.ok(routes.has(route), `发现未注册页面: ${route}`)
}

for (const file of walk(root).filter((entry) => entry.endsWith('.json') && !entry.includes('node_modules'))) {
  JSON.parse(fs.readFileSync(file, 'utf8'))
}

const cloudSource = read('cloudfunctions/dish-api/index.js')
const apiSource = read('miniprogram/utils/api.ts')
assert.match(cloudSource, /if \(includeOffline\) await requireAdmin\(data\.token\)/, '离线菜品读取缺少管理员校验')
assert.match(cloudSource, /process\.env\.ADMIN_PASSWORD/, '后台密码必须来自云函数环境变量')
assert.doesNotMatch(cloudSource, /ADMIN_PASSWORD\s*=\s*['"]/, '禁止在源码硬编码后台密码')
assert.match(cloudSource, /res\.data\[0\]\.openid !== openid/, '管理员会话必须绑定微信身份')
assert.match(cloudSource, /ADMIN_LOGIN_MAX_ATTEMPTS = 5/, '管理员登录必须限制失败次数')
assert.match(cloudSource, /async function adminLogout\(data\).*requireAdmin\(data\.token\)/s, '管理员退出必须撤销云端会话')
assert.match(cloudSource, /await ensureCollections\(\)/, '云函数首次运行必须自动准备集合')
assert.match(cloudSource, /async function createDish\(data\) \{\s+const user = await requireRegisteredUser\(\)/, '投稿必须服务端校验用户身份')
assert.match(cloudSource, /async function rateDish\(data\) \{\s+const user = await requireRegisteredUser\(\)/, '评分必须服务端校验用户身份')
assert.match(cloudSource, /createdBy: openid/, '投稿必须记录服务端微信身份')
assert.doesNotMatch(cloudSource, /return \{ token: openid/, '禁止把 openid 作为用户令牌返回客户端')
assert.match(cloudSource, /cloud\.openapi\.security\.msgSecCheck/, '用户文本必须接入微信内容安全')
assert.match(cloudSource, /cloud\.openapi\.security\.imgSecCheck/, '投稿图片必须接入微信内容安全')
assert.match(cloudSource, /MAX_IMAGE_BYTES = 5 \* 1024 \* 1024/, '服务端必须限制图片大小')
assert.match(cloudSource, /USER_SUBMIT_INTERVAL = 30 \* 1000/, '用户投稿必须限制频率')
assert.match(cloudSource, /return suggest === 'pass' \? 'pass' : 'review'/, '未知文本检测结果必须转人工审核')
assert.match(cloudSource, /return code === 0 \? 'pass' : 'review'/, '未知图片检测结果必须转人工审核')
assert.match(cloudSource, /crypto\.createHash\('sha256'\).*openid.*dishId/, '评分记录必须按用户和菜品确定性去重')
assert.match(cloudSource, /return db\.runTransaction/, '评分汇总必须在事务中更新')
assert.doesNotMatch(cloudSource, /allRatings.*limit\(1000\)/, '评分汇总不能依赖固定条数扫描')
assert.doesNotMatch(apiSource, /getStoredToken|setStorageSync\(LEGACY_USER_TOKEN_STORAGE_KEY|getStorageSync\(LEGACY_USER_TOKEN_STORAGE_KEY/, '客户端不应读取或写入旧微信 openid 令牌')
assert.match(apiSource, /removeStorageSync\(LEGACY_USER_TOKEN_STORAGE_KEY\)/, '升级时必须删除旧微信 openid 令牌')

const cloudPackage = readJson('cloudfunctions/dish-api/package.json')
assert.notEqual(cloudPackage.dependencies['wx-server-sdk'], 'latest', '云函数依赖必须固定版本')
assert.match(read('.gitignore'), /^project\.private\.config\.json$/m, '私有开发者工具配置必须忽略')

console.log(`Release checks passed: ${routes.size} pages`)
