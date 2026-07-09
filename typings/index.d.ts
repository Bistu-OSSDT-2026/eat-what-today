/// <reference path="./types/index.d.ts" />

interface IAppOption {
  globalData: {
    userInfo?: WechatMiniprogram.UserInfo,
    cloudFunctionName?: string,
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback,
}

declare namespace WechatMiniprogram {
  interface WindowInfo {
    pixelRatio: number
    screenWidth: number
    screenHeight: number
    windowWidth: number
    windowHeight: number
    statusBarHeight: number
    screenTop: number
    safeArea: {
      top: number
      bottom: number
      left: number
      right: number
      width: number
      height: number
    }
  }
  interface Wx {
    getWindowInfo(): WindowInfo
  }
}
