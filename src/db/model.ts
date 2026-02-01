import { Entity, Column, PrimaryColumn, PrimaryGeneratedColumn, CreateDateColumn } from '@koishijs/plugin-database'

export type VerifyMode = 'whitelist' | 'captcha' | 'image-captcha'
export type VerifyResult = 'pass' | 'fail' | 'timeout'
export type VerifyType = 'whitelist' | 'captcha' | 'image-captcha' | 'skip' | 'timeout'

@Entity('qq_group_verify_group_config')
export class GroupConfig {
  @PrimaryColumn()
  groupId: number

  @Column()
  mode: VerifyMode = 'captcha'

  @Column()
  captchaLength: number = 4

  @Column()
  timeout: number = 180

  @Column()
  skipInGroupUser: boolean = true

  @Column()
  waitingMsg: string = '请输入验证码：{captcha}，{timeout}秒内有效'

  @Column()
  approveMsg: string = '验证通过，欢迎加入群聊！'

  @Column()
  rejectMsg: string = '验证失败，拒绝加入群聊'

  @Column()
  timeoutMsg: string = '验证超时，拒绝加入群聊'
}

@Entity('qq_group_verify_whitelist')
export class Whitelist {
  @PrimaryColumn()
  userId: number

  @Column({ nullable: true })
  remark?: string

  @CreateDateColumn()
  createTime: Date
}

@Entity('qq_group_verify_record')
export class VerifyRecord {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  groupId: number

  @Column()
  userId: number

  @Column()
  type: VerifyType

  @Column()
  result: VerifyResult

  @CreateDateColumn()
  verifyTime: Date
}