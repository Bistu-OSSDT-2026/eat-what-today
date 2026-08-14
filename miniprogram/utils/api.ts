const PROFILE_STORAGE_KEY = 'dishUserProfile'
const LEGACY_USER_TOKEN_STORAGE_KEY = 'dishUserToken'
const ADMIN_SESSION_STORAGE_KEY = 'dishAdminSession'
const LEGACY_ADMIN_TOKEN_STORAGE_KEY = 'dishAdminToken'
const DEFAULT_CLOUD_FUNCTION_NAME = 'dish-api'

export interface UserProfile {
  nickname: string
  avatarUrl: string
}

export interface AdminSession {
  token: string
  expiresAt: string
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

function callCloud<T>(action: string, data: WechatMiniprogram.IAnyObject = {}) {
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

function isRemoteImage(imagePath: string) {
  return imagePath.startsWith('cloud://') || imagePath.startsWith('http://') || imagePath.startsWith('https://')
}

function uploadImage(imagePath: string, folder: string) {
  return new Promise<string>((resolve, reject) => {
    if (!wx.cloud) {
      reject(new Error('当前微信版本不支持云开发'))
      return
    }

    const extMatch = imagePath.match(/\.([a-zA-Z0-9]+)$/)
    const ext = extMatch ? extMatch[1] : 'jpg'
    const cloudPath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
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

export function getStoredProfile(): UserProfile | null {
  wx.removeStorageSync(LEGACY_USER_TOKEN_STORAGE_KEY)
  const raw = wx.getStorageSync(PROFILE_STORAGE_KEY)
  if (!raw || typeof raw !== 'object') return null
  const profile = raw as Partial<UserProfile>
  if (!profile.nickname) return null
  return { nickname: profile.nickname, avatarUrl: profile.avatarUrl || '' }
}

export function isRegistered(): boolean {
  return Boolean(getStoredProfile())
}

export function getStoredAdminToken(): string {
  const raw = wx.getStorageSync(ADMIN_SESSION_STORAGE_KEY)
  if (!raw || typeof raw !== 'object') return ''
  const session = raw as Partial<AdminSession>
  const expiresAt = Number(session.expiresAt || 0)
  if (!session.token || !expiresAt || expiresAt <= Date.now()) {
    wx.removeStorageSync(ADMIN_SESSION_STORAGE_KEY)
    return ''
  }
  return session.token
}

export function storeAdminSession(session: AdminSession) {
  wx.setStorageSync(ADMIN_SESSION_STORAGE_KEY, session)
  wx.removeStorageSync(LEGACY_ADMIN_TOKEN_STORAGE_KEY)
}

export function clearAdminSession() {
  wx.removeStorageSync(ADMIN_SESSION_STORAGE_KEY)
  wx.removeStorageSync(LEGACY_ADMIN_TOKEN_STORAGE_KEY)
}

export function logout() {
  wx.removeStorageSync(PROFILE_STORAGE_KEY)
}

export async function registerOrLogin(profile: UserProfile): Promise<void> {
  const avatarUrl = profile.avatarUrl && !isRemoteImage(profile.avatarUrl)
    ? await uploadImage(profile.avatarUrl, 'dish-avatars')
    : profile.avatarUrl
  const storedProfile = { ...profile, avatarUrl }
  const data = await callCloud<{ profile: UserProfile }>(
    'registerOrLogin',
    storedProfile as unknown as WechatMiniprogram.IAnyObject,
  )
  wx.setStorageSync(PROFILE_STORAGE_KEY, data.profile || storedProfile)
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
  return callCloud<AdminSession & { role: string; schoolId?: string; schoolName?: string }>('adminLogin', {
    password,
  })
}

export function adminLogout(token: string) {
  return callCloud<boolean>('adminLogout', { token })
}

export function dishes(schoolId = 'bistu', includeOffline = false, token = '') {
  return callCloud<DishView[]>('dishes', { schoolId, includeOffline, token, limit: 200 })
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

export function rateDish(dishId: string, score: number) {
  return callCloud<DishView>('rateDish', { dishId, score })
}

export async function uploadDish(payload: UploadDishPayload, imagePath: string) {
  const imageUrl = imagePath ? await uploadImage(imagePath, 'dish-images') : ''
  return callCloud<DishView>('createDish', {
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
