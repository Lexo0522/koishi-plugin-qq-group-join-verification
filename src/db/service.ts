import { Context } from '@koishijs/core'
import { Database } from '@koishijs/plugin-database'
import { GroupConfig, Whitelist, VerifyRecord } from './model'

export class DatabaseService {
  private db: Database

  constructor(ctx: Context) {
    this.db = ctx.database
    this.init()
  }

  private init() {
    this.db.extend(GroupConfig)
    this.db.extend(Whitelist)
    this.db.extend(VerifyRecord)
  }

  // GroupConfig 相关方法
  async getGroupConfig(groupId: number): Promise<GroupConfig | null> {
    return this.db.get(GroupConfig, groupId)
  }

  async setGroupConfig(config: GroupConfig): Promise<void> {
    await this.db.set(GroupConfig, config)
  }

  async getAllGroupConfigs(): Promise<GroupConfig[]> {
    return this.db.get(GroupConfig)
  }

  // Whitelist 相关方法
  async isInWhitelist(userId: number): Promise<boolean> {
    const result = await this.db.get(Whitelist, userId)
    return !!result
  }

  async addToWhitelist(userId: number, remark?: string): Promise<void> {
    await this.db.set(Whitelist, {
      userId,
      remark,
      createTime: new Date(),
    })
  }

  async removeFromWhitelist(userId: number): Promise<void> {
    await this.db.remove(Whitelist, userId)
  }

  async getWhitelist(): Promise<Whitelist[]> {
    return this.db.get(Whitelist)
  }

  // VerifyRecord 相关方法
  async addVerifyRecord(record: Omit<VerifyRecord, 'id' | 'verifyTime'>): Promise<void> {
    await this.db.create(VerifyRecord, {
      ...record,
      verifyTime: new Date(),
    })
  }

  async getVerifyRecords(groupId?: number, userId?: number): Promise<VerifyRecord[]> {
    const query: any = {}
    if (groupId) query.groupId = groupId
    if (userId) query.userId = userId
    return this.db.get(VerifyRecord, query)
  }
}