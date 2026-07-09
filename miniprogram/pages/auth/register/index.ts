import { getStoredProfile, isRegistered, logout, registerOrLogin, type UserProfile } from '../../../utils/api'

interface RegisterForm {
  nickname: string
  avatarUrl: string
}

const DEFAULT_NICKNAME = '微信读者'

function formatTwo(value: number) {
  return value < 10 ? `0${value}` : `${value}`
}

function trimText(value = '') {
  return value.trim()
}

function pickProfile(form: RegisterForm, wxUserInfo?: WechatMiniprogram.UserInfo): UserProfile {
  const nickname = trimText((wxUserInfo && wxUserInfo.nickName) || form.nickname) || DEFAULT_NICKNAME
  const avatarUrl = (wxUserInfo && wxUserInfo.avatarUrl) || form.avatarUrl || ''
  return { nickname, avatarUrl }
}

function getWxUserProfile() {
  return new Promise<WechatMiniprogram.UserInfo | undefined>((resolve) => {
    if (!wx.canIUse('getUserProfile')) {
      resolve(undefined)
      return
    }

    wx.getUserProfile({
      desc: '用于展示投稿和评分身份',
      success(res) {
        resolve(res.userInfo)
      },
      fail() {
        resolve(undefined)
      },
    })
  })
}

Page({
  data: {
    statusBarHeight: 0,
    readerTop: 10,
    editionDate: '',
    registered: false,
    statusLabel: '未登录',
    identityLabel: '设置后可投稿和评分',
    submitting: false,
    form: {
      nickname: '',
      avatarUrl: '',
    } as RegisterForm,
  },

  onLoad() {
    const info = wx.getWindowInfo()
    const now = new Date()
    this.setData({
      statusBarHeight: info.statusBarHeight || 0,
      readerTop: (info.statusBarHeight || 0) + 10,
      editionDate: `${now.getFullYear()}.${formatTwo(now.getMonth() + 1)}.${formatTwo(now.getDate())}`,
    })
    this.refreshProfileState()
  },

  onShow() {
    this.refreshProfileState()
  },

  refreshProfileState() {
    const existing = getStoredProfile()
    const registered = isRegistered()
    this.setData({
      registered,
      statusLabel: registered ? '已登录' : '未登录',
      identityLabel: registered ? '投稿和评分会显示该身份' : '设置后可投稿和评分',
      form: {
        nickname: existing ? existing.nickname || '' : '',
        avatarUrl: existing ? existing.avatarUrl || '' : '',
      },
    })
  },

  onChooseAvatar(event: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
    const avatarUrl = event.detail.avatarUrl || ''
    if (!avatarUrl) return
    this.setData({ 'form.avatarUrl': avatarUrl })
  },

  async submit() {
    if (this.data.submitting) return
    const form = this.data.form as RegisterForm

    this.setData({ submitting: true })
    wx.showLoading({ title: '保存中', mask: true })
    try {
      const wxUserInfo = await getWxUserProfile()
      const profile = pickProfile(form, wxUserInfo)
      this.setData({ form: profile })
      await registerOrLogin(profile)
      this.refreshProfileState()
      wx.hideLoading()
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => this.goBack(), 600)
    } catch (error) {
      wx.hideLoading()
      wx.showToast({
        title: error instanceof Error ? error.message : '保存失败',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  logoutUser() {
    wx.showModal({
      title: '退出个人身份',
      content: '退出后将不能投稿和评分，重新设置资料即可继续使用。',
      confirmText: '退出',
      confirmColor: '#b31921',
      success: (res) => {
        if (!res.confirm) return
        logout()
        this.setData({
          registered: false,
          statusLabel: '未登录',
          identityLabel: '设置后可投稿和评分',
          form: {
            nickname: '',
            avatarUrl: '',
          },
        })
        wx.showToast({ title: '已退出', icon: 'none' })
      },
    })
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 })
    } else {
      wx.redirectTo({ url: '/pages/newspaper/index' })
    }
  },
})
