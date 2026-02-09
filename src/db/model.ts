// 类型定义
export type VerifyMode = string
export type VerifyResult = 'pass' | 'fail' | 'timeout'
export type VerifyType = string

// 数据库模型配置
export interface GroupConfig {
  groupId: number
  mode: VerifyMode
  captchaLength: number
  timeout: number
  skipInGroupUser: boolean
  waitingMsg: string
  approveMsg: string
  rejectMsg: string
  timeoutMsg: string
}

export interface Whitelist {
  userId: number
  remark?: string
  createTime: number
}

export interface VerifyRecord {
  id?: number
  groupId: number
  userId: number
  type: VerifyType
  result: VerifyResult
  verifyTime: number
}

export interface SuperAdmin {
  userId: number
  remark?: string
  createTime: number
}

// 数据库模型定义
// 极简表结构定义，确保每个字段的 type 都是明确的字符串字面量
export const TableStructures = {
  group_config: {
    groupId: {
      type: 'integer',
      nullable: false
    },
    mode: {
      type: 'string',
      initial: 'captcha',
      nullable: false
    },
    captchaLength: {
      type: 'integer',
      initial: 4,
      nullable: false
    },
    timeout: {
      type: 'integer',
      initial: 300,
      nullable: false
    },
    skipInGroupUser: {
      type: 'boolean',
      initial: true,
      nullable: false
    },
    waitingMsg: {
      type: 'string',
      initial: '请输入验证码：{captcha}，{timeout}秒内有效',
      nullable: false
    },
    approveMsg: {
      type: 'string',
      initial: '验证通过，欢迎加入群聊！',
      nullable: false
    },
    rejectMsg: {
      type: 'string',
      initial: '验证失败，拒绝加入群聊',
      nullable: false
    },
    timeoutMsg: {
      type: 'string',
      initial: '验证超时，拒绝加入群聊',
      nullable: false
    }
  },
  whitelist: {
    userId: {
      type: 'integer',
      nullable: false
    },
    remark: {
      type: 'string',
      nullable: true
    },
    createTime: {
      type: 'integer',
      initial: Date.now(),
      nullable: false
    }
  },
  verify_record: {
    id: {
      type: 'integer',
      nullable: false
    },
    groupId: {
      type: 'integer',
      nullable: false
    },
    userId: {
      type: 'integer',
      nullable: false
    },
    type: {
      type: 'string',
      initial: 'captcha',
      nullable: false
    },
    result: {
      type: 'string',
      initial: 'pass',
      nullable: false
    },
    verifyTime: {
      type: 'integer',
      initial: Date.now(),
      nullable: false
    }
  },
  super_admin: {
    userId: {
      type: 'integer',
      nullable: false
    },
    remark: {
      type: 'string',
      nullable: true
    },
    createTime: {
      type: 'integer',
      initial: Date.now(),
      nullable: false
    }
  }
}
