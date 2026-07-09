import {
  adminLogin,
  announcement,
  categories,
  createCategory,
  dishes,
  setAnnouncement,
  updateDish,
  type CategoryView,
  type DishView,
} from '../../utils/api'

const ADMIN_TOKEN_KEY = 'dishAdminToken'
const SCHOOL_ID = 'bistu'
const SCHOOL_NAME = '北京信息科技大学'
const DISH_PLACEHOLDER = '/images/dish-placeholder.svg'
const STATUS_TEXT: Record<string, string> = {
  ACTIVE: '上架',
  OFFLINE: '下架',
  PENDING: '待审核',
  REJECTED: '已拒绝',
}

interface DisplayDish extends DishView {
  imageUrl: string
  headlineText: string
  placeText: string
  scoreText: string
  ratingText: string
  statusText: string
  statusClass: string
}

interface EditForm {
  name: string
  categoryName: string
  shopName: string
  floorName: string
  description: string
  imageUrl: string
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
  const status = dish.status || 'ACTIVE'
  return {
    ...dish,
    imageUrl: dish.imageUrl || DISH_PLACEHOLDER,
    headlineText: buildDishHeadline(dish),
    placeText: [dish.canteenName, dish.floorName, dish.shopName].filter(Boolean).join(' · ') || '校园食堂',
    scoreText: Number(dish.avgScore || 0).toFixed(1),
    ratingText: `${dish.ratingCount || 0} 人评分`,
    statusText: STATUS_TEXT[status] || '上架',
    statusClass: status.toLowerCase(),
  }
}

function countByStatus(rows: DisplayDish[], status: string) {
  return rows.filter((dish) => (dish.status || 'ACTIVE') === status).length
}

Page({
  data: {
    schoolId: SCHOOL_ID,
    schoolName: SCHOOL_NAME,
    adminToken: '',
    password: '',
    loading: false,
    saving: false,
    activeStatus: 'all',
    statusTabs: [
      { key: 'all', label: '全部' },
      { key: 'ACTIVE', label: '上架' },
      { key: 'OFFLINE', label: '下架' },
      { key: 'PENDING', label: '待审核' },
    ],
    stats: {
      total: 0,
      active: 0,
      offline: 0,
      pending: 0,
    },
    announcement: '',
    categoryName: '',
    categories: [] as CategoryView[],
    dishes: [] as DisplayDish[],
    visibleDishes: [] as DisplayDish[],
    showEditSheet: false,
    editingDishId: '',
    editForm: {
      name: '',
      categoryName: '',
      shopName: '',
      floorName: '',
      description: '',
      imageUrl: '',
    } as EditForm,
  },

  onLoad() {
    const adminToken = (wx.getStorageSync(ADMIN_TOKEN_KEY) as string) || ''
    this.setData({ adminToken })
    if (adminToken) this.loadAdminData()
  },

  onPullDownRefresh() {
    this.loadAdminData().finally(() => wx.stopPullDownRefresh())
  },

  onPasswordInput(event: WechatMiniprogram.Input) {
    this.setData({ password: event.detail.value })
  },

  async loginAdmin() {
    const password = this.data.password.trim()
    if (!password) {
      wx.showToast({ title: '请输入管理密码', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: '登录中' })
    try {
      const session = await adminLogin(password)
      wx.setStorageSync(ADMIN_TOKEN_KEY, session.token)
      this.setData({ adminToken: session.token, password: '' })
      wx.showToast({ title: '已登录', icon: 'success' })
      await this.loadAdminData()
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '登录失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ loading: false })
    }
  },

  logoutAdmin() {
    wx.removeStorageSync(ADMIN_TOKEN_KEY)
    this.setData({ adminToken: '', dishes: [], visibleDishes: [] })
  },

  async loadAdminData() {
    if (!this.data.adminToken) return
    this.setData({ loading: true })
    try {
      const [announcementText, categoryRows, dishRows] = await Promise.all([
        announcement(this.data.schoolId),
        categories(this.data.schoolId),
        dishes(this.data.schoolId, true),
      ])
      const normalizedDishes = dishRows.map(normalizeDish)
      this.setData({
        announcement: announcementText || '',
        categories: categoryRows,
        dishes: normalizedDishes,
        stats: {
          total: normalizedDishes.length,
          active: countByStatus(normalizedDishes, 'ACTIVE'),
          offline: countByStatus(normalizedDishes, 'OFFLINE'),
          pending: countByStatus(normalizedDishes, 'PENDING'),
        },
      })
      this.applyStatusFilter()
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyStatusFilter() {
    const { activeStatus, dishes: dishRows } = this.data
    const visibleDishes = activeStatus === 'all'
      ? dishRows
      : dishRows.filter((dish) => (dish.status || 'ACTIVE') === activeStatus)
    this.setData({ visibleDishes })
  },

  switchStatus(event: WechatMiniprogram.BaseEvent) {
    this.setData({ activeStatus: String(event.currentTarget.dataset.status || 'all') })
    this.applyStatusFilter()
  },

  onAnnouncementInput(event: WechatMiniprogram.Input) {
    this.setData({ announcement: event.detail.value })
  },

  async saveAnnouncement() {
    this.setData({ saving: true })
    try {
      await setAnnouncement(this.data.adminToken, this.data.schoolId, this.data.announcement.trim())
      wx.showToast({ title: '公告已保存', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  onCategoryInput(event: WechatMiniprogram.Input) {
    this.setData({ categoryName: event.detail.value })
  },

  async addCategory() {
    const name = this.data.categoryName.trim()
    if (!name) {
      wx.showToast({ title: '请输入分类名', icon: 'none' })
      return
    }

    try {
      const category = await createCategory(this.data.adminToken, this.data.schoolId, name)
      this.setData({
        categoryName: '',
        categories: [...this.data.categories, category],
      })
      wx.showToast({ title: '分类已添加', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '添加失败', icon: 'none' })
    }
  },

  async updateDishStatus(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    const status = String(event.currentTarget.dataset.status || '')
    if (!id || !status) return

    try {
      await updateDish(this.data.adminToken, id, { status })
      wx.showToast({ title: status === 'ACTIVE' ? '已上架' : '已下架', icon: 'success' })
      await this.loadAdminData()
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '操作失败', icon: 'none' })
    }
  },

  openEditSheet(event: WechatMiniprogram.BaseEvent) {
    const dish = this.data.dishes.find((item) => item.id === event.currentTarget.dataset.id)
    if (!dish) return
    this.setData({
      showEditSheet: true,
      editingDishId: dish.id,
      editForm: {
        name: dish.name || '',
        categoryName: dish.categoryName || '',
        shopName: dish.shopName || '',
        floorName: dish.floorName || '',
        description: dish.description || '',
        imageUrl: dish.imageUrl === DISH_PLACEHOLDER ? '' : dish.imageUrl || '',
      },
    })
  },

  closeEditSheet() {
    this.setData({ showEditSheet: false, editingDishId: '' })
  },

  onEditInput(event: WechatMiniprogram.Input) {
    const field = String(event.currentTarget.dataset.field || '') as keyof EditForm
    if (!field) return
    this.setData({ [`editForm.${field}`]: event.detail.value })
  },

  async saveDishEdit() {
    const { editForm, editingDishId } = this.data
    if (!editingDishId) return
    if (!editForm.name.trim()) {
      wx.showToast({ title: '菜名不能为空', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      await updateDish(this.data.adminToken, editingDishId, {
        name: editForm.name.trim(),
        categoryName: editForm.categoryName.trim(),
        shopName: editForm.shopName.trim(),
        floorName: editForm.floorName.trim(),
        description: editForm.description.trim(),
        imageUrl: editForm.imageUrl.trim(),
      })
      wx.showToast({ title: '菜品已保存', icon: 'success' })
      this.closeEditSheet()
      await this.loadAdminData()
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
})
