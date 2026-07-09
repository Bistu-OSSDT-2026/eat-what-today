const TOKEN_STORAGE_KEY = 'dishUserToken'
const PROFILE_STORAGE_KEY = 'dishUserProfile'
const DEFAULT_CLOUD_FUNCTION_NAME = 'dish-api'

// REST API 配置（部署后修改这里）
const API_BASE_URL = 'https://your-render-app.onrender.com'
const USE_REST_API = false // 设为 true 切换到 REST API 模式

export interface UserProfile {
  nickname: string
  avatarUrl: string
}

export interface DishView {
  id: string
  name: string
  description?: string
  imageUrl?: string
  categoryName?: string
  canteenName?: string
  floorName?: string
  shopName?: string
  headline?: string
  avgScore?: number
  ratingCount?: number
  status?: string
  rankScore?: number
}

export interface CategoryView {
  id: string
  name: string
}

export interface CanteenFloorView {
  name: string
  shops: string[]
}

export interface CanteenView {
  _id: string
  id?: string
  schoolId?: string
  name: string
  floors: CanteenFloorView[]
}

export interface UploadDishPayload {
  schoolId: string
  name: string
  categoryName?: string
  description?: string
  shopName?: string
  floorName?: string
}

interface CloudResponse<T> {
  success?: boolean
  data?: T
  message?: string
}

function getCloudFunctionName() {
  const app = getApp<IAppOption>()
  return app.globalData.cloudFunctionName || DEFAULT_CLOUD_FUNCTION_NAME
}

function cleanPayload(payload: Record<string, string>) {
  const data: Record<string, string> = {}
  Object.keys(payload).forEach((key) => {
    const value = payload[key]
    if (value !== undefined && value !== '') data[key] = value
  })
  return data
}

function unwrap<T>(body: CloudResponse<T>) {
  if (body.success === false) throw new Error(body.message || '请求失败')
  return body.data as T
}

function callRestApi<T>(action: string, data: WechatMiniprogram.IAnyObject = {}) {
  return new Promise<T>((resolve, reject) => {
    const token = wx.getStorageSync(TOKEN_STORAGE_KEY)
    const url = `${API_BASE_URL}/api/${action}`
    const isGet = ['rankings', 'categories', 'announcement', 'canteenData', 'dishes'].includes(action)

    const requestData: WechatMiniprogram.RequestOption = {
      url,
      method: isGet ? 'GET' : 'POST',
      header: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-User-Token': token } : {}),
      },
      success(res) {
        const result = res.data as CloudResponse<T>
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(unwrap<T>(result))
          } catch (error) {
            reject(error)
          }
        } else {
          reject(new Error(result.message || `HTTP ${res.statusCode}`))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'))
      },
    }

    if (isGet) {
      const query = Object.keys(data)
        .filter((k) => data[k] !== undefined && data[k] !== '')
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(data[k]))}`)
        .join('&')
      if (query) requestData.url += `?${query}`
    } else {
      requestData.data = data
    }

    wx.request(requestData)
  })
}

function callCloud<T>(action: string, data: WechatMiniprogram.IAnyObject = {}) {
  if (USE_REST_API) {
    return callRestApi<T>(action, data)
  }

  return new Promise<T>((resolve, reject) => {
    if (!wx.cloud) {
      reject(new Error('当前微信版本不支持云开发'))
      return
    }

    wx.cloud.callFunction({
      name: getCloudFunctionName(),
      data: { action, data },
      success(res) {
        try {
          resolve(unwrap<T>((res.result || {}) as CloudResponse<T>))
        } catch (error) {
          reject(error)
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '云函数调用失败'))
      },
    })
  })
}

function uploadImage(imagePath: string) {
  return new Promise<string>((resolve, reject) => {
    if (!wx.cloud) {
      reject(new Error('当前微信版本不支持云开发'))
      return
    }

    const extMatch = imagePath.match(/\.([a-zA-Z0-9]+)$/)
    const ext = extMatch ? extMatch[1] : 'jpg'
    const cloudPath = `dish-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    wx.cloud.uploadFile({
      cloudPath,
      filePath: imagePath,
      success(res) {
        resolve(res.fileID)
      },
      fail(err) {
        reject(new Error(err.errMsg || '图片上传失败'))
      },
    })
  })
}

export function getStoredToken(): string {
  return (wx.getStorageSync(TOKEN_STORAGE_KEY) as string) || ''
}

export function getStoredProfile(): UserProfile | null {
  const raw = wx.getStorageSync(PROFILE_STORAGE_KEY)
  if (!raw || typeof raw !== 'object') return null
  const profile = raw as Partial<UserProfile>
  if (!profile.nickname) return null
  return { nickname: profile.nickname, avatarUrl: profile.avatarUrl || '' }
}

export function isRegistered(): boolean {
  return Boolean(getStoredToken() && getStoredProfile())
}

export function logout() {
  wx.removeStorageSync(TOKEN_STORAGE_KEY)
  wx.removeStorageSync(PROFILE_STORAGE_KEY)
}

export async function registerOrLogin(profile: UserProfile): Promise<string> {
  const data = await callCloud<{ token: string }>('registerOrLogin', profile as unknown as WechatMiniprogram.IAnyObject)
  wx.setStorageSync(TOKEN_STORAGE_KEY, data.token)
  wx.setStorageSync(PROFILE_STORAGE_KEY, profile)
  return data.token
}

export function rankings(schoolId = 'bistu', limit = 20) {
  return callCloud<DishView[]>('rankings', { schoolId, limit })
}

export function categories(schoolId = 'bistu') {
  return callCloud<CategoryView[]>('categories', { schoolId })
}

export function announcement(schoolId = 'bistu') {
  return callCloud<string>('announcement', { schoolId })
}

export function canteenData(schoolId = 'bistu') {
  return callCloud<CanteenView[]>('canteenData', { schoolId })
}

export function adminLogin(password: string) {
  return callCloud<{ token: string; expiresAt: string; role: string; schoolId?: string; schoolName?: string }>('adminLogin', {
    password,
  })
}

export function dishes(schoolId = 'bistu', includeOffline = false) {
  return callCloud<DishView[]>('dishes', { schoolId, includeOffline, limit: 200 })
}

export function updateDish(token: string, dishId: string, patch: Partial<DishView>) {
  return callCloud<DishView>('updateDish', {
    token,
    dishId,
    patch: patch as WechatMiniprogram.IAnyObject,
  })
}

export function setAnnouncement(token: string, schoolId: string, content: string) {
  return callCloud<boolean>('setAnnouncement', { token, schoolId, content })
}

export function createCategory(token: string, schoolId: string, name: string) {
  return callCloud<CategoryView>('createCategory', { token, schoolId, name })
}

export function rateDish(token: string, dishId: string, score: number) {
  return callCloud<DishView>('rateDish', { token, dishId, score })
}

export async function uploadDish(token: string, payload: UploadDishPayload, imagePath: string) {
  const imageUrl = imagePath ? await uploadImage(imagePath) : ''
  return callCloud<DishView>('createDish', {
    token,
    ...cleanPayload({
      schoolId: payload.schoolId,
      name: payload.name,
      categoryName: payload.categoryName || '',
      description: payload.description || '',
      shopName: payload.shopName || '',
      floorName: payload.floorName || '',
      imageUrl,
    }),
  })
}
