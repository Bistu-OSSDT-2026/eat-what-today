# 明天吃什么日报（Eat What Today）

一款面向高校食堂的菜品推荐微信小程序，同时支持 Web 端访问。解决"今天吃什么"的选择困难，提供菜品榜单、随机推荐、搜索收藏、评分投稿等功能。

---

## 项目信息

- **仓库地址：** https://github.com/Bistu-OSSDT-2026/eat-what-today
- **Web 端访问：** https://eat-what-today.onrender.com
- **开发团队：** 张俊豪、李思宇、王子墨、贾明睿、张宇航
- **指导教师：** 李宁
- **开源协议：** MIT License

---

## 功能特性

### 小程序端
- **首页（01版）：** 报纸风格排版，展示推荐菜品和随机推荐
- **榜单页（02版）：** 食堂各楼层菜品榜单，支持评分排序
- **菜品搜索：** 按关键词实时搜索菜品
- **我的收藏：** 收藏喜欢的菜品，独立页面管理
- **评分系统：** 用户对菜品打分，自动计算平均分
- **菜品投稿：** 提交新菜品信息，等待审核
- **随机推荐：** 一键随机推荐食堂窗口

### Web 端
- 与小程序一致的核心功能
- 响应式报纸风格界面
- 独立的登录注册系统
- 管理员后台审核功能

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 小程序前端 | 微信小程序原生框架（WXML + WXSS + TypeScript） |
| Web 前端 | HTML + CSS + JavaScript |
| 后端 API | Node.js + Express |
| 数据库 | SQLite3 |
| 云开发 | 微信云开发（云函数 + 云数据库）|
| 部署 | Render（Web端）、微信小程序平台 |

---

## 项目结构

```
eat-what-today/
├── miniprogram/              # 微信小程序端
│   ├── pages/                # 页面
│   │   ├── newspaper/        # 首页+榜单（01版/02版）
│   │   │   ├── index.ts
│   │   │   ├── index.wxml
│   │   │   ├── index.scss
│   │   │   └── index.json
│   │   ├── favorites/        # 我的收藏
│   │   │   ├── index.ts
│   │   │   ├── index.wxml
│   │   │   ├── index.scss
│   │   │   └── index.json
│   │   ├── detail/           # 菜品详情
│   │   ├── submit/           # 菜品投稿
│   │   └── auth/             # 登录注册
│   ├── utils/                # 工具函数
│   │   └── api.ts            # API封装（支持云开发/REST切换）
│   ├── app.ts                # 小程序全局逻辑
│   ├── app.json              # 小程序全局配置
│   └── app.scss              # 小程序全局样式
├── server/                   # REST API后端
│   ├── index.js              # Express主入口
│   ├── index.html            # Web端页面
│   ├── package.json          # 后端依赖
│   └── public/
│       └── images/           # 菜品图片资源（dish1.jpg ~ dish12.jpg）
├── cloudfunctions/           # 微信云函数
│   └── dish-api/             # 菜品相关云函数
│       └── index.js
├── .github/
│   └── workflows/            # GitHub Actions CI
│       └── ci.yml
├── README.md                 # 项目说明
└── LICENSE                   # 开源协议
```

---

## 本地运行

### 小程序端
1. 克隆仓库：`git clone https://github.com/Bistu-OSSDT-2026/eat-what-today.git`
2. 使用微信开发者工具打开 `miniprogram` 目录
3. 在 `utils/api.ts` 中切换 `USE_REST_API` 控制数据源
4. 点击编译运行

### Web 端
```bash
cd server
npm install
node index.js
# 访问 http://localhost:3000
```

---

## 团队分工

| 成员 | 主要职责 |
|------|---------|
| 张俊豪 | 微信小程序云开发、项目初始化 |
| 李思宇 | 功能开发、Bug修复、CI构建、部署、Issue组织 |
| 王子墨 | 测试、项目集成、版本发布、PR Review |
| 贾明睿 | 测试、项目集成、版本发布、PR Review |
| 张宇航 | 项目分析、PR Review、文档撰写 |

---

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.1 | 2026-07-09 | 小程序+Web双端可用，新增搜索/收藏/REST API后端 |
| web-v1.0 | 2026-07-09 | 独立REST API后端上线，支持Web端访问 |

---

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

---

**北京信息科技大学 - 开源软件开发课程实践项目**
