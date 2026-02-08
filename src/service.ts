import { Bot, Context, Session } from 'koishi'
import AdapterService from './adapter'
import DatabaseService from './db/service'
import { captchaService } from './utils/captcha'
import type { Config } from './index'
import type { GroupRequest, PendingRequest, VerifyAttempt, GroupConfigCacheItem, VerifyMode, VerifyType, GroupConfig } from '../types'

class JoinVerificationService {
  private adapterService: AdapterService
  private databaseService: DatabaseService
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private verifyAttempts: Map<string, VerifyAttempt> = new Map()
  private groupConfigCache: Map<number, GroupConfigCacheItem> = new Map()
  private logger: ReturnType<Context['logger']>
  private config: Config

  constructor(private ctx: Context, config: Config = {
    superAdmins: [],
    enableAutoVerify: false,
    verifyTimeout: 300000,
    maxRetryCount: 3,
    enableLog: true,
    defaultVerifyMode: 'captcha',
    defaultCaptchaLength: 4,
    enableImageCaptcha: true,
    approveMsg: '验证通过，欢迎加入群聊！',
    rejectMsg: '验证失败，拒绝加入群聊',
    timeoutMsg: '验证超时，拒绝加入群聊',
    waitingMsg: '请输入验证码：{captcha}，{timeout}秒内有效'
  }) {
    this.config = config
    this.adapterService = new AdapterService(ctx)
    this.databaseService = new DatabaseService(ctx)
    this.logger = ctx.logger('qq-group-join-verification')
    
    // 延迟初始化，让 Cordis 内部变量先初始化完成
    // 使用 setTimeout 延迟执行，避免触发 Cordis 事件系统的初始化 bug
    setTimeout(() => {
      this.init()
      
      // 插件卸载时清理所有定时器
      try {
        ctx.on('dispose', () => {
          this.clearAllTimers()
        })
      } catch (error) {
        this.logger.warn('Failed to register dispose event listener:', error)
        // 即使注册失败，插件也能正常运行
      }
    }, 1000) // 延迟 1 秒执行
  }
  
  private clearAllTimers() {
    // 清理所有待处理请求的定时器
    for (const [key, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutTimer)
    }
    this.pendingRequests.clear()
    this.verifyAttempts.clear()
    this.groupConfigCache.clear()
    if (this.config.enableLog) {
      this.logger.info('所有定时器已清理，防止内存泄漏')
    }
  }

  private async init() {
    this.ctx.on('notice/group-request' as any, this.handleRequest.bind(this))
    this.ctx.on('notice.group.request.add' as any, this.handleRequest.bind(this))
    this.ctx.on('milky.group.request.add' as any, this.handleRequest.bind(this))
    this.ctx.on('guild-member-request' as any, this.handleRequest.bind(this))
    this.ctx.on('message', this.handleGroupMessage.bind(this))
    this.registerCommands()
    
    // 初始化超级管理员（从配置加载）
    await this.initSuperAdmins()
  }
  
  private async initSuperAdmins() {
    try {
      const { superAdmins } = this.config
      if (Array.isArray(superAdmins) && superAdmins.length > 0) {
        for (const qq of superAdmins) {
          const userId = Number(qq)
          if (!isNaN(userId)) {
            // 检查是否已存在
            const isExisting = await this.databaseService.isSuperAdmin(userId)
            if (!isExisting) {
              await this.databaseService.addSuperAdmin(userId, '从配置初始化')
              if (this.config.enableLog) {
                this.logger.info(`已从配置初始化超级管理员: ${userId}`)
              }
            }
          }
        }
      }
    } catch (error) {
      if (this.config.enableLog) {
        this.logger.error('初始化超级管理员失败:', error)
      }
    }
  }

  private registerCommands() {
    // 注册主命令
    this.ctx.command('verify', '群验证管理')
      .action(() => this.getHelpMessage())
    
    // 注册子命令（使用点号分隔格式）
    
    // 基础命令
    this.ctx.command('verify.help', '查看帮助信息')
      .action(() => this.getHelpMessage())
    
    this.ctx.command('verify.enable', '开启群验证')
      .action(async (ctx: any) => {
        const session = ctx.session
        const userId = session.userId
        if (!await this.checkSuperAdmin(userId)) return '权限不足，只有超级管理员可以使用此命令'
        
        const groupId = session.channelId || session.group_id || session.groupId
        if (!groupId) return '请在群内使用此命令'
        return this.enableVerification(Number(groupId))
      })
    
    this.ctx.command('verify.disable', '关闭群验证')
      .action(async (ctx: any) => {
        const session = ctx.session
        const userId = session.userId
        if (!await this.checkSuperAdmin(userId)) return '权限不足，只有超级管理员可以使用此命令'
        
        const groupId = session.channelId || session.group_id || session.groupId
        if (!groupId) return '请在群内使用此命令'
        return this.disableVerification(Number(groupId))
      })
    
    this.ctx.command('verify.status', '查看当前群验证状态')
      .action(async (ctx: any) => {
        const session = ctx.session
        const userId = session.userId
        if (!await this.checkSuperAdmin(userId)) return '权限不足，只有超级管理员可以使用此命令'
        
        const groupId = session.channelId || session.group_id || session.groupId
        if (!groupId) return '请在群内使用此命令'
        return this.getGroupStatus(Number(groupId))
      })
    
    this.ctx.command('verify.audit', '查询最近10条验证记录')
      .action(async (ctx: any) => {
        const session = ctx.session
        const userId = session.userId
        if (!await this.checkSuperAdmin(userId)) return '权限不足，只有超级管理员可以使用此命令'
        
        const groupId = session.channelId || session.group_id || session.groupId
        if (!groupId) return '请在群内使用此命令'
        return this.getAuditData(Number(groupId))
      })
    
    // 模式设置命令
    this.ctx.command('verify.mode <mode>', '设置验证模式')
      .action(async (ctx: any) => {
        const session = ctx.session
        const userId = session.userId
        if (!await this.checkSuperAdmin(userId)) return '权限不足，只有超级管理员可以使用此命令'
        
        const groupId = session.channelId || session.group_id || session.groupId
        if (!groupId) return '请在群内使用此命令'
        return this.setVerifyMode(Number(groupId), ctx.args.mode)
      })
    
    // 超时设置命令
    this.ctx.command('verify.timeout <seconds>', '设置验证超时时间')
      .action(async (ctx: any) => {
        const session = ctx.session
        const userId = session.userId
        if (!await this.checkSuperAdmin(userId)) return '权限不足，只有超级管理员可以使用此命令'
        
        const groupId = session.channelId || session.group_id || session.groupId
        if (!groupId) return '请在群内使用此命令'
        return this.setVerifyTimeout(Number(groupId), parseInt(ctx.args.seconds))
      })
    
    // 白名单命令组
    this.ctx.command('verify.whitelist', '白名单管理')
      .action(() => '请使用 verify.whitelist.add/remove/list')
    
    this.ctx.command('verify.whitelist.add <userId> [remark]', '添加白名单')
      .action(async (ctx: any) => {
        const session = ctx.session
        const currentUserId = session.userId
        if (!await this.checkSuperAdmin(currentUserId)) return '权限不足，只有超级管理员可以使用此命令'
        
        return this.manageWhitelist(Number(currentUserId), 'add', parseInt(ctx.args.userId), ctx.args.remark)
      })
    
    this.ctx.command('verify.whitelist.remove <userId>', '移除白名单')
      .action(async (ctx: any) => {
        const session = ctx.session
        const currentUserId = session.userId
        if (!await this.checkSuperAdmin(currentUserId)) return '权限不足，只有超级管理员可以使用此命令'
        
        return this.manageWhitelist(Number(currentUserId), 'remove', parseInt(ctx.args.userId))
      })
    
    this.ctx.command('verify.whitelist.list', '查看白名单')
      .action(async (ctx: any) => {
        const session = ctx.session
        const currentUserId = session.userId
        if (!await this.checkSuperAdmin(currentUserId)) return '权限不足，只有超级管理员可以使用此命令'
        
        return this.manageWhitelist(Number(currentUserId), 'list')
      })
    
    // 管理员命令组
    this.ctx.command('verify.admin', '超级管理员管理')
      .action(() => '请使用 verify.admin.add/remove/list')
    
    this.ctx.command('verify.admin.add <userId> [remark]', '添加超级管理员')
      .action(async (ctx: any) => {
        const session = ctx.session
        const currentUserId = session.userId
        if (!await this.checkSuperAdmin(currentUserId)) return '权限不足，只有超级管理员可以使用此命令'
        
        return this.manageSuperAdmin('add', parseInt(ctx.args.userId), ctx.args.remark)
      })
    
    this.ctx.command('verify.admin.remove <userId>', '移除超级管理员')
      .action(async (ctx: any) => {
        const session = ctx.session
        const currentUserId = session.userId
        if (!await this.checkSuperAdmin(currentUserId)) return '权限不足，只有超级管理员可以使用此命令'
        
        return this.manageSuperAdmin('remove', parseInt(ctx.args.userId))
      })
    
    this.ctx.command('verify.admin.list', '查看超级管理员')
      .action(async (ctx: any) => {
        const session = ctx.session
        const currentUserId = session.userId
        if (!await this.checkSuperAdmin(currentUserId)) return '权限不足，只有超级管理员可以使用此命令'
        
        return this.manageSuperAdmin('list', 0)
      })
  }
  
  private async checkSuperAdmin(userId: any): Promise<boolean> {
    // 兼容不同适配器的用户 ID 格式（如 onebot:123456789 -> 123456789）
    const normalizedUserId = String(userId).replace(/^\w+:/, '')
    
    // 首先检查配置文件中的超级管理员
    if (Array.isArray(this.config.superAdmins) && this.config.superAdmins.includes(normalizedUserId)) {
      return true
    }
    
    // 然后检查数据库中的超级管理员
    return await this.databaseService.isSuperAdmin(Number(normalizedUserId))
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
    config.mode = this.config.defaultVerifyMode // 使用默认验证模式
    await this.databaseService.setGroupConfig(config)
    this.clearGroupConfigCache(groupId)
    return `群验证已开启，使用 ${this.config.defaultVerifyMode} 模式`
  }

  private async disableVerification(groupId: number): Promise<string> {
    const config = await this.getGroupConfig(groupId)
    config.mode = 'whitelist' // 设置为白名单模式，相当于关闭验证
    await this.databaseService.setGroupConfig(config)
    this.clearGroupConfigCache(groupId)
    return '群验证已关闭'
  }

  private async setVerifyMode(groupId: number, mode: string): Promise<string> {
    const validModes: VerifyMode[] = ['whitelist', 'captcha', 'image-captcha']
    if (!validModes.includes(mode as VerifyMode)) {
      return `无效的验证模式，请选择：${validModes.join(', ')}`
    }

    const config = await this.getGroupConfig(groupId)
    config.mode = mode as VerifyMode
    await this.databaseService.setGroupConfig(config)
    this.clearGroupConfigCache(groupId)
    return `验证模式已设置为：${mode}`
  }

  private async setVerifyTimeout(groupId: number, timeout: number): Promise<string> {
    if (isNaN(timeout) || timeout < 60 || timeout > 3600) {
      return '无效的超时时间，请设置 60-3600 秒之间的值'
    }

    const config = await this.getGroupConfig(groupId)
    config.timeout = timeout
    await this.databaseService.setGroupConfig(config)
    this.clearGroupConfigCache(groupId)
    return `验证码时长已设置为：${timeout}秒`
  }

  private async manageWhitelist(userId: number, action: string, targetUserId?: number, remark?: string): Promise<string> {
    if (action !== 'list' && isNaN(targetUserId as number)) {
      return '无效的用户ID'
    }

    switch (action) {
      case 'add':
        await this.databaseService.addToWhitelist(targetUserId as number, remark)
        return `已添加用户 ${targetUserId} 到白名单`
      case 'remove':
        await this.databaseService.removeFromWhitelist(targetUserId as number)
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

  private getHelpMessage(): string {
    return `QQ 群加群验证插件指令帮助：\n\n` +
      `verify.enable - 开启群验证\n` +
      `verify.disable - 关闭群验证\n` +
      `verify.mode <mode> - 设置验证模式 (captcha/image-captcha/whitelist)\n` +
      `verify.timeout <seconds> - 设置验证超时时间 (60-3600秒)\n` +
      `verify.whitelist.add <userId> [remark] - 添加白名单\n` +
      `verify.whitelist.remove <userId> - 移除白名单\n` +
      `verify.whitelist.list - 查看白名单\n` +
      `verify.audit - 查询最近10条验证记录\n` +
      `verify.admin.add <userId> [remark] - 添加超级管理员\n` +
      `verify.admin.remove <userId> - 移除超级管理员\n` +
      `verify.admin.list - 查看超级管理员\n` +
      `verify.status - 查看当前群验证状态\n` +
      `verify.help - 查看此帮助信息`
  }

  private async getGroupStatus(groupId: number): Promise<string> {
    const config = await this.getGroupConfig(groupId)
    return `群 ${groupId} 验证状态：\n` +
      `验证模式：${config.mode}\n` +
      `验证码长度：${config.captchaLength}\n` +
      `验证超时时间：${config.timeout}秒\n` +
      `跳过群内用户：${config.skipInGroupUser ? '是' : '否'}\n` +
      `等待验证消息：${config.waitingMsg}\n` +
      `验证通过消息：${config.approveMsg}\n` +
      `验证失败消息：${config.rejectMsg}\n` +
      `验证超时消息：${config.timeoutMsg}`
  }

  private async handleRequest(session: Session) {
    const bot = session.bot
    const request = this.adapterService.parseRequest(bot, session.event)
    if (!request) return

    const { groupId, userId } = request
    
    // 检查白名单
    if (await this.checkWhitelist(userId)) {
      const config = await this.getGroupConfig(groupId)
      await this.approveRequest(bot, request, config, 'whitelist')
      return
    }

    // 检查是否已在群内
    const config = await this.getGroupConfig(groupId)
    if (await this.checkUserInGroup(bot, groupId, userId, config)) {
      await this.approveRequest(bot, request, config, 'skip')
      return
    }

    // 根据验证模式处理
    await this.handleVerifyMode(bot, request, config)
  }

  private async checkWhitelist(userId: number): Promise<boolean> {
    return this.databaseService.isInWhitelist(userId)
  }

  private async checkUserInGroup(bot: Bot, groupId: number, userId: number, config: GroupConfig): Promise<boolean> {
    if (!config.skipInGroupUser) return false
    return this.adapterService.isUserInGroup(bot, groupId, userId)
  }

  private async handleVerifyMode(bot: Bot, request: GroupRequest, config: GroupConfig) {
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
    // 检查缓存
    const cached = this.groupConfigCache.get(groupId)
    const now = Date.now()
    if (cached && (now - cached.timestamp) < 60000) { // 缓存 1 分钟
      return cached.config
    }

    const config = await this.databaseService.getGroupConfig(groupId)
    if (config) {
      // 更新缓存
      this.groupConfigCache.set(groupId, { config, timestamp: now })
      return config
    }

    // 创建默认配置
    const defaultConfig = {
      groupId,
      mode: this.config.defaultVerifyMode,
      captchaLength: this.config.defaultCaptchaLength,
      timeout: 300,
      skipInGroupUser: true,
      waitingMsg: this.config.waitingMsg,
      approveMsg: this.config.approveMsg,
      rejectMsg: this.config.rejectMsg,
      timeoutMsg: this.config.timeoutMsg
    }
    
    await this.databaseService.setGroupConfig(defaultConfig)
    // 更新缓存
    this.groupConfigCache.set(groupId, { config: defaultConfig, timestamp: now })
    return defaultConfig
  }

  private async sendCaptcha(bot: Bot, request: GroupRequest, config: GroupConfig) {
    const { groupId, userId } = request
    const key = `${groupId}:${userId}`

    // 检查是否已存在待处理请求
      const existingPending = this.pendingRequests.get(key)
      if (existingPending) {
        if (this.config.enableLog) {
          this.logger.info(`用户 ${userId} 在群 ${groupId} 的验证请求已存在，复用原有验证码`)
        }
        // 清除原有超时定时器
        clearTimeout(existingPending.timeoutTimer)
      // 重置超时定时器
      const timeoutTimer = setTimeout(async () => {
        await this.handleTimeout(bot, request, config)
      }, config.timeout * 1000)
      // 更新待处理请求
      existingPending.timeoutTimer = timeoutTimer
      existingPending.startTime = Date.now()
      // 重新发送验证码提示
      if (config.mode === 'image-captcha' && this.config.enableImageCaptcha) {
        // 重新生成图片验证码
        const result = captchaService.generateImageCaptcha(config.captchaLength)
        existingPending.captcha = result.code
        await this.sendImageCaptchaMessage(bot, groupId, config, result.svg)
      } else {
        await this.sendTextCaptchaMessage(bot, groupId, existingPending.captcha!, config)
      }
      return
    }

    let captcha: string
    let captchaSvg: string | undefined

    if (config.mode === 'image-captcha' && this.config.enableImageCaptcha) {
      try {
        const result = captchaService.generateImageCaptcha(config.captchaLength)
        captcha = result.code
        captchaSvg = result.svg
        // 发送图片验证码到群内
        await this.sendImageCaptchaMessage(bot, groupId, config, captchaSvg)
      } catch (error) {
          if (this.config.enableLog) {
            this.logger.warn(`图片验证码发送失败，降级为文本验证码: ${error}`)
          }
          // 降级为文本验证码
          captcha = captchaService.generateTextCaptcha(config.captchaLength)
          await this.sendTextCaptchaMessage(bot, groupId, captcha, config)
        }
    } else {
      captcha = captchaService.generateTextCaptcha(config.captchaLength)
      // 发送文本验证码到群内
      await this.sendTextCaptchaMessage(bot, groupId, captcha, config)
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
      config: config as any,
      captcha,
      startTime: Date.now(),
      timeoutTimer,
    })
  }

  private async sendImageCaptchaMessage(bot: Bot, groupId: number, config: GroupConfig, captchaSvg?: string) {
    try {
      const message = `欢迎加入群聊～\n请查看图片验证码并发送对应内容\n${config.waitingMsg.replace('{timeout}', config.timeout.toString())}`
      
      if (captchaSvg) {
        // 发送包含SVG的消息
        await bot.sendMessage(groupId.toString(), message)
        // 这里可以根据适配器类型发送不同格式的图片
        // 对于支持的适配器，直接发送SVG或转换为其他格式
      } else {
        await bot.sendMessage(groupId.toString(), message)
      }
    } catch (error) {
      if (this.config.enableLog) {
        this.logger.error(`发送图片验证码失败: ${error}`)
      }
      throw new Error('无法发送验证码')
    }
  }

  private async sendTextCaptchaMessage(bot: Bot, groupId: number, captcha: string, config: GroupConfig) {
    try {
      const message = config.waitingMsg
        .replace('{captcha}', captcha)
        .replace('{timeout}', config.timeout.toString())
      await bot.sendMessage(groupId.toString(), `欢迎加入群聊～\n${message}`)
    } catch (error) {
      if (this.config.enableLog) {
        this.logger.error(`发送文本验证码失败: ${error}`)
      }
      throw new Error('无法发送验证码')
    }
  }

  private async handleGroupMessage(session: Session) {
    // 只处理群消息
    if (!session.channelId) return
    
    const userId = session.userId
    const groupId = session.channelId
    const content = session.content?.trim()
    if (!content) return

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

    // 检查尝试次数
    if (!await this.checkVerifyAttempts(key)) {
      await this.rejectRequest(bot, request, config, '验证码尝试次数过多')
      return
    }

    // 验证验证码
    const isCorrect = captchaService.verifyCaptcha(key, input)
    if (isCorrect) {
      this.verifyAttempts.delete(key) // 验证成功，清除尝试记录
      await this.approveRequest(bot, request, config, config.mode)
    } else {
      await this.rejectRequest(bot, request, config, '验证码错误')
    }
  }

  private async checkVerifyAttempts(key: string): Promise<boolean> {
    const attempts = this.verifyAttempts.get(key) || { count: 0, lastAttempt: 0 }
    const now = Date.now()
    
    // 重置尝试次数（如果超过 1 小时）
    if (now - attempts.lastAttempt > 3600000) {
      attempts.count = 0
    }

    // 检查尝试次数限制
    if (attempts.count >= this.config.maxRetryCount) {
      return false
    }

    // 更新尝试次数
    attempts.count++
    attempts.lastAttempt = now
    this.verifyAttempts.set(key, attempts)
    return true
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

    if (this.config.enableLog) {
      this.logger.info(`验证超时: 群 ${groupId}, 用户 ${userId}`)
    }
  }

  private async approveRequest(bot: Bot, request: GroupRequest, config: GroupConfig, type: VerifyType) {
    const { groupId, userId, flag } = request

    // 同意请求
    await this.adapterService.approve(bot, groupId, userId, flag)

    // 发送通过消息到群内
    await this.sendApproveMessage(bot, groupId, userId, config)

    // 记录验证记录
    await this.databaseService.addVerifyRecord({
      groupId,
      userId,
      type,
      result: 'pass',
    })

    if (this.config.enableLog) {
      this.logger.info(`验证通过: 群 ${groupId}, 用户 ${userId}, 类型 ${type}`)
    }
  }

  private async rejectRequest(bot: Bot, request: GroupRequest, config: GroupConfig, reason: string) {
    const { groupId, userId, flag } = request

    // 拒绝请求
    await this.adapterService.reject(bot, groupId, userId, flag, config.rejectMsg)

    // 发送拒绝消息到群内
    await this.sendRejectMessage(bot, groupId, userId, config)

    // 记录验证记录
    await this.databaseService.addVerifyRecord({
      groupId,
      userId,
      type: config.mode,
      result: 'fail',
    })

    if (this.config.enableLog) {
      this.logger.info(`验证失败: 群 ${groupId}, 用户 ${userId}, 原因 ${reason}`)
    }
  }

  private async sendApproveMessage(bot: Bot, groupId: number, userId: number, config: GroupConfig) {
    try {
      await bot.sendMessage(groupId.toString(), `[加群验证] ${userId} ${config.approveMsg}`)
    } catch (error) {
      if (this.config.enableLog) {
        this.logger.error(`发送通过消息失败: ${error}`)
      }
    }
  }

  private async sendRejectMessage(bot: Bot, groupId: number, userId: number, config: GroupConfig) {
    try {
      await bot.sendMessage(groupId.toString(), `[加群验证] ${userId} ${config.rejectMsg}`)
    } catch (error) {
      if (this.config.enableLog) {
        this.logger.error(`发送拒绝消息失败: ${error}`)
      }
    }
  }

  private clearGroupConfigCache(groupId?: number) {
    if (groupId) {
      this.groupConfigCache.delete(groupId)
    } else {
      this.groupConfigCache.clear()
    }
  }

  // 暴露给 Console 的方法
  async getGroupConfigs() {
    return this.databaseService.getAllGroupConfigs()
  }

  async saveGroupConfig(config: GroupConfig) {
    await this.databaseService.setGroupConfig(config)
    this.clearGroupConfigCache(config.groupId)
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

  async getVerifyRecords(groupId?: number, userId?: number, page: number = 1, pageSize: number = 20) {
    return this.databaseService.getVerifyRecords(groupId, userId, page, pageSize)
  }
}

export default JoinVerificationService