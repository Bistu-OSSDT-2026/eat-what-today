// app.ts
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
