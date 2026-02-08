<template>
  <div class="config-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>QQ 群加入验证配置</span>
        </div>
      </template>

      <!-- 群配置 -->
      <el-tabs v-model="activeTab">
        <el-tab-pane label="群配置" name="group">
          <el-form :model="currentConfig" label-width="120px">
            <el-form-item label="选择群聊">
              <el-select v-model="selectedGroup" @change="loadGroupConfig" filterable>
                <el-option
                  v-for="group in groups"
                  :key="group.groupId"
                  :label="`${group.groupId}`"
                  :value="group.groupId"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="开启群聊验证">
              <el-switch v-model="isVerificationEnabled" @change="toggleVerification" />
            </el-form-item>

            <el-form-item label="验证模式" :disabled="!isVerificationEnabled">
              <el-select v-model="currentConfig.mode" :disabled="!isVerificationEnabled">
                <el-option label="仅白名单" value="whitelist" />
                <el-option label="文本验证码" value="captcha" />
                <el-option label="图片验证码" value="image-captcha" />
              </el-select>
            </el-form-item>

            <el-form-item label="验证码长度">
              <el-input-number v-model="currentConfig.captchaLength" :min="3" :max="8" />
            </el-form-item>

            <el-form-item label="超时时间(秒)">
              <el-input-number v-model="currentConfig.timeout" :min="30" :max="3600" />
            </el-form-item>

            <el-form-item label="跳过群内用户">
              <el-switch v-model="currentConfig.skipInGroupUser" />
            </el-form-item>

            <el-form-item label="等待消息">
              <el-input
                v-model="currentConfig.waitingMsg"
                type="textarea"
                :rows="2"
                placeholder="支持变量：{captcha} 验证码，{timeout} 超时秒数"
              />
            </el-form-item>

            <el-form-item label="通过消息">
              <el-input v-model="currentConfig.approveMsg" />
            </el-form-item>

            <el-form-item label="拒绝消息">
              <el-input v-model="currentConfig.rejectMsg" />
            </el-form-item>

            <el-form-item label="超时消息">
              <el-input v-model="currentConfig.timeoutMsg" />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="saveGroupConfig">保存配置</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 白名单管理 -->
        <el-tab-pane label="白名单管理" name="whitelist">
          <el-form :inline="true" class="mb-4" @submit.prevent="addWhitelist">
            <el-form-item label="用户ID">
              <el-input v-model="newWhitelist.userId" type="number" placeholder="输入用户ID" />
            </el-form-item>
            <el-form-item label="备注">
              <el-input v-model="newWhitelist.remark" placeholder="可选" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" native-type="submit">添加白名单</el-button>
            </el-form-item>
          </el-form>

          <el-table :data="whitelist" style="width: 100%">
            <el-table-column prop="userId" label="用户ID" width="180" />
            <el-table-column prop="remark" label="备注" />
            <el-table-column prop="createTime" label="添加时间" width="200">
              <template #default="scope">
                {{ formatDate(scope.row.createTime) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="scope">
                <el-button
                  type="danger"
                  size="small"
                  @click="removeWhitelist(scope.row.userId)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { useRequest, useToast } from '@koishijs/plugin-console'

interface GroupConfig {
  groupId: number
  mode: 'whitelist' | 'captcha' | 'image-captcha'
  captchaLength: number
  timeout: number
  skipInGroupUser: boolean
  waitingMsg: string
  approveMsg: string
  rejectMsg: string
  timeoutMsg: string
}

interface WhitelistItem {
  userId: number
  remark?: string
  createTime: string
}

const activeTab = ref('group')
const selectedGroup = ref<number>(0)
const groups = ref<GroupConfig[]>([])
const isVerificationEnabled = ref(true)
const currentConfig = reactive<GroupConfig>({
  groupId: 0,
  mode: 'captcha',
  captchaLength: 4,
  timeout: 180,
  skipInGroupUser: true,
  waitingMsg: '请输入验证码：{captcha}，{timeout}秒内有效',
  approveMsg: '验证通过，欢迎加入群聊！',
  rejectMsg: '验证失败，拒绝加入群聊',
  timeoutMsg: '验证超时，拒绝加入群聊',
})

const whitelist = ref<WhitelistItem[]>([])
const newWhitelist = reactive({
  userId: 0,
  remark: '',
})

const toast = useToast()

// 获取群配置列表
const { run: loadGroupConfigs } = useRequest(async () => {
  const response = await fetch('/api/qq-group-join-verification/group-configs')
  const data = await response.json()
  groups.value = data
  if (data.length > 0 && !selectedGroup.value) {
    selectedGroup.value = data[0].groupId
    loadGroupConfig()
  }
}, { immediate: true })

// 加载单个群配置
const loadGroupConfig = async () => {
  if (!selectedGroup.value) return
  const config = groups.value.find(g => g.groupId === selectedGroup.value)
  if (config) {
    Object.assign(currentConfig, config)
    // 根据验证模式判断是否启用
    isVerificationEnabled.value = config.mode !== 'whitelist'
  } else {
    // 新群，使用默认配置
    currentConfig.groupId = selectedGroup.value
    isVerificationEnabled.value = true
  }
}

// 切换验证状态
const toggleVerification = async () => {
  if (!selectedGroup.value) {
    toast.warning('请先选择群聊')
    isVerificationEnabled.value = false
    return
  }
  
  try {
    if (isVerificationEnabled.value) {
      // 启用验证
      currentConfig.mode = 'captcha' // 默认使用文本验证码
    } else {
      // 禁用验证
      currentConfig.mode = 'whitelist'
    }
    
    await saveGroupConfig()
  } catch (error) {
    toast.error('切换验证状态失败')
    // 恢复原来的状态
    isVerificationEnabled.value = !isVerificationEnabled.value
  }
}

// 保存群配置
const saveGroupConfig = async () => {
  try {
    await fetch('/api/qq-group-join-verification/group-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(currentConfig),
    })
    toast.success('配置保存成功')
    loadGroupConfigs()
  } catch (error) {
    toast.error('配置保存失败')
  }
}

// 获取白名单
const { run: loadWhitelist } = useRequest(async () => {
  const response = await fetch('/api/qq-group-join-verification/whitelist')
  const data = await response.json()
  whitelist.value = data
}, { immediate: true })

// 添加白名单
const addWhitelist = async () => {
  if (!newWhitelist.userId) {
    toast.warning('请输入用户ID')
    return
  }
  try {
    await fetch('/api/qq-group-join-verification/whitelist/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newWhitelist),
    })
    toast.success('白名单添加成功')
    loadWhitelist()
    newWhitelist.userId = 0
    newWhitelist.remark = ''
  } catch (error) {
    toast.error('白名单添加失败')
  }
}

// 删除白名单
const removeWhitelist = async (userId: number) => {
  try {
    await fetch('/api/qq-group-join-verification/whitelist/remove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    })
    toast.success('白名单删除成功')
    loadWhitelist()
  } catch (error) {
    toast.error('白名单删除失败')
  }
}

// 格式化日期
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleString()
}

onMounted(() => {
  loadGroupConfigs()
  loadWhitelist()
})
</script>

<style scoped>
.config-page {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mb-4 {
  margin-bottom: 16px;
}
</style>