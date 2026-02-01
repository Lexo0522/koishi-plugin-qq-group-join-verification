import { Bot, Context, Session } from '@koishijs/core'
import { AdapterService, GroupRequest } from './adapter'
import { DatabaseService } from './db/service'
import { captchaService } from './utils/captcha'
import { GroupConfig, VerifyRecord, VerifyType, VerifyResult } from './db/model'

interface PendingRequest {
  bot: Bot
  request: GroupRequest
  config: GroupConfig
  captcha?: string
  startTime: number
  timeoutTimer: NodeJS.Timeout
}

class JoinVerificationService {
  private adapterService: AdapterService
  private databaseService: DatabaseService
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private logger: ReturnType<Context['logger']>

  constructor(private ctx: Context) {
    this.adapterService = new AdapterService(ctx)
    this.databaseService = new DatabaseService(ctx)
    this.logger = ctx.logger('qq-group-join-verification')
    this.init()
  }

  private init() {
    this.ctx.on('notice/group-request', this.handleRequest.bind(this))
    this.ctx.on('notice.group.request.add', this.handleRequest.bind(this))
    this.ctx.on('milky.group.request.add', this.handleRequest.bind(this))
    this.ctx.on('message/group', this.handleGroupMessage.bind(this))
    this.registerCommands()
  }

  private registerCommands() {
    // 注册超级管理员指令
    this.ctx.command('verify', '群验证管理', {
      usage: 'verify <action> [params...]',
      examples: [
        'verify enable - 开启群验证',
        'verify disable - 关闭群验证',
        'verify mode captcha - 设置验证模式为文本验证码',
        'verify timeout 300 - 设置验证码时长为5分钟',
        'verify whitelist add 123456 - 添加白名单',
        'verify whitelist remove 123456 - 移除白名单',
        'verify whitelist list - 查看白名单',
        'verify audit - 查询验证记录',
        'verify admin add 123456 - 添加超级管理员',
        'verify admin remove 123456 - 移除超级管理员',
        'verify admin list - 查看超级管理员',
      ],
    })
      .action(async (session, action, ...params) => {
        const { groupId, userId } = session
        if (!groupId) return '请在群内使用此命令'

        // 检查是否为超级管理员
        const isSuperAdmin = await this.databaseService.isSuperAdmin(userId)
        if (!isSuperAdmin) return '权限不足，只有超级管理员可以使用此命令'

        switch (action) {
          case 'enable':
            return this.enableVerification(groupId)
          case 'disable':
            return this.disableVerification(groupId)
          case 'mode':
            return this.setVerifyMode(groupId, params[0])
          case 'timeout':
            return this.setVerifyTimeout(groupId, parseInt(params[0]))
          case 'whitelist':
            return this.manageWhitelist(userId, params[0], parseInt(params[1]), params[2])
          case 'audit':
            return this.getAuditData(groupId)
          case 'admin':
            return this.manageSuperAdmin(params[0], parseInt(params[1]), params[2])
          default:
            return '未知命令，请使用 verify help 查看帮助'
        }
      })
  }

  private async manageSuperAdmin(action: string, targetUserId: number, remark?: string): Promise<string> {
    if (isNaN(targetUserId)) {
      return '无效的用户ID'
    }

    switch (action) {
      case 'add':
        await this.databaseService.addSuperAdmin(targetUserId, remark)
        return `已添加用户 ${targetUserId} 为超级管理员`
      case 'remove':
        await this.databaseService.removeSuperAdmin(targetUserId)
        return `已移除用户 ${targetUserId} 的超级管理员权限`
      case 'list':
        const admins = await this.databaseService.getSuperAdmins()
        if (admins.length === 0) {
          return '暂无超级管理员'
        }
        return admins.map(admin => `${admin.userId}${admin.remark ? ` (${admin.remark})` : ''}`).join('\n')
      default:
        return '无效的超级管理员操作，请使用 add/remove/list'
    }
  }

  private async enableVerification(groupId: number): Promise<string> {
    const config = await this.getGroupConfig(groupId)
    config.mode = 'captcha' // 默认启用文本验证码
    await this.databaseService.setGroupConfig(config)
    return '群验证已开启，默认使用文本验证码模式'
  }

  private async disableVerification(groupId: number): Promise<string> {
    const config = await this.getGroupConfig(groupId)
    config.mode = 'whitelist' // 设置为白名单模式，相当于关闭验证
    await this.databaseService.setGroupConfig(config)
    return '群验证已关闭'
  }

  private async setVerifyMode(groupId: number, mode: string): Promise<string> {
    const validModes = ['whitelist', 'captcha', 'image-captcha']
    if (!validModes.includes(mode)) {
      return `无效的验证模式，请选择：${validModes.join(', ')}`
    }

    const config = await this.getGroupConfig(groupId)
    config.mode = mode as any
    await this.databaseService.setGroupConfig(config)
    return `验证模式已设置为：${mode}`
  }

  private async setVerifyTimeout(groupId: number, timeout: number): Promise<string> {
    if (isNaN(timeout) || timeout < 60 || timeout > 3600) {
      return '无效的超时时间，请设置 60-3600 秒之间的值'
    }

    const config = await this.getGroupConfig(groupId)
    config.timeout = timeout
    await this.databaseService.setGroupConfig(config)
    return `验证码时长已设置为：${timeout}秒`
  }

  private async manageWhitelist(userId: number, action: string, targetUserId: number, remark?: string): Promise<string> {
    if (isNaN(targetUserId)) {
      return '无效的用户ID'
    }

    switch (action) {
      case 'add':
        await this.databaseService.addToWhitelist(targetUserId, remark)
        return `已添加用户 ${targetUserId} 到白名单`
      case 'remove':
        await this.databaseService.removeFromWhitelist(targetUserId)
        return `已从白名单移除用户 ${targetUserId}`
      case 'list':
        const whitelist = await this.databaseService.getWhitelist()
        if (whitelist.length === 0) {
          return '白名单为空'
        }
        return whitelist.map(item => `${item.userId}${item.remark ? ` (${item.remark})` : ''}`).join('\n')
      default:
        return '无效的白名单操作，请使用 add/remove/list'
    }
  }

  private async getAuditData(groupId: number): Promise<string> {
    const records = await this.databaseService.getVerifyRecords(groupId)
    if (records.length === 0) {
      return '暂无验证记录'
    }

    const recentRecords = records.slice(-10) // 只显示最近10条记录
    const lines = recentRecords.map(record => {
      const time = new Date(record.verifyTime).toLocaleString()
      return `${time} - ${record.userId} - ${record.type} - ${record.result}`
    })

    return `最近10条验证记录：\n${lines.join('\n')}`
  }

  private async handleRequest(session: Session) {
    const bot = session.bot
    const request = this.adapterService.parseRequest(bot, session.event)
    if (!request) return

    const { groupId, userId, flag } = request
    const config = await this.getGroupConfig(groupId)

    // 检查是否在白名单
    const isWhitelist = await this.databaseService.isInWhitelist(userId)
    if (isWhitelist) {
      await this.approveRequest(bot, request, config, 'whitelist')
      return
    }

    // 检查是否已在群内
    if (config.skipInGroupUser) {
      const isInGroup = await this.adapterService.isUserInGroup(bot, groupId, userId)
      if (isInGroup) {
        await this.approveRequest(bot, request, config, 'skip')
        return
      }
    }

    // 根据验证模式处理
    switch (config.mode) {
      case 'whitelist':
        await this.rejectRequest(bot, request, config, '不在白名单')
        break
      case 'captcha':
      case 'image-captcha':
        await this.sendCaptcha(bot, request, config)
        break
    }
  }

  private async getGroupConfig(groupId: number): Promise<GroupConfig> {
    const config = await this.databaseService.getGroupConfig(groupId)
    if (config) return config
    // 创建默认配置
    const defaultConfig = new GroupConfig()
    defaultConfig.groupId = groupId
    await this.databaseService.setGroupConfig(defaultConfig)
    return defaultConfig
  }

  private async sendCaptcha(bot: Bot, request: GroupRequest, config: GroupConfig) {
    const { groupId, userId } = request
    const key = `${groupId}:${userId}`

    let captcha: string
    let message: string

    if (config.mode === 'image-captcha') {
      const result = captchaService.generateImageCaptcha(config.captchaLength)
      captcha = result.code
      // 发送图片验证码到群内
      try {
        await bot.sendGroupMessage(groupId, [
          { type: 'text', content: `欢迎加入日常分享群～进群请发：` },
          { type: 'text', content: `【图片验证码】` },
          { type: 'image', content: `data:image/svg+xml;base64,${Buffer.from(result.svg).toString('base64')}` },
          { type: 'text', content: `发完即可畅聊，禁止广告、刷屏、引战。` },
        ])
      } catch (error) {
        this.logger.error(`发送图片验证码失败: ${error}`)
        await this.rejectRequest(bot, request, config, '无法发送验证码')
        return
      }
    } else {
      captcha = captchaService.generateTextCaptcha(config.captchaLength)
      // 发送文本验证码到群内
      try {
        await bot.sendGroupMessage(groupId, `欢迎加入日常分享群～进群请发：\n【${captcha}】\n发完即可畅聊，禁止广告、刷屏、引战。`)
      } catch (error) {
        this.logger.error(`发送文本验证码失败: ${error}`)
        await this.rejectRequest(bot, request, config, '无法发送验证码')
        return
      }
    }

    // 缓存验证码
    captchaService.setCaptcha(key, captcha, config.timeout * 1000)

    // 设置超时
    const timeoutTimer = setTimeout(async () => {
      await this.handleTimeout(bot, request, config)
    }, config.timeout * 1000)

    // 保存待处理请求
    this.pendingRequests.set(key, {
      bot,
      request,
      config,
      captcha,
      startTime: Date.now(),
      timeoutTimer,
    })
  }

  private async handleGroupMessage(session: Session) {
    const { userId, groupId } = session
    const content = session.content.trim()

    // 查找待处理请求
    const key = `${groupId}:${userId}`
    const pending = this.pendingRequests.get(key)
    if (pending) {
      await this.verifyCaptcha(pending, content)
    }
  }

  private async verifyCaptcha(pending: PendingRequest, input: string) {
    const { bot, request, config } = pending
    const { groupId, userId } = request
    const key = `${groupId}:${userId}`

    // 清除超时定时器
    clearTimeout(pending.timeoutTimer)
    this.pendingRequests.delete(key)

    // 验证验证码
    const isCorrect = captchaService.verifyCaptcha(key, input)
    if (isCorrect) {
      await this.approveRequest(bot, request, config, config.mode)
    } else {
      await this.rejectRequest(bot, request, config, '验证码错误')
    }
  }

  private async handleTimeout(bot: Bot, request: GroupRequest, config: GroupConfig) {
    const { groupId, userId } = request
    const key = `${groupId}:${userId}`

    // 从待处理请求中移除
    const pending = this.pendingRequests.get(key)
    if (pending) {
      clearTimeout(pending.timeoutTimer)
      this.pendingRequests.delete(key)
    }

    // 拒绝请求
    await this.adapterService.reject(bot, groupId, userId, request.flag, config.timeoutMsg)

    // 记录验证记录
    await this.databaseService.addVerifyRecord({
      groupId,
      userId,
      type: 'timeout',
      result: 'timeout',
    })

    this.logger.info(`验证超时: 群 ${groupId}, 用户 ${userId}`)
  }

  private async approveRequest(bot: Bot, request: GroupRequest, config: GroupConfig, type: VerifyType) {
    const { groupId, userId, flag } = request

    // 同意请求
    await this.adapterService.approve(bot, groupId, userId, flag)

    // 发送通过消息到群内
    try {
      await bot.sendGroupMessage(groupId, `[加群验证] ${userId} ${config.approveMsg}`)
    } catch (error) {
      this.logger.error(`发送通过消息失败: ${error}`)
    }

    // 记录验证记录
    await this.databaseService.addVerifyRecord({
      groupId,
      userId,
      type,
      result: 'pass',
    })

    this.logger.info(`验证通过: 群 ${groupId}, 用户 ${userId}, 类型 ${type}`)
  }

  private async rejectRequest(bot: Bot, request: GroupRequest, config: GroupConfig, reason: string) {
    const { groupId, userId, flag } = request

    // 拒绝请求
    await this.adapterService.reject(bot, groupId, userId, flag, config.rejectMsg)

    // 发送拒绝消息到群内
    try {
      await bot.sendGroupMessage(groupId, `[加群验证] ${userId} ${config.rejectMsg}`)
    } catch (error) {
      this.logger.error(`发送拒绝消息失败: ${error}`)
    }

    // 记录验证记录
    await this.databaseService.addVerifyRecord({
      groupId,
      userId,
      type: config.mode,
      result: 'fail',
    })

    this.logger.info(`验证失败: 群 ${groupId}, 用户 ${userId}, 原因 ${reason}`)
  }

  // 暴露给 Console 的方法
  async getGroupConfigs() {
    return this.databaseService.getAllGroupConfigs()
  }

  async saveGroupConfig(config: GroupConfig) {
    await this.databaseService.setGroupConfig(config)
  }

  async getWhitelist() {
    return this.databaseService.getWhitelist()
  }

  async addToWhitelist(userId: number, remark?: string) {
    await this.databaseService.addToWhitelist(userId, remark)
  }

  async removeFromWhitelist(userId: number) {
    await this.databaseService.removeFromWhitelist(userId)
  }

  async getVerifyRecords(groupId?: number, userId?: number) {
    return this.databaseService.getVerifyRecords(groupId, userId)
  }
}

export default JoinVerificationService