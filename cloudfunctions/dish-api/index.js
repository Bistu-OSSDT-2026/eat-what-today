const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEFAULT_SCHOOL_ID = 'bistu'
const DEFAULT_SCHOOL_NAME = '北京信息科技大学'
const ADMIN_SESSION_TTL = 2 * 60 * 60 * 1000
const ADMIN_LOGIN_WINDOW = 15 * 60 * 1000
const ADMIN_LOGIN_MAX_ATTEMPTS = 5
const USER_SUBMIT_INTERVAL = 30 * 1000
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const COLLECTIONS = {
  users: 'dish_users',
  dishes: 'dish_dishes',
  categories: 'dish_categories',
  announcements: 'dish_announcements',
  canteens: 'dish_canteens',
  ratings: 'dish_ratings',
  adminSessions: 'dish_admin_sessions',
  adminLoginAttempts: 'dish_admin_login_attempts',
}

let collectionSetupPromise

function isCollectionExistsError(error) {
  const message = String(error && (error.errMsg || error.message || error))
  return /already exists|collection.*exist|已存在/i.test(message)
}

async function ensureCollections() {
  if (!collectionSetupPromise) {
    collectionSetupPromise = Promise.all(Object.values(COLLECTIONS).map(async (name) => {
      try {
        await db.createCollection(name)
      } catch (error) {
        if (!isCollectionExistsError(error)) throw error
      }
    })).catch((error) => {
      collectionSetupPromise = null
      throw error
    })
  }
  await collectionSetupPromise
}

function ok(data) {
  return { success: true, data }
}

function fail(message) {
  return { success: false, message }
}

function now() {
  return Date.now()
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function limitedString(value, maxLength, label) {
  const text = cleanString(value)
  if (text.length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符`)
  return text
}

function boundedLimit(value, fallback, maximum) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(Math.floor(parsed), maximum)
}

function contentRiskError(message) {
  const error = new Error(message)
  error.code = 'CONTENT_RISKY'
  return error
}

function openApiErrorCode(value) {
  return Number(value && (value.errCode != null ? value.errCode : value.errcode)) || 0
}

async function checkTextContent(openid, content) {
  if (!content) return 'pass'
  try {
    const result = await cloud.openapi.security.msgSecCheck({
      version: 2,
      scene: 2,
      openid,
      content,
    })
    const suggest = result && result.result && result.result.suggest
    if (suggest === 'risky' || openApiErrorCode(result) === 87014) {
      throw contentRiskError('内容包含违规信息，请修改后重试')
    }
    return suggest === 'pass' ? 'pass' : 'review'
  } catch (error) {
    if (error && (error.code === 'CONTENT_RISKY' || openApiErrorCode(error) === 87014)) {
      throw contentRiskError('内容包含违规信息，请修改后重试')
    }
    console.warn('文本内容安全检查转人工审核:', error && (error.errMsg || error.message || error))
    return 'review'
  }
}

function imageContentType(fileId) {
  const extension = cleanString(fileId).split('?')[0].split('.').pop().toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'gif') return 'image/gif'
  if (extension === 'webp') return 'image/webp'
  return 'image/jpeg'
}

async function checkImageContent(fileId, allowRemote = false) {
  if (!fileId) return 'none'
  if (allowRemote && /^https?:\/\//.test(fileId)) return 'review'
  if (!fileId.startsWith('cloud://')) throw new Error('投稿图片必须来自当前小程序云存储')
  try {
    const file = await cloud.downloadFile({ fileID: fileId })
    if (!file.fileContent || file.fileContent.length > MAX_IMAGE_BYTES) {
      const error = new Error('图片不能超过 5MB')
      error.code = 'IMAGE_TOO_LARGE'
      throw error
    }
    const result = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: imageContentType(fileId),
        value: file.fileContent,
      },
    })
    const code = openApiErrorCode(result)
    if (code === 87014) throw contentRiskError('图片包含违规信息，请更换后重试')
    return code === 0 ? 'pass' : 'review'
  } catch (error) {
    if (error && error.code === 'IMAGE_TOO_LARGE') throw error
    if (error && (error.code === 'CONTENT_RISKY' || openApiErrorCode(error) === 87014)) {
      throw contentRiskError('图片包含违规信息，请更换后重试')
    }
    console.warn('图片内容安全检查转人工审核:', error && (error.errMsg || error.message || error))
    return 'review'
  }
}

function safePasswordEquals(value, expected) {
  const valueBuffer = Buffer.from(value)
  const expectedBuffer = Buffer.from(expected)
  if (valueBuffer.length !== expectedBuffer.length) return false
  return crypto.timingSafeEqual(valueBuffer, expectedBuffer)
}

function publicDish(row) {
  return {
    id: row._id,
    name: row.name || '',
    description: row.description || '',
    imageUrl: row.imageUrl || '',
    categoryName: row.categoryName || '',
    canteenName: row.canteenName || '',
    floorName: row.floorName || '',
    shopName: row.shopName || '',
    headline: row.headline || '',
    avgScore: Number(row.avgScore || 0),
    ratingCount: Number(row.ratingCount || 0),
    status: row.status || 'ACTIVE',
    rankScore: Number(row.rankScore || 0),
  }
}

function rankScore(avgScore, ratingCount) {
  return Number(avgScore || 0) * 1000 + Number(ratingCount || 0)
}

function requireOpenid() {
  const context = cloud.getWXContext()
  if (!context.OPENID) throw new Error('无法获取微信身份')
  return context.OPENID
}

async function requireAdmin(token) {
  const openid = requireOpenid()
  const sessionToken = cleanString(token)
  if (!sessionToken) throw new Error('请先登录后台')
  const res = await db.collection(COLLECTIONS.adminSessions)
    .where({ token: sessionToken, expiresAt: _.gt(now()) })
    .limit(1)
    .get()
  if (!res.data.length) throw new Error('后台登录已过期')
  if (res.data[0].openid !== openid) throw new Error('管理员身份不匹配')
  return res.data[0]
}

async function requireRegisteredUser() {
  const openid = requireOpenid()
  const res = await db.collection(COLLECTIONS.users).where({ openid }).limit(1).get()
  if (!res.data.length) throw new Error('请先设置个人资料')
  return res.data[0]
}

async function getAdminLoginAttempt(openid) {
  const res = await db.collection(COLLECTIONS.adminLoginAttempts).where({ openid }).limit(1).get()
  return res.data[0] || null
}

async function recordAdminLoginFailure(openid, existing) {
  const timestamp = now()
  const withinWindow = existing && timestamp - Number(existing.windowStartedAt || 0) < ADMIN_LOGIN_WINDOW
  const count = withinWindow ? Number(existing.count || 0) + 1 : 1
  const lockedUntil = count >= ADMIN_LOGIN_MAX_ATTEMPTS ? timestamp + ADMIN_LOGIN_WINDOW : 0
  const data = {
    count,
    windowStartedAt: withinWindow ? existing.windowStartedAt : timestamp,
    lockedUntil,
    updatedAt: timestamp,
  }

  if (existing) {
    await db.collection(COLLECTIONS.adminLoginAttempts).doc(existing._id).update({ data })
  } else {
    await db.collection(COLLECTIONS.adminLoginAttempts).add({
      data: { openid, ...data, createdAt: timestamp },
    })
  }
  return lockedUntil
}

async function registerOrLogin(data) {
  const openid = requireOpenid()
  const nickname = limitedString(data.nickname, 20, '昵称') || '微信读者'
  const avatarUrl = limitedString(data.avatarUrl, 2048, '头像地址')
  const nicknameModeration = await checkTextContent(openid, nickname)
  const avatarModeration = await checkImageContent(avatarUrl, true)
  const profile = { nickname, avatarUrl }
  const existing = await db.collection(COLLECTIONS.users).where({ openid }).limit(1).get()
  if (existing.data.length) {
    await db.collection(COLLECTIONS.users).doc(existing.data[0]._id).update({
      data: { ...profile, nicknameModeration, avatarModeration, updatedAt: now() },
    })
  } else {
    await db.collection(COLLECTIONS.users).add({
      data: { openid, ...profile, nicknameModeration, avatarModeration, createdAt: now(), updatedAt: now() },
    })
  }
  return { profile }
}

async function rankings(data) {
  const schoolId = limitedString(data.schoolId, 64, '学校 ID') || DEFAULT_SCHOOL_ID
  const limit = boundedLimit(data.limit, 20, 100)
  const res = await db.collection(COLLECTIONS.dishes)
    .where({ schoolId, status: 'ACTIVE' })
    .orderBy('rankScore', 'desc')
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get()
  return res.data.map(publicDish)
}

async function categories(data) {
  const schoolId = limitedString(data.schoolId, 64, '学校 ID') || DEFAULT_SCHOOL_ID
  const res = await db.collection(COLLECTIONS.categories)
    .where({ schoolId })
    .orderBy('createdAt', 'asc')
    .limit(100)
    .get()
  return res.data.map((row) => ({ id: row._id, name: row.name || '' }))
}

async function announcement(data) {
  const schoolId = limitedString(data.schoolId, 64, '学校 ID') || DEFAULT_SCHOOL_ID
  const res = await db.collection(COLLECTIONS.announcements).where({ schoolId }).limit(1).get()
  return res.data.length ? res.data[0].content || '' : ''
}

async function canteenData(data) {
  const schoolId = limitedString(data.schoolId, 64, '学校 ID') || DEFAULT_SCHOOL_ID
  const res = await db.collection(COLLECTIONS.canteens).where({ schoolId }).limit(100).get()
  return res.data.map((row) => ({
    _id: row._id,
    id: row._id,
    schoolId: row.schoolId,
    name: row.name || '',
    floors: Array.isArray(row.floors) ? row.floors : [],
  }))
}

async function dishes(data) {
  const schoolId = limitedString(data.schoolId, 64, '学校 ID') || DEFAULT_SCHOOL_ID
  const includeOffline = Boolean(data.includeOffline)
  if (includeOffline) await requireAdmin(data.token)
  const where = includeOffline ? { schoolId } : { schoolId, status: 'ACTIVE' }
  const res = await db.collection(COLLECTIONS.dishes)
    .where(where)
    .orderBy('updatedAt', 'desc')
    .limit(boundedLimit(data.limit, 200, 200))
    .get()
  return res.data.map(publicDish)
}

async function createDish(data) {
  const user = await requireRegisteredUser()
  const openid = user.openid
  if (now() - Number(user.lastDishSubmittedAt || 0) < USER_SUBMIT_INTERVAL) {
    throw new Error('提交太频繁，请稍后再试')
  }
  const schoolId = limitedString(data.schoolId, 64, '学校 ID') || DEFAULT_SCHOOL_ID
  const name = limitedString(data.name, 40, '菜名')
  if (!name) throw new Error('菜名不能为空')
  const payload = {
    schoolId,
    name,
    categoryName: limitedString(data.categoryName, 24, '分类名'),
    description: limitedString(data.description, 160, '描述'),
    canteenName: limitedString(data.canteenName, 40, '食堂名'),
    floorName: limitedString(data.floorName, 24, '楼层'),
    shopName: limitedString(data.shopName, 40, '窗口名'),
    imageUrl: limitedString(data.imageUrl, 2048, '图片地址'),
    headline: '',
    avgScore: 0,
    ratingCount: 0,
    rankScore: 0,
    status: 'PENDING',
    createdBy: openid,
    createdAt: now(),
    updatedAt: now(),
  }
  const textContent = [
    payload.name,
    payload.categoryName,
    payload.description,
    payload.canteenName,
    payload.floorName,
    payload.shopName,
  ].filter(Boolean).join('\n')
  const textModeration = await checkTextContent(openid, textContent)
  const imageModeration = await checkImageContent(payload.imageUrl)
  payload.moderation = {
    text: textModeration,
    image: imageModeration,
    checkedAt: now(),
  }
  const result = await db.collection(COLLECTIONS.dishes).add({ data: payload })
  await db.collection(COLLECTIONS.users).doc(user._id).update({
    data: { lastDishSubmittedAt: now(), updatedAt: now() },
  })
  return publicDish({ _id: result._id, ...payload })
}

async function updateDish(data) {
  await requireAdmin(data.token)
  const dishId = cleanString(data.dishId)
  if (!dishId) throw new Error('缺少菜品 ID')
  const patch = data.patch || {}
  const fieldLimits = {
    name: 40,
    categoryName: 24,
    description: 160,
    canteenName: 40,
    floorName: 24,
    shopName: 40,
    imageUrl: 2048,
    headline: 120,
    status: 16,
  }
  const payload = { updatedAt: now() }
  Object.keys(fieldLimits).forEach((field) => {
    if (patch[field] !== undefined) payload[field] = limitedString(patch[field], fieldLimits[field], field)
  })
  if (payload.status && !['ACTIVE', 'OFFLINE', 'PENDING', 'REJECTED'].includes(payload.status)) {
    throw new Error('菜品状态不合法')
  }
  await db.collection(COLLECTIONS.dishes).doc(dishId).update({ data: payload })
  const res = await db.collection(COLLECTIONS.dishes).doc(dishId).get()
  return publicDish(res.data)
}

async function rateDish(data) {
  const user = await requireRegisteredUser()
  const openid = user.openid
  const dishId = cleanString(data.dishId)
  const score = Number(data.score)
  if (!dishId) throw new Error('缺少菜品 ID')
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('评分必须是 1 到 5')

  const ratingId = crypto.createHash('sha256').update(`${openid}:${dishId}`).digest('hex')
  return db.runTransaction(async (transaction) => {
    const dishRef = transaction.collection(COLLECTIONS.dishes).doc(dishId)
    const ratingRef = transaction.collection(COLLECTIONS.ratings).doc(ratingId)
    const dishRes = await dishRef.get()
    const dish = dishRes.data
    if (!dish || dish.status !== 'ACTIVE') throw new Error('该菜品暂不可评分')

    const ratingRes = await transaction.collection(COLLECTIONS.ratings)
      .where({ _id: ratingId })
      .limit(1)
      .get()
    const previous = ratingRes.data[0]
    const previousScore = previous ? Number(previous.score || 0) : 0
    const currentCount = Number(dish.ratingCount || 0)
    const currentTotal = Number.isFinite(Number(dish.ratingTotal))
      ? Number(dish.ratingTotal)
      : Number(dish.avgScore || 0) * currentCount
    const ratingCount = previous ? currentCount : currentCount + 1
    const ratingTotal = currentTotal - previousScore + score
    const avgScore = ratingCount ? Math.round((ratingTotal / ratingCount) * 10) / 10 : 0
    const nextRankScore = rankScore(avgScore, ratingCount)
    const timestamp = now()

    await ratingRef.set({
      data: {
        openid,
        dishId,
        score,
        createdAt: previous ? previous.createdAt : timestamp,
        updatedAt: timestamp,
      },
    })
    await dishRef.update({
      data: {
        avgScore,
        ratingCount,
        ratingTotal,
        rankScore: nextRankScore,
        updatedAt: timestamp,
      },
    })
    return publicDish({ ...dish, avgScore, ratingCount, rankScore: nextRankScore })
  })
}

async function adminLogin(data) {
  const openid = requireOpenid()
  const password = limitedString(data.password, 128, '管理密码')
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) throw new Error('后台密码未配置，请在云函数环境变量设置 ADMIN_PASSWORD')
  const attempt = await getAdminLoginAttempt(openid)
  if (attempt && Number(attempt.lockedUntil || 0) > now()) {
    throw new Error('登录尝试过多，请 15 分钟后再试')
  }
  if (!password || !safePasswordEquals(password, expected)) {
    const lockedUntil = await recordAdminLoginFailure(openid, attempt)
    if (lockedUntil > now()) throw new Error('登录尝试过多，请 15 分钟后再试')
    throw new Error('管理密码错误')
  }
  if (attempt) await db.collection(COLLECTIONS.adminLoginAttempts).doc(attempt._id).remove()
  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = now() + ADMIN_SESSION_TTL
  await db.collection(COLLECTIONS.adminSessions).add({
    data: { token, openid, role: 'admin', schoolId: DEFAULT_SCHOOL_ID, createdAt: now(), expiresAt },
  })
  return { token, expiresAt: String(expiresAt), role: 'admin', schoolId: DEFAULT_SCHOOL_ID, schoolName: DEFAULT_SCHOOL_NAME }
}

async function adminLogout(data) {
  const session = await requireAdmin(data.token)
  await db.collection(COLLECTIONS.adminSessions).doc(session._id).remove()
  return true
}

async function setAnnouncement(data) {
  await requireAdmin(data.token)
  const schoolId = limitedString(data.schoolId, 64, '学校 ID') || DEFAULT_SCHOOL_ID
  const content = limitedString(data.content, 160, '公告')
  const existing = await db.collection(COLLECTIONS.announcements).where({ schoolId }).limit(1).get()
  if (existing.data.length) {
    await db.collection(COLLECTIONS.announcements).doc(existing.data[0]._id).update({ data: { content, updatedAt: now() } })
  } else {
    await db.collection(COLLECTIONS.announcements).add({ data: { schoolId, content, createdAt: now(), updatedAt: now() } })
  }
  return true
}

async function createCategory(data) {
  await requireAdmin(data.token)
  const schoolId = limitedString(data.schoolId, 64, '学校 ID') || DEFAULT_SCHOOL_ID
  const name = limitedString(data.name, 24, '分类名')
  if (!name) throw new Error('分类名不能为空')
  const existing = await db.collection(COLLECTIONS.categories).where({ schoolId, name }).limit(1).get()
  if (existing.data.length) return { id: existing.data[0]._id, name: existing.data[0].name }
  const result = await db.collection(COLLECTIONS.categories).add({ data: { schoolId, name, createdAt: now(), updatedAt: now() } })
  return { id: result._id, name }
}

const handlers = {
  registerOrLogin,
  rankings,
  categories,
  announcement,
  canteenData,
  dishes,
  createDish,
  updateDish,
  rateDish,
  adminLogin,
  adminLogout,
  setAnnouncement,
  createCategory,
}

exports.main = async (event) => {
  try {
    const action = cleanString(event.action)
    if (!handlers[action]) throw new Error('未知操作')
    await ensureCollections()
    const data = await handlers[action](event.data || {})
    return ok(data)
  } catch (error) {
    return fail(error && error.message ? error.message : '云函数调用失败')
  }
}
