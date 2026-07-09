const express = require('express')
const cors = require('cors')
const sqlite3 = require('sqlite3').verbose()
const crypto = require('crypto')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '10mb' }))

const DEFAULT_SCHOOL_ID = 'bistu'
const DEFAULT_SCHOOL_NAME = '北京信息科技大学'
const ADMIN_SESSION_TTL = 2 * 60 * 60 * 1000

const db = new sqlite3.Database('./data.db')

function now() { return Date.now() }
function ok(data) { return { success: true, data } }
function fail(message) { return { success: false, message } }
function cleanString(value) { return typeof value === 'string' ? value.trim() : '' }
function cleanOptionalString(value) { const text = cleanString(value); return text || undefined }
function rankScore(avgScore, ratingCount) { return Number(avgScore || 0) * 1000 + Number(ratingCount || 0) }

function publicDish(row) {
  return {
    id: String(row.id),
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

function requireToken(req) {
  const token = cleanString(req.headers['x-user-token'] || req.body.token || req.query.token)
  if (!token) throw new Error('缺少用户身份')
  return token
}

async function requireAdmin(token) {
  const sessionToken = cleanString(token)
  if (!sessionToken) throw new Error('请先登录后台')
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM admin_sessions WHERE token = ? AND expiresAt > ?',
      [sessionToken, now()],
      (err, row) => {
        if (err || !row) return reject(new Error('后台登录已过期'))
        resolve(row)
      }
    )
  })
}

// 初始化数据库
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    nickname TEXT,
    avatarUrl TEXT,
    createdAt INTEGER,
    updatedAt INTEGER
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS dishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schoolId TEXT,
    name TEXT,
    categoryName TEXT,
    description TEXT,
    canteenName TEXT,
    floorName TEXT,
    shopName TEXT,
    imageUrl TEXT,
    headline TEXT,
    avgScore REAL DEFAULT 0,
    ratingCount INTEGER DEFAULT 0,
    rankScore REAL DEFAULT 0,
    status TEXT DEFAULT 'PENDING',
    createdAt INTEGER,
    updatedAt INTEGER
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schoolId TEXT,
    name TEXT,
    createdAt INTEGER,
    updatedAt INTEGER
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schoolId TEXT,
    content TEXT,
    createdAt INTEGER,
    updatedAt INTEGER
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userToken TEXT,
    dishId INTEGER,
    score INTEGER,
    createdAt INTEGER,
    updatedAt INTEGER,
    UNIQUE(userToken, dishId)
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS admin_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE,
    role TEXT,
    schoolId TEXT,
    createdAt INTEGER,
    expiresAt INTEGER
  )`)

  // 插入默认公告
  db.get("SELECT id FROM announcements WHERE schoolId = ?", [DEFAULT_SCHOOL_ID], (err, row) => {
    if (!row) {
      db.run("INSERT INTO announcements (schoolId, content, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
        [DEFAULT_SCHOOL_ID, '今日榜单正在整理，欢迎投递你在食堂发现的好味道。', now(), now()])
    }
  })

  // 插入默认分类
  const defaultCategories = ['面食', '米饭', '粥汤', '小炒', '清真', '饮品']
  defaultCategories.forEach((name, idx) => {
    db.get("SELECT id FROM categories WHERE schoolId = ? AND name = ?", [DEFAULT_SCHOOL_ID, name], (err, row) => {
      if (!row) {
        db.run("INSERT INTO categories (schoolId, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
          [DEFAULT_SCHOOL_ID, name, now() + idx, now()])
      }
    })
  })
})

// 注册/登录
app.post('/api/registerOrLogin', (req, res) => {
  const nickname = cleanString(req.body.nickname) || '微信读者'
  const avatarUrl = cleanString(req.body.avatarUrl)
  const token = crypto.randomBytes(16).toString('hex')
  const t = now()

  db.run(
    'INSERT OR REPLACE INTO users (token, nickname, avatarUrl, createdAt, updatedAt) VALUES (?, ?, ?, COALESCE((SELECT createdAt FROM users WHERE token = ?), ?), ?)',
    [token, nickname, avatarUrl, token, t, t],
    function(err) {
      if (err) return res.json(fail(err.message))
      res.json(ok({ token, profile: { nickname, avatarUrl } }))
    }
  )
})

// 榜单
app.get('/api/rankings', (req, res) => {
  const schoolId = cleanString(req.query.schoolId) || DEFAULT_SCHOOL_ID
  const limit = Math.min(Number(req.query.limit || 20), 100)

  db.all(
    'SELECT * FROM dishes WHERE schoolId = ? AND status = ? ORDER BY rankScore DESC, updatedAt DESC LIMIT ?',
    [schoolId, 'ACTIVE', limit],
    (err, rows) => {
      if (err) return res.json(fail(err.message))
      res.json(ok(rows.map(publicDish)))
    }
  )
})

// 分类
app.get('/api/categories', (req, res) => {
  const schoolId = cleanString(req.query.schoolId) || DEFAULT_SCHOOL_ID
  db.all(
    'SELECT id, name FROM categories WHERE schoolId = ? ORDER BY createdAt ASC LIMIT 100',
    [schoolId],
    (err, rows) => {
      if (err) return res.json(fail(err.message))
      res.json(ok(rows.map((row) => ({ id: String(row.id), name: row.name || '' }))))
    }
  )
})

// 公告
app.get('/api/announcement', (req, res) => {
  const schoolId = cleanString(req.query.schoolId) || DEFAULT_SCHOOL_ID
  db.get(
    'SELECT content FROM announcements WHERE schoolId = ? ORDER BY updatedAt DESC LIMIT 1',
    [schoolId],
    (err, row) => {
      if (err) return res.json(fail(err.message))
      res.json(ok(row ? row.content || '' : ''))
    }
  )
})

// 食堂数据（返回模拟数据）
app.get('/api/canteenData', (req, res) => {
  res.json(ok([
    { _id: 'c1', id: 'c1', schoolId: DEFAULT_SCHOOL_ID, name: '第一食堂', floors: ['一层', '二层', '三层'] },
    { _id: 'c2', id: 'c2', schoolId: DEFAULT_SCHOOL_ID, name: '第二食堂', floors: ['一层', '二层'] },
    { _id: 'c3', id: 'c3', schoolId: DEFAULT_SCHOOL_ID, name: '清真食堂', floors: ['一层'] },
  ]))
})

// 所有菜品
app.get('/api/dishes', (req, res) => {
  const schoolId = cleanString(req.query.schoolId) || DEFAULT_SCHOOL_ID
  const includeOffline = Boolean(req.query.includeOffline)
  const limit = Math.min(Number(req.query.limit || 200), 200)
  const statusSql = includeOffline ? '' : " AND status = 'ACTIVE'"

  db.all(
    `SELECT * FROM dishes WHERE schoolId = ?${statusSql} ORDER BY updatedAt DESC LIMIT ?`,
    [schoolId, limit],
    (err, rows) => {
      if (err) return res.json(fail(err.message))
      res.json(ok(rows.map(publicDish)))
    }
  )
})

// 创建菜品
app.post('/api/createDish', (req, res) => {
  try { requireToken(req) } catch (e) { return res.json(fail(e.message)) }

  const schoolId = cleanString(req.body.schoolId) || DEFAULT_SCHOOL_ID
  const name = cleanString(req.body.name)
  if (!name) return res.json(fail('菜名不能为空'))

  const t = now()
  const payload = [
    schoolId, name,
    cleanOptionalString(req.body.categoryName) || '',
    cleanOptionalString(req.body.description) || '',
    cleanOptionalString(req.body.canteenName) || '',
    cleanOptionalString(req.body.floorName) || '',
    cleanOptionalString(req.body.shopName) || '',
    cleanOptionalString(req.body.imageUrl) || '',
    '', 0, 0, 0, 'PENDING', t, t,
  ]

  db.run(
    `INSERT INTO dishes (schoolId, name, categoryName, description, canteenName, floorName, shopName, imageUrl, headline, avgScore, ratingCount, rankScore, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    payload,
    function(err) {
      if (err) return res.json(fail(err.message))
      res.json(ok(publicDish({ id: this.lastID, ...Object.fromEntries(payload.map((v, i) => [['schoolId','name','categoryName','description','canteenName','floorName','shopName','imageUrl','headline','avgScore','ratingCount','rankScore','status','createdAt','updatedAt'][i], v])) })))
    }
  )
})

// 更新菜品
app.post('/api/updateDish', async (req, res) => {
  try { await requireAdmin(req.body.token) } catch (e) { return res.json(fail(e.message)) }

  const dishId = Number(req.body.dishId)
  if (!dishId) return res.json(fail('缺少菜品 ID'))

  const patch = req.body.patch || {}
  const allowFields = ['name', 'categoryName', 'description', 'canteenName', 'floorName', 'shopName', 'imageUrl', 'headline', 'status']
  const updates = []
  const values = []

  allowFields.forEach((field) => {
    if (patch[field] !== undefined) {
      updates.push(`${field} = ?`)
      values.push(cleanString(patch[field]))
    }
  })

  if (updates.length === 0) return res.json(fail('没有可更新的字段'))

  updates.push('updatedAt = ?')
  values.push(now())
  values.push(dishId)

  db.run(
    `UPDATE dishes SET ${updates.join(', ')} WHERE id = ?`,
    values,
    function(err) {
      if (err) return res.json(fail(err.message))
      db.get('SELECT * FROM dishes WHERE id = ?', [dishId], (err2, row) => {
        if (err2 || !row) return res.json(fail('菜品不存在'))
        res.json(ok(publicDish(row)))
      })
    }
  )
})

// 评分
app.post('/api/rateDish', (req, res) => {
  const userToken = requireToken(req)
  const dishId = Number(req.body.dishId)
  const score = Number(req.body.score)

  if (!dishId) return res.json(fail('缺少菜品 ID'))
  if (!Number.isInteger(score) || score < 1 || score > 5) return res.json(fail('评分必须是 1 到 5'))

  db.get('SELECT * FROM dishes WHERE id = ? AND status = ?', [dishId, 'ACTIVE'], (err, dish) => {
    if (err || !dish) return res.json(fail('该菜品暂不可评分'))

    const t = now()
    db.run(
      'INSERT INTO ratings (userToken, dishId, score, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(userToken, dishId) DO UPDATE SET score = excluded.score, updatedAt = excluded.updatedAt',
      [userToken, dishId, score, t, t],
      function(err) {
        if (err) return res.json(fail(err.message))

        db.all('SELECT score FROM ratings WHERE dishId = ?', [dishId], (err2, ratings) => {
          if (err2) return res.json(fail(err2.message))
          const ratingCount = ratings.length
          const totalScore = ratings.reduce((sum, r) => sum + Number(r.score || 0), 0)
          const avgScore = ratingCount ? Math.round((totalScore / ratingCount) * 10) / 10 : 0
          const nextRankScore = rankScore(avgScore, ratingCount)

          db.run(
            'UPDATE dishes SET avgScore = ?, ratingCount = ?, rankScore = ?, updatedAt = ? WHERE id = ?',
            [avgScore, ratingCount, nextRankScore, t, dishId],
            (err3) => {
              if (err3) return res.json(fail(err3.message))
              res.json(ok(publicDish({ ...dish, avgScore, ratingCount, rankScore: nextRankScore })))
            }
          )
        })
      }
    )
  })
})

// 后台登录
app.post('/api/adminLogin', (req, res) => {
  const password = cleanString(req.body.password)
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return res.json(fail('后台密码未配置，请设置环境变量 ADMIN_PASSWORD'))
  if (!password || password !== expected) return res.json(fail('管理密码错误'))

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = now() + ADMIN_SESSION_TTL
  const t = now()

  db.run(
    'INSERT INTO admin_sessions (token, role, schoolId, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?)',
    [token, 'admin', DEFAULT_SCHOOL_ID, t, expiresAt],
    (err) => {
      if (err) return res.json(fail(err.message))
      res.json(ok({ token, expiresAt: String(expiresAt), role: 'admin', schoolId: DEFAULT_SCHOOL_ID, schoolName: DEFAULT_SCHOOL_NAME }))
    }
  )
})

// 设置公告
app.post('/api/setAnnouncement', async (req, res) => {
  try { await requireAdmin(req.body.token) } catch (e) { return res.json(fail(e.message)) }

  const schoolId = cleanString(req.body.schoolId) || DEFAULT_SCHOOL_ID
  const content = cleanString(req.body.content)
  const t = now()

  db.get('SELECT id FROM announcements WHERE schoolId = ?', [schoolId], (err, row) => {
    if (err) return res.json(fail(err.message))
    if (row) {
      db.run('UPDATE announcements SET content = ?, updatedAt = ? WHERE id = ?', [content, t, row.id], (err2) => {
        if (err2) return res.json(fail(err2.message))
        res.json(ok(true))
      })
    } else {
      db.run('INSERT INTO announcements (schoolId, content, createdAt, updatedAt) VALUES (?, ?, ?, ?)', [schoolId, content, t, t], (err2) => {
        if (err2) return res.json(fail(err2.message))
        res.json(ok(true))
      })
    }
  })
})

// 创建分类
app.post('/api/createCategory', async (req, res) => {
  try { await requireAdmin(req.body.token) } catch (e) { return res.json(fail(e.message)) }

  const schoolId = cleanString(req.body.schoolId) || DEFAULT_SCHOOL_ID
  const name = cleanString(req.body.name)
  if (!name) return res.json(fail('分类名不能为空'))

  db.get('SELECT id, name FROM categories WHERE schoolId = ? AND name = ?', [schoolId, name], (err, row) => {
    if (err) return res.json(fail(err.message))
    if (row) return res.json(ok({ id: String(row.id), name: row.name }))

    const t = now()
    db.run('INSERT INTO categories (schoolId, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)', [schoolId, name, t, t], function(err2) {
      if (err2) return res.json(fail(err2.message))
      res.json(ok({ id: String(this.lastID), name }))
    })
  })
})

// 首页 - 展示页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
