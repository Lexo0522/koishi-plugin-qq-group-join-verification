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
  createTime: Date
}

export interface VerifyRecord {
  id?: number
  groupId: number
  userId: number
  type: VerifyType
  result: VerifyResult
  verifyTime: Date
}

export interface SuperAdmin {
  userId: number
  remark?: string
  createTime: Date
}

// 数据库模型定义
// 极简表结构定义，确保每个字段的 type 都是明确的字符串字面量
export const TableStructures = {
  group_config: {
    groupId: {
      type: 'integer',
      primary: true,
      nullable: false
    },
    mode: {
      type: 'string',
      default: 'captcha',
      nullable: false
    },
    captchaLength: {
      type: 'integer',
      default: 4,
      nullable: false
    },
    timeout: {
      type: 'integer',
      default: 300,
      nullable: false
    },
    skipInGroupUser: {
      type: 'boolean',
      default: true,
      nullable: false
    },
    waitingMsg: {
      type: 'string',
      default: '请输入验证码：{captcha}，{timeout}秒内有效',
      nullable: false
    },
    approveMsg: {
      type: 'string',
      default: '验证通过，欢迎加入群聊！',
      nullable: false
    },
    rejectMsg: {
      type: 'string',
      default: '验证失败，拒绝加入群聊',
      nullable: false
    },
    timeoutMsg: {
      type: 'string',
      default: '验证超时，拒绝加入群聊',
      nullable: false
    }
  },
  whitelist: {
    userId: {
      type: 'integer',
      primary: true,
      nullable: false
    },
    remark: {
      type: 'string',
      nullable: true
    },
    createTime: {
      type: 'datetime',
      default: function() {
        return new Date()
      },
      nullable: false
    }
  },
  verify_record: {
    id: {
      type: 'integer',
      primary: true,
      autoIncrement: true,
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
      default: 'captcha',
      nullable: false
    },
    result: {
      type: 'string',
      default: 'pass',
      nullable: false
    },
    verifyTime: {
      type: 'datetime',
      default: function() {
        return new Date()
      },
      nullable: false
    }
  },
  super_admin: {
    userId: {
      type: 'integer',
      primary: true,
      nullable: false
    },
    remark: {
      type: 'string',
      nullable: true
    },
    createTime: {
      type: 'datetime',
      default: function() {
        return new Date()
      },
      nullable: false
    }
  }
}
