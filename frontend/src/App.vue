<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import { callAI, TOOLS_CONFIG } from './utils/api.js'

// ── 配置 marked ──────────────────────────────────────────
marked.setOptions({ breaks: true, gfm: true })

// ── 核心状态 ──────────────────────────────────────────────
const selectedTool = ref(null)
const loading = ref(false)
const output = ref('')
const error = ref('')
const userInput = ref('')
const startTime = ref(0)
const elapsedMs = ref(0)

// ── Toast 状态 ─────────────────────────────────────────────
const toast = ref({ show: false, message: '', type: 'success' })
let toastTimer = null

function showToast(message, type = 'success') {
  clearTimeout(toastTimer)
  toast.value = { show: true, message, type }
  toastTimer = setTimeout(() => { toast.value.show = false }, 3000)
}

// ── 历史记录状态 ───────────────────────────────────────────
const showHistory = ref(false)
const historyList = ref([])

// ── 计算属性 ──────────────────────────────────────────────
const tools = computed(() => Object.values(TOOLS_CONFIG))
const currentTool = computed(() => selectedTool.value ? TOOLS_CONFIG[selectedTool.value] : null)
const renderedOutput = computed(() => output.value ? marked.parse(output.value) : '')
const elapsed = computed(() => {
  if (elapsedMs.value < 1000) return `${elapsedMs.value}ms`
  return `${(elapsedMs.value / 1000).toFixed(1)}s`
})

// ── 选择工具 ──────────────────────────────────────────────
function selectTool(toolId) {
  if (selectedTool.value === toolId) {
    selectedTool.value = null
    resetWorkspace()
  } else {
    selectedTool.value = toolId
    resetWorkspace()
    // 滚动到工作区
    setTimeout(() => {
      document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
    // 加载历史
    loadHistory(toolId)
  }
}

function resetWorkspace() {
  output.value = ''
  error.value = ''
  userInput.value = ''
  elapsedMs.value = 0
  showHistory.value = false
}

// ── 填入示例 ──────────────────────────────────────────────
function fillExample() {
  if (currentTool.value) {
    userInput.value = currentTool.value.example
    showToast('✅ 已填入示例内容')
  }
}

// ── 清空输入 ──────────────────────────────────────────────
function clearInput() {
  userInput.value = ''
  output.value = ''
  error.value = ''
  elapsedMs.value = 0
}

// ── 调用 AI ──────────────────────────────────────────────
async function processInput() {
  const text = userInput.value.trim()
  if (!text || loading.value) return

  if (text.length < 10) {
    showToast('⚠️ 输入内容过短，建议至少 10 个字符', 'warn')
    return
  }

  loading.value = true
  output.value = ''
  error.value = ''
  startTime.value = Date.now()

  try {
    const result = await callAI(selectedTool.value, text)
    output.value = result
    elapsedMs.value = Date.now() - startTime.value
    saveToHistory(selectedTool.value, text, result)
    loadHistory(selectedTool.value)
    showToast(`✅ 处理完成，耗时 ${elapsed.value}`)
  } catch (err) {
    error.value = err.message || '处理失败，请稍后重试'
    showToast(`❌ ${error.value}`, 'error')
  } finally {
    loading.value = false
  }
}

// ── LocalStorage 历史记录 ──────────────────────────────────
function saveToHistory(toolType, input, result) {
  try {
    const key = `aegis_history_${toolType}`
    const history = JSON.parse(localStorage.getItem(key) || '[]')
    history.unshift({
      id: Date.now(),
      input: input.substring(0, 300),
      output: result,
      timestamp: new Date().toISOString(),
    })
    localStorage.setItem(key, JSON.stringify(history.slice(0, 30)))
  } catch (e) { /* 静默 */ }
}

function loadHistory(toolType) {
  try {
    const key = `aegis_history_${toolType}`
    historyList.value = JSON.parse(localStorage.getItem(key) || '[]')
  } catch (e) {
    historyList.value = []
  }
}

function loadHistoryItem(item) {
  userInput.value = item.input
  output.value = item.output
  error.value = ''
  showHistory.value = false
  showToast('📂 已加载历史记录')
}

function clearHistory() {
  if (!selectedTool.value) return
  const key = `aegis_history_${selectedTool.value}`
  localStorage.removeItem(key)
  historyList.value = []
  showHistory.value = false
  showToast('🗑️ 历史记录已清空')
}

function formatTime(iso) {
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── 复制结果 ──────────────────────────────────────────────
async function copyOutput() {
  if (!output.value) return
  try {
    await navigator.clipboard.writeText(output.value)
    showToast('📋 已复制到剪贴板')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = output.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    showToast('📋 已复制到剪贴板')
  }
}

// ── 键盘快捷键 ────────────────────────────────────────────
function handleKeydown(e) {
  // Ctrl+Enter / Cmd+Enter 提交
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    if (selectedTool.value && userInput.value.trim() && !loading.value) {
      processInput()
    }
  }
  // Escape 关闭工作区
  if (e.key === 'Escape' && selectedTool.value) {
    selectedTool.value = null
    resetWorkspace()
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

const currentYear = new Date().getFullYear()
</script>

<template>
  <div class="min-h-screen relative">
    <!-- ═══ Toast 通知 ═══ -->
    <transition name="toast">
      <div
        v-if="toast.show"
        :class="[
          'fixed bottom-6 right-6 z-[100] px-5 py-3 rounded-xl text-sm font-medium shadow-2xl',
          'backdrop-blur-xl border',
          toast.type === 'error' && 'bg-red-500/15 border-red-500/30 text-red-300',
          toast.type === 'warn' && 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300',
          toast.type === 'success' && 'bg-green-500/15 border-green-500/30 text-green-300',
        ]"
      >
        {{ toast.message }}
      </div>
    </transition>

    <!-- ═══ 动态背景 ═══ -->
    <div class="bg-scene">
      <div class="orb orb-blue"></div>
      <div class="orb orb-pink"></div>
      <div class="orb orb-green"></div>
    </div>

    <!-- ═══ 顶部导航 ═══ -->
    <header class="glass-header fixed top-0 left-0 right-0 z-50">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-500/20">
            A
          </div>
          <span class="text-lg font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Aegis AI
          </span>
        </div>
        <nav class="hidden md:flex items-center gap-6 text-sm text-slate-400">
          <a href="#tools" class="hover:text-white transition-colors">功能模块</a>
          <a href="#about" class="hover:text-white transition-colors">安全说明</a>
          <span class="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-500">
            🔒 数据仅存本地
          </span>
        </nav>
      </div>
    </header>

    <!-- ═══ 主内容 ═══ -->
    <main class="relative pt-24 pb-16 px-6">
      <div class="max-w-7xl mx-auto">

        <!-- ── Hero 区域 ── -->
        <section class="text-center mb-16 animate-fade-in">
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-slate-400 mb-6">
            <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            Powered by DeepSeek / Gemini · Built on Cloudflare
          </div>
          <h1 class="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
            <span class="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              企业级 AI 效能中枢
            </span>
          </h1>
          <p class="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            面向传统企业文职人员的智能办公平台<br class="hidden md:block" />
            <span class="text-slate-500">让 AI 处理繁琐文书 · 让效率指数级提升</span>
          </p>
        </section>

        <!-- ── 工具卡片 ── -->
        <section id="tools" class="mb-12">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div
              v-for="tool in tools"
              :key="tool.id"
              @click="selectTool(tool.id)"
              :class="[
                'tool-card',
                `card-${tool.color}`,
                { active: selectedTool === tool.id }
              ]"
            >
              <div class="relative z-10">
                <div class="text-4xl mb-4">{{ tool.icon }}</div>
                <h3 class="text-lg font-bold text-white mb-2">{{ tool.name }}</h3>
                <p class="text-sm text-slate-400 leading-relaxed">{{ tool.description }}</p>
                <div class="mt-4 flex items-center gap-2 text-xs">
                  <span
                    :class="[
                      'px-2.5 py-1 rounded-md font-medium transition-all',
                      tool.color === 'blue' && (selectedTool === tool.id ? 'bg-blue-500/25 text-blue-300' : 'bg-blue-500/10 text-blue-400'),
                      tool.color === 'pink' && (selectedTool === tool.id ? 'bg-pink-500/25 text-pink-300' : 'bg-pink-500/10 text-pink-400'),
                      tool.color === 'green' && (selectedTool === tool.id ? 'bg-green-500/25 text-green-300' : 'bg-green-500/10 text-green-400'),
                    ]"
                  >
                    {{ selectedTool === tool.id ? '✓ 使用中' : '点击使用' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ── 工作区 ── -->
        <transition name="slide">
          <section v-if="selectedTool" id="workspace" class="glass-strong p-6 md:p-8 mb-12">
            <!-- 工作区头部 -->
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-3">
                <span class="text-2xl">{{ currentTool.icon }}</span>
                <div>
                  <h2 class="text-xl font-bold text-white">{{ currentTool.name }}</h2>
                  <p class="text-xs text-slate-500">{{ currentTool.description }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <!-- 历史记录按钮 -->
                <button
                  @click="showHistory = !showHistory"
                  :class="[
                    'px-3 py-2 rounded-lg text-xs font-medium transition-all border',
                    showHistory
                      ? 'bg-white/10 border-white/20 text-white'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
                  ]"
                >
                  📂 历史 ({{ historyList.length }})
                </button>
                <!-- 关闭按钮 -->
                <button
                  @click="selectTool(selectedTool)"
                  class="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                  title="关闭工作区 (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            <!-- 历史记录面板 -->
            <transition name="fade">
              <div v-if="showHistory" class="mb-5 glass p-4">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-semibold text-slate-300">处理历史</h3>
                  <button
                    v-if="historyList.length > 0"
                    @click="clearHistory"
                    class="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    🗑️ 清空
                  </button>
                </div>
                <div v-if="historyList.length === 0" class="text-xs text-slate-600 text-center py-4">
                  暂无历史记录
                </div>
                <div v-else class="space-y-2 max-h-48 overflow-y-auto">
                  <div
                    v-for="item in historyList.slice(0, 10)"
                    :key="item.id"
                    @click="loadHistoryItem(item)"
                    class="flex items-start gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-all group"
                  >
                    <span class="text-xs text-slate-600 whitespace-nowrap mt-0.5">{{ formatTime(item.timestamp) }}</span>
                    <p class="text-xs text-slate-400 line-clamp-2 flex-1 group-hover:text-slate-300">
                      {{ item.input }}
                    </p>
                  </div>
                </div>
              </div>
            </transition>

            <!-- 输入区域 -->
            <div class="mb-5">
              <div class="flex items-center justify-between mb-2">
                <label class="text-sm font-medium text-slate-300">输入内容</label>
                <div class="flex items-center gap-3">
                  <button
                    @click="clearInput"
                    v-if="userInput"
                    class="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    🗑️ 清空
                  </button>
                  <button
                    @click="fillExample"
                    class="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                  >
                    <span>💡</span> 填入示例
                  </button>
                </div>
              </div>
              <textarea
                v-model="userInput"
                :placeholder="currentTool.placeholder"
                class="glass-input"
                rows="8"
              ></textarea>
              <div class="flex items-center justify-between mt-2">
                <div class="flex items-center gap-3">
                  <span class="text-xs text-slate-600">
                    {{ userInput.length }} 字
                  </span>
                  <span class="text-xs text-slate-700">
                    Ctrl+Enter 提交
                  </span>
                </div>
                <button
                  @click="processInput"
                  :disabled="!userInput.trim() || loading"
                  class="btn-gradient text-sm"
                >
                  <span v-if="!loading">🚀 开始处理</span>
                  <span v-else class="flex items-center gap-2">
                    <span class="loading-dots">
                      <span></span><span></span><span></span>
                    </span>
                    AI 处理中...
                  </span>
                </button>
              </div>
            </div>

            <!-- 输出区域 -->
            <transition name="fade">
              <div v-if="output || error || loading" class="border-t border-white/5 pt-5">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-3">
                    <label class="text-sm font-medium text-slate-300">
                      {{ loading ? '⏳ 处理中...' : '📋 处理结果' }}
                    </label>
                    <span v-if="!loading && elapsedMs > 0" class="text-xs text-slate-600">
                      耗时 {{ elapsed }}
                    </span>
                  </div>
                  <button
                    v-if="output && !loading"
                    @click="copyOutput"
                    class="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                  >
                    📋 复制结果
                  </button>
                </div>

                <!-- 加载动画 -->
                <div v-if="loading && !output" class="glass p-8 text-center">
                  <div class="loading-dots mb-3" style="justify-content: center; display: flex;">
                    <span></span><span></span><span></span>
                  </div>
                  <p class="text-sm text-slate-500">AI 正在分析处理中，请稍候...</p>
                </div>

                <!-- 错误信息 -->
                <div v-if="error" class="glass p-6 border-red-500/30">
                  <p class="text-red-400 text-sm">❌ {{ error }}</p>
                </div>

                <!-- 结果内容 -->
                <div v-if="output" class="glass p-6 max-h-[600px] overflow-y-auto">
                  <div class="markdown-output" v-html="renderedOutput"></div>
                </div>
              </div>
            </transition>
          </section>
        </transition>

        <!-- ── 使用说明（未选择工具时展示）── -->
        <transition name="fade">
          <section v-if="!selectedTool" class="glass p-8 mb-12">
            <h2 class="text-xl font-bold text-white mb-6 text-center">📋 使用指南</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div class="text-center">
                <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-2xl mx-auto mb-3">📝</div>
                <h3 class="font-semibold text-white mb-1">智能文书助手</h3>
                <p class="text-sm text-slate-400">输入零散工作要点 → AI 生成结构化周报/计划书/请示报告</p>
              </div>
              <div class="text-center">
                <div class="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center text-2xl mx-auto mb-3">🔍</div>
                <h3 class="font-semibold text-white mb-1">合同/文档审核</h3>
                <p class="text-sm text-slate-400">粘贴合同文本 → AI 三轮扫描合规风险并给出修改建议</p>
              </div>
              <div class="text-center">
                <div class="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-2xl mx-auto mb-3">🔄</div>
                <h3 class="font-semibold text-white mb-1">格式化转换器</h3>
                <p class="text-sm text-slate-400">粘贴会议纪要 → AI 提取标准任务清单表格</p>
              </div>
            </div>
          </section>
        </transition>

        <!-- ── 安全说明 ── -->
        <section id="about" class="glass p-8 mb-12">
          <h2 class="text-xl font-bold text-white mb-6 text-center">🔐 安全与隐私设计</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="text-center">
              <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-2xl mx-auto mb-3">🛡️</div>
              <h3 class="font-semibold text-white mb-1">逻辑隔离</h3>
              <p class="text-sm text-slate-400">前端不包含任何 API Key，所有请求必须经过 Worker 中转</p>
            </div>
            <div class="text-center">
              <div class="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center text-2xl mx-auto mb-3">🔑</div>
              <h3 class="font-semibold text-white mb-1">环境指纹鉴权</h3>
              <p class="text-sm text-slate-400">Token + Origin + ClientID 三重验证，仅授权环境可调用</p>
            </div>
            <div class="text-center">
              <div class="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-2xl mx-auto mb-3">💾</div>
              <h3 class="font-semibold text-white mb-1">本地化存储</h3>
              <p class="text-sm text-slate-400">文档数据仅保存在浏览器 LocalStorage，不上传任何服务器</p>
            </div>
          </div>
        </section>

        <!-- ── 页脚 ── -->
        <footer class="text-center text-xs text-slate-600">
          <p>Aegis AI · 企业级 AI 效能中枢 · {{ currentYear }}</p>
          <p class="mt-1">Built with Vue 3 · Tailwind CSS · Cloudflare Workers · DeepSeek / Gemini</p>
        </footer>
      </div>
    </main>
  </div>
</template>
