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

  db.run(`CREATE TABLE IF NOT EXISTS web_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    token TEXT UNIQUE,
    nickname TEXT,
    createdAt INTEGER,
    updatedAt INTEGER
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userToken TEXT NOT NULL,
    dishId INTEGER NOT NULL,
    createdAt INTEGER,
    UNIQUE(userToken, dishId)
  )`)

  // 插入默认公告
  db.get("SELECT id FROM announcements WHERE schoolId = ?", [DEFAULT_SCHOOL_ID], (err, row) => {
    if (!row) {
      db.run("INSERT INTO announcements (schoolId, content, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
        [DEFAULT_SCHOOL_ID, '今日榜单正在整理，欢迎投递你在食堂发现的好味道。', now(), now()])
    }
  })

  // 插入默认分类
  const defaultCategories = ['盖饭', '粉面', '麻辣', '饮品', '小炒', '清真']
  defaultCategories.forEach((name, idx) => {
    db.get("SELECT id FROM categories WHERE schoolId = ? AND name = ?", [DEFAULT_SCHOOL_ID, name], (err, row) => {
      if (!row) {
        db.run("INSERT INTO categories (schoolId, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
          [DEFAULT_SCHOOL_ID, name, now() + idx, now()])
      }
    })
  })

  // 插入默认菜品
  const defaultDishes = [
    { name: '黄焖鸡米饭', categoryName: '盖饭', canteenName: '一食堂', floorName: '一楼', shopName: '黄焖鸡米饭', description: '酱香浓郁，土豆软糯，是不知道吃什么时最稳的一道。', avgScore: 4.9, ratingCount: 126, imageUrl: '/images/dish1.jpg' },
    { name: '麻辣香锅', categoryName: '麻辣', canteenName: '一食堂', floorName: '一楼', shopName: '麻辣香锅', description: '适合多人拼单，辣度稳定，午饭高峰也很有存在感。', avgScore: 4.7, ratingCount: 94, imageUrl: '/images/dish2.jpg' },
    { name: '桂林米粉', categoryName: '粉面', canteenName: '二食堂', floorName: '一楼', shopName: '桂林米粉', description: '出餐快，汤粉和拌粉都适合赶课前后。', avgScore: 4.6, ratingCount: 72, imageUrl: '/images/dish3.jpg' },
    { name: '兰州拉面', categoryName: '粉面', canteenName: '一食堂', floorName: '一楼', shopName: '兰州拉面', description: '汤头清亮，面条劲道，冬天来一碗很暖。', avgScore: 4.5, ratingCount: 68, imageUrl: '/images/dish4.jpg' },
    { name: '重庆小面', categoryName: '粉面', canteenName: '一食堂', floorName: '一楼', shopName: '重庆小面', description: '麻辣鲜香，重口味同学的首选。', avgScore: 4.4, ratingCount: 55, imageUrl: '/images/dish5.jpg' },
    { name: '酸菜鱼', categoryName: '小炒', canteenName: '一食堂', floorName: '二楼', shopName: '酸菜鱼', description: '鱼肉嫩滑，酸菜爽口，分量足。', avgScore: 4.6, ratingCount: 81, imageUrl: '/images/dish6.jpg' },
    { name: '煲仔饭', categoryName: '盖饭', canteenName: '一食堂', floorName: '二楼', shopName: '煲仔饭', description: '锅巴香脆，腊肠香甜，饭粒分明。', avgScore: 4.5, ratingCount: 63, imageUrl: '/images/dish7.jpg' },
    { name: '自助餐', categoryName: '盖饭', canteenName: '一食堂', floorName: '二楼', shopName: '自助餐', description: '菜品丰富，自选称重，想吃啥拿啥。', avgScore: 4.3, ratingCount: 112, imageUrl: '/images/dish8.jpg' },
    { name: '沙县小吃', categoryName: '粉面', canteenName: '二食堂', floorName: '一楼', shopName: '沙县小吃', description: '蒸饺、拌面、炖汤，性价比之王。', avgScore: 4.2, ratingCount: 89, imageUrl: '/images/dish9.jpg' },
    { name: '麻辣烫', categoryName: '麻辣', canteenName: '二食堂', floorName: '三楼', shopName: '麻辣烫', description: '汤底浓郁，菜品新鲜，冬天必吃。', avgScore: 4.4, ratingCount: 76, imageUrl: '/images/dish10.jpg' },
    { name: '烤肉拌饭', categoryName: '盖饭', canteenName: '一食堂', floorName: '三楼', shopName: '烤肉', description: '烤肉焦香，配菜丰富，酱汁很下饭。', avgScore: 4.3, ratingCount: 58, imageUrl: '/images/dish11.jpg' },
    { name: '奶茶', categoryName: '饮品', canteenName: '二食堂', floorName: '二楼', shopName: '奶茶店', description: '饭后一杯，甜度可选，珍珠Q弹。', avgScore: 4.1, ratingCount: 145, imageUrl: '/images/dish12.jpg' },
  ]

  db.get("SELECT id FROM dishes WHERE schoolId = ? LIMIT 1", [DEFAULT_SCHOOL_ID], (err, row) => {
    if (!row) {
      const t = now()
      defaultDishes.forEach((dish, idx) => {
        const rank = dish.avgScore * 1000 + dish.ratingCount
        db.run(
          `INSERT INTO dishes (schoolId, name, categoryName, description, canteenName, floorName, shopName, imageUrl, headline, avgScore, ratingCount, rankScore, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [DEFAULT_SCHOOL_ID, dish.name, dish.categoryName, dish.description, dish.canteenName, dish.floorName, dish.shopName, dish.imageUrl || '', `${dish.name}登上今日风味榜`, dish.avgScore, dish.ratingCount, rank, 'ACTIVE', t + idx, t + idx]
        )
      })
    }
  })

  // 强制更新现有菜品图片路径，确保每个菜品都有独立图片（与Web端一致）
  const dishImageMap = {
    '黄焖鸡米饭': '/images/dish1.jpg',
    '麻辣香锅': '/images/dish2.jpg',
    '桂林米粉': '/images/dish3.jpg',
    '兰州拉面': '/images/dish4.jpg',
    '重庆小面': '/images/dish5.jpg',
    '酸菜鱼': '/images/dish6.jpg',
    '煲仔饭': '/images/dish7.jpg',
    '自助餐': '/images/dish8.jpg',
    '沙县小吃': '/images/dish9.jpg',
    '麻辣烫': '/images/dish10.jpg',
    '烤肉拌饭': '/images/dish11.jpg',
    '奶茶': '/images/dish12.jpg',
  }
  Object.entries(dishImageMap).forEach(([name, imageUrl]) => {
    db.run('UPDATE dishes SET imageUrl = ? WHERE name = ? AND schoolId = ?', [imageUrl, name, DEFAULT_SCHOOL_ID])
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
    { _id: 'c1', id: 'c1', schoolId: DEFAULT_SCHOOL_ID, name: '第一食堂', floors: [
      { name: '一层', shops: ['黄焖鸡米饭', '麻辣香锅', '兰州拉面', '重庆小面', '煎饼果子', '肉夹馍'] },
      { name: '二层', shops: ['自助餐', '小炒肉', '酸菜鱼', '煲仔饭', '过桥米线', '铁板烧'] },
      { name: '三层', shops: ['火锅', '烤肉', '韩式料理', '日式料理', '西餐厅', '甜品站'] },
    ]},
    { _id: 'c2', id: 'c2', schoolId: DEFAULT_SCHOOL_ID, name: '第二食堂', floors: [
      { name: '一层', shops: ['沙县小吃', '桂林米粉', '湘菜馆', '川菜馆', '粤菜馆', '饺子馆'] },
      { name: '二层', shops: ['汉堡王', '肯德基', '必胜客', '赛百味', '奶茶店', '咖啡厅'] },
      { name: '三层', shops: ['麻辣烫', '冒菜', '干锅', '烤鱼', '烧烤', '小龙虾'] },
      { name: '四层', shops: ['精致自助', '海鲜餐厅', '牛排馆', '寿司店', '私房菜', '特色火锅'] },
    ]},
    { _id: 'c3', id: 'c3', schoolId: DEFAULT_SCHOOL_ID, name: '清真食堂', floors: [
      { name: '一层', shops: ['清真拉面', '大盘鸡', '羊肉串', '烤包子', '手抓饭', '酸奶'] },
    ]},
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
    '', 5.0, 0, rankScore(5.0, 0), 'PENDING', t, t,
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
      'INSERT INTO ratings (userToken, dishId, score, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(userToken, dishId) DO NOTHING',
      [userToken, dishId, score, t, t],
      function(err) {
        if (err) return res.json(fail(err.message))
        if (this.changes === 0) return res.json(fail('已经评过分了'))

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

// Web 用户注册
app.post('/api/webRegister', (req, res) => {
  const username = cleanString(req.body.username)
  const password = cleanString(req.body.password)
  const nickname = cleanString(req.body.nickname) || username

  if (!username) return res.json(fail('用户名不能为空'))
  if (!password || password.length < 4) return res.json(fail('密码至少4位'))

  db.get('SELECT id FROM web_users WHERE username = ?', [username], (err, row) => {
    if (err) return res.json(fail(err.message))
    if (row) return res.json(fail('用户名已存在'))

    const token = crypto.randomBytes(16).toString('hex')
    const t = now()
    db.run(
      'INSERT INTO web_users (username, password, token, nickname, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [username, password, token, nickname, t, t],
      function(err2) {
        if (err2) return res.json(fail(err2.message))
        res.json(ok({ token, nickname, username }))
      }
    )
  })
})

// Web 用户登录
app.post('/api/webLogin', (req, res) => {
  const username = cleanString(req.body.username)
  const password = cleanString(req.body.password)

  if (!username || !password) return res.json(fail('用户名和密码不能为空'))

  db.get('SELECT * FROM web_users WHERE username = ? AND password = ?', [username, password], (err, row) => {
    if (err) return res.json(fail(err.message))
    if (!row) return res.json(fail('用户名或密码错误'))

    const token = crypto.randomBytes(16).toString('hex')
    const t = now()
    db.run('UPDATE web_users SET token = ?, updatedAt = ? WHERE id = ?', [token, t, row.id], (err2) => {
      if (err2) return res.json(fail(err2.message))
      res.json(ok({ token, nickname: row.nickname, username: row.username }))
    })
  })
})

// 获取用户信息
app.get('/api/userInfo', (req, res) => {
  try {
    const token = requireToken(req)
    db.get('SELECT username, nickname FROM web_users WHERE token = ?', [token], (err, row) => {
      if (err || !row) return res.json(fail('用户不存在'))
      res.json(ok({ username: row.username, nickname: row.nickname }))
    })
  } catch (e) {
    res.json(fail(e.message))
  }
})

// 获取收藏列表
app.get('/api/favorites', (req, res) => {
  try {
    const userToken = requireToken(req)
    db.all(
      'SELECT dishId FROM favorites WHERE userToken = ? ORDER BY createdAt DESC',
      [userToken],
      (err, rows) => {
        if (err) return res.json(fail(err.message))
        res.json(ok(rows.map(r => String(r.dishId))))
      }
    )
  } catch (e) {
    res.json(fail(e.message))
  }
})

// 添加收藏
app.post('/api/addFavorite', (req, res) => {
  try {
    const userToken = requireToken(req)
    const dishId = Number(req.body.dishId)
    if (!dishId) return res.json(fail('缺少菜品 ID'))

    db.run(
      'INSERT INTO favorites (userToken, dishId, createdAt) VALUES (?, ?, ?)',
      [userToken, dishId, now()],
      (err) => {
        if (err) return res.json(fail('已收藏'))
        res.json(ok(true))
      }
    )
  } catch (e) {
    res.json(fail(e.message))
  }
})

// 取消收藏
app.post('/api/removeFavorite', (req, res) => {
  try {
    const userToken = requireToken(req)
    const dishId = Number(req.body.dishId)
    if (!dishId) return res.json(fail('缺少菜品 ID'))

    db.run(
      'DELETE FROM favorites WHERE userToken = ? AND dishId = ?',
      [userToken, dishId],
      function(err) {
        if (err) return res.json(fail(err.message))
        res.json(ok(true))
      }
    )
  } catch (e) {
    res.json(fail(e.message))
  }
})

// 静态文件服务（图片等）
app.use('/images', express.static(path.join(__dirname, 'public', 'images')))

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
