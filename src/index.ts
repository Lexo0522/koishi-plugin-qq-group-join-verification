import { Context, Schema } from 'koishi'
import JoinVerificationService from './service'
import { registerTables } from './db/service'
import type { PluginConfig, VerifyMode, GroupConfig as GroupConfigType } from '../types'

export const name = 'koishi-plugin-qq-group-join-verification'

export const using = ['database']

export interface Config extends PluginConfig {
}

export const Config: Schema<Config> = Schema.object({
  superAdmins: Schema.array(Schema.string()).default([]).description('超级管理员 QQ 号列表'),
  enableAutoVerify: Schema.boolean().default(false).description('是否启用自动验证'),
  verifyTimeout: Schema.number().default(300000).description('验证超时时间（毫秒，默认 5 分钟）'),
  maxRetryCount: Schema.number().default(3).description('最大重试次数'),
  enableLog: Schema.boolean().default(true).description('是否启用详细日志'),
  defaultVerifyMode: Schema.union(['captcha', 'image-captcha', 'whitelist']).default('captcha').description('默认验证模式'),
  defaultCaptchaLength: Schema.number().default(4).description('默认验证码长度'),
  enableImageCaptcha: Schema.boolean().default(true).description('是否启用图片验证码'),
  approveMsg: Schema.string().default('验证通过，欢迎加入群聊！').description('验证通过消息'),
  rejectMsg: Schema.string().default('验证失败，拒绝加入群聊').description('验证失败消息'),
  timeoutMsg: Schema.string().default('验证超时，拒绝加入群聊').description('验证超时消息'),
  waitingMsg: Schema.string().default('请输入验证码：{captcha}，{timeout}秒内有效').description('等待验证消息')
})

export function apply(ctx: Context, config: Config = {
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
  try {
    // 检查数据库服务是否可用
    if (!ctx.model) {
      ctx.logger('qq-group-join-verification').error('Database service is not available, plugin initialization failed')
      throw new Error('Database service is not available')
    }
    
    ctx.logger('qq-group-join-verification').info('Database service detected, starting table registration...')
    
    // 同步注册表，去掉多余延迟
    // Koishi 的 using: ['database'] 已保证数据库服务就绪
    const tablesRegistered = registerTables(ctx)
    
    if (!tablesRegistered) {
      ctx.logger('qq-group-join-verification').error('Table registration failed, plugin initialization aborted')
      throw new Error('Table registration failed')
    }
    
    ctx.logger('qq-group-join-verification').info('Table registration successful, initializing core service...')
    
    // 直接初始化核心服务，无延迟
    const service = new JoinVerificationService(ctx, config)
    ctx.logger('qq-group-join-verification').info('QQ group join verification plugin initialized successfully')
    
  } catch (error) {
    ctx.logger('qq-group-join-verification').error('Plugin initialization failed:', error)
    throw error
  }
}
