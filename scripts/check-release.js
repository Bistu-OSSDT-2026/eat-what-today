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
const globalInjectedEventNames = new Set(['__hapticTap'])
const appSource = read('miniprogram/app.ts')
const hapticPath = path.join(miniRoot, 'utils/haptic.ts')

assert.equal(app.pages[0], 'pages/newspaper/index', '首页路由必须保持第一项')
assert.equal(app.rendererOptions?.skyline?.tagNameStyleIsolation, undefined, '不得恢复已失效的 Skyline tagNameStyleIsolation 配置')
assert.equal(project.projectname, 'eat-what-today', 'projectname 必须与仓库一致')
assert.equal(project.miniprogramRoot, 'miniprogram/', 'miniprogramRoot 配置错误')
assert.equal(project.cloudfunctionRoot, 'cloudfunctions/', 'cloudfunctionRoot 配置错误')
assert.equal(app.__usePrivacyCheck__, true, '必须启用微信隐私授权检查')
assert.ok(fs.existsSync(hapticPath), '缺少全局震动实现: miniprogram/utils/haptic.ts')

const hapticSource = fs.readFileSync(hapticPath, 'utf8')
assert.match(appSource, /import\s*\{\s*enhancePageOptions\s*\}\s*from\s*['"]\.\/utils\/haptic['"]/, 'app.ts 未导入 haptic Page wrapper')
assert.match(appSource, /originalPage\(enhancePageOptions\(options\)\)/, 'app.ts 未使用 haptic Page wrapper')
assert.match(appSource, /Page = patchedPage/, 'app.ts 未安装 haptic Page wrapper')
assert.match(appSource, /^installHapticPageWrapper\(\)$/m, 'app.ts 未启用 haptic Page wrapper')
assert.match(hapticSource, /export function enhancePageOptions\b/, 'haptic.ts 缺少 enhancePageOptions')
assert.match(hapticSource, /HAPTIC_TAP_METHOD\s*=\s*['"]__hapticTap['"]/, 'haptic.ts 缺少 __hapticTap')
assert.match(hapticSource, /options\[HAPTIC_TAP_METHOD\]\s*=/, 'haptic.ts 未注入 __hapticTap')
assert.match(hapticSource, /DEDUPE_INTERVAL\s*=\s*80\b/, 'haptic.ts 震动去重必须为 80ms')
assert.match(hapticSource, /now - lastVibrateAt < DEDUPE_INTERVAL/, 'haptic.ts 未应用 80ms 震动去重')

for (const route of routes) {
  for (const extension of ['.json', '.wxml', '.scss', '.ts']) {
    assert.ok(fs.existsSync(path.join(miniRoot, `${route}${extension}`)), `缺少页面文件: ${route}${extension}`)
  }

  const wxml = fs.readFileSync(path.join(miniRoot, `${route}.wxml`), 'utf8')
  const source = fs.readFileSync(path.join(miniRoot, `${route}.ts`), 'utf8')
  const eventNames = [...wxml.matchAll(/\b(?:bind|catch)[a-z:]*\s*=\s*"([^"]+)"/g)].map((match) => match[1])
  for (const eventName of eventNames) {
    if (globalInjectedEventNames.has(eventName)) continue
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
const appStyle = read('miniprogram/app.scss')
const homeWxml = read('miniprogram/pages/newspaper/index.wxml')
const homeSource = read('miniprogram/pages/newspaper/index.ts')
const homeStyle = read('miniprogram/pages/newspaper/index.scss')
const adminSource = read('miniprogram/pages/admin/index.ts')
const miniProgramText = walk(miniRoot)
  .filter((file) => /\.(?:js|json|scss|svg|ts|wxml|wxss)$/.test(file))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n')
assert.match(homeWxml, /<view[^>]*class="brand-block"[^>]*bindlongpress="openAdmin"/, '首页必须保留长按管理员入口')
assert.match(homeWxml, /class="decision-reel \{\{randomRolling \? 'is-rolling' : ''\}\} \{\{randomSettleDirection \? 'is-settling' : ''\}\}"/, '随机推荐必须保留老虎机滚轮')
assert.match(homeWxml, /data-mode="food"[^>]*bindtap="switchDecisionMode"[^>]*>\s*吃什么\s*<\/view>/s, '决定卡缺少“吃什么”切换')
assert.match(homeWxml, /data-mode="drink"[^>]*bindtap="switchDecisionMode"[^>]*>\s*喝什么\s*<\/view>/s, '决定卡缺少“喝什么”切换')
assert.match(homeSource, /RANDOM_ROLL_DURATION\s*=\s*1600\b/, '老虎机滚轮时长必须为 1600ms')
assert.match(homeSource, /RANDOM_ROLL_FRAME_DELAY\s*=\s*64\b/, '老虎机滚轮必须留出末帧收尾时间')
assert.match(homeSource, /RANDOM_SETTLE_STEP_DURATION\s*=\s*180\b/, '老虎机滚轮必须保留整格回弹')
assert.match(homeSource, /RANDOM_REEL_ITEM_COUNT\s*=\s*10\b/, '老虎机滚轮格数必须满足连续滚动')
assert.match(homeSource, /const sampleDrinks:\s*RandomPick\[\]\s*=/, '饮品模式缺少本地兜底数据')
assert.match(homeSource, /function buildDrinkPool\(dishes:\s*DisplayDish\[\]\):\s*RandomPick\[\]/, '饮品模式缺少饮品池')
for (const keyword of ['饮品', '饮料', '奶茶', '咖啡', '果汁', '冷饮']) {
  assert.ok(homeSource.includes(`'${keyword}'`), `饮品池缺少分类关键词: ${keyword}`)
}
assert.match(homeSource, /return matched\.length \? matched : sampleDrinks/, '饮品池无数据时必须使用 sampleDrinks')
assert.match(homeSource, /function buildRandomReel\(pool:\s*RandomPick\[\],\s*current:\s*RandomPick\)/, '两种模式必须共用 pool 入参的滚轮')
assert.match(homeSource, /current\.key && pool\.some\(\(item\) => item\.key === current\.key\)/, '切换模式后旧结果不能混入新滚轮')
assert.match(homeSource, /decisionMode:\s*'food'/, '决定卡默认模式必须为吃什么')
assert.match(homeSource, /switchDecisionMode\([^)]*\)[\s\S]*sequence !== this\.randomRollSequence[\s\S]*this\.rollRandomPick\(\)/, '快速切换必须只启动最新一次滚动')
assert.match(homeSource, /items:\s*\[guardPick,\s*\.\.\.reversedPicks\]\.map\(toRandomReelItem\)/, '老虎机滚轮必须保留上下候选位')
assert.match(homeSource, /const guardPick = pickFromPool\(pool,\s*\[reversedPicks\[0\]\.key\]\)/, '老虎机上一项必须与最终结果不同')
assert.match(homeSource, /randomReelOffset:\s*-\(items\.length - 1\) \* RANDOM_REEL_ITEM_HEIGHT/, '老虎机滚轮必须从顶部外侧开始')
assert.match(homeSource, /randomReel:\s*this\.randomRollActive/, '数据刷新不能重置活动中的老虎机滚轮')
assert.match(homeSource, /randomPick:\s*this\.randomRollActive \? currentRandom : nextRandom/, '数据刷新不能替换活动中的老虎机结果')
assert.match(homeStyle, /\.decision-reel\.is-rolling\s*\{[^}]*transition:\s*transform 1600ms/s, '老虎机滚轮样式时长必须与逻辑一致')
const rollingResultRule = homeStyle.match(
  /\.decision-reel\.is-rolling \.decision-result,\s*\.decision-reel\.is-settling \.decision-result\s*\{([^}]*)\}/s,
)?.[1] || ''
const disabledButtonRule = homeStyle.match(/\.decision-button\.is-disabled\s*\{([^}]*)\}/s)?.[1] || ''
const decisionButtonTag = homeWxml.match(/<button\b(?=[^>]*class="decision-button)[^>]*>/s)?.[0] || ''
assert.match(rollingResultRule, /flex-direction:\s*row/, '老虎机滚动时菜名和地点必须保持同组')
assert.match(homeWxml, /class="decision-button \{\{randomRolling \|\| randomSettleDirection \? 'is-disabled' : ''\}\}"/, '老虎机按钮必须使用自定义禁用态')
assert.ok(decisionButtonTag, '缺少老虎机按钮')
assert.doesNotMatch(decisionButtonTag, /(?:^|\s)disabled\s*=/, '老虎机按钮不得使用会洗灰文字的原生禁用态')
assert.match(disabledButtonRule, /color:\s*var\(--color-ink\)/, '老虎机滚动提示必须保持可读')
assert.match(disabledButtonRule, /pointer-events:\s*none/, '老虎机自定义禁用态必须拦截点击')
assert.doesNotMatch(disabledButtonRule, /opacity:\s*0(?:\.\d+)?/, '老虎机滚动提示不得降低整体透明度')
assert.match(homeSource, /rollRandomPick\(\)\s*\{\s*if \(this\.randomRollActive \|\| this\.data\.randomRolling \|\| this\.data\.randomSettleDirection\) return/, '老虎机滚动中必须同步拒绝重复点击')
assert.match(homeSource, /settleDirection === 'settle-prev'[\s\S]*finalOffset - RANDOM_REEL_ITEM_HEIGHT/, '老虎机滚轮必须随机偏移到上一个或下一个')
assert.match(homeSource, /onHide\(\)[\s\S]*randomRollSequence \+= 1[\s\S]*clearRandomRollTimers\(\)/, '切走页面时必须作废并终止老虎机滚轮')
assert.match(homeSource, /homeLoadSequence:\s*0/, '首页数据加载缺少请求序号')
assert.match(homeSource, /const sequence = this\.homeLoadSequence[\s\S]*sequence !== this\.homeLoadSequence/, '旧首页请求不能覆盖新请求')
assert.match(homeSource, /pageDestroyed:\s*false[\s\S]*onUnload\(\)[\s\S]*pageDestroyed = true/, '页面卸载后必须作废异步续体')
assert.match(homeSource, /pageVisible:\s*false[\s\S]*onHide\(\)[\s\S]*pageVisible = false[\s\S]*wx\.hideLoading\(\)/, '页面隐藏后必须收回本页全局加载提示')
assert.match(homeSource, /await rateDish\([^)]*\)[\s\S]*if \(this\.pageDestroyed\) return/, '评分完成后必须检查页面是否已销毁')
assert.match(homeSource, /await uploadDish\([\s\S]*if \(this\.pageDestroyed\) return/, '投稿完成后必须检查页面是否已销毁')
assert.match(homeSource, /if \(this\.pageVisible\) wx\.showToast\(\{ title: '已评分'/, '评分结果只能在首页可见时提示')
assert.match(homeSource, /if \(this\.pageVisible\) wx\.showToast\(\{ title: '已提交'/, '投稿结果只能在首页可见时提示')
assert.doesNotMatch(homeSource, /randomPick:\s*final[\s\S]{0,300}mediumHaptic\(\)/, '老虎机落定不得重复触发第二次震动')
assert.match(homeSource, /dishId\.startsWith\('sample-'\)/, '样例菜品必须保持禁止评分')
assert.match(homeSource, /rankingRows:\s*this\.dishes\.slice\(0,\s*6\)/, '榜单数据必须保留榜首供放大卡展示')
assert.match(homeWxml, /wx:for="\{\{rankingRows\}\}"[\s\S]*wx:if="\{\{index > 0\}\}"[\s\S]*\{\{index \+ 1\}\}/, '榜单普通行必须从第 2 名开始')

const reelHeight = Number(homeSource.match(/RANDOM_REEL_ITEM_HEIGHT\s*=\s*(\d+)/)?.[1])
const slotHeight = Number(homeStyle.match(/\.decision-slot\s*\{[^}]*\bheight:\s*(\d+)rpx/s)?.[1])
const resultHeight = Number(homeStyle.match(/\.decision-result\s*\{[^}]*\bheight:\s*(\d+)rpx/s)?.[1])
assert.equal(reelHeight, 148, '老虎机单格逻辑高度必须为 148rpx')
assert.equal(slotHeight, reelHeight, 'decision-slot 高度必须与老虎机逻辑高度一致')
assert.equal(resultHeight, reelHeight, 'decision-result 高度必须与老虎机逻辑高度一致')
assert.match(appStyle, /--stroke-heavy:\s*4rpx/, '强调层描边必须为 4rpx')
assert.match(appStyle, /--stroke-base:\s*3rpx/, '主要层描边必须为 3rpx')
assert.match(appStyle, /--stroke-light:\s*2rpx/, '次要层描边必须为 2rpx')
assert.match(appStyle, /button\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*justify-content:\s*center/s, '按钮文字必须水平垂直居中')
assert.match(appStyle, /--color-brand:\s*#a34a16/, '品牌主色不得回退为蓝色')
assert.match(appStyle, /--color-teal:\s*#1b6e67/, '辅助主色必须保持青绿色')
assert.doesNotMatch(miniProgramText, /backdrop-filter\s*:/, '小程序样式不得残留 backdrop-filter')
assert.doesNotMatch(miniProgramText, /#(?:1c1b1b|000(?:000)?)\b/i, '小程序不得残留黑色描边或文字色')
assert.doesNotMatch(miniProgramText, /#(?:2170e4|2563eb|2e6be6|1d4ed8|3b82f6)\b|rgba?\(\s*33\s*,\s*112\s*,\s*228/i, '小程序不得回退为旧蓝色主题')
assert.doesNotMatch(miniProgramText, /font-weight:\s*(?:800|900)\b/, '小程序样式不得残留 800/900 伪粗体')
assert.doesNotMatch(miniProgramText, /transform:\s*scale\(/, '按钮按压不得使用缩放反馈')
assert.match(
  homeStyle,
  /background-image:\s*repeating-linear-gradient\(45deg[\s\S]*repeating-linear-gradient\(-45deg/,
  '首页必须保留极淡双向格纹',
)
assert.match(homeSource, /submitSheetSequence === this\.submitSheetSequence && this\.data\.showSubmitSheet/, '旧投稿请求不能关闭新投稿面板')
assert.match(adminSource, /editSheetSequence === this\.editSheetSequence[\s\S]*this\.data\.editingDishId === editingDishId/, '旧保存请求不能关闭新菜品编辑面板')
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
