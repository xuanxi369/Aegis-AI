<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import html2pdf from 'html2pdf.js'
import { encryptPDFWithPassword } from './utils/pdfEncrypt.js'
import { callAI, callAudioAI, autoParseFile, TOOLS_CONFIG } from './utils/api.js'
import { t, currentLang } from './utils/i18n.js' // 👈 引入翻译引擎

marked.setOptions({ breaks: true, gfm: true })

// ── 核心视图状态 ─────────────────────────
const currentView = ref('landing')
const selectedTool = ref(null)
const isOutputExpanded = ref(false)
const inputMode = ref('text') 

// ── 日夜模式切换逻辑 (Theme Switcher) ──────────
const isDark = ref(localStorage.getItem('aegis_theme') === 'dark')

function toggleTheme() {
  isDark.value = !isDark.value
  if (isDark.value) {
    document.documentElement.classList.add('dark')
    localStorage.setItem('aegis_theme', 'dark')
  } else {
    document.documentElement.classList.remove('dark')
    localStorage.setItem('aegis_theme', 'light')
  }
}

// ── 动态交互背景状态 ────────────────────
const targetX = ref(0)
const targetY = ref(0)
const currentX = ref(0)
const currentY = ref(0)
let animationFrameId = null

function handlePointerMove(e) {
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  targetX.value = clientX - window.innerWidth / 2
  targetY.value = clientY - window.innerHeight / 2
}

function animateBackground() {
  currentX.value += (targetX.value - currentX.value) * 0.05
  currentY.value += (targetY.value - currentY.value) * 0.05
  animationFrameId = requestAnimationFrame(animateBackground)
}

// ── 工作区状态 ──────────────────────────
const loading = ref(false)
const output = ref('')
const error = ref('')
const userInput = ref('')
const startTime = ref(0)
const elapsedMs = ref(0)
let currentRequestId = 0 
const selectedFile = ref(null)
const parsedText = ref('')
const parseStatus = ref('') 
const isDragOver = ref(false)
const fileInputRef = ref(null)

const showPasswordModal = ref(false)
const pdfPassword = ref('')
const isExporting = ref(false)

const toast = ref({ show: false, message: '', type: 'success' })
let toastTimer = null
function showToast(msg, type = 'success') {
  clearTimeout(toastTimer)
  toast.value = { show: true, message: msg, type }
  toastTimer = setTimeout(() => { toast.value.show = false }, 3000)
}

const showHistory = ref(false)
const historyList = ref([])

const tools = computed(() => Object.values(TOOLS_CONFIG))
const currentTool = computed(() => selectedTool.value ? TOOLS_CONFIG[selectedTool.value] : null)
const renderedOutput = computed(() => {
  if (!output.value) return ''
  return marked.parse(output.value)
})

function enterApp() { currentView.value = 'dashboard' }
function goBackToDashboard() {
  currentView.value = 'dashboard'
  selectedTool.value = null
  isOutputExpanded.value = false 
  showHistory.value = false
  resetWorkspace()
}
function openTool(toolId) {
  selectedTool.value = toolId
  resetWorkspace()
  inputMode.value = currentTool.value.inputType || 'text' 
  currentView.value = 'tool'
  loadHistory(toolId)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function resetWorkspace() {
  output.value = ''; error.value = ''; userInput.value = ''
  showHistory.value = false; selectedFile.value = null; parsedText.value = ''; parseStatus.value = ''
  currentRequestId++ 
}

function onFileSelect(e) { const f = e.target.files?.[0]; if (f) handleFile(f) }
function onDrop(e) { e.preventDefault(); isDragOver.value = false; const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }
function onDragOver(e) { e.preventDefault(); isDragOver.value = true }
function onDragLeave() { isDragOver.value = false }

function handleFile(file) {
  const limit = 20 * 1024 * 1024
  if (file.size > limit) return showToast(`⚠️ 文件过大`, 'warn')
  selectedFile.value = file; parsedText.value = ''; parseStatus.value = 'parsing'
  autoParseFile(file).then(res => {
    parsedText.value = res.text || ''; parseStatus.value = 'done'
    showToast(`✅ 解析完成`)
  }).catch(err => {
    parseStatus.value = 'error'; error.value = err.message
    showToast(`❌ 解析失败`, 'error')
  })
}
function removeFile() { selectedFile.value = null; parseStatus.value = ''; if(fileInputRef.value) fileInputRef.value.value = '' }

function cancelAnalysis() {
  currentRequestId++ 
  loading.value = false
  showToast(t('取消'), 'warn')
}

async function processInput() {
  if (loading.value) return
  if (inputMode.value === 'file') {
    if (!selectedFile.value || parseStatus.value !== 'done') return showToast('⚠️ 请先上传', 'warn')
    return await processFileInput()
  } else {
    if (userInput.value.trim().length < 10) return showToast('⚠️ 内容过短', 'warn')
    await processTextInput(userInput.value.trim())
  }
}

async function processTextInput(text) {
  loading.value = true; output.value = ''; currentRequestId++
  const reqId = currentRequestId 
  try {
    const result = await callAI(selectedTool.value, text)
    if (reqId !== currentRequestId) return 
    output.value = result
    saveToHistory(selectedTool.value, text.substring(0, 50), result); loadHistory(selectedTool.value)
  } catch (err) { if (reqId === currentRequestId) error.value = err.message } 
  finally { if (reqId === currentRequestId) loading.value = false }
}

async function processFileInput() {
  loading.value = true; output.value = ''; currentRequestId++
  const reqId = currentRequestId 
  try {
    const result = await callAI(selectedTool.value, parsedText.value)
    if (reqId !== currentRequestId) return 
    output.value = result
    saveToHistory(selectedTool.value, `[文件] ${selectedFile.value.name}`, result); loadHistory(selectedTool.value)
  } catch (err) { if (reqId === currentRequestId) error.value = err.message } 
  finally { if (reqId === currentRequestId) loading.value = false }
}

function fillExample() { if(currentTool.value?.example) userInput.value = currentTool.value.example }
function copyOutput() { navigator.clipboard.writeText(output.value).then(()=>showToast(t('复制')+'成功')) }
function saveToHistory(t, i, r) { try { const k = `ag_${t}`; const h = JSON.parse(localStorage.getItem(k)||'[]'); h.unshift({id:Date.now(),input:i,output:r}); localStorage.setItem(k, JSON.stringify(h.slice(0,20))) } catch(e){} }
function loadHistory(t) { try { historyList.value = JSON.parse(localStorage.getItem(`ag_${t}`)||'[]') } catch{ historyList.value = [] } }
function loadHistoryItem(item) { userInput.value = item.input; output.value = item.output; showHistory.value = false }
function clearHistory() { localStorage.removeItem(`ag_${selectedTool.value}`); historyList.value = []; showHistory.value = false }

async function secureExportToPDF(password) {
  if (!password) return; isExporting.value = true; const el = document.getElementById('report-content')
  try {
    const opt = { margin: 0, html2canvas: { scale: 2, useCORS: true }, jsPDF: { format: 'a4', orientation: 'portrait' } }
    const pdfBlob = await html2pdf().set(opt).from(el).toPdf().output('blob')
    const bytes = await encryptPDFWithPassword(await pdfBlob.arrayBuffer(), password)
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'})); a.download = `Aegis_${Date.now()}.pdf`; a.click()
    showPasswordModal.value = false
  } catch(e) {} finally { isExporting.value = false }
}

onMounted(() => {
  // 初始化系统日夜模式
  if (isDark.value) document.documentElement.classList.add('dark')
  
  document.addEventListener('keydown', e => { if((e.ctrlKey||e.metaKey)&&e.key==='Enter') processInput() })
  window.addEventListener('mousemove', handlePointerMove)
  window.addEventListener('touchmove', handlePointerMove, { passive: true })
  animateBackground()
})

onUnmounted(() => {
  window.removeEventListener('mousemove', handlePointerMove)
  window.removeEventListener('touchmove', handlePointerMove)
  cancelAnimationFrame(animationFrameId)
})
</script>

<template>
  <div class="min-h-screen relative font-sans transition-colors duration-500">
    <div class="bg-scene">
      <div class="orb-container" :style="{ transform: `translate(${currentX * 0.15}px, ${currentY * 0.15}px)` }"><div class="orb orb-blue"></div></div>
      <div class="orb-container" :style="{ transform: `translate(${currentX * -0.1}px, ${currentY * -0.1}px)` }"><div class="orb orb-pink"></div></div>
      <div class="orb-container" :style="{ transform: `translate(${currentX * 0.05}px, ${currentY * 0.05}px)` }"><div class="orb orb-mint"></div></div>
    </div>

    <header class="fixed top-0 w-full z-50 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border-b border-white/50 dark:border-slate-700">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3 cursor-pointer" @click="currentView = 'landing'">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-pink-500 flex items-center justify-center text-white font-bold shadow-lg shadow-pink-500/20">A</div>
          <span class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-pink-600">Aegis AI</span>
        </div>
        
        <div class="flex items-center gap-4">
          <button @click="toggleTheme" class="w-9 h-9 rounded-full bg-white/60 dark:bg-slate-800/60 border border-white dark:border-slate-700 shadow-sm flex items-center justify-center text-lg hover:scale-105 transition">
            {{ isDark ? '🌙' : '☀️' }}
          </button>
          
          <select v-model="currentLang" class="glass-input !py-1 !px-3 !rounded-full !text-sm !w-auto cursor-pointer dark:bg-slate-800/80 outline-none">
            <option value="zh-CN">🇨🇳 简体中文</option>
            <option value="zh-TW">🇭🇰 繁體中文</option>
            <option value="en">🇬🇧 English</option>
            <option value="ja">🇯🇵 日本語</option>
            <option value="ko">🇰🇷 한국어</option>
            <option value="de">🇩🇪 Deutsch</option>
          </select>

          <button v-if="currentView !== 'landing'" @click="goBackToDashboard" class="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors ml-2">
            {{ t('模块大厅') }}
          </button>
        </div>
      </div>
    </header>

    <main class="relative z-10 pt-24 pb-16 px-6 max-w-7xl mx-auto min-h-screen flex flex-col">
      <transition name="fade" mode="out-in">
        <div v-if="currentView === 'landing'" class="flex-1 flex flex-col items-center justify-center text-center py-20">
          <div class="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/60 dark:bg-slate-800/60 border border-white dark:border-slate-700 shadow-sm text-sm text-blue-600 dark:text-blue-400 font-medium mb-8 backdrop-blur-md">
            <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            {{ t('全新视觉 · 企业效能引擎') }}
          </div>
          <h1 class="text-5xl md:text-7xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mb-6">
            {{ t('智驭未来办公') }} <br/> <span class="bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">{{ t('释放极简效能') }}</span>
          </h1>
          <button @click="enterApp" class="btn-fluid text-lg px-8 py-4 mt-10 flex items-center gap-3">
            {{ t('进入功能中枢') }} <span>→</span>
          </button>
        </div>

        <div v-else-if="currentView === 'dashboard'" class="py-10">
          <h2 class="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">{{ t('欢迎回来，探索智能模块') }}</h2>
          <p class="text-slate-500 dark:text-slate-400 mb-10">{{ t('选择一个专门配置的 AI Agent 开始您的工作') }}</p>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div v-for="tool in tools" :key="tool.id" @click="openTool(tool.id)" class="glass-card cursor-pointer p-8 group rounded-[2rem]">
              <div class="w-14 h-14 rounded-2xl bg-white/80 dark:bg-slate-800 shadow-sm flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform">{{ tool.icon }}</div>
              <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100 mb-3">{{ tool.name }}</h3>
              <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6 h-10">{{ tool.description }}</p>
              <div class="flex justify-between items-center text-sm font-medium">
                <span class="text-blue-500 group-hover:text-pink-500 transition-colors">{{ t('开始使用') }}</span>
                <span class="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-xs text-slate-500 dark:text-slate-300">{{ t('全模式支持') }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="currentView === 'tool'" class="py-6">
          <button @click="goBackToDashboard" class="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white mb-6 font-medium transition-colors">
            <span class="text-xl">←</span> {{ t('返回大厅') }}
          </button>

          <div class="glass-panel p-8 md:p-10 rounded-[2rem]">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-slate-200 dark:border-slate-700 pb-8 relative">
              <div class="flex items-center gap-5">
                <div class="w-16 h-16 rounded-3xl bg-white dark:bg-slate-800 flex items-center justify-center text-4xl">{{ currentTool.icon }}</div>
                <div>
                  <h2 class="text-3xl font-extrabold text-slate-800 dark:text-white">{{ currentTool.name }}</h2>
                </div>
              </div>
              <button @click="showHistory = !showHistory" class="px-5 py-2.5 rounded-full font-bold bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400">
                {{ t('📂 历史记录') }}
              </button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:items-start">
              <div class="lg:col-span-5 flex flex-col">
                <div class="flex justify-between items-center mb-4">
                  <h3 class="text-lg font-bold text-slate-800 dark:text-white">{{ t('提供分析内容') }}</h3>
                  <button v-if="inputMode === 'text'" @click="fillExample" class="text-xs font-medium px-3 py-1.5 rounded-full bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400">{{ t('填入示例') }}</button>
                </div>

                <div class="flex p-1.5 bg-white/50 dark:bg-slate-800/50 rounded-[1.25rem] mb-6 relative">
                  <button @click="inputMode = 'text'" :class="['flex-1 py-3 text-sm font-bold rounded-xl transition', inputMode === 'text' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow' : 'text-slate-500 dark:text-slate-400']">{{ t('📝 文本段落描述') }}</button>
                  <button @click="inputMode = 'file'" :class="['flex-1 py-3 text-sm font-bold rounded-xl transition', inputMode === 'file' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow' : 'text-slate-500 dark:text-slate-400']">{{ t('📄 完整文件解析') }}</button>
                </div>

                <div v-if="inputMode === 'text'" class="flex flex-col">
                  <textarea v-model="userInput" class="glass-input min-h-[250px] resize-none"></textarea>
                </div>

                <div v-if="inputMode === 'file'" class="flex flex-col">
                  <div v-if="!selectedFile" @click="fileInputRef?.click()" @drop="onDrop" @dragover="onDragOver" @dragleave="onDragLeave" :class="['file-drop-zone flex flex-col items-center justify-center min-h-[250px]', isDragOver&&'file-drop-active']">
                    <input ref="fileInputRef" type="file" @change="onFileSelect" class="hidden" />
                    <div class="text-2xl mb-4 text-blue-500">📤</div>
                    <p class="font-bold text-slate-700 dark:text-slate-300 mb-2">{{ t('点击或拖拽上传文件') }}</p>
                  </div>
                  <div v-else class="bg-white/60 dark:bg-slate-800/60 p-6 rounded-[2rem] min-h-[250px] flex flex-col justify-center">
                    <p class="font-bold text-slate-800 dark:text-white">{{ selectedFile.name }}</p>
                    <button @click="removeFile" class="mt-4 w-8 h-8 rounded-full bg-red-50 text-red-500 flex justify-center items-center">✕</button>
                  </div>
                </div>

                <div class="mt-6 flex gap-3">
                  <button v-if="!loading" @click="processInput" class="btn-fluid flex-1 py-4 text-lg">
                    {{ t('🚀 立即执行 AI 分析') }}
                  </button>
                  <div v-else class="flex-1 flex gap-3">
                    <button disabled class="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full">{{ t('深度运算中') }}</button>
                    <button @click="cancelAnalysis" class="px-6 py-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold rounded-full">{{ t('⏹ 取消') }}</button>
                  </div>
                </div>
              </div>

              <div class="lg:col-span-7 bg-white/40 dark:bg-slate-800/40 rounded-[2.5rem] p-8 shadow-inner min-h-[450px] max-h-[600px] flex flex-col relative overflow-hidden">
                <div class="flex justify-between items-center mb-6">
                  <h3 class="text-lg font-bold text-slate-800 dark:text-white">{{ t('输出结果') }}</h3>
                  <div v-if="output && !loading" class="flex gap-2">
                    <button @click="isOutputExpanded = true" class="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-full text-sm font-bold text-blue-600 dark:text-blue-400">{{ t('⤢ 展开') }}</button>
                    <button @click="copyOutput" class="px-4 py-2 bg-white dark:bg-slate-700 rounded-full text-sm font-medium">{{ t('复制') }}</button>
                    <button @click="showPasswordModal = true" class="px-4 py-2 bg-blue-600 rounded-full text-sm font-medium text-white">{{ t('导出 PDF') }}</button>
                  </div>
                </div>
                <div v-if="output && !loading" class="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <div class="markdown-output" v-html="renderedOutput"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </main>

    <transition name="fade">
      <div v-if="isOutputExpanded" class="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-md flex justify-center items-center p-6 md:p-12">
        <div class="bg-white/95 dark:bg-slate-900/95 backdrop-blur-3xl w-full max-w-5xl h-full max-h-[85vh] rounded-[2.5rem] flex flex-col relative overflow-hidden border border-white dark:border-slate-700">
          <div class="px-8 py-5 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 sticky top-0 z-10">
            <h3 class="text-xl font-bold text-slate-800 dark:text-white">{{ t('沉浸式阅读') }}</h3>
            <button @click="isOutputExpanded = false" class="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full font-bold">{{ t('⤡ 收回') }}</button>
          </div>
          <div class="p-8 md:p-12 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/30 dark:bg-slate-900/30">
            <div class="markdown-output max-w-4xl mx-auto" v-html="renderedOutput"></div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>
