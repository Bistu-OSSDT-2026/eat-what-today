const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function createDatabase() {
  const stores = new Map()
  let nextId = 1

  function store(name) {
    if (!stores.has(name)) stores.set(name, new Map())
    return stores.get(name)
  }

  function matches(row, where) {
    return Object.entries(where).every(([key, expected]) => {
      if (expected && expected.$gt !== undefined) return Number(row[key]) > expected.$gt
      return row[key] === expected
    })
  }

  function query(name, where = {}) {
    let limit = Infinity
    return {
      orderBy() {
        return this
      },
      limit(value) {
        limit = value
        return this
      },
      async get() {
        return {
          data: [...store(name).values()].filter((row) => matches(row, where)).slice(0, limit).map(clone),
        }
      },
    }
  }

  function document(name, id) {
    return {
      async get() {
        return { data: clone(store(name).get(id)) }
      },
      async set({ data }) {
        store(name).set(id, { _id: id, ...clone(data) })
      },
      async update({ data }) {
        const current = store(name).get(id)
        if (!current) throw new Error(`missing document: ${name}/${id}`)
        store(name).set(id, { ...current, ...clone(data) })
      },
      async remove() {
        store(name).delete(id)
      },
    }
  }

  function collection(name) {
    return {
      where(where) {
        return query(name, where)
      },
      orderBy() {
        return query(name)
      },
      limit(value) {
        return query(name).limit(value)
      },
      doc(id) {
        return document(name, id)
      },
      async add({ data }) {
        const id = `id-${nextId++}`
        store(name).set(id, { _id: id, ...clone(data) })
        return { _id: id }
      },
    }
  }

  return {
    stores,
    command: {
      gt(value) {
        return { $gt: value }
      },
    },
    async createCollection(name) {
      if (stores.has(name)) throw new Error(`collection already exists: ${name}`)
      stores.set(name, new Map())
    },
    collection,
    runTransaction(callback) {
      return callback({ collection })
    },
  }
}

async function main() {
  const db = createDatabase()
  let openid = 'user-1'
  let textSuggest = 'pass'
  let imageCode = 0
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database() {
      return db
    },
    getWXContext() {
      return { OPENID: openid }
    },
    openapi: {
      security: {
        async msgSecCheck() {
          return { result: { suggest: textSuggest } }
        },
        async imgSecCheck() {
          return { errCode: imageCode }
        },
      },
    },
    async downloadFile() {
      return { fileContent: Buffer.from('image') }
    },
    async deleteFile() {
      return {}
    },
  }

  const originalLoad = Module._load
  Module._load = function load(request, parent, isMain) {
    if (request === 'wx-server-sdk') return cloud
    return originalLoad.call(this, request, parent, isMain)
  }

  const modulePath = path.resolve(__dirname, '../cloudfunctions/dish-api/index.js')
  delete require.cache[modulePath]
  const api = require(modulePath)
  Module._load = originalLoad

  const register = await api.main({
    action: 'registerOrLogin',
    data: { nickname: '测试同学', avatarUrl: '' },
  })
  assert.equal(register.success, true)
  assert.equal(register.data.token, undefined)

  openid = 'user-2'
  const unregisteredDish = await api.main({
    action: 'createDish',
    data: { name: '未注册投稿' },
  })
  assert.equal(unregisteredDish.success, false)
  assert.match(unregisteredDish.message, /设置个人资料/)

  openid = 'user-1'
  textSuggest = 'risky'
  const riskyDish = await api.main({
    action: 'createDish',
    data: { name: '违规投稿' },
  })
  assert.equal(riskyDish.success, false)
  assert.match(riskyDish.message, /违规/)

  textSuggest = 'pass'
  imageCode = 0
  const safeDish = await api.main({
    action: 'createDish',
    data: { name: '黄焖鸡米饭', imageUrl: 'cloud://test/dish.jpg' },
  })
  assert.equal(safeDish.success, true)
  const storedDish = db.stores.get('dish_dishes').get(safeDish.data.id)
  assert.equal(storedDish.createdBy, openid)
  assert.deepEqual(storedDish.moderation, {
    text: 'pass',
    image: 'pass',
    checkedAt: storedDish.moderation.checkedAt,
  })

  storedDish.status = 'ACTIVE'
  await api.main({ action: 'rateDish', data: { dishId: storedDish._id, score: 5 } })
  await api.main({ action: 'rateDish', data: { dishId: storedDish._id, score: 3 } })
  const ratedDish = db.stores.get('dish_dishes').get(storedDish._id)
  assert.equal(db.stores.get('dish_ratings').size, 1)
  assert.equal(ratedDish.ratingCount, 1)
  assert.equal(ratedDish.avgScore, 3)

  process.env.ADMIN_PASSWORD = 'test-password'
  const login = await api.main({
    action: 'adminLogin',
    data: { password: 'test-password' },
  })
  assert.equal(login.success, true)
  assert.equal(db.stores.get('dish_admin_sessions').size, 1)
  const logout = await api.main({
    action: 'adminLogout',
    data: { token: login.data.token },
  })
  assert.equal(logout.success, true)
  assert.equal(db.stores.get('dish_admin_sessions').size, 0)

  console.log('dish-api behavior checks passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
