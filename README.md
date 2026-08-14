# 今天吃什么（Eat What Today）

北京信息科技大学校园食堂推荐微信小程序。用户可以随机选择窗口、查看评分榜、投稿菜品和评分；管理员可以审核菜品、维护分类与首页公告。

## 项目信息

- 仓库：`Bistu-OSSDT-2026/eat-what-today`
- 开发团队：张俊豪、李思宇、王子墨、贾明睿、张宇航
- 指导教师：李宁
- 开源协议：MIT License

## 当前功能

- 首页随机推荐、今日首选和风味榜
- 用户评分和菜品投稿
- 微信头像、昵称资料设置
- 管理员登录、菜品审核、分类和公告维护
- 云函数身份校验、内容安全检查和管理员会话保护

## 项目结构

```text
miniprogram/
  pages/newspaper/       首页、榜单和投稿
  pages/auth/register/   用户资料
  pages/admin/           管理后台
  utils/api.ts           云函数调用
cloudfunctions/
  dish-api/              菜品、评分、资料和管理接口
scripts/
  check-release.js       发布规则检查
  test-dish-api.js       云函数行为检查
```

## 本地检查

```bash
npm install
npm run check
```

使用微信开发者工具导入仓库根目录。项目配置已经指定：

- 小程序目录：`miniprogram/`
- 云函数目录：`cloudfunctions/`
- 云函数名称：`dish-api`

## 首次云环境配置

1. 在微信开发者工具中为当前 AppID 开通云开发环境。
2. 上传并部署 `cloudfunctions/dish-api`，选择“云端安装依赖”。
3. 为云函数配置环境变量 `ADMIN_PASSWORD`，不要把密码写入代码或配置文件。
4. 首次调用时，云函数会自动创建 `cloudfunctions/dish-api/README.md` 中列出的数据库集合。
5. 在小程序管理后台配置《用户隐私保护指引》，声明头像昵称和相册或拍摄图片的实际用途。

## 发布前门禁

1. `npm run check` 通过。
2. 微信开发者工具预览编译通过。
3. 真机验证随机推荐、资料保存、头像上传、投稿、评分、管理员登录、审核和退出。
4. 确认云函数已经部署到目标环境，且 `ADMIN_PASSWORD` 已配置。
5. 在微信公众平台完成隐私保护指引、类目、服务内容和版本说明。

本地修改、Git 提交、云函数部署、体验版预览和正式发布是五个独立状态，不能互相替代。

## 历史版本

- `v1.1`
- `web-v1.0`

## 许可证

本项目采用 [MIT License](LICENSE) 开源。

**北京信息科技大学 - 开源软件开发课程实践项目**
