import { Context as BaseContext, Bot, Database } from 'koishi';
export interface ConsoleEntryOptions {
    dev: string;
    prod: string;
}
export interface ConsoleContext extends BaseContext {
    console: {
        addEntry(options: ConsoleEntryOptions): void;
        addRoute(method: string, path: string, handler: (ctx: any) => Promise<void>): void;
    };
}
export type VerifyMode = 'captcha' | 'image-captcha' | 'whitelist';
export type VerifyResult = 'pass' | 'fail' | 'timeout';
export type VerifyType = VerifyMode | 'skip' | 'timeout';
export interface GroupRequest {
    groupId: number;
    userId: number;
    flag: string;
}
export interface PendingRequest {
    bot: Bot;
    request: GroupRequest;
    config: GroupConfig;
    captcha?: string;
    startTime: number;
    timeoutTimer: NodeJS.Timeout;
}
export interface PluginConfig {
    superAdmins: string[];
    enableAutoVerify: boolean;
    verifyTimeout: number;
    maxRetryCount: number;
    enableLog: boolean;
    defaultVerifyMode: VerifyMode;
    defaultCaptchaLength: number;
    enableImageCaptcha: boolean;
    approveMsg: string;
    rejectMsg: string;
    timeoutMsg: string;
    waitingMsg: string;
}
export interface VerifyAttempt {
    count: number;
    lastAttempt: number;
}
export interface GroupConfigCacheItem {
    config: GroupConfig;
    timestamp: number;
}
export interface GroupConfig {
    groupId: number;
    mode: VerifyMode;
    captchaLength: number;
    timeout: number;
    skipInGroupUser: boolean;
    waitingMsg: string;
    approveMsg: string;
    rejectMsg: string;
    timeoutMsg: string;
}
export interface Whitelist {
    userId: number;
    remark?: string;
    createTime: Date;
}
export interface VerifyRecord {
    id?: number;
    groupId: number;
    userId: number;
    type: VerifyType;
    result: VerifyResult;
    verifyTime: Date;
}
export interface SuperAdmin {
    userId: number;
    remark?: string;
    createTime: Date;
}
export interface DatabaseService {
    db: Database;
    init(): void;
    getGroupConfig(groupId: number): Promise<GroupConfig | null>;
    setGroupConfig(config: GroupConfig): Promise<void>;
    getAllGroupConfigs(): Promise<GroupConfig[]>;
    isInWhitelist(userId: number): Promise<boolean>;
    addToWhitelist(userId: number, remark?: string): Promise<void>;
    removeFromWhitelist(userId: number): Promise<void>;
    getWhitelist(): Promise<Whitelist[]>;
    addVerifyRecord(record: Partial<VerifyRecord>): Promise<void>;
    getVerifyRecords(groupId?: number, userId?: number): Promise<VerifyRecord[]>;
    isSuperAdmin(userId: number): Promise<boolean>;
    addSuperAdmin(userId: number, remark?: string): Promise<void>;
    removeSuperAdmin(userId: number): Promise<void>;
    getSuperAdmins(): Promise<SuperAdmin[]>;
}
