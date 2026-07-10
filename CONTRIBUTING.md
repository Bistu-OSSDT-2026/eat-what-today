# 贡献指南

感谢你对"明天吃什么日报"项目的关注！本文档将指导你如何为项目做出贡献。

---

## 开发环境准备

1. 克隆仓库
   ```bash
   git clone https://github.com/Bistu-OSSDT-2026/eat-what-today.git
   cd eat-what-today
   ```

2. 安装依赖
   ```bash
   cd server
   npm install
   ```

3. 使用微信开发者工具打开 `miniprogram` 目录

---

## 分支规范

- `main`：主分支，仅用于发布稳定版本
- `feature/xxx`：功能开发分支
- `fix/xxx`：Bug 修复分支

**禁止直接向 main 分支提交代码**，所有修改必须通过 Pull Request 合并。

---

## 提交规范

提交信息格式：`type: 描述内容`

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档更新 |
| `style` | 代码格式调整（不影响功能）|
| `refactor` | 代码重构 |
| `chore` | 构建/工具变更 |

示例：
```
feat: 添加菜品搜索功能
fix: 修复评分计算错误
docs: 更新README说明
```

---

## Issue 规范

提交 Issue 前请先搜索是否已存在相关问题。

- **Bug 报告**：使用 Bug 报告模板，描述复现步骤
- **功能建议**：使用功能建议模板，说明使用场景

---

## Pull Request 流程

1. 从 `main` 创建新的功能分支：`git checkout -b feature/xxx`
2. 在分支上进行开发
3. 提交前确保代码可以正常运行
4. 提交到远程仓库：`git push origin feature/xxx`
5. 在 GitHub 上创建 Pull Request
6. 等待至少 1 位团队成员 Review
7. Review 通过后合并到 `main`

---

## 代码规范

- 使用 2 个空格缩进
- 变量/函数名使用驼峰命名法
- 注释使用中文，便于团队理解
- 提交前删除 `console.log` 调试代码

---

## 联系方式

如有疑问，请通过 GitHub Issues 联系项目维护者。

---

**北京信息科技大学 - 开源软件开发课程实践项目**
