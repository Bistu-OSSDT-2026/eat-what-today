import {
  announcement,
  canteenData,
  categories,
  getStoredProfile,
  getStoredAdminToken,
  isRegistered,
  rankings,
  rateDish,
  uploadDish,
  type CanteenView,
  type CategoryView,
  type DishView,
} from '../../utils/api'
import { medium as mediumHaptic } from '../../utils/haptic'

const SCHOOL_ID = 'bistu'
const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const DISH_PLACEHOLDER = '/images/dishes/dish-fallback.webp'
const RANDOM_ROLL_DURATION = 360
const RANDOM_SWAP_DELAY = RANDOM_ROLL_DURATION / 2
const SUBMIT_SHEET_CLOSE_DURATION = 260

interface DisplayDish {
  id: string
  name: string
  description: string
  imageUrl: string
  categoryName: string
  placeText: string
  scoreText: string
  ratingText: string
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
  shop: string
  place: string
  key: string
}

const EMPTY_RANDOM_PICK: RandomPick = {
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
      { name: '一楼', shops: ['黄焖鸡米饭', '麻辣香锅', '兰州拉面', '煎饼果子'] },
      { name: '二楼', shops: ['酸菜鱼', '煲仔饭', '过桥米线', '铁板烧'] },
    ],
  },
  {
    _id: 'mock-canteen-2',
    id: 'mock-canteen-2',
    schoolId: SCHOOL_ID,
    name: '二食堂',
    floors: [
      { name: '一楼', shops: ['沙县小吃', '桂林米粉', '饺子馆', '湘菜馆'] },
      { name: '二楼', shops: ['麻辣烫', '冒菜', '烤鱼', '烧烤'] },
    ],
  },
]

const sampleDishes: DisplayDish[] = [
  {
    id: 'sample-1',
    name: '黄焖鸡米饭',
    description: '酱香浓郁，土豆软糯，是不知道吃什么时很稳的一道。',
    imageUrl: '/images/dishes/huangmenji-rice.webp',
    categoryName: '盖饭',
    placeText: '一食堂 · 一楼 · 黄焖鸡米饭',
    scoreText: '4.9',
    ratingText: '126 人评价',
    canRate: false,
  },
  {
    id: 'sample-2',
    name: '麻辣香锅',
    description: '适合多人拼单，辣度稳定，午饭高峰也很有存在感。',
    imageUrl: '/images/dishes/mala-xiangguo.webp',
    categoryName: '麻辣',
    placeText: '一食堂 · 一楼 · 麻辣香锅',
    scoreText: '4.7',
    ratingText: '94 人评价',
    canRate: false,
  },
  {
    id: 'sample-3',
    name: '桂林米粉',
    description: '出餐快，汤粉和拌粉都适合赶课前后。',
    imageUrl: '/images/dishes/guilin-rice-noodles.webp',
    categoryName: '粉面',
    placeText: '二食堂 · 一楼 · 桂林米粉',
    scoreText: '4.6',
    ratingText: '72 人评价',
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

function formatDate(date: Date) {
  return `${date.getFullYear()}.${formatTwo(date.getMonth() + 1)}.${formatTwo(date.getDate())}`
}

function normalizeDish(dish: DishView): DisplayDish {
  const place = [dish.canteenName, dish.floorName, dish.shopName].filter(Boolean).join(' · ')
  return {
    id: dish.id,
    name: dish.name || '未命名菜品',
    description: dish.description || '等待同学补充风味记录。',
    imageUrl: dish.imageUrl || DISH_PLACEHOLDER,
    categoryName: dish.categoryName || '未分类',
    placeText: place || '校园食堂',
    scoreText: Number(dish.avgScore || 0).toFixed(1),
    ratingText: `${dish.ratingCount || 0} 人评价`,
    canRate: true,
  }
}

function ratingCountOf(row: DisplayDish) {
  return Number.parseInt(row.ratingText, 10) || 0
}

function compareDishRank(a: DisplayDish, b: DisplayDish) {
  const scoreDiff = Number(b.scoreText) - Number(a.scoreText)
  return scoreDiff || ratingCountOf(b) - ratingCountOf(a)
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
    placeText: dish.canteenName || dish.floorName || dish.shopName ? next.placeText : existing.placeText,
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
  return pool[Math.floor(Math.random() * pool.length)]
}

Page({
  data: {
    topInset: 10,
    editionDate: '',
    networkNote: '样例数据',
    loading: false,
    announcementText: '今日榜单正在整理，欢迎分享你在食堂发现的好味道。',
    leadDish: sampleDishes[0],
    rankingRows: sampleDishes,
    categoryRows: sampleCategories,
    randomPick: EMPTY_RANDOM_PICK,
    randomRolling: false,
    ratingScoreOptions: [1, 2, 3, 4, 5],
    registered: false,
    isAdmin: false,
    profileLabel: '设置资料',
    showSubmitSheet: false,
    submitSheetClosing: false,
    submitting: false,
    imagePath: '',
    imageName: '',
    form: {
      name: '',
      categoryName: '',
      shopName: '',
      floorName: '',
      description: '',
    } as SubmitForm,
  },

  randomRollTimer: 0,
  randomSwapTimer: 0,
  randomRollSequence: 0,
  submitSheetCloseTimer: 0,
  submitSheetSequence: 0,
  resetSubmitAfterClose: false,
  reopenSubmitAfterClose: false,
  dishes: sampleDishes,
  categoriesCache: sampleCategories,
  canteenRows: mockCanteenRows,

  onLoad() {
    const info = wx.getWindowInfo()
    this.setData({
      topInset: (info.statusBarHeight || 0) + 12,
      editionDate: formatDate(new Date()),
    })
    this.refreshAccessState()
    this.loadHomeData()
  },

  onShow() {
    this.refreshAccessState()
  },

  onUnload() {
    this.randomRollSequence += 1
    this.clearRandomRollTimers()
    this.submitSheetSequence += 1
    this.clearSubmitSheetCloseTimer()
    this.resetSubmitAfterClose = false
    this.reopenSubmitAfterClose = false
  },

  onPullDownRefresh() {
    this.loadHomeData().finally(() => wx.stopPullDownRefresh())
  },

  refreshAccessState() {
    const registered = isRegistered()
    const profile = registered ? getStoredProfile() : null
    this.setData({
      registered,
      isAdmin: Boolean(getStoredAdminToken()),
      profileLabel: profile && profile.nickname ? profile.nickname : '设置资料',
    })
  },

  openProfile() {
    wx.navigateTo({ url: '/pages/auth/register/index' })
  },

  openAdmin() {
    mediumHaptic()
    wx.navigateTo({ url: '/pages/admin/index' })
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

  async loadHomeData() {
    this.setData({ loading: true, networkNote: '正在更新' })
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
      this.setHomeData(
        rankRows.length ? '实时数据' : '样例数据',
        announcementText || '暂无公告，今天的版面留给同学推荐。',
      )
    } catch (error) {
      this.dishes = sampleDishes
      this.categoriesCache = sampleCategories
      this.canteenRows = mockCanteenRows
      this.setHomeData('离线样例', '暂时没有更新到最新内容，随机推荐仍可使用。')
    } finally {
      this.setData({ loading: false })
    }
  },

  setHomeData(networkNote: string, announcementText: string) {
    const currentRandom = this.data.randomPick
    this.setData({
      networkNote,
      announcementText,
      leadDish: this.dishes[0] || sampleDishes[0],
      rankingRows: this.dishes.slice(0, 6),
      categoryRows: this.categoriesCache.slice(0, 10),
      randomPick: currentRandom && currentRandom.key ? currentRandom : pickRandomShop(this.canteenRows),
    })
  },

  refreshData() {
    this.loadHomeData()
  },

  onLeadDishImageError() {
    const leadDish = this.data.leadDish
    if (leadDish.imageUrl === DISH_PLACEHOLDER) return

    this.dishes = this.dishes.map((dish) => (
      dish.id === leadDish.id ? { ...dish, imageUrl: DISH_PLACEHOLDER } : dish
    ))
    this.setData({ leadDish: { ...leadDish, imageUrl: DISH_PLACEHOLDER } })
  },

  clearRandomRollTimers() {
    clearTimeout(this.randomSwapTimer)
    clearTimeout(this.randomRollTimer)
    this.randomSwapTimer = 0
    this.randomRollTimer = 0
  },

  rollRandomPick() {
    this.clearRandomRollTimers()
    this.randomRollSequence += 1
    const sequence = this.randomRollSequence
    const next = pickRandomShop(this.canteenRows)
    if (!next.key) {
      this.setData({ randomRolling: false, randomPick: next })
      wx.showToast({ title: '暂无窗口数据', icon: 'none' })
      return
    }

    this.setData({ randomRolling: false }, () => {
      if (sequence !== this.randomRollSequence) return

      this.setData({ randomRolling: true }, () => {
        if (sequence !== this.randomRollSequence) return

        this.randomSwapTimer = setTimeout(() => {
          if (sequence !== this.randomRollSequence) return
          this.setData({ randomPick: next })
          this.randomSwapTimer = 0
        }, RANDOM_SWAP_DELAY)
        this.randomRollTimer = setTimeout(() => {
          if (sequence !== this.randomRollSequence) return
          this.setData({ randomRolling: false })
          this.randomRollTimer = 0
        }, RANDOM_ROLL_DURATION)
      })
    })
  },

  updateRatedDishDisplay(dish?: DishView) {
    if (!dish || !dish.id) return false

    const existing = this.dishes.find((row) => row.id === dish.id)
    const updated = mergeDisplayDish(existing, dish)
    this.dishes = this.dishes.filter((row) => row.id !== dish.id).concat(updated).sort(compareDishRank)
    this.setHomeData(this.data.networkNote, this.data.announcementText)
    return true
  },

  async onRateTap(event: WechatMiniprogram.BaseEvent) {
    const dishId = String(event.currentTarget.dataset.dishId || '')
    const score = Number(event.currentTarget.dataset.score || 0)
    if (!dishId || !score || dishId.startsWith('sample-')) {
      wx.showToast({ title: '样例不能评分', icon: 'none' })
      return
    }
    if (!isRegistered()) {
      this.promptRegister('设置资料后即可评分')
      return
    }

    wx.showLoading({ title: '评分中' })
    try {
      const ratedDish = await rateDish(dishId, score)
      if (!this.updateRatedDishDisplay(ratedDish)) await this.loadHomeData()
      wx.showToast({ title: '已评分', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '评分失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  ensureRegisteredForSubmit() {
    if (isRegistered()) return true
    this.promptRegister('设置资料后即可投稿')
    return false
  },

  openSubmitSheet() {
    if (!this.ensureRegisteredForSubmit()) return
    if (this.data.submitSheetClosing) {
      this.reopenSubmitAfterClose = true
      return
    }

    this.clearSubmitSheetCloseTimer()
    this.submitSheetSequence += 1
    this.setData({ showSubmitSheet: true, submitSheetClosing: false })
  },

  closeSubmitSheet() {
    if (!this.data.showSubmitSheet || this.data.submitSheetClosing) return

    this.clearSubmitSheetCloseTimer()
    this.reopenSubmitAfterClose = false
    this.submitSheetSequence += 1
    const sequence = this.submitSheetSequence
    this.setData({ submitSheetClosing: true }, () => {
      if (sequence !== this.submitSheetSequence) return

      this.submitSheetCloseTimer = setTimeout(() => {
        this.finishSubmitSheetClose(sequence)
      }, SUBMIT_SHEET_CLOSE_DURATION)
    })
  },

  finishSubmitSheetClose(sequence: number) {
    if (sequence !== this.submitSheetSequence) return
    this.submitSheetCloseTimer = 0
    this.setData({ showSubmitSheet: false }, () => {
      if (sequence !== this.submitSheetSequence) return
      if (this.resetSubmitAfterClose) {
        this.resetSubmitAfterClose = false
        this.resetSubmitForm()
      }
      const reopen = this.reopenSubmitAfterClose
      this.reopenSubmitAfterClose = false
      this.setData({ showSubmitSheet: reopen, submitSheetClosing: false })
    })
  },

  clearSubmitSheetCloseTimer() {
    clearTimeout(this.submitSheetCloseTimer)
    this.submitSheetCloseTimer = 0
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
          fail: () => wx.showToast({ title: '读取图片失败', icon: 'none' }),
        })
      },
      fail: (error) => {
        if (!String(error.errMsg || '').includes('cancel')) {
          wx.showToast({ title: '未能选择图片', icon: 'none' })
        }
      },
    })
  },

  clearImage() {
    this.setData({ imagePath: '', imageName: '' })
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
    if (!this.ensureRegisteredForSubmit() || this.data.submitting) return

    const submitSheetSequence = this.submitSheetSequence
    const form = this.data.form as SubmitForm
    const name = form.name.trim()
    if (!name) {
      wx.showToast({ title: '先填写菜名', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中' })
    try {
      await uploadDish({
        schoolId: SCHOOL_ID,
        name,
        categoryName: form.categoryName.trim(),
        description: form.description.trim(),
        shopName: form.shopName.trim(),
        floorName: form.floorName.trim(),
      }, this.data.imagePath)
      wx.showToast({ title: '已提交', icon: 'success' })
      if (submitSheetSequence === this.submitSheetSequence && this.data.showSubmitSheet) {
        this.resetSubmitAfterClose = true
        this.closeSubmitSheet()
      }
      void this.loadHomeData()
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '提交失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ submitting: false })
    }
  },
})
