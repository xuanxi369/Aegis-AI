<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import html2pdf from 'html2pdf.js'
import { encryptPDFWithPassword } from './utils/pdfEncrypt.js'
import { callAI, callAudioAI, autoParseFile, TOOLS_CONFIG } from './utils/api.js'

marked.setOptions({ breaks: true, gfm: true })

// ── 核心视图状态 ─────────────────────────
const currentView = ref('landing')
const selectedTool = ref(null)
const isOutputExpanded = ref(false)

// ── 动态交互背景状态 (新增物理追踪逻辑) ────────────────────
const targetX = ref(0)
const targetY = ref(0)
const currentX = ref(0)
const currentY = ref(0)
let animationFrameId = null

function handlePointerMove(e) {
  // 兼容鼠标和触摸事件
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  // 计算基于屏幕中心点的偏移量
  targetX.value = clientX - window.innerWidth / 2
  targetY.value = clientY - window.innerHeight / 2
}

function animateBackground() {
  // 引入缓动算法 (Easing)，使得跟随平滑自然而不生硬
  currentX.value += (targetX.value - currentX.value) * 0.05
  currentY.value += (targetY.value - currentY.value) * 0.05
  animationFrameId = requestAnimationFrame(animateBackground)
}

// ── 工作区与并发控制状态 ────────────────────────────────────
const loading = ref(false)
const output = ref('')
const error = ref('')
const userInput = ref('')
const startTime = ref(0)
const elapsedMs = ref(0)
let currentRequestId = 0 

// ── 文件上传状态 ──────────────────────────────────────────
const selectedFile = ref(null)
const parsedText = ref('')
const parseStatus = ref('') 
const isDragOver = ref(false)
const ocrProgress = ref(0)
const fileInputRef = ref(null)

// ── PDF 导出状态 ──────────────────────────────────────────
const showPasswordModal = ref(false)
const pdfPassword = ref('')
const isExporting = ref(false)
const exportDate = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`
})

// ── Toast ─────────────────────────────────────────────────
const toast = ref({ show: false, message: '', type: 'success' })
let toastTimer = null
function showToast(msg, type = 'success') {
  clearTimeout(toastTimer)
  toast.value = { show: true, message: msg, type }
  toastTimer = setTimeout(() => { toast.value.show = false }, 3000)
}

// ── 历史记录状态 ──────────────────────────────────────────
const showHistory = ref(false)
const historyList = ref([])

// ── 计算属性 ──────────────────────────────────────────────
const tools = computed(() => Object.values(TOOLS_CONFIG))
const currentTool = computed(() => selectedTool.value ? TOOLS_CONFIG[selectedTool.value] : null)
const isFileTool = computed(() => currentTool.value?.inputType === 'file')
const renderedOutput = computed(() => {
  if (!output.value) return ''
  if (selectedTool.value === 'finance_audit') {
    try { return renderFinanceJSON(JSON.parse(output.value)) } 
    catch { return marked.parse(output.value) }
  }
  return marked.parse(output.value)
})
const elapsed = computed(() => elapsedMs.value < 1000 ? `${elapsedMs.value}ms` : `${(elapsedMs.value / 1000).toFixed(1)}s`)

// ── 路由导航控制 ──────────────────────────────────────────
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
  currentView.value = 'tool'
  loadHistory(toolId)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── 财务 JSON 渲染 ──────────────────────────
function renderFinanceJSON(json) {
  const score = json.risk_score ?? 0
  const scoreColor = score < 30 ? '#10B981' : score < 60 ? '#F59E0B' : '#EF4444'
  let html = `<div class="bg-white/50 rounded-3xl p-6 border border-white/60">`
  html += `<div class="flex justify-between items-center mb-6 border-b border-slate-200 pb-4">`
  html += `<h3 class="text-xl font-bold text-slate-800 m-0">📄 ${json.document_type || '财务单据'}</h3>`
  html += `<span class="px-4 py-1.5 rounded-full text-sm font-bold bg-white border border-slate-200 shadow-sm">${json.audit_status}</span>`
  html += `</div>`
  
  html += `<div class="mb-6"><p class="text-sm text-slate-500 mb-2">综合风险评分</p>`
  html += `<div class="h-3 bg-slate-200 rounded-full overflow-hidden"><div style="width:${score}%;background:${scoreColor}" class="h-full rounded-full transition-all"></div></div>`
  html += `</div>`

  if (json.anomaly_detection?.length) {
    html += `<div class="space-y-3">`
    json.anomaly_detection.forEach(a => {
      html += `<div class="bg-white/80 p-4 rounded-2xl border border-slate-100 shadow-sm">`
      html += `<div class="font-semibold text-slate-800 mb-1 flex items-center gap-2"><span class="w-2 h-2 rounded-full ${a.severity==='High'?'bg-red-500':'bg-yellow-500'}"></span>${a.issue}</div>`
      if(a.remediation) html += `<div class="text-sm text-slate-600 mt-2 bg-slate-50 p-3 rounded-xl">${a.remediation}</div>`
      html += `</div>`
    })
    html += `</div>`
  }
  html += `</div>`
  return html
}

function resetWorkspace() {
  output.value = ''; error.value = ''; userInput.value = ''; elapsedMs.value = 0
  showHistory.value = false; selectedFile.value = null; parsedText.value = ''; parseStatus.value = ''; ocrProgress.value = 0
  currentRequestId++ 
}

// ── 文件处理逻辑 ──────────────────────────
function onFileSelect(e) { const f = e.target.files?.[0]; if (f) handleFile(f) }
function onDrop(e) { e.preventDefault(); isDragOver.value = false; const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }
function onDragOver(e) { e.preventDefault(); isDragOver.value = true }
function onDragLeave() { isDragOver.value = false }

function handleFile(file) {
  const MAX_DOC = 20 * 1024 * 1024, MAX_AUDIO = 10 * 1024 * 1024, MAX_IMG = 10 * 1024 * 1024
  const ext = file.name.split('.').pop().toLowerCase()
  const audioExts = ['wav', 'flac', 'ape', 'mp3', 'aac', 'wma', 'aiff', 'mp4']
  const imageExts = ['jpg', 'jpeg', 'png']
  const limit = audioExts.includes(ext) ? MAX_AUDIO : imageExts.includes(ext) ? MAX_IMG : MAX_DOC

  if (file.size > limit) return showToast(`⚠️ 文件过大，最大支持 ${Math.round(limit/1024/1024)}MB`, 'warn')
  selectedFile.value = file; parsedText.value = ''; parseStatus.value = 'parsing'; output.value = ''; error.value = ''

  if (audioExts.includes(ext)) {
    parseStatus.value = 'done'; parsedText.value = '__AUDIO__'
    return showToast(`🎵 音频就绪: ${file.name}`)
  }
  if (imageExts.includes(ext)) return parseImageOCR(file)

  autoParseFile(file).then(res => {
    parsedText.value = res.text || ''; parseStatus.value = 'done'
    showToast(`✅ 解析完成: ${file.name} (${parsedText.value.length}字)`)
  }).catch(err => {
    parseStatus.value = 'error'; error.value = err.message
    showToast(`❌ 解析失败`, 'error')
  })
}

async function parseImageOCR(file) {
  try {
    const Tesseract = await import('tesseract.js')
    const { data } = await Tesseract.recognize(file, 'chi_sim+eng', { logger: m => { if (m.status === 'recognizing text') ocrProgress.value = Math.round(m.progress * 100) } })
    parsedText.value = data.text; parseStatus.value = 'done'; ocrProgress.value = 0
  } catch (err) {
    parseStatus.value = 'error'; error.value = err.message
  }
}
function removeFile() { selectedFile.value = null; parseStatus.value = ''; if(fileInputRef.value) fileInputRef.value.value = '' }

// ── 提交与打断处理 ──────────────────────────────
function cancelAnalysis() {
  currentRequestId++ 
  loading.value = false
  showToast('已安全中断，您可以修改后重新分析', 'warn')
}

async function processInput() {
  if (loading.value) return
  if (isFileTool.value) {
    if (!selectedFile.value || parseStatus.value !== 'done') return showToast('⚠️ 请先上传并等待解析完成', 'warn')
    return await processFileInput()
  }
  const text = userInput.value.trim()
  if (text.length < 10) return showToast('⚠️ 内容过短', 'warn')
  await processTextInput(text)
}

async function processTextInput(text) {
  loading.value = true; output.value = ''; error.value = ''; startTime.value = Date.now()
  const reqId = ++currentRequestId 
  
  try {
    const result = await callAI(selectedTool.value, text)
    if (reqId !== currentRequestId) return 
    
    output.value = result; elapsedMs.value = Date.now() - startTime.value
    saveToHistory(selectedTool.value, text.substring(0, 50), result); loadHistory(selectedTool.value)
  } catch (err) { 
    if (reqId !== currentRequestId) return
    error.value = err.message 
  } finally { 
    if (reqId === currentRequestId) loading.value = false 
  }
}

async function processFileInput() {
  loading.value = true; output.value = ''; error.value = ''; startTime.value = Date.now()
  const reqId = ++currentRequestId 
  
  try {
    let result
    const ext = selectedFile.value.name.split('.').pop().toLowerCase()
    if (['wav', 'mp3', 'aac', 'mp4'].includes(ext)) {
      const { audioToBase64 } = await import('./utils/api.js')
      const b64 = await audioToBase64(selectedFile.value)
      if (reqId !== currentRequestId) return
      result = await callAudioAI(selectedTool.value, b64, selectedFile.value.type || 'audio/mpeg')
    } else {
      result = await callAI(selectedTool.value, parsedText.value)
    }
    if (reqId !== currentRequestId) return 
    
    output.value = result; elapsedMs.value = Date.now() - startTime.value
    saveToHistory(selectedTool.value, `[文件] ${selectedFile.value.name}`, result); loadHistory(selectedTool.value)
  } catch (err) { 
    if (reqId !== currentRequestId) return
    error.value = err.message 
  } finally { 
    if (reqId === currentRequestId) loading.value = false 
  }
}

// ── 历史记录方法 ──────────────────────────
function fillExample() { if(currentTool.value?.example) userInput.value = currentTool.value.example }
function clearInput() { userInput.value = ''; output.value = '' }
function saveToHistory(t, i, r) { try { const k = `ag_${t}`; const h = JSON.parse(localStorage.getItem(k)||'[]'); h.unshift({id:Date.now(),input:i,output:r}); localStorage.setItem(k, JSON.stringify(h.slice(0,20))) } catch(e){} }
function loadHistory(t) { try { historyList.value = JSON.parse(localStorage.getItem(`ag_${t}`)||'[]') } catch{ historyList.value = [] } }
function loadHistoryItem(item) { userInput.value = item.input; output.value = item.output; showHistory.value = false }
function copyOutput() { navigator.clipboard.writeText(output.value).then(()=>showToast('📋 已复制')) }
function clearHistory() {
  if (!selectedTool.value) return
  localStorage.removeItem(`ag_${selectedTool.value}`)
  historyList.value = []
  showHistory.value = false
  showToast('历史记录已清空')
}
function formatTime(timestamp) {
  const d = new Date(timestamp)
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

async function secureExportToPDF(password) {
  if (!password) return; isExporting.value = true; const el = document.getElementById('report-content')
  try {
    const opt = { margin: 0, html2canvas: { scale: 2, useCORS: true, onclone: (doc) => { const e = doc.getElementById('report-content'); e.style.position='static'; e.style.left='0'; } }, jsPDF: { format: 'a4', orientation: 'portrait' } }
    const pdfBlob = await html2pdf().set(opt).from(el).toPdf().output('blob')
    const bytes = await encryptPDFWithPassword(await pdfBlob.arrayBuffer(), password)
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'})); a.download = `Aegis报告_${Date.now()}.pdf`; a.click()
    showPasswordModal.value = false
  } catch(e) { showToast('导出失败','error') } finally { isExporting.value = false }
}

onMounted(() => {
  document.addEventListener('keydown', e => { if((e.ctrlKey||e.metaKey)&&e.key==='Enter') processInput() })
  
  // 挂载交互背景监听器
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
  <div class="min-h-screen relative font-sans">
    
    <div class="bg-scene">
      <div class="orb-container" :style="{ transform: `translate(${currentX * 0.15}px, ${currentY * 0.15}px)` }">
        <div class="orb orb-blue"></div>
      </div>
      <div class="orb-container" :style="{ transform: `translate(${currentX * -0.1}px, ${currentY * -0.1}px)` }">
        <div class="orb orb-pink"></div>
      </div>
      <div class="orb-container" :style="{ transform: `translate(${currentX * 0.05}px, ${currentY * 0.05}px)` }">
        <div class="orb orb-mint"></div>
      </div>
    </div>

    <transition name="fade">
      <div v-if="toast.show" class="fixed top-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full bg-white/80 backdrop-blur-xl border border-white shadow-xl text-sm font-medium text-slate-800 flex items-center gap-2">
        <span v-if="toast.type==='success'" class="text-green-500">✓</span>
        <span v-else-if="toast.type==='warn'" class="text-yellow-500">!</span>
        <span v-else class="text-red-500">✕</span>
        {{ toast.message }}
      </div>
    </transition>

    <header class="fixed top-0 w-full z-50 bg-white/40 backdrop-blur-md border-b border-white/50">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3 cursor-pointer" @click="currentView = 'landing'">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-pink-500 flex items-center justify-center text-white font-bold shadow-lg shadow-pink-500/20">A</div>
          <span class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-pink-600">Aegis AI</span>
        </div>
        <div class="flex items-center gap-4">
          <button v-if="currentView !== 'landing'" @click="goBackToDashboard" class="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">模块大厅</button>
        </div>
      </div>
    </header>

    <main class="relative z-10 pt-24 pb-16 px-6 max-w-7xl mx-auto min-h-screen flex flex-col">
      
      <transition name="fade" mode="out-in">
        <div v-if="currentView === 'landing'" class="flex-1 flex flex-col items-center justify-center text-center py-20">
          <div class="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/60 border border-white shadow-sm text-sm text-blue-600 font-medium mb-8 backdrop-blur-md">
            <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            全新视觉 · 企业效能引擎
          </div>
          <h1 class="text-5xl md:text-7xl font-extrabold text-slate-800 tracking-tight mb-6">
            智驭未来办公 <br/> <span class="bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">释放极简效能</span>
          </h1>
          <p class="text-lg text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            打破传统企业软件的沉闷边界。Aegis AI 融合流体玻璃美学与前沿大语言模型，为财务、法务、人事提供极致愉悦的智能处理体验。
          </p>
          <button @click="enterApp" class="btn-fluid text-lg px-8 py-4 flex items-center gap-3">
            进入功能中枢 <span>→</span>
          </button>
        </div>

        <div v-else-if="currentView === 'dashboard'" class="py-10">
          <h2 class="text-3xl font-bold text-slate-800 mb-2">欢迎回来，探索智能模块</h2>
          <p class="text-slate-500 mb-10">选择一个专门配置的 AI Agent 开始您的工作</p>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div v-for="tool in tools" :key="tool.id" @click="openTool(tool.id)" class="glass-card cursor-pointer p-8 group rounded-[2rem]">
              <div class="w-14 h-14 rounded-2xl bg-white/80 shadow-sm flex items-center justify-center text-3xl mb-6 border border-white group-hover:scale-110 transition-transform">{{ tool.icon }}</div>
              <h3 class="text-xl font-bold text-slate-800 mb-3">{{ tool.name }}</h3>
              <p class="text-sm text-slate-500 leading-relaxed mb-6 h-10">{{ tool.description }}</p>
              <div class="flex justify-between items-center text-sm font-medium">
                <span class="text-blue-500 group-hover:text-pink-500 transition-colors">开始使用 ↗</span>
                <span v-if="tool.inputType==='file'" class="px-3 py-1 bg-slate-100 rounded-full text-xs text-slate-500">支持文件</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="currentView === 'tool'" class="py-6">
          <button @click="goBackToDashboard" class="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-6 font-medium transition-colors">
            <span class="text-xl">←</span> 返回大厅
          </button>

          <div class="glass-panel p-8 md:p-10 rounded-[2rem]">
            
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-white/50 pb-8 relative">
              <div class="flex items-center gap-5">
                <div class="w-16 h-16 rounded-3xl bg-white shadow-sm flex items-center justify-center text-4xl border border-slate-100">{{ currentTool.icon }}</div>
                <div>
                  <h2 class="text-3xl font-extrabold text-slate-800 tracking-tight">{{ currentTool.name }}</h2>
                  <p class="text-slate-500 mt-2">{{ currentTool.description }}</p>
                </div>
              </div>
              
              <button @click="showHistory = !showHistory" :class="['px-5 py-2.5 rounded-full font-bold transition flex items-center gap-2 border shadow-sm', showHistory ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 hover:text-blue-600 border-slate-100']">
                📂 历史记录 ({{ historyList.length }})
              </button>
            </div>

            <transition name="fade">
              <div v-if="showHistory" class="mb-10 p-6 bg-white/60 backdrop-blur-xl border border-white rounded-[2rem] shadow-lg">
                <div class="flex justify-between items-center mb-4">
                  <h4 class="font-bold text-slate-800">最近处理历史</h4>
                  <button v-if="historyList.length > 0" @click="clearHistory" class="text-sm text-red-500 hover:text-red-600 font-medium bg-red-50 px-3 py-1.5 rounded-full transition">清空历史</button>
                </div>
                <div v-if="historyList.length === 0" class="text-sm text-slate-500 py-6 text-center border-2 border-dashed border-slate-200 rounded-2xl">暂无历史记录</div>
                <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                  <div v-for="item in historyList" :key="item.id" @click="loadHistoryItem(item)" class="p-4 bg-white/80 rounded-2xl cursor-pointer hover:shadow-md hover:border-blue-200 border border-transparent transition group flex flex-col justify-between">
                    <div class="text-sm text-slate-700 line-clamp-3 mb-3">{{ item.input }}</div>
                    <div class="text-xs text-slate-400 flex items-center justify-between">
                      <span>{{ formatTime(item.id) }}</span>
                      <span class="text-blue-500 opacity-0 group-hover:opacity-100 transition">载入此记录 →</span>
                    </div>
                  </div>
                </div>
              </div>
            </transition>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:items-start">
              
              <div class="lg:col-span-5 flex flex-col">
                <h3 class="text-lg font-bold text-slate-800 mb-4 flex justify-between items-center">
                  提供分析内容
                  <button v-if="!isFileTool" @click="fillExample" class="text-xs font-medium px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition">填入示例</button>
                </h3>

                <div v-if="!isFileTool" class="flex flex-col">
                  <textarea v-model="userInput" :placeholder="currentTool.placeholder" class="glass-input min-h-[300px] resize-none"></textarea>
                </div>

                <div v-if="isFileTool" class="flex flex-col">
                  <div v-if="!selectedFile" @click="fileInputRef?.click()" @drop="onDrop" @dragover="onDragOver" @dragleave="onDragLeave" :class="['file-drop-zone flex flex-col items-center justify-center min-h-[300px]', isDragOver&&'file-drop-active']">
                    <input ref="fileInputRef" type="file" :accept="currentTool.accept" @change="onFileSelect" class="hidden" />
                    <div class="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-2xl mb-4 text-blue-500">📤</div>
                    <p class="font-bold text-slate-700 mb-2">点击或拖拽上传文件</p>
                    <p class="text-xs text-slate-500">{{ currentTool.acceptHint }}</p>
                  </div>
                  <div v-else class="bg-white/60 p-6 rounded-[2rem] border border-white shadow-sm">
                    <div class="flex items-center gap-4 mb-4">
                      <div class="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-xl">📄</div>
                      <div class="flex-1 min-w-0">
                        <p class="font-bold text-slate-800 truncate">{{ selectedFile.name }}</p>
                        <p class="text-xs text-slate-500">{{ (selectedFile.size/1024).toFixed(1) }} KB</p>
                      </div>
                      <button @click="removeFile" class="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex justify-center items-center">✕</button>
                    </div>
                    <div v-if="parseStatus === 'parsing'" class="text-sm text-blue-600 flex items-center gap-2"><span class="loading-dots"><span></span><span></span><span></span></span> 解析中...</div>
                    <div v-if="parseStatus === 'done'" class="text-sm text-green-600 font-medium">✓ 文件就绪</div>
                  </div>
                </div>

                <div class="mt-6 flex gap-3">
                  <button v-if="!loading" @click="processInput" :disabled="isFileTool ? parseStatus!=='done' : !userInput" class="btn-fluid flex-1 py-4 text-lg shadow-xl shadow-blue-500/20 flex justify-center items-center">
                    🚀 立即执行 AI 分析
                  </button>
                  <div v-else class="flex-1 flex gap-3">
                    <button disabled class="flex-1 py-4 text-base md:text-lg bg-slate-100 text-slate-500 rounded-full cursor-not-allowed flex justify-center items-center border border-slate-200">
                      <span class="loading-dots px-3 py-1"><span></span><span></span><span></span></span> 深度运算中
                    </button>
                    <button @click="cancelAnalysis" class="px-6 md:px-8 py-4 text-base md:text-lg bg-red-50 text-red-600 font-bold rounded-full hover:bg-red-100 transition shadow-sm border border-red-100 flex items-center justify-center shrink-0">
                      ⏹ 取消
                    </button>
                  </div>
                </div>
              </div>

              <div class="lg:col-span-7 bg-white/40 rounded-[2.5rem] border border-white/80 p-8 shadow-inner min-h-[450px] max-h-[600px] flex flex-col relative overflow-hidden">
                <div class="flex justify-between items-center mb-6">
                  <h3 class="text-lg font-bold text-slate-800">输出结果</h3>
                  <div v-if="output && !loading" class="flex gap-2">
                    <button @click="isOutputExpanded = true" class="px-4 py-2 bg-blue-50 rounded-full text-sm font-bold text-blue-600 hover:bg-blue-100 transition shadow-sm border border-blue-100">⤢ 展开</button>
                    <button @click="copyOutput" class="px-4 py-2 bg-white rounded-full text-sm font-medium text-slate-600 hover:text-blue-600 shadow-sm border border-slate-100 transition">复制</button>
                    <button @click="showPasswordModal = true" class="px-4 py-2 bg-blue-600 rounded-full text-sm font-medium text-white shadow-md hover:bg-blue-700 transition">导出 PDF</button>
                  </div>
                </div>

                <div v-if="!output && !loading" class="flex-1 flex flex-col items-center justify-center text-slate-400 opacity-50">
                  <div class="text-6xl mb-4">✨</div>
                  <p>AI 生成的结果将在这里展示</p>
                </div>
                
                <div v-if="loading" class="flex-1 flex flex-col items-center justify-center">
                  <div class="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                  <p class="text-slate-500 font-medium animate-pulse">正在调用大模型神经引擎...</p>
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
        <div class="bg-white/95 backdrop-blur-3xl w-full max-w-5xl h-full max-h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col relative overflow-hidden border border-white">
          <div class="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white/50 sticky top-0 z-10">
            <div class="flex items-center gap-3">
              <span class="text-2xl">✨</span>
              <h3 class="text-xl font-bold text-slate-800">沉浸式阅读</h3>
            </div>
            <button @click="isOutputExpanded = false" class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full font-bold transition flex items-center gap-2">
              ⤡ 收回
            </button>
          </div>
          <div class="p-8 md:p-12 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/30">
            <div class="markdown-output max-w-4xl mx-auto" v-html="renderedOutput"></div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showPasswordModal" class="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex justify-center items-center p-4">
        <div class="bg-white/90 backdrop-blur-3xl p-8 rounded-[2rem] border border-white shadow-2xl w-full max-w-md text-center transform transition-all">
          <div class="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">🔒</div>
          <h3 class="text-xl font-bold text-slate-800 mb-2">安全导出设定</h3>
          <p class="text-sm text-slate-500 mb-6">为保护企业敏感数据，请设置查看密码</p>
          <input v-model="pdfPassword" type="password" placeholder="输入文档密码" class="glass-input mb-6 bg-slate-50 focus:bg-white" autofocus />
          <div class="flex gap-3">
            <button @click="showPasswordModal = false" class="flex-1 py-3 rounded-full bg-slate-100 text-slate-600 font-medium hover:bg-slate-200 transition">取消</button>
            <button @click="secureExportToPDF(pdfPassword)" :disabled="isExporting" class="flex-1 py-3 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition shadow-lg shadow-blue-500/30">
              {{ isExporting ? '加密生成中...' : '确认下载' }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <div id="report-content" class="pdf-export-area">
       <div class="p-10 font-sans text-black">
         <h1 class="text-2xl font-bold border-b-2 border-black pb-4 mb-6">Aegis AI 效能中枢 · 安全报告</h1>
         <div v-html="renderedOutput" class="markdown-output !text-black"></div>
         <div class="mt-10 pt-4 border-t border-gray-300 text-xs text-gray-500">Powered by Aegis AI · {{ exportDate }}</div>
       </div>
    </div>
  </div>
</template>

<style>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.3); border-radius: 10px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.6); }
</style>
