import { rankings, API_BASE_URL } from '../../utils/api'

interface DishItem {
  id: string
  name: string
  headline: string
  imageUrl: string
  shopText: string
  scoreText: string
  ratingText: string
}

Page({
  data: {
    dishes: [] as DishItem[],
    loading: true,
    empty: false,
  },

  onShow() {
    this.loadFavorites()
  },

  async loadFavorites() {
    this.setData({ loading: true })
    const favoriteIds: string[] = wx.getStorageSync('favorite_dish_ids') || []

    if (!favoriteIds.length) {
      this.setData({ dishes: [], empty: true, loading: false })
      return
    }

    try {
      const rows = await rankings('bistu', 200)
      const favoriteMap = new Set(favoriteIds)
      const dishes: DishItem[] = rows
        .filter((d: any) => favoriteMap.has(String(d.id)))
        .map((d: any) => {
          let imageUrl = d.imageUrl || ''
          if (imageUrl && imageUrl.startsWith('/') && !imageUrl.startsWith('/images/dish-placeholder')) {
            imageUrl = `${API_BASE_URL}${imageUrl}`
          }
          return {
            id: String(d.id),
            name: d.name || '',
            headline: d.headline || `${d.name || '这道菜'}登上今日风味榜`,
            imageUrl,
            shopText: [d.canteenName, d.floorName, d.shopName].filter(Boolean).join(' · ') || '校园食堂',
            scoreText: Number(d.avgScore || 0).toFixed(1),
            ratingText: `${d.ratingCount || 0} 人评价`,
          }
        })

      this.setData({ dishes, empty: dishes.length === 0, loading: false })
    } catch {
      this.setData({ dishes: [], empty: true, loading: false })
    }
  },

  toggleFavorite(event: WechatMiniprogram.CustomEvent) {
    const dishId = String(event.currentTarget.dataset.dishId || '')
    if (!dishId) return

    let favoriteIds: string[] = wx.getStorageSync('favorite_dish_ids') || []
    const index = favoriteIds.indexOf(dishId)

    if (index > -1) {
      favoriteIds.splice(index, 1)
      wx.showToast({ title: '已取消收藏', icon: 'success' })
    } else {
      favoriteIds.push(dishId)
      wx.showToast({ title: '已收藏', icon: 'success' })
    }

    wx.setStorageSync('favorite_dish_ids', favoriteIds)
    this.loadFavorites()
  },

  goBack() {
    wx.navigateBack()
  },
})
