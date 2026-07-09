import {
  announcement,
  canteenData,
  categories,
  getStoredProfile,
  getStoredToken,
  isRegistered,
  rankings,
  rateDish,
  uploadDish,
  type CanteenView,
  type CategoryView,
  type DishView,
} from '../../utils/api'

const SCHOOL_ID = 'bistu'
const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const EDITION_COUNT = 4
const DISH_PLACEHOLDER = '/images/dish-placeholder.svg'

interface DisplayDish {
  id: string
  name: string
  description: string
  imageUrl: string
  categoryName: string
  placeText: string
  shopText: string
  scoreText: string
  ratingText: string
  headline: string
  reasonText: string
  audienceText: string
  warningText: string
  canRate: boolean
}

interface SubmitForm {
  name: string
  categoryName: string
  shopName: string
  floorName: string
  description: string
}

interface RandomPick {
  canteen: string
  floor: string
  shop: string
  place: string
  key: string
}

const EMPTY_RANDOM_PICK: RandomPick = {
  canteen: '',
  floor: '',
  shop: '暂无窗口数据',
  place: '等待食堂窗口同步',
  key: '',
}

const mockCanteenRows: CanteenView[] = [
  {
    _id: 'mock-canteen-1',
    id: 'mock-canteen-1',
    schoolId: SCHOOL_ID,
    name: '一食堂',
    floors: [
      { name: '一楼', shops: ['黄焖鸡米饭', '麻辣香锅', '兰州拉面', '重庆小面', '煎饼果子', '肉夹馍'] },
      { name: '二楼', shops: ['自助餐', '小炒肉', '酸菜鱼', '煲仔饭', '过桥米线', '铁板烧'] },
      { name: '三楼', shops: ['火锅', '烤肉', '韩式料理', '日式料理', '西餐厅', '甜品站'] },
    ],
  },
  {
    _id: 'mock-canteen-2',
    id: 'mock-canteen-2',
    schoolId: SCHOOL_ID,
    name: '二食堂',
    floors: [
      { name: '一楼', shops: ['沙县小吃', '桂林米粉', '湘菜馆', '川菜馆', '粤菜馆', '饺子馆'] },
      { name: '二楼', shops: ['汉堡王', '肯德基', '必胜客', '赛百味', '奶茶店', '咖啡厅'] },
      { name: '三楼', shops: ['麻辣烫', '冒菜', '干锅', '烤鱼', '烧烤', '小龙虾'] },
      { name: '四楼', shops: ['精致自助', '海鲜餐厅', '牛排馆', '寿司店', '私房菜', '特色火锅'] },
    ],
  },
]

const sampleDishes: DisplayDish[] = [
  {
    id: 'sample-1',
    name: '黄焖鸡米饭',
    description: '酱香浓郁，土豆软糯，是不知道吃什么时最稳的一道。',
    imageUrl: DISH_PLACEHOLDER,
    categoryName: '盖饭',
    placeText: '一食堂 · 一楼 · 黄焖鸡米饭',
    shopText: '黄焖鸡米饭',
    scoreText: '4.9',
    ratingText: '126 人评价',
    headline: '午饭前的稳妥答案仍然来自黄焖鸡窗口',
    reasonText: '酱香浓郁，土豆软糯，是不知道吃什么时最稳的一道。',
    audienceText: '想吃热饭 / 不想踩雷 / 赶时间的你',
    warningText: '口味偏咸，减脂期少浇汤哦。',
    canRate: false,
  },
  {
    id: 'sample-2',
    name: '麻辣香锅',
    description: '适合多人拼单，辣度稳定，午饭高峰也很有存在感。',
    imageUrl: DISH_PLACEHOLDER,
    categoryName: '麻辣',
    placeText: '一食堂 · 一楼 · 麻辣香锅',
    shopText: '麻辣香锅',
    scoreText: '4.7',
    ratingText: '94 人评价',
    headline: '麻辣香锅在多人拼单中继续占据显眼位置',
    reasonText: '辣度稳定、份量足，三个人也能拼一锅吃饱。',
    audienceText: '一起拼单 / 想吃辣 / 想吃饱',
    warningText: '油偏重，胃口轻的同学少加底料。',
    canRate: false,
  },
  {
    id: 'sample-3',
    name: '桂林米粉',
    description: '出餐快，汤粉和拌粉都适合赶课前后。',
    imageUrl: DISH_PLACEHOLDER,
    categoryName: '粉面',
    placeText: '二食堂 · 一楼 · 桂林米粉',
    shopText: '桂林米粉',
    scoreText: '4.6',
    ratingText: '72 人评价',
    headline: '赶课同学把桂林米粉推上速度榜',
    reasonText: '汤头清亮，三两下就能上桌，赶课同学常点。',
    audienceText: '赶时间 / 想吃清淡 / 习惯粉面',
    warningText: '辣油另加，怕辣的提前说"少辣"。',
    canRate: false,
  },
]

const sampleCategories: CategoryView[] = [
  { id: 'cat-1', name: '盖饭' },
  { id: 'cat-2', name: '粉面' },
  { id: 'cat-3', name: '麻辣' },
  { id: 'cat-4', name: '饮品' },
]

function formatTwo(value: number) {
  return value < 10 ? `0${value}` : `${value}`
}

function buildDishHeadline(dish: DishView) {
  const name = dish.name || '这道菜'
  const count = Number(dish.ratingCount || 0)
  if (dish.headline) return dish.headline
  if (count >= 20) return `${name}收获${count}张食堂票，继续留在今日版面`
  if (count > 0) return `${name}拿到${count}张新票，正在冲上风味榜`
  if (dish.shopName) return `${dish.shopName}把${name}送上今日候选`
  if (dish.categoryName) return `${name}登上${dish.categoryName}栏目，等待第一张票`
  return `${name}成为今天的食堂头条候选`
}

function normalizeDish(dish: DishView): DisplayDish {
  const place = [dish.canteenName, dish.floorName, dish.shopName].filter(Boolean).join(' · ')
  const name = dish.name || '未命名菜品'
  const description = dish.description || '等待同学补充风味记录。'
  return {
    id: dish.id,
    name,
    description,
    imageUrl: dish.imageUrl || DISH_PLACEHOLDER,
    categoryName: dish.categoryName || '未分类',
    placeText: place || '校园食堂',
    shopText: dish.shopName || place || '校园食堂',
    scoreText: Number(dish.avgScore || 0).toFixed(1),
    ratingText: `${dish.ratingCount || 0} 人评价`,
    headline: buildDishHeadline(dish),
    reasonText: description,
    audienceText: dish.categoryName ? `常点 ${dish.categoryName} 的同学` : '想吃饱 / 想吃稳',
    warningText: '欢迎在评分时补一句口味提醒。',
    canRate: true,
  }
}

function pickDish(rows: DisplayDish[], index: number) {
  return rows[index] || rows[0] || sampleDishes[0]
}

function ratingCountOf(row: DisplayDish) {
  return Number.parseInt(row.ratingText, 10) || 0
}

function compareDishRank(a: DisplayDish, b: DisplayDish) {
  const scoreDiff = Number(b.scoreText || 0) - Number(a.scoreText || 0)
  if (scoreDiff !== 0) return scoreDiff
  return ratingCountOf(b) - ratingCountOf(a)
}

function mergeDisplayDish(existing: DisplayDish | undefined, dish: DishView) {
  const next = normalizeDish(dish)
  if (!existing) return next

  return {
    ...next,
    name: dish.name ? next.name : existing.name,
    description: dish.description ? next.description : existing.description,
    imageUrl: dish.imageUrl ? next.imageUrl : existing.imageUrl,
    categoryName: dish.categoryName ? next.categoryName : existing.categoryName,
    placeText: (dish.canteenName || dish.floorName || dish.shopName) ? next.placeText : existing.placeText,
    shopText: dish.shopName ? next.shopText : existing.shopText,
    reasonText: dish.description ? next.reasonText : existing.reasonText,
    audienceText: dish.categoryName ? next.audienceText : existing.audienceText,
    warningText: existing.warningText || next.warningText,
  }
}

function buildRandomPool(canteens: CanteenView[]) {
  const pool: RandomPick[] = []
  canteens.forEach((canteen) => {
    const canteenName = canteen.name || '食堂'
    const floors = Array.isArray(canteen.floors) ? canteen.floors : []
    floors.forEach((floor) => {
      const floorName = floor.name || '楼层'
      const shops = Array.isArray(floor.shops) ? floor.shops : []
      shops.forEach((shop) => {
        const shopName = String(shop || '').trim()
        if (!shopName) return
        pool.push({
          canteen: canteenName,
          floor: floorName,
          shop: shopName,
          place: `${canteenName} · ${floorName}`,
          key: `${canteenName}-${floorName}-${shopName}`,
        })
      })
    })
  })
  return pool
}

function resolveCanteenRows(rows: CanteenView[]) {
  return buildRandomPool(rows).length ? rows : mockCanteenRows
}

function pickRandomShop(canteens: CanteenView[]) {
  const pool = buildRandomPool(resolveCanteenRows(canteens))
  if (!pool.length) return EMPTY_RANDOM_PICK
  const index = Math.floor(Math.random() * pool.length)
  return pool[index]
}

Page({
  data: {
    statusBarHeight: 0,
    readerTop: 10,
    currentIndex: 0,
    pageNumber: '01',
    pageTotal: formatTwo(EDITION_COUNT),
    editionDate: '',
    networkNote: '样张模式',
    leadDish: sampleDishes[0],
    featureDish: sampleDishes[1],
    thirdDish: sampleDishes[2],
    rankingRows: sampleDishes,
    categoryRows: sampleCategories,
    randomPick: EMPTY_RANDOM_PICK,
    randomRolling: false,
    ratingScoreOptions: [1, 2, 3, 4, 5],
    announcementText: '今日榜单正在整理，欢迎投递你在食堂发现的好味道。',
    showSubmitSheet: false,
    submitting: false,
    imagePath: '',
    imageName: '',
    registered: false,
    profileLabel: '个人资料',
    form: {
      name: '',
      categoryName: '',
      shopName: '',
      floorName: '',
      description: '',
    } as SubmitForm,
  },

  randomRollTimer: 0,
  dishes: sampleDishes,
  categoriesCache: sampleCategories,
  canteenRows: [] as CanteenView[],
  adminTapCount: 0,
  adminTapTimer: 0,

  onLoad() {
    this.setupPage()
    this.refreshProfileLabel()
    this.loadNewspaperData()
  },

  onShow() {
    this.refreshProfileLabel()
  },

  onUnload() {
    if (this.randomRollTimer) clearTimeout(this.randomRollTimer)
    if (this.adminTapTimer) clearTimeout(this.adminTapTimer)
  },

  refreshProfileLabel() {
    const registered = isRegistered()
    const profile = registered ? getStoredProfile() : null
    this.setData({
      registered,
      profileLabel: profile && profile.nickname ? profile.nickname : '个人资料',
    })
  },

  openProfile() {
    wx.navigateTo({ url: '/pages/auth/register/index' })
  },

  onMastheadTap() {
    if (this.adminTapTimer) clearTimeout(this.adminTapTimer)
    this.adminTapCount += 1
    if (this.adminTapCount >= 6) {
      this.adminTapCount = 0
      wx.navigateTo({ url: '/pages/admin/index' })
      return
    }

    this.adminTapTimer = setTimeout(() => {
      this.adminTapCount = 0
      this.adminTapTimer = 0
    }, 1400)
  },

  promptRegister(reason: string) {
    wx.showModal({
      title: '先设置资料',
      content: `${reason}，是否现在设置个人资料？`,
      confirmText: '去设置',
      cancelText: '稍后',
      success: (res) => {
        if (res.confirm) this.openProfile()
      },
    })
  },

  setupPage() {
    const info = wx.getWindowInfo()
    const now = new Date()
    this.setData({
      statusBarHeight: info.statusBarHeight || 0,
      readerTop: (info.statusBarHeight || 0) + 10,
      editionDate: `${now.getFullYear()}.${formatTwo(now.getMonth() + 1)}.${formatTwo(now.getDate())}`,
      pageNumber: formatTwo(this.data.currentIndex + 1),
    })
  },

  async loadNewspaperData() {
    this.setData({ networkNote: '正在更新' })

    try {
      const [rankRows, categoryRows, announcementText, canteenRows] = await Promise.all([
        rankings(SCHOOL_ID, 20),
        categories(SCHOOL_ID),
        announcement(SCHOOL_ID),
        canteenData(SCHOOL_ID).catch(() => [] as CanteenView[]),
      ])

      this.dishes = rankRows.length ? rankRows.map(normalizeDish) : sampleDishes
      this.categoriesCache = categoryRows.length ? categoryRows : sampleCategories
      this.canteenRows = resolveCanteenRows(Array.isArray(canteenRows) ? canteenRows : [])
      this.setNewspaperData(
        rankRows.length ? '实时数据' : '模拟窗口',
        announcementText || '暂无公告，今日编辑部把版面留给同学投稿。',
      )
    } catch (error) {
      this.dishes = sampleDishes
      this.categoriesCache = sampleCategories
      this.canteenRows = mockCanteenRows
      this.setNewspaperData('离线样张', '暂时没有更新到最新内容，随机推荐使用模拟窗口。')
    }
  },

  setNewspaperData(networkNote: string, announcementText: string) {
    const currentRandom = this.data.randomPick
    const randomPick = currentRandom && currentRandom.key ? currentRandom : pickRandomShop(this.canteenRows)
    this.setData({
      networkNote,
      announcementText,
      leadDish: pickDish(this.dishes, 0),
      featureDish: pickDish(this.dishes, 1),
      thirdDish: pickDish(this.dishes, 2),
      rankingRows: this.dishes.slice(0, 8),
      categoryRows: this.categoriesCache.slice(0, 10),
      randomPick,
    })
  },

  updateRatedDishDisplay(dish?: DishView) {
    if (!dish || !dish.id) return false

    const existing = this.dishes.find((row) => row.id === dish.id)
    const updated = mergeDisplayDish(existing, dish)
    const nextDishes = this.dishes.filter((row) => row.id !== dish.id)
    nextDishes.push(updated)
    nextDishes.sort(compareDishRank)
    this.dishes = nextDishes
    this.setNewspaperData(this.data.networkNote, this.data.announcementText)
    return true
  },

  rollRandomPick() {
    if (this.randomRollTimer) clearTimeout(this.randomRollTimer)
    const next = pickRandomShop(this.canteenRows)
    if (!next.key) {
      this.setData({ randomRolling: false, randomPick: next })
      wx.showToast({ title: '暂无窗口数据', icon: 'none' })
      return
    }

    this.setData({ randomRolling: true })
    this.randomRollTimer = setTimeout(() => {
      this.setData({ randomPick: next })
      this.randomRollTimer = setTimeout(() => {
        this.setData({ randomRolling: false })
        this.randomRollTimer = 0
      }, 320)
    }, 130)
  },

  onSwiperChange(event: WechatMiniprogram.CustomEvent<{ current: number }>) {
    const currentIndex = Number(event.detail.current || 0)
    if (currentIndex === this.data.currentIndex) return
    this.setData({
      currentIndex,
      pageNumber: formatTwo(currentIndex + 1),
    })
  },

  goEdition(event: WechatMiniprogram.BaseEvent) {
    const target = Number(event.currentTarget.dataset.target)
    if (Number.isNaN(target)) return
    const targetIndex = Math.max(0, Math.min(EDITION_COUNT - 1, Number(target || 0)))
    if (targetIndex === this.data.currentIndex) return
    this.setData({
      currentIndex: targetIndex,
      pageNumber: formatTwo(targetIndex + 1),
    })
  },

  refreshData() {
    this.loadNewspaperData()
  },

  ensureRegisteredForSubmit() {
    if (isRegistered()) return true
    this.promptRegister('设置资料后即可投稿')
    return false
  },

  openSubmitSheet() {
    if (!this.ensureRegisteredForSubmit()) return
    this.setData({ showSubmitSheet: true })
  },

  closeSubmitSheet() {
    this.setData({ showSubmitSheet: false })
  },

  chooseImage() {
    if (!this.ensureRegisteredForSubmit()) return
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const imagePath = res.tempFilePaths[0]
        wx.getFileInfo({
          filePath: imagePath,
          success: (fileInfo) => {
            if (fileInfo.size > MAX_IMAGE_SIZE) {
              wx.showToast({ title: '图片不能超过 5MB', icon: 'none' })
              return
            }
            const parts = imagePath.split('/')
            this.setData({
              imagePath,
              imageName: parts[parts.length - 1] || '已选择图片',
            })
          },
        })
      },
    })
  },

  clearImage() {
    this.setData({ imagePath: '', imageName: '' })
  },

  async onRateTap(event: WechatMiniprogram.BaseEvent) {
    const dishId = String(event.currentTarget.dataset.dishId || '')
    const score = Number(event.currentTarget.dataset.score || 0)
    if (!dishId || !score || dishId.startsWith('sample-')) {
      wx.showToast({ title: '样张不能评分', icon: 'none' })
      return
    }

    if (!isRegistered()) {
      this.promptRegister('设置资料后即可为该菜品评分')
      return
    }

    wx.showLoading({ title: '评分中' })
    try {
      const ratedDish = await rateDish(getStoredToken(), dishId, score)
      if (!this.updateRatedDishDisplay(ratedDish)) {
        await this.loadNewspaperData()
      }
      wx.showToast({ title: '已评分', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '评分失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  resetSubmitForm() {
    this.setData({
      imagePath: '',
      imageName: '',
      form: {
        name: '',
        categoryName: '',
        shopName: '',
        floorName: '',
        description: '',
      },
    })
  },

  async submitDish() {
    if (!this.ensureRegisteredForSubmit()) return

    const form = this.data.form as SubmitForm
    const name = form.name.trim()
    if (!name) {
      wx.showToast({ title: '先写菜名', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '投稿中' })
    try {
      await uploadDish(getStoredToken(), {
        schoolId: SCHOOL_ID,
        name,
        categoryName: form.categoryName.trim(),
        description: form.description.trim(),
        shopName: form.shopName.trim(),
        floorName: form.floorName.trim(),
      }, this.data.imagePath)
      wx.showToast({ title: '已投稿', icon: 'success' })
      this.resetSubmitForm()
      this.setData({
        showSubmitSheet: false,
        currentIndex: 1,
        pageNumber: '02',
      })
      await this.loadNewspaperData()
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '投稿失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ submitting: false })
    }
  },
})
