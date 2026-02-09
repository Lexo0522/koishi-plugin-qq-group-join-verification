import { Context } from 'koishi'
import { TableStructures } from './model'

// 注册数据库表
export function registerTables(ctx: Context): boolean {
  try {
    const model = ctx.model as any

    if (!model) {
      throw new Error('Database model is not available')
    }

    ctx.logger('qq-group-join-verification').info('Starting database table registration...')

    // 极简注册表逻辑：直接传递纯对象给 ctx.model.define
    for (const [tableName, fields] of Object.entries(TableStructures)) {
      ctx.logger('qq-group-join-verification').info(`Registering table: ${tableName}`)
      let primary: string | undefined
      if (tableName === 'group_config') {
        primary = 'groupId'
      } else if (tableName === 'whitelist') {
        primary = 'userId'
      } else if (tableName === 'verify_record') {
        primary = 'id'
      } else if (tableName === 'super_admin') {
        primary = 'userId'
      }
      let autoInc: boolean | undefined
      if (tableName === 'verify_record') {
        autoInc = true
      }
      model.extend(tableName, fields, { primary, autoInc })
      ctx.logger('qq-group-join-verification').info(`✓ ${tableName} table registered successfully`)
    }

    ctx.logger('qq-group-join-verification').info('All database tables registered successfully')
    return true
  } catch (error) {
    ctx.logger('qq-group-join-verification').error('Failed to register database tables:', error)
    throw error
  }
}

class DatabaseService {
  private logger: any

  constructor(private ctx: Context) {
    this.logger = ctx.logger('qq-group-join-verification:database')
    this.logger.info('Database service initialized with Cordis database model system (persistent storage)')
  }

  // 安全的数据库操作方法，带错误处理
  private async safeGet(table: string, query?: any, options?: any) {
    try {
      const model = this.ctx.model as any
      return await model.get(table, query, options)
    } catch (error) {
      this.logger.warn(`Failed to get from ${table}:`, error)
      return table === 'verify_record' ? [] : null
    }
  }

  private async safeSet(table: string, data: any) {
    try {
      const model = this.ctx.model as any
      if (table === 'group_config' && data.groupId) {
        await model.upsert(table, { groupId: data.groupId }, [data])
      } else if (table === 'whitelist' && data.userId) {
        await model.upsert(table, { userId: data.userId }, [data])
      } else if (table === 'super_admin' && data.userId) {
        await model.upsert(table, { userId: data.userId }, [data])
      }
    } catch (error) {
      this.logger.warn(`Failed to set ${table}:`, error)
      throw error
    }
  }

  private async safeRemove(table: string, query: any) {
    try {
      const model = this.ctx.model as any
      await model.remove(table, query)
    } catch (error) {
      this.logger.warn(`Failed to remove from ${table}:`, error)
      throw error
    }
  }

  private async safeCreate(table: string, data: any) {
    try {
      const model = this.ctx.model as any
      await model.create(table, data)
    } catch (error) {
      this.logger.warn(`Failed to create in ${table}:`, error)
      throw error
    }
  }

  // GroupConfig 相关方法
  async getGroupConfig(groupId: number) {
    try {
      const config = await this.safeGet('group_config', { groupId })
      if (config) return config

      // 创建默认配置
      const defaultConfig = {
        groupId,
        mode: 'captcha',
        captchaLength: 4,
        timeout: 300,
        skipInGroupUser: true,
        waitingMsg: '请输入验证码：{captcha}，{timeout}秒内有效',
        approveMsg: '验证通过，欢迎加入群聊！',
        rejectMsg: '验证失败，拒绝加入群聊',
        timeoutMsg: '验证超时，拒绝加入群聊'
      }

      await this.safeSet('group_config', defaultConfig)
      return defaultConfig
    } catch (error) {
      this.logger.error('Failed to get group config:', error)
      // 返回默认配置作为兜底
      return {
        groupId,
        mode: 'captcha',
        captchaLength: 4,
        timeout: 300,
        skipInGroupUser: true,
        waitingMsg: '请输入验证码：{captcha}，{timeout}秒内有效',
        approveMsg: '验证通过，欢迎加入群聊！',
        rejectMsg: '验证失败，拒绝加入群聊',
        timeoutMsg: '验证超时，拒绝加入群聊'
      }
    }
  }

  async setGroupConfig(config: any) {
    await this.safeSet('group_config', config)
  }

  async getAllGroupConfigs() {
    try {
      return await this.safeGet('group_config', {}, { limit: 100 })
    } catch (error) {
      this.logger.error('Failed to get all group configs:', error)
      return []
    }
  }

  // Whitelist 相关方法
  async isInWhitelist(userId: number) {
    try {
      const result = await this.safeGet('whitelist', { userId })
      return !!result
    } catch (error) {
      this.logger.error('Failed to check whitelist:', error)
      return false
    }
  }

  async addToWhitelist(userId: number, remark?: string) {
    await this.safeSet('whitelist', {
      userId,
      remark,
      createTime: Date.now(),
    })
  }

  async removeFromWhitelist(userId: number) {
    await this.safeRemove('whitelist', { userId })
  }

  async getWhitelist() {
    try {
      return await this.safeGet('whitelist', {}, { limit: 100 })
    } catch (error) {
      this.logger.error('Failed to get whitelist:', error)
      return []
    }
  }

  // VerifyRecord 相关方法
  async addVerifyRecord(record: any) {
    await this.safeCreate('verify_record', {
      ...record,
      verifyTime: Date.now(),
    })
  }

  async getVerifyRecords(groupId?: number, userId?: number, page: number = 1, pageSize: number = 20) {
    try {
      const query: any = {}
      if (groupId) query.groupId = groupId
      if (userId) query.userId = userId

      const records = await this.safeGet('verify_record', query, { limit: pageSize * page })
      if (!records || !Array.isArray(records)) return []

      // 排序和分页
      return records
        .sort((a: any, b: any) => new Date(b.verifyTime).getTime() - new Date(a.verifyTime).getTime())
        .slice((page - 1) * pageSize, page * pageSize)
    } catch (error) {
      this.logger.error('Failed to get verify records:', error)
      return []
    }
  }

  // SuperAdmin 相关方法
  async isSuperAdmin(userId: number) {
    try {
      const result = await this.safeGet('super_admin', { userId })
      return !!result
    } catch (error) {
      this.logger.error('Failed to check super admin:', error)
      return false
    }
  }

  async addSuperAdmin(userId: number, remark?: string) {
    await this.safeSet('super_admin', {
      userId,
      remark,
      createTime: Date.now(),
    })
  }

  async removeSuperAdmin(userId: number) {
    await this.safeRemove('super_admin', { userId })
  }

  async getSuperAdmins() {
    try {
      return await this.safeGet('super_admin', {}, { limit: 100 })
    } catch (error) {
      this.logger.error('Failed to get super admins:', error)
      return []
    }
  }
}

export default DatabaseService
