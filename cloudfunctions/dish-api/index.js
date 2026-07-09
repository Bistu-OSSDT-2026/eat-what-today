const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEFAULT_SCHOOL_ID = 'bistu'
const DEFAULT_SCHOOL_NAME = '北京信息科技大学'
const ADMIN_SESSION_TTL = 2 * 60 * 60 * 1000

const COLLECTIONS = {
  users: 'dish_users',
  dishes: 'dish_dishes',
  categories: 'dish_categories',
  announcements: 'dish_announcements',
  canteens: 'dish_canteens',
  ratings: 'dish_ratings',
  adminSessions: 'dish_admin_sessions',
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

function cleanOptionalString(value) {
  const text = cleanString(value)
  return text || undefined
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
  const sessionToken = cleanString(token)
  if (!sessionToken) throw new Error('请先登录后台')
  const res = await db.collection(COLLECTIONS.adminSessions)
    .where({ token: sessionToken, expiresAt: _.gt(now()) })
    .limit(1)
    .get()
  if (!res.data.length) throw new Error('后台登录已过期')
  return res.data[0]
}

async function registerOrLogin(data) {
  const openid = requireOpenid()
  const nickname = cleanString(data.nickname) || '微信读者'
  const avatarUrl = cleanString(data.avatarUrl)
  const profile = { nickname, avatarUrl }
  const existing = await db.collection(COLLECTIONS.users).where({ openid }).limit(1).get()
  if (existing.data.length) {
    await db.collection(COLLECTIONS.users).doc(existing.data[0]._id).update({
      data: { ...profile, updatedAt: now() },
    })
  } else {
    await db.collection(COLLECTIONS.users).add({
      data: { openid, ...profile, createdAt: now(), updatedAt: now() },
    })
  }
  return { token: openid, profile }
}

async function rankings(data) {
  const schoolId = cleanString(data.schoolId) || DEFAULT_SCHOOL_ID
  const limit = Math.min(Number(data.limit || 20), 100)
  const res = await db.collection(COLLECTIONS.dishes)
    .where({ schoolId, status: 'ACTIVE' })
    .orderBy('rankScore', 'desc')
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get()
  return res.data.map(publicDish)
}

async function categories(data) {
  const schoolId = cleanString(data.schoolId) || DEFAULT_SCHOOL_ID
  const res = await db.collection(COLLECTIONS.categories)
    .where({ schoolId })
    .orderBy('createdAt', 'asc')
    .limit(100)
    .get()
  return res.data.map((row) => ({ id: row._id, name: row.name || '' }))
}

async function announcement(data) {
  const schoolId = cleanString(data.schoolId) || DEFAULT_SCHOOL_ID
  const res = await db.collection(COLLECTIONS.announcements).where({ schoolId }).limit(1).get()
  return res.data.length ? res.data[0].content || '' : ''
}

async function canteenData(data) {
  const schoolId = cleanString(data.schoolId) || DEFAULT_SCHOOL_ID
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
  const schoolId = cleanString(data.schoolId) || DEFAULT_SCHOOL_ID
  const includeOffline = Boolean(data.includeOffline)
  const where = includeOffline ? { schoolId } : { schoolId, status: 'ACTIVE' }
  const res = await db.collection(COLLECTIONS.dishes)
    .where(where)
    .orderBy('updatedAt', 'desc')
    .limit(Math.min(Number(data.limit || 200), 200))
    .get()
  return res.data.map(publicDish)
}

async function createDish(data) {
  requireOpenid()
  const schoolId = cleanString(data.schoolId) || DEFAULT_SCHOOL_ID
  const name = cleanString(data.name)
  if (!name) throw new Error('菜名不能为空')
  const payload = {
    schoolId,
    name,
    categoryName: cleanOptionalString(data.categoryName) || '',
    description: cleanOptionalString(data.description) || '',
    canteenName: cleanOptionalString(data.canteenName) || '',
    floorName: cleanOptionalString(data.floorName) || '',
    shopName: cleanOptionalString(data.shopName) || '',
    imageUrl: cleanOptionalString(data.imageUrl) || '',
    headline: '',
    avgScore: 0,
    ratingCount: 0,
    rankScore: 0,
    status: 'PENDING',
    createdAt: now(),
    updatedAt: now(),
  }
  const result = await db.collection(COLLECTIONS.dishes).add({ data: payload })
  return publicDish({ _id: result._id, ...payload })
}

async function updateDish(data) {
  await requireAdmin(data.token)
  const dishId = cleanString(data.dishId)
  if (!dishId) throw new Error('缺少菜品 ID')
  const patch = data.patch || {}
  const allowFields = ['name', 'categoryName', 'description', 'canteenName', 'floorName', 'shopName', 'imageUrl', 'headline', 'status']
  const payload = { updatedAt: now() }
  allowFields.forEach((field) => {
    if (patch[field] !== undefined) payload[field] = cleanString(patch[field])
  })
  if (payload.status && !['ACTIVE', 'OFFLINE', 'PENDING', 'REJECTED'].includes(payload.status)) {
    throw new Error('菜品状态不合法')
  }
  await db.collection(COLLECTIONS.dishes).doc(dishId).update({ data: payload })
  const res = await db.collection(COLLECTIONS.dishes).doc(dishId).get()
  return publicDish(res.data)
}

async function rateDish(data) {
  const openid = requireOpenid()
  const dishId = cleanString(data.dishId)
  const score = Number(data.score)
  if (!dishId) throw new Error('缺少菜品 ID')
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('评分必须是 1 到 5')

  const dishRes = await db.collection(COLLECTIONS.dishes).doc(dishId).get()
  const dish = dishRes.data
  if (!dish || dish.status !== 'ACTIVE') throw new Error('该菜品暂不可评分')

  const ratingRes = await db.collection(COLLECTIONS.ratings).where({ openid, dishId }).limit(1).get()
  if (ratingRes.data.length) {
    await db.collection(COLLECTIONS.ratings).doc(ratingRes.data[0]._id).update({ data: { score, updatedAt: now() } })
  } else {
    await db.collection(COLLECTIONS.ratings).add({ data: { openid, dishId, score, createdAt: now(), updatedAt: now() } })
  }

  const allRatings = await db.collection(COLLECTIONS.ratings).where({ dishId }).limit(1000).get()
  const ratingCount = allRatings.data.length
  const totalScore = allRatings.data.reduce((sum, item) => sum + Number(item.score || 0), 0)
  const avgScore = ratingCount ? Math.round((totalScore / ratingCount) * 10) / 10 : 0
  const nextRankScore = rankScore(avgScore, ratingCount)
  await db.collection(COLLECTIONS.dishes).doc(dishId).update({
    data: { avgScore, ratingCount, rankScore: nextRankScore, updatedAt: now() },
  })
  return publicDish({ ...dish, avgScore, ratingCount, rankScore: nextRankScore })
}

async function adminLogin(data) {
  const password = cleanString(data.password)
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) throw new Error('后台密码未配置，请在云函数环境变量设置 ADMIN_PASSWORD')
  if (!password || password !== expected) throw new Error('管理密码错误')
  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = now() + ADMIN_SESSION_TTL
  await db.collection(COLLECTIONS.adminSessions).add({
    data: { token, role: 'admin', schoolId: DEFAULT_SCHOOL_ID, createdAt: now(), expiresAt },
  })
  return { token, expiresAt: String(expiresAt), role: 'admin', schoolId: DEFAULT_SCHOOL_ID, schoolName: DEFAULT_SCHOOL_NAME }
}

async function setAnnouncement(data) {
  await requireAdmin(data.token)
  const schoolId = cleanString(data.schoolId) || DEFAULT_SCHOOL_ID
  const content = cleanString(data.content)
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
  const schoolId = cleanString(data.schoolId) || DEFAULT_SCHOOL_ID
  const name = cleanString(data.name)
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
  setAnnouncement,
  createCategory,
}

exports.main = async (event) => {
  try {
    const action = cleanString(event.action)
    if (!handlers[action]) throw new Error('未知操作')
    const data = await handlers[action](event.data || {})
    return ok(data)
  } catch (error) {
    return fail(error && error.message ? error.message : '云函数调用失败')
  }
}
