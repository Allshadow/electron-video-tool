<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useClipboard } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { Setting, Download, CopyDocument, Delete, Microphone, FolderOpened } from '@element-plus/icons-vue'

const downloadUrl = ref('')
const logs = ref<string[]>([])
const isDownloading = ref(false)
const logContainerRef = ref<HTMLElement | null>(null)

// 音频分离相关
const audioFile = ref('')
const separationLogs = ref<string[]>([])
const isSeparating = ref(false)
const separationLogContainerRef = ref<HTMLElement | null>(null)

// 输出目录路径（分离完成后可打开）
const separationOutputDir = ref('')
const downloadOutputDir = ref('')

// 标签页控制
const activeTab = ref('download')

// 使用 vueuse 的 useClipboard
const { copy } = useClipboard()

// 自动滚动到底部
const scrollToBottom = async () => {
  await nextTick()
  if (logContainerRef.value) {
    logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight
  }
  if (separationLogContainerRef.value) {
    separationLogContainerRef.value.scrollTop = separationLogContainerRef.value.scrollHeight
  }
}

// 添加日志
const addLog = (message: string) => {
  const timestamp = new Date().toLocaleTimeString()
  logs.value.push(`[${timestamp}] ${message}`)
  scrollToBottom()
}

// 添加分离日志
const addSeparationLog = (message: string) => {
  const timestamp = new Date().toLocaleTimeString()
  separationLogs.value.push(`[${timestamp}] ${message}`)
  scrollToBottom()
}

// 立即下载
const handleDownload = async () => {
  if (!downloadUrl.value.trim()) {
    ElMessage.warning('请输入下载链接')
    return
  }

  if (isDownloading.value) {
    ElMessage.warning('正在下载中，请勿重复提交')
    return
  }

  // 重置状态
  isDownloading.value = true
  logs.value = []
  addLog(`准备启动下载任务...`)
  addLog(`目标链接：${downloadUrl.value}`)

  try {
    // 1. 检查 Electron API 是否存在
    if (!window.api) {
      throw new Error('Electron API 未就绪。请确认项目在 Electron 环境中运行，且 preload 脚本已加载。')
    }

    // 2. 检查 startDownload 方法是否存在
    if (typeof window.api.startDownload !== 'function') {
      throw new Error('API 错误: window.api.startDownload 未定义。请检查 preload/index.ts 是否暴露了该方法。')
    }

    // 3. 调用主进程
    await window.api.startDownload(downloadUrl.value)

    ElMessage.success('下载任务已提交至后台')

  } catch (error: any) {
    console.error('Failed to start download:', error)
    const errMsg = error?.message || String(error)
    addLog(`启动下载失败: ${errMsg}`)
    ElMessage.error(`下载启动失败: ${errMsg}`)
    isDownloading.value = false
  }
}

// 选择音频文件
const handleSelectFile = async () => {
  if (!window.api || typeof window.api.selectFile !== 'function') {
    ElMessage.error('Electron API 未就绪')
    return
  }

  try {
    const result = await window.api.selectFile()
    if (result && result.filePaths && result.filePaths.length > 0) {
      audioFile.value = result.filePaths[0]
      ElMessage.success('文件选择成功')
    }
  } catch (error) {
    ElMessage.error('文件选择失败')
  }
}

// 执行音频分离
const handleSeparate = async () => {
  if (!audioFile.value.trim()) {
    ElMessage.warning('请选择音频/视频文件')
    return
  }

  if (isSeparating.value) {
    ElMessage.warning('正在分离中，请勿重复提交')
    return
  }

  // 重置状态
  isSeparating.value = true
  separationLogs.value = []
  addSeparationLog(`准备启动音频分离任务...`)
  addSeparationLog(`目标文件：${audioFile.value}`)

  try {
    // 检查 Electron API 是否存在
    if (!window.api) {
      throw new Error('Electron API 未就绪')
    }

    // 调用主进程（输出目录由主进程计算）
    await window.api.separateAudio(audioFile.value)

    ElMessage.success('音频分离任务已提交至后台')

  } catch (error: any) {
    console.error('Failed to separate audio:', error)
    const errMsg = error?.message || String(error)
    addSeparationLog(`启动分离失败: ${errMsg}`)
    ElMessage.error(`音频分离启动失败: ${errMsg}`)
    isSeparating.value = false
  }
}

// 打开输出目录
const handleOpenDir = async (dir: string) => {
  if (!dir) {
    ElMessage.warning('暂无输出目录')
    return
  }
  if (!window.api || typeof window.api.openPath !== 'function') {
    ElMessage.error('Electron API 未就绪')
    return
  }
  try {
    await window.api.openPath(dir)
  } catch (error) {
    ElMessage.error('打开目录失败')
  }
}

// 复制日志
const copyLogs = async () => {
  if (logs.value.length === 0) {
    ElMessage.warning('暂无日志可复制')
    return
  }
  try {
    await copy(logs.value.join('\n'))
    ElMessage.success('日志已复制到剪贴板')
  } catch (err) {
    ElMessage.error('复制失败')
  }
}

// 复制分离日志
const copySeparationLogs = async () => {
  if (separationLogs.value.length === 0) {
    ElMessage.warning('暂无日志可复制')
    return
  }
  try {
    await copy(separationLogs.value.join('\n'))
    ElMessage.success('日志已复制到剪贴板')
  } catch (err) {
    ElMessage.error('复制失败')
  }
}

// 清除日志
const clearLogs = () => {
  logs.value = []
  ElMessage.success('日志已清除')
}

// 清除分离日志
const clearSeparationLogs = () => {
  separationLogs.value = []
  ElMessage.success('日志已清除')
}

// 设置按钮点击
const handleSettings = () => {
  ElMessage.info('设置功能开发中...')
}

// 监听来自主进程的日志更新
let unregisterLogListener: (() => void) | null = null
let unregisterSeparationListener: (() => void) | null = null

onMounted(() => {
  if (window.api && typeof window.api.onDownloadLog === 'function') {
    unregisterLogListener = window.api.onDownloadLog((data: { type: string; message: string; outputDir?: string }) => {
      let logMsg = ''
      let isEnd = false
      let isError = false
      let isSuccess = false

      logMsg = data.message

      // 捕获输出目录路径
      if (data.outputDir) {
        downloadOutputDir.value = data.outputDir
      }

      // 判断日志类型
      if (data.type === 'error') {
        isError = true
        isEnd = true
      } else if (data.type === 'success') {
        isSuccess = true
        isEnd = true
      } else if (data.type === 'info') {
        // 检查 info 类型中是否包含完成标志
        if (data.message.includes('[download] 100%') || data.message.includes('has already been downloaded')) {
          isSuccess = true
          isEnd = true
        }
      }

      if (logMsg) {
        addLog(logMsg)
      }

      // 处理结束状态，重置 loading
      if (isEnd) {
        if (isError) {
           ElMessage.error('下载过程中出现错误')
           isDownloading.value = false
        } else if (isSuccess) {
           ElMessage.success('视频下载完成')
           isDownloading.value = false
        }
      }
    })
  } else {
    console.warn('onDownloadLog listener not available')
  }

  if (window.api && typeof window.api.onSeparationLog === 'function') {
    unregisterSeparationListener = window.api.onSeparationLog((data: { type: string; message: string; outputDir?: string }) => {
      let logMsg = data.message
      let isEnd = false
      let isError = false
      let isSuccess = false

      // 捕获输出目录路径
      if (data.outputDir) {
        separationOutputDir.value = data.outputDir
      }

      // 判断日志类型
      if (data.type === 'error') {
        isError = true
        isEnd = true
      } else if (data.type === 'success') {
        isSuccess = true
        isEnd = true
      }

      if (logMsg) {
        addSeparationLog(logMsg)
      }

      // 处理结束状态，重置 loading
      if (isEnd) {
        if (isError) {
           ElMessage.error('音频分离过程中出现错误')
           isSeparating.value = false
        } else if (isSuccess) {
           ElMessage.success('音频分离完成')
           isSeparating.value = false
        }
      }
    })
  }
})

onUnmounted(() => {
  // 清理监听器，防止内存泄漏
  if (unregisterLogListener) {
    unregisterLogListener()
  }
  if (unregisterSeparationListener) {
    unregisterSeparationListener()
  }
})
</script>

<template>
  <div class="container">
    <!-- 右上角设置按钮 -->
    <el-button
      class="settings-btn"
      :icon="Setting"
      circle
      @click="handleSettings"
      title="设置"
    />

    <!-- 标签页切换 -->
    <el-tabs v-model="activeTab" class="main-tabs">
      <!-- 视频下载标签页 -->
      <el-tab-pane label="视频下载" name="download">
        <!-- 输入区域 -->
        <div class="input-section">
          <el-input
            v-model="downloadUrl"
            placeholder="请输入视频链接 (支持 YouTube, Bilibili 等)"
            clearable
            @keyup.enter="handleDownload"
            class="url-input"
            :disabled="isDownloading"
          />
          <el-button
            type="primary"
            :icon="Download"
            @click="handleDownload"
            class="download-btn"
            :loading="isDownloading"
          >
            {{ isDownloading ? '下载中...' : '立即下载' }}
          </el-button>
        </div>

        <!-- 日志区域 -->
        <div class="log-section">
          <div class="log-header">
            <span class="log-title">运行日志</span>
            <div class="log-actions">
              <el-button
                v-if="downloadOutputDir"
                :icon="FolderOpened"
                size="small"
                type="success"
                @click="handleOpenDir(downloadOutputDir)"
              >
                打开输出目录
              </el-button>
              <el-button
                :icon="CopyDocument"
                size="small"
                @click="copyLogs"
              >
                复制
              </el-button>
              <el-button
                :icon="Delete"
                size="small"
                type="danger"
                @click="clearLogs"
              >
                清除
              </el-button>
            </div>
          </div>
          <div class="log-content" ref="logContainerRef">
            <div v-if="logs.length === 0" class="empty-log">
              等待下载任务...
            </div>
            <div v-else class="log-list">
              <div v-for="(log, index) in logs" :key="index" class="log-item">
                {{ log }}
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 音频分离标签页 -->
      <el-tab-pane label="音频分离" name="separation">
        <!-- 文件选择区域 -->
        <div class="input-section">
          <el-input
            v-model="audioFile"
            placeholder="请选择音频/视频文件路径"
            clearable
            class="url-input"
            :disabled="isSeparating"
          />
          <el-button
            @click="handleSelectFile"
            :disabled="isSeparating"
          >
            选择文件
          </el-button>
          <el-button
            type="success"
            :icon="Microphone"
            @click="handleSeparate"
            :loading="isSeparating"
          >
            {{ isSeparating ? '分离中...' : '开始分离' }}
          </el-button>
        </div>

        <!-- 分离日志区域 -->
        <div class="log-section">
          <div class="log-header">
            <span class="log-title">分离日志</span>
            <div class="log-actions">
              <el-button
                v-if="separationOutputDir"
                :icon="FolderOpened"
                size="small"
                type="success"
                @click="handleOpenDir(separationOutputDir)"
              >
                打开输出目录
              </el-button>
              <el-button
                :icon="CopyDocument"
                size="small"
                @click="copySeparationLogs"
              >
                复制
              </el-button>
              <el-button
                :icon="Delete"
                size="small"
                type="danger"
                @click="clearSeparationLogs"
              >
                清除
              </el-button>
            </div>
          </div>
          <div class="log-content" ref="separationLogContainerRef">
            <div v-if="separationLogs.length === 0" class="empty-log">
              等待音频分离任务...
            </div>
            <div v-else class="log-list">
              <div v-for="(log, index) in separationLogs" :key="index" class="log-item">
                {{ log }}
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped lang="scss">
.container {
  width: 100%;
  max-width: 800px;
  position: relative;
  /* padding-top: 10px; */
}

/* 设置按钮 */
.settings-btn {
  position: absolute;
  top: 20px;
  right: 20px;
}

/* 标签页样式 */
.main-tabs {
  margin-top: 60px;
  :deep(.el-tabs__item){
    color: rgba($color: #fff, $alpha: .5);
    &.is-active{
      color: #409eff;
    }
  }
}

/* 输入区域 */
.input-section {
  display: flex;
  gap: 12px;
  margin-bottom: 30px;
}

.url-input {
  flex: 1;
}

.download-btn {
  white-space: nowrap;
}

/* 日志区域 */
.log-section {
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  background: #fafafa;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  border-bottom: 1px solid #e0e0e0;
}

.log-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.log-actions {
  display: flex;
  gap: 8px;
}

.log-content {
  height: 350px;
  overflow-y: auto;
  padding: 12px;
  background: #1e1e1e;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.empty-log {
  color: #666;
  text-align: center;
  padding: 20px;
  font-style: italic;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.log-item {
  color: #d4d4d4;
  padding: 2px 0;
  word-break: break-all;
}

.log-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* 滚动条样式 */
.log-content::-webkit-scrollbar {
  width: 8px;
}

.log-content::-webkit-scrollbar-track {
  background: #2d2d2d;
}

.log-content::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

.log-content::-webkit-scrollbar-thumb:hover {
  background: #409eff;
}
</style>
