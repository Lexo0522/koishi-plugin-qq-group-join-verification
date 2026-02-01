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
    this.ctx.on('message/private', this.handlePrivateMessage.bind(this))
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
      message = config.waitingMsg
        .replace('{captcha}', '')
        .replace('{timeout}', config.timeout.toString())
      // 发送图片验证码
      try {
        await bot.sendPrivateMessage(userId, [
          { type: 'text', content: message },
          { type: 'image', content: `data:image/svg+xml;base64,${Buffer.from(result.svg).toString('base64')}` },
        ])
      } catch (error) {
        this.logger.error(`发送图片验证码失败: ${error}`)
        await this.rejectRequest(bot, request, config, '无法发送验证码')
        return
      }
    } else {
      captcha = captchaService.generateTextCaptcha(config.captchaLength)
      message = config.waitingMsg
        .replace('{captcha}', captcha)
        .replace('{timeout}', config.timeout.toString())
      // 发送文本验证码
      try {
        await bot.sendPrivateMessage(userId, message)
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

  private async handlePrivateMessage(session: Session) {
    const { userId } = session
    const content = session.content.trim()

    // 查找待处理请求
    for (const [key, pending] of this.pendingRequests.entries()) {
      const [, reqUserId] = key.split(':').map(Number)
      if (reqUserId === userId) {
        await this.verifyCaptcha(pending, content)
        break
      }
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

    // 发送通过消息
    try {
      await bot.sendPrivateMessage(userId, config.approveMsg)
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

    // 发送拒绝消息
    try {
      await bot.sendPrivateMessage(userId, config.rejectMsg)
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