# dish-api 云函数

这是小程序的云开发后端聚合函数，替代原外部 `dish-api` REST 服务。

## 部署步骤

1. 在微信开发者工具中开通云开发，并选择当前小程序环境。
2. 上传并部署 `cloudfunctions/dish-api`，首次部署会安装 `wx-server-sdk`。
3. 在云函数环境变量中配置 `ADMIN_PASSWORD`，后台登录密码只在云函数端校验。
4. 首次调用时，云函数会自动创建下列集合；初始分类和公告可在管理后台维护。

## 使用的集合

- `dish_users`：读者资料
- `dish_dishes`：菜品
- `dish_categories`：分类
- `dish_announcements`：公告
- `dish_canteens`：食堂窗口
- `dish_ratings`：评分记录
- `dish_admin_sessions`：后台登录会话
- `dish_admin_login_attempts`：管理员登录失败次数和短期锁定

## 注意事项

- 投稿默认进入 `PENDING`，需要后台上架后才会进入榜单。
- 投稿和评分会在云函数中按真实微信身份检查是否已设置资料，客户端不保存 `openid`。
- 昵称、投稿文本和投稿图片会调用微信内容安全接口；明确违规直接拒绝，异常结果保持待审核。
- 后台密码不要写入小程序代码，必须使用云函数环境变量 `ADMIN_PASSWORD`。
- 管理员会话绑定登录者微信身份，两小时过期；同一微信 15 分钟内最多失败 5 次。
- 图片通过 `wx.cloud.uploadFile` 上传，菜品里保存的是云文件 `fileID`。
