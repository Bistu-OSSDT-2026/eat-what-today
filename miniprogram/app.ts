// app.ts
import { enhancePageOptions } from './utils/haptic'

type HapticPageConstructor = WechatMiniprogram.Page.Constructor & {
  __hapticWrapperInstalled?: boolean
}

function installHapticPageWrapper(): void {
  if (typeof Page !== 'function') return

  const originalPage = Page as HapticPageConstructor
  if (originalPage.__hapticWrapperInstalled) return

  const patchedPage = (<
    TData extends WechatMiniprogram.Page.DataOption,
    TCustom extends WechatMiniprogram.Page.CustomOption,
  >(options: WechatMiniprogram.Page.Options<TData, TCustom>) => {
    originalPage(enhancePageOptions(options))
  }) as HapticPageConstructor

  patchedPage.__hapticWrapperInstalled = true
  Page = patchedPage
}

installHapticPageWrapper()

App<IAppOption>({
  globalData: {
    cloudFunctionName: 'dish-api',
  },
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        traceUser: true,
      })
    }
  },
})
