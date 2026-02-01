# koishi-plugin-qq-group-join-verification

Koishi 插件，用于 QQ 群加群验证，支持多适配器、多群独立配置、图片验证码、超时拒绝、白名单、数据库持久化、Console 可视化后台。

## 📋 更新记录

### v1.0.7
- 优化构建配置：
  - 改回使用 TypeScript 源码（src目录），避免构建错误
  - 移除不存在的 @types/svg-captcha 依赖
  - 确保插件能够正确加载和运行

### v1.0.6
- 优化构建配置：
  - 改为使用编译后的代码（lib目录）
  - 添加 prepublishOnly 脚本，确保发布前自动构建
  - 修复模块导入错误

### v1.0.3
- 变更验证码发送方式：从私聊发送改为群内直接发送
- 优化验证流程，提高用户体验
- 修复相关消息处理逻辑
- 更新验证码发送格式：
  ```
  欢迎加入日常分享群～进群请发：
  【验证码】
  发完即可畅聊，禁止广告、刷屏、引战。
  ```
- 设置验证码时长默认为5分钟（300秒）
- 添加超级管理员指令功能：
  - `verify enable` - 开启群验证
  - `verify disable` - 关闭群验证
  - `verify mode <mode>` - 切换验证方式（captcha/image-captcha/whitelist）
  - `verify timeout <seconds>` - 设置验证码时长
  - `verify whitelist add <userId> [remark]` - 添加白名单
  - `verify whitelist remove <userId>` - 移除白名单
  - `verify whitelist list` - 查看白名单
  - `verify audit` - 查询验证记录
- 管理员可以通过指令控制群验证功能，无需进入控制台

### v1.0.2
- 修复依赖版本问题，移除对 @koishijs/plugin-database 的直接依赖
- 优化依赖配置，确保与 Koishi v4 兼容
- 修复市场插件解析错误

### v1.0.1
- 添加作者邮箱：kate522@88.com
- 添加 GitHub 仓库地址：https://github.com/Lexo0522/koishi-plugin-qq-group-join-verification
- 优化 README.md 文档结构

### v1.0.0
- 初始版本
- 支持多群独立配置
- 支持多种验证模式（白名单、文本验证码、图片验证码）
- 支持群内用户免验证
- 支持超时拒绝
- 支持白名单系统
- 支持验证记录（审计）
- 支持多适配器兼容
- 支持 Console 可视化后台

## 📦 安装

### 方法一：通过 Npm 安装

```bash
npm install koishi-plugin-qq-group-join-verification
```

### 方法二：手动安装

将 `koishi-plugin-qq-group-join-verification` 目录复制到 Koishi 的 `plugins` 目录中。

## 🚀 快速开始

### 1. 启用插件

在 Koishi 配置文件中启用插件，并确保已启用以下插件：
- `@koishijs/plugin-database`（数据库支持）
- `@koishijs/plugin-console`（控制台支持）

### 2. 配置插件

打开 Koishi 控制台，进入「QQ 群加入验证」页面：

#### 群配置
- **选择群聊**：选择需要配置的群
- **验证模式**：
  - `whitelist`：仅白名单通过
  - `captcha`：随机文本验证码
  - `image-captcha`：SVG 图片验证码（带干扰线、噪点）
- **验证码长度**：设置验证码的长度（3-8位）
- **超时时间**：设置验证超时时间（秒）
- **跳过群内用户**：已在群内的用户直接通过，不进入验证流程
- **自定义消息模板**：
  - `{captcha}`：验证码
  - `{timeout}`：超时秒数

#### 白名单管理
- **添加白名单**：输入用户 ID 和备注，点击「添加白名单」
- **删除白名单**：点击白名单列表中的「删除」按钮

## ✨ 功能特性

### 多群独立配置
- 每个群可独立设置验证模式、验证码长度、超时时间等
- 配置持久化到数据库

### 多种验证模式
- **whitelist**：仅白名单通过
- **captcha**：随机文本验证码
- **image-captcha**：SVG 图片验证码（带干扰线、噪点）

### 智能验证
- **群内用户免验证**：调用 API 检查用户是否已在群内，是则直接通过
- **超时拒绝**：每个加群申请独立计时，超时未回复自动拒绝
- **白名单系统**：白名单用户直接通过，无需验证

### 审计功能
- **验证记录**：记录群号、用户、验证类型、结果、时间
- **用于排查、统计**：可查询验证历史，分析验证通过率

### 多适配器兼容
- **adapter-onebot**：支持 OneBot 协议适配器
- **adapter-red**：支持 Red 协议适配器
- **adapter-milky**：支持 Milky 协议适配器

### 可视化后台
- **Koishi Console**：Vue3 配置面板
- **群配置编辑**：切换群、保存配置
- **白名单管理**：增删查

## 🛠 技术实现

### 后端
- **语言**：TypeScript + Node.js
- **框架**：Koishi v4
- **数据库**：基于 @koishijs/plugin-database，支持 SQLite / MySQL
- **图片验证码**：svg-captcha（轻量、跨平台、Base64 直接发送）

### 前端
- **框架**：Vue3 + Koishi Console
- **组件**：Element Plus
- **API**：Koishi Console API

### 核心流程
1. 收到加群请求
2. 解析请求，获取群号、用户 ID、标识
3. 加载该群独立配置
4. 检查是否已在群内 → 直接通过
5. 检查白名单 → 直接通过
6. 生成验证码（文本 / 图片），缓存，设置超时
7. 私聊发送验证码
8. 监听私聊回复，校验验证码
9. 通过 → 同意加群；失败 → 拒绝；超时 → 自动拒绝
10. 所有结果写入验证记录

## 📁 目录结构

```
src/
├── index.ts                 # 插件入口，注册事件、Console、数据库
├── service.ts               # 核心业务逻辑：加群处理、验证码、超时、私聊验证
├── adapter/
│   └── index.ts             # 适配器兼容层：统一 approve/reject/解析请求
├── db/
│   ├── model.ts             # 数据库模型（白名单、群配置、验证记录）
│   └── service.ts           # 数据库 CRUD 封装
├── utils/
│   └── captcha.ts           # 文本/图片验证码生成、校验、缓存
└── client/
    ├── index.ts             # Console 路由、API、页面注册
    └── pages/
        └── config.vue       # 多群配置 + 白名单管理前端页面
```

## 🎯 使用场景

1. **防止广告机器人**：通过验证码过滤机器人群
2. **提高群聊质量**：确保加入群聊的用户是真实用户
3. **管理群聊成员**：通过白名单系统控制群成员质量
4. **审计需求**：记录所有加群验证记录，便于后续排查

## 🔧 常见问题

### 1. 验证码发送失败
- **原因**：机器人无法发送私聊消息
- **解决方案**：确保机器人有发送私聊消息的权限

### 2. 加群请求处理失败
- **原因**：机器人没有群管理权限
- **解决方案**：确保机器人有群管理权限，能够处理加群请求

### 3. 适配器不兼容
- **原因**：使用了未适配的适配器
- **解决方案**：修改 `src/adapter/index.ts` 文件，添加对该适配器的支持

### 4. 数据库连接失败
- **原因**：数据库配置错误
- **解决方案**：检查 `@koishijs/plugin-database` 插件的配置

## 📄 许可证

MIT License

## 👨‍💻 作者

- **姓名**：kate522
- **邮箱**：kate522@88.com
- **GitHub**：[Lexo0522](https://github.com/Lexo0522)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request，共同改进插件功能。

## 📞 联系方式

如有问题，请在 GitHub 上提交 Issue，或发送邮件至 kate522@88.com。

## 🔗 相关链接

- **GitHub 仓库**：[koishi-plugin-qq-group-join-verification](https://github.com/Lexo0522/koishi-plugin-qq-group-join-verification)
- **Npm 包**：[koishi-plugin-qq-group-join-verification](https://www.npmjs.com/package/koishi-plugin-qq-group-join-verification)

---

**Koishi 插件：QQ 群加入验证** - 让群聊管理更智能、更安全！