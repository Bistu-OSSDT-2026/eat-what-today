const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const schoolId = 'bistu'
const now = Date.now()

async function addIfMissing(collection, where, data) {
  const existing = await db.collection(collection).where(where).limit(1).get()
  if (existing.data.length) return existing.data[0]._id
  const result = await db.collection(collection).add({ data })
  return result._id
}

exports.main = async () => {
  await addIfMissing('dish_announcements', { schoolId }, {
    schoolId,
    content: '今日榜单正在整理，欢迎投递你在食堂发现的好味道。',
    createdAt: now,
    updatedAt: now,
  })

  const categoryNames = ['盖饭', '粉面', '麻辣', '饮品']
  await Promise.all(categoryNames.map((name) => addIfMissing('dish_categories', { schoolId, name }, {
    schoolId,
    name,
    createdAt: now,
    updatedAt: now,
  })))

  await addIfMissing('dish_canteens', { schoolId, name: '一食堂' }, {
    schoolId,
    name: '一食堂',
    floors: [
      { name: '一楼', shops: ['黄焖鸡米饭', '麻辣香锅', '兰州拉面', '重庆小面'] },
      { name: '二楼', shops: ['自助餐', '小炒肉', '酸菜鱼', '煲仔饭'] },
    ],
    createdAt: now,
    updatedAt: now,
  })

  await addIfMissing('dish_canteens', { schoolId, name: '二食堂' }, {
    schoolId,
    name: '二食堂',
    floors: [
      { name: '一楼', shops: ['沙县小吃', '桂林米粉', '湘菜馆', '饺子馆'] },
      { name: '二楼', shops: ['汉堡', '奶茶店', '麻辣烫', '冒菜'] },
    ],
    createdAt: now,
    updatedAt: now,
  })

  await addIfMissing('dish_dishes', { schoolId, name: '黄焖鸡米饭' }, {
    schoolId,
    name: '黄焖鸡米饭',
    description: '酱香浓郁，土豆软糯，是不知道吃什么时最稳的一道。',
    categoryName: '盖饭',
    canteenName: '一食堂',
    floorName: '一楼',
    shopName: '黄焖鸡米饭',
    imageUrl: '',
    headline: '午饭前的稳妥答案仍然来自黄焖鸡窗口',
    avgScore: 4.9,
    ratingCount: 126,
    rankScore: 5026,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  })

  return { success: true }
}
