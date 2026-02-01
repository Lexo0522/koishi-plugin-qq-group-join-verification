import { Context, Schema } from '@koishijs/core'
import JoinVerificationService from './service'

const name = 'qq-group-join-verification'

export const using = ['database', 'console'] as const

export const schema = Schema.object({})

export function apply(ctx: Context) {
  const service = ctx.service(name, JoinVerificationService, true)

  // 注册 Console 前端
  ctx.console.addEntry({
    dev: resolve => resolve(__dirname, '../client/index.ts'),
    prod: './dist/client/index.js',
  })

  // 注册 API 路由
  ctx.console.addRoute('POST', '/qq-group-join-verification/group-config', async (ctx) => {
    const config = ctx.request.body
    await service.saveGroupConfig(config)
    ctx.body = { success: true }
  })

  ctx.console.addRoute('GET', '/qq-group-join-verification/group-configs', async (ctx) => {
    ctx.body = await service.getGroupConfigs()
  })

  ctx.console.addRoute('POST', '/qq-group-join-verification/whitelist/add', async (ctx) => {
    const { userId, remark } = ctx.request.body
    await service.addToWhitelist(userId, remark)
    ctx.body = { success: true }
  })

  ctx.console.addRoute('POST', '/qq-group-join-verification/whitelist/remove', async (ctx) => {
    const { userId } = ctx.request.body
    await service.removeFromWhitelist(userId)
    ctx.body = { success: true }
  })

  ctx.console.addRoute('GET', '/qq-group-join-verification/whitelist', async (ctx) => {
    ctx.body = await service.getWhitelist()
  })

  ctx.console.addRoute('GET', '/qq-group-join-verification/records', async (ctx) => {
    const { groupId, userId } = ctx.query
    ctx.body = await service.getVerifyRecords(
      groupId ? Number(groupId) : undefined,
      userId ? Number(userId) : undefined
    )
  })
}

export default {
  name,
  using,
  schema,
  apply,
}