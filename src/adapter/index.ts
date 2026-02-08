import { Bot, Context } from 'koishi'

class AdapterService {
  constructor(private ctx: Context) {
  }

  parseRequest(bot: Bot, event: any) {
    // adapter-onebot
    if (event.post_type === 'notice' && event.notice_type === 'group_request') {
      return {
        groupId: Number(event.group_id),
        userId: Number(event.user_id),
        flag: event.flag,
      }
    }

    // adapter-red
    if (event.type === 'notice.group.request.add') {
      return {
        groupId: Number(event.groupId),
        userId: Number(event.userId),
        flag: event.flag,
      }
    }

    // adapter-milky
    if (event.type === 'milky.group.request.add') {
      return {
        groupId: Number(event.group_id),
        userId: Number(event.user_id),
        flag: event.flag,
      }
    }

    // guild-member-request event
    if (event.type === 'guild-member-request') {
      return {
        groupId: Number(event.groupId || event.group_id),
        userId: Number(event.userId || event.user_id),
        flag: event.flag,
      }
    }

    return null
  }

  async approve(bot: Bot, groupId: number, userId: number, flag: string) {
    // adapter-onebot
    if (bot.platform === 'onebot') {
      await bot.internal('set_group_add_request', {
        flag,
        sub_type: 'add',
        approve: true,
      })
      return
    }

    // adapter-red
    if (bot.platform === 'red') {
      await bot.internal('approveGroupRequest', {
        groupId,
        userId,
        flag,
      })
      return
    }

    // adapter-milky
    if (bot.platform === 'milky') {
      await bot.internal('approveGroupRequest', {
        flag,
        approve: true,
      })
      return
    }

    throw new Error(`Adapter ${bot.platform} not supported`)
  }

  async reject(bot: Bot, groupId: number, userId: number, flag: string, reason?: string) {
    // adapter-onebot
    if (bot.platform === 'onebot') {
      await bot.internal('set_group_add_request', {
        flag,
        sub_type: 'add',
        approve: false,
        reason: reason || '',
      })
      return
    }

    // adapter-red
    if (bot.platform === 'red') {
      await bot.internal('rejectGroupRequest', {
        groupId,
        userId,
        flag,
        reason: reason || '',
      })
      return
    }

    // adapter-milky
    if (bot.platform === 'milky') {
      await bot.internal('approveGroupRequest', {
        flag,
        approve: false,
        reason: reason || '',
      })
      return
    }

    throw new Error(`Adapter ${bot.platform} not supported`)
  }

  async isUserInGroup(bot: Bot, groupId: number, userId: number) {
    // adapter-onebot
    if (bot.platform === 'onebot') {
      try {
        const member = await bot.internal('get_group_member_info', {
          group_id: groupId,
          user_id: userId,
        })
        return !!member
      } catch {
        return false
      }
    }

    // adapter-red
    if (bot.platform === 'red') {
      try {
        const member = await bot.internal('getGroupMember', {
          groupId,
          userId,
        })
        return !!member
      } catch {
        return false
      }
    }

    // adapter-milky
    if (bot.platform === 'milky') {
      try {
        const member = await bot.internal('getGroupMemberInfo', {
          group_id: groupId,
          user_id: userId,
        })
        return !!member
      } catch {
        return false
      }
    }

    return false
  }
}

export default AdapterService