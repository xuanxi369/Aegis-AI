<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { marked } from 'marked'
import html2pdf from 'html2pdf.js'
import { encryptPDFWithPassword } from './utils/pdfEncrypt.js'
import { callAI, callAudioAI, autoParseFile, TOOLS_CONFIG } from './utils/api.js'
import { dictionary } from './utils/i18n.js' 

marked.setOptions({ breaks: true, gfm: true })

// ── 核心响应式语言逻辑 ────────────────────
const currentLang = ref(localStorage.getItem('aegis_lang') || 'zh-CN')

function t(text) {
  if (!text) return ''
  if (currentLang.value === 'zh-CN') return text
  return dictionary[currentLang.value]?.[text] || text
}

function changeLang(event) {
  const lang = event.target.value
  currentLang.value = lang
  localStorage.setItem('aegis_lang', lang)
}

// ── 视图与日夜切换 ─────────────────────────
const currentView = ref('landing')
const selectedTool = ref(null)
const isOutputExpanded = ref(false)
const inputMode = ref('text') 
const isDark = ref(localStorage.getItem('aegis_theme') === 'dark')

function toggleTheme() {
  isDark.value = !isDark.value
  const mode = isDark.value ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('aegis_theme', mode)
}

// ── 动态交互背景 ─────────────────────────
const targetX = ref(0), targetY = ref(0), currentX = ref(0), currentY = ref(0)
let animationFrameId = null

function handlePointerMove(e) {
  const x = e.touches ? e.touches[0].clientX : e.clientX
  const y = e.touches ? e.touches[0].clientY : e.clientY
  targetX.value = x - window.innerWidth / 2
  targetY.value = y - window.innerHeight / 2
}

function animateBackground() {
  currentX.value += (targetX.value - currentX.value) * 0.05
  currentY.value += (targetY.value - currentY.value) * 0.05
  animationFrameId = requestAnimationFrame(animateBackground)
}

// ── 工作区逻辑 ──────────────────────────
const loading = ref(false), output = ref(''), error = ref(''), userInput = ref(''), elapsedMs = ref(0)
const selectedFile = ref(null), parsedText = ref(''), parseStatus = ref(''), ocrProgress = ref(0)
const isDragOver = ref(false), fileInputRef = ref(null), showHistory = ref(false), historyList = ref([])
const showPasswordModal = ref(false), pdfPassword = ref(''), isExporting = ref(false)
let currentRequestId = 0 
const startTime = ref(0)

const exportDate = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`
})

// ✨ 核心修复：强制注入响应式依赖！
// 当 currentLang 改变时，强制重新计算每个 tool 的显示名称和描述，破解全局翻译不生效的死局！
const tools = computed(() => {
  const lang = currentLang.value; // 强制 Vue 收集依赖
  return Object.values(TOOLS_CONFIG).map(tool => ({
    ...tool,
    displayName: t(tool.name),
    displayDesc: t(tool.description)
  }))
})

const currentTool = computed(() => selectedTool.value ? TOOLS_CONFIG[selectedTool.value] : null)
const renderedOutput = computed(() => {
  if (!output.value) return ''
  if (selectedTool.value === 'finance_audit') {
    try { return renderFinanceJSON(JSON.parse(output.value)) } 
    catch { return marked.parse(output.value) }
  }
  return marked.parse(output.value)
})

const toast = ref({ show: false, message: '', type: 'success' })
let toastTimer = null
function showToast(msg, type = 'success') {
  clearTimeout(toastTimer)
  toast.value = { show: true, message: msg, type }
  toastTimer = setTimeout(() => { toast.value.show = false }, 3000)
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
  output.value = ''; error.value = ''; userInput.value = ''; elapsedMs.value = 0
  showHistory.value = false; selectedFile.value = null; parsedText.value = ''; parseStatus.value = ''; ocrProgress.value = 0
  currentRequestId++ 
}

function renderFinanceJSON(json) {
  const score = json.risk_score ?? 0
  const scoreColor = score < 30 ? '#10B981' : score < 60 ? '#F59E0B' : '#EF4444'
  let html = `<div class="bg-white/50 dark:bg-slate-800/50 rounded-3xl p-6 border border-white/60 dark:border-slate-700">`
  html += `<div class="flex justify-between items-center mb-6 border-b border-slate-200 dark:border-slate-700 pb-4">`
  html += `<h3 class="text-xl font-bold text-slate-800 dark:text-white m-0">📄 ${json.document_type || t('财务单据')}</h3>`
  html += `<span class="px-4 py-1.5 rounded-full text-sm font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm">${json.audit_status}</span>`
  html += `</div>`
  
  html += `<div class="mb-6"><p class="text-sm text-slate-500 mb-2">${t('综合风险评分')}</p>`
  html += `<div class="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"><div style="width:${score}%;background:${scoreColor}" class="h-full rounded-full transition-all"></div></div>`
  html += `</div>`

  if (json.anomaly_detection?.length) {
    html += `<div class="space-y-3">`
    json.anomaly_detection.forEach(a => {
      html += `<div class="bg-white/80 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">`
      html += `<div class="font-semibold text-slate-800 dark:text-white mb-1 flex items-center gap-2"><span class="w-2 h-2 rounded-full ${a.severity==='High'?'bg-red-500':'bg-yellow-500'}"></span>${a.issue}</div>`
      if(a.remediation) html += `<div class="text-sm text-slate-600 dark:text-slate-400 mt-2 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">${a.remediation}</div>`
      html += `</div>`
    })
    html += `</div>`
  }
  html += `</div>`
  return html
}

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

  if (file.size > limit) return showToast(t('⚠️ 文件过大'), 'warn')
  selectedFile.value = file; parsedText.value = ''; parseStatus.value = 'parsing'; output.value = ''; error.value = ''

  if (audioExts.includes(ext)) {
    parseStatus.value = 'done'; parsedText.value = '__AUDIO__'
    return showToast(t('🎵 音频就绪: ') + file.name)
  }
  if (imageExts.includes(ext)) return parseImageOCR(file)

  autoParseFile(file).then(res => {
    parsedText.value = res.text || ''; parseStatus.value = 'done'
    showToast(t('✅ 解析完成'))
  }).catch(err => {
    parseStatus.value = 'error'; error.value = err.message
    showToast(t('❌ 解析失败'), 'error')
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

function cancelAnalysis() {
  currentRequestId++ 
  loading.value = false
  showToast(t('⏹ 取消'), 'warn')
}

async function processInput() {
  if (loading.value) return
  if (inputMode.value === 'file') {
    if (!selectedFile.value || parseStatus.value !== 'done') return showToast(t('⚠️ 请先上传'), 'warn')
    return await processFileInput()
  } else {
    const text = userInput.value.trim()
    if (text.length < 10) return showToast(t('⚠️ 内容过短'), 'warn')
    await processTextInput(text)
  }
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

function goBackToDashboard() {
  currentView.value = 'dashboard'
  selectedTool.value = null
  isOutputExpanded.value = false 
  showHistory.value = false
  resetWorkspace()
}
function fillExample() { if(currentTool.value?.example) userInput.value = currentTool.value.example }
function copyOutput() { navigator.clipboard.writeText(output.value).then(()=>showToast(t('复制成功'))) }
function saveToHistory(t_id, i, r) { try { const k = `ag_${t_id}`; const h = JSON.parse(localStorage.getItem(k)||'[]'); h.unshift({id:Date.now(),input:i,output:r}); localStorage.setItem(k, JSON.stringify(h.slice(0,20))) } catch(e){} }
function loadHistory(t_id) { try { historyList.value = JSON.parse(localStorage.getItem(`ag_${t_id}`)||'[]') } catch{ historyList.value = [] } }
function loadHistoryItem(item) { userInput.value = item.input; output.value = item.output; showHistory.value = false }
function clearHistory() { localStorage.removeItem(`ag_${selectedTool.value}`); historyList.value = []; showHistory.value = false; showToast(t('历史记录已清空')) }

async function secureExportToPDF(password) {
  if (!password) return; isExporting.value = true; const el = document.getElementById('report-content')
  try {
    const opt = { margin: 0, html2canvas: { scale: 2, useCORS: true, onclone: (doc) => { const e = doc.getElementById('report-content'); e.style.position='static'; e.style.left='0'; } }, jsPDF: { format: 'a4', orientation: 'portrait' } }
    const pdfBlob = await html2pdf().set(opt).from(el).toPdf().output('blob')
    const bytes = await encryptPDFWithPassword(await pdfBlob.arrayBuffer(), password)
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'})); a.download = `Aegis报告_${Date.now()}.pdf`; a.click()
    showPasswordModal.value = false
  } catch(e) { showToast('PDF 导出失败', 'error') } finally { isExporting.value = false }
}

onMounted(() => {
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
  <div class="min-h-screen relative transition-colors duration-500 dark:bg-slate-950">
    <div class="bg-scene">
      <div class="orb-container" :style="{ transform: `translate(${currentX*0.1}px, ${currentY*0.1}px)` }"><div class="orb orb-blue"></div></div>
      <div class="orb-container" :style="{ transform: `translate(${currentX*-0.08}px, ${currentY*-0.08}px)` }"><div class="orb orb-pink"></div></div>
      <div class="orb-container" :style="{ transform: `translate(${currentX*0.05}px, ${currentY*0.05}px)` }"><div class="orb orb-mint"></div></div>
    </div>

    <transition name="fade">
      <div v-if="toast.show" class="fixed top-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white dark:border-slate-700 shadow-xl text-sm font-medium text-slate-800 dark:text-white flex items-center gap-2">
        <span v-if="toast.type==='success'" class="text-green-500">✓</span>
        <span v-else-if="toast.type==='warn'" class="text-yellow-500">!</span>
        <span v-else class="text-red-500">✕</span>
        {{ toast.message }}
      </div>
    </transition>

    <header class="fixed top-0 w-full z-50 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border-b border-white/50 dark:border-slate-800">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3 cursor-pointer" @click="currentView = 'landing'">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-pink-500 flex items-center justify-center text-white font-bold shadow-lg">A</div>
          <span class="text-xl font-bold dark:text-white">Aegis AI</span>
        </div>
        
        <div class="flex items-center gap-4">
          <button @click="toggleTheme" class="w-10 h-10 rounded-full bg-white/60 dark:bg-slate-800 border dark:border-slate-700 flex items-center justify-center shadow-sm hover:scale-105 transition">
            {{ isDark ? '🌙' : '☀️' }}
          </button>
          
          <select :value="currentLang" @change="changeLang" class="glass-input !py-1.5 !px-4 !w-auto !rounded-full !text-sm cursor-pointer dark:bg-slate-800">
            <option value="zh-CN">🇨🇳 简体中文</option>
            <option value="zh-TW">🇭🇰 繁體中文</option>
            <option value="en">🇬🇧 English</option>
            <option value="ja">🇯🇵 日本語</option>
            <option value="ko">🇰🇷 한국어</option>
            <option value="de">🇩🇪 Deutsch</option>
          </select>

          <button v-if="currentView !== 'landing'" @click="goBackToDashboard" class="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors ml-2">
            {{ t('返回大厅') }}
          </button>
        </div>
      </div>
    </header>

    <main class="relative z-10 pt-24 pb-16 px-6 max-w-7xl mx-auto">
      
      <transition name="fade" mode="out-in">
        <div v-if="currentView === 'landing'" class="flex flex-col items-center justify-center text-center py-20 min-h-[70vh]">
          <div class="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/60 dark:bg-slate-800/60 border border-white dark:border-slate-700 shadow-sm text-sm text-blue-600 dark:text-blue-400 font-medium mb-8 backdrop-blur-md">
            <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            {{ t('全新视觉 · 企业效能引擎') }}
          </div>
          
          <h1 class="text-5xl md:text-7xl font-extrabold text-slate-800 dark:text-white tracking-tight leading-tight mb-8">
            {{ t('智驭未来办公') }} <br/>
            <span class="bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">{{ t('释放极简效能') }}</span>
          </h1>
          
          <button @click="currentView = 'dashboard'" class="btn-fluid px-10 py-4 text-xl shadow-xl shadow-blue-500/20 flex items-center gap-3">
            {{ t('进入功能中枢') }} <span>→</span>
          </button>
        </div>

        <div v-else-if="currentView === 'dashboard'" class="py-10">
          <h2 class="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">{{ t('欢迎回来，探索智能模块') }}</h2>
          <p class="text-slate-500 dark:text-slate-400 mb-10">{{ t('选择一个专门配置的 AI Agent 开始您的工作') }}</p>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div v-for="tool in tools" :key="tool.id" @click="openTool(tool.id)" class="glass-card cursor-pointer p-8 group rounded-[2.5rem]">
              <div class="w-14 h-14 rounded-2xl bg-white/80 dark:bg-slate-800 shadow-sm flex items-center justify-center text-3xl mb-6 border border-white dark:border-slate-700 group-hover:scale-110 transition-transform">{{ tool.icon }}</div>
              
              <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100 mb-3">{{ tool.displayName }}</h3>
              <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6 h-10">{{ tool.displayDesc }}</p>
              
              <div class="flex justify-between items-center text-sm font-medium">
                <span class="text-blue-500 group-hover:text-pink-500 transition-colors">{{ t('开始使用') }} ↗</span>
                <span class="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-xs text-slate-500 dark:text-slate-300">{{ t('全模式支持') }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="currentView === 'tool'">
          <div class="glass-panel p-10 rounded-[3rem]">
            <div class="flex justify-between items-center mb-10 border-b border-slate-200 dark:border-slate-800 pb-8">
              <div class="flex items-center gap-4">
                <div class="text-4xl p-4 bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">{{ currentTool.icon }}</div>
                <div>
                  <h2 class="text-3xl font-black text-slate-800 dark:text-white">{{ t(currentTool.name) }}</h2>
                  <p class="text-slate-500 mt-2">{{ t(currentTool.description) }}</p>
                </div>
              </div>
              <button @click="showHistory = !showHistory" class="px-6 py-2.5 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-full font-bold shadow-sm border border-blue-100 dark:border-slate-700 transition hover:bg-blue-100 dark:hover:bg-slate-700">
                {{ t('📂 历史记录') }} ({{ historyList.length }})
              </button>
            </div>

            <transition name="fade">
              <div v-if="showHistory" class="mb-8 p-6 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl border border-white dark:border-slate-700 rounded-[2rem] shadow-lg">
                <div class="flex justify-between items-center mb-4">
                  <h4 class="font-bold text-slate-800 dark:text-white">{{ t('最近处理历史') }}</h4>
                  <button v-if="historyList.length > 0" @click="clearHistory" class="text-sm text-red-500 hover:text-red-600 font-medium bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded-full">{{ t('清空历史') }}</button>
                </div>
                <div v-if="historyList.length === 0" class="text-sm text-slate-500 py-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">{{ t('暂无历史记录') }}</div>
                <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                  <div v-for="h in historyList" :key="h.id" @click="loadHistoryItem(h)" class="p-4 hover:bg-white dark:hover:bg-slate-700 cursor-pointer rounded-2xl text-sm border border-slate-100 dark:border-slate-600 transition group flex flex-col justify-between">
                    <div class="text-slate-700 dark:text-slate-300 line-clamp-3 mb-3">{{ h.input }}</div>
                    <span class="text-blue-500 opacity-0 group-hover:opacity-100 transition text-xs font-bold">{{ t('载入此记录 →') }}</span>
                  </div>
                </div>
              </div>
            </transition>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <div class="lg:col-span-5 flex flex-col gap-6">
                <div class="flex justify-between items-center">
                  <h3 class="text-lg font-bold text-slate-800 dark:text-white">{{ t('提供分析内容') }}</h3>
                  <button v-if="inputMode === 'text'" @click="fillExample" class="text-xs font-medium px-3 py-1.5 rounded-full bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100">{{ t('填入示例') }}</button>
                </div>

                <div class="flex p-1.5 bg-white/50 dark:bg-slate-800/50 rounded-2xl border border-white/80 dark:border-slate-700 shadow-inner">
                  <button @click="inputMode='text'" :class="['flex-1 py-3 rounded-xl font-bold transition text-sm flex items-center justify-center gap-2', inputMode==='text'?'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-md border border-slate-100 dark:border-slate-600':'text-slate-500 dark:text-slate-400']">{{ t('📝 文本段落描述') }}</button>
                  <button @click="inputMode='file'" :class="['flex-1 py-3 rounded-xl font-bold transition text-sm flex items-center justify-center gap-2', inputMode==='file'?'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-md border border-slate-100 dark:border-slate-600':'text-slate-500 dark:text-slate-400']">{{ t('📄 完整文件解析') }}</button>
                </div>

                <textarea v-if="inputMode==='text'" v-model="userInput" :placeholder="t(currentTool.placeholder) || t('在此输入您需要分析的具体段落或描述内容...')" class="glass-input min-h-[250px] resize-none"></textarea>
                
                <div v-else class="flex flex-col">
                  <div v-if="!selectedFile" @click="fileInputRef?.click()" @drop="onDrop" @dragover="onDragOver" @dragleave="onDragLeave" :class="['file-drop-zone min-h-[250px] flex flex-col items-center justify-center dark:border-slate-700 transition', isDragOver&&'file-drop-active']">
                    <input ref="fileInputRef" type="file" @change="onFileSelect" class="hidden" />
                    <span class="text-4xl mb-4 bg-white dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center shadow-sm">📤</span>
                    <p class="font-bold text-slate-700 dark:text-slate-300 mb-2">{{ t('点击或拖拽上传文件') }}</p>
                    <p class="text-xs text-slate-500">{{ t(currentTool.acceptHint) || t('支持 PDF, Word, TXT 等格式文本提取') }}</p>
                  </div>
                  <div v-else class="bg-white/60 dark:bg-slate-800/60 p-6 rounded-[2rem] border border-white dark:border-slate-700 shadow-sm min-h-[250px] flex flex-col justify-center">
                    <div class="flex items-center gap-4 mb-4">
                      <div class="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-slate-900 flex items-center justify-center text-xl">📄</div>
                      <div class="flex-1 min-w-0">
                        <p class="font-bold text-slate-800 dark:text-white truncate">{{ selectedFile.name }}</p>
                        <p class="text-xs text-slate-500">{{ (selectedFile.size/1024).toFixed(1) }} KB</p>
                      </div>
                      <button @click="removeFile" class="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100 flex justify-center items-center">✕</button>
                    </div>
                    <div v-if="parseStatus === 'parsing'" class="text-sm text-blue-600 flex items-center gap-2"><span class="loading-dots"><span></span><span></span><span></span></span> 解析中...</div>
                    <div v-if="parseStatus === 'done'" class="text-sm text-green-600 font-bold bg-green-50 dark:bg-green-900/30 px-4 py-2 rounded-xl w-max">{{ t('✅ 解析完成') }}</div>
                  </div>
                </div>

                <div class="flex gap-3 mt-2">
                  <button v-if="!loading" @click="processInput" :disabled="inputMode === 'file' ? parseStatus!=='done' : !userInput" class="btn-fluid flex-1 py-4 text-lg shadow-xl shadow-blue-500/20">
                    {{ t('🚀 立即执行 AI 分析') }}
                  </button>
                  <div v-else class="flex-1 flex gap-3">
                    <button disabled class="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full flex justify-center items-center font-bold">
                      <span class="loading-dots px-3 py-1"><span></span><span></span><span></span></span> {{ t('深度运算中') }}
                    </button>
                    <button @click="cancelAnalysis" class="px-8 py-4 bg-red-50 dark:bg-red-900/30 text-red-600 font-bold rounded-full hover:bg-red-100 transition shadow-sm border border-red-100 dark:border-red-900/50">
                      {{ t('⏹ 取消') }}
                    </button>
                  </div>
                </div>
              </div>

              <div class="lg:col-span-7 bg-white/40 dark:bg-slate-900/40 rounded-[2.5rem] p-8 shadow-inner min-h-[500px] max-h-[600px] flex flex-col relative border border-white/80 dark:border-slate-800">
                <div class="flex justify-between items-center mb-6">
                  <h3 class="text-lg font-bold text-slate-800 dark:text-white">{{ t('输出结果') }}</h3>
                  <div v-if="output && !loading" class="flex gap-2">
                    <button @click="isOutputExpanded = true" class="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-full text-sm font-bold text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-slate-700">{{ t('⤢ 展开') }}</button>
                    <button @click="copyOutput" class="px-4 py-2 bg-white dark:bg-slate-800 rounded-full text-sm font-medium border border-slate-100 dark:border-slate-700 shadow-sm">{{ t('复制') }}</button>
                    <button @click="showPasswordModal = true" class="px-4 py-2 bg-blue-600 rounded-full text-sm font-medium text-white shadow-md">{{ t('导出 PDF') }}</button>
                  </div>
                </div>

                <div v-if="!output && !loading" class="flex-1 flex flex-col items-center justify-center text-center">
                  <div class="w-20 h-20 bg-blue-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-3xl mb-6 animate-pulse border border-blue-100 dark:border-slate-700 shadow-inner">✨</div>
                  <h4 class="text-xl font-bold mb-2 dark:text-white">{{ t('等待指令中') }}</h4>
                  <p class="text-slate-500 dark:text-slate-400 max-w-xs">{{ t('请在左侧提供内容，AI 助手已准备就绪') }}</p>
                </div>
                
                <div v-else-if="loading" class="flex-1 flex flex-col items-center justify-center">
                  <div class="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <p class="mt-4 font-bold text-blue-500">{{ t('深度运算中') }}</p>
                </div>

                <div v-else class="flex-1 overflow-y-auto markdown-output custom-scrollbar pr-2" v-html="renderedOutput"></div>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </main>

    <transition name="fade">
      <div v-if="isOutputExpanded" class="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-md flex justify-center items-center p-6 md:p-12">
        <div class="bg-white/95 dark:bg-slate-900/95 backdrop-blur-3xl w-full max-w-5xl h-full max-h-[85vh] rounded-[2.5rem] flex flex-col relative overflow-hidden border border-white dark:border-slate-700 shadow-2xl">
          <div class="px-8 py-5 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 sticky top-0 z-10">
            <div class="flex items-center gap-3">
              <span class="text-2xl">✨</span><h3 class="text-xl font-bold text-slate-800 dark:text-white">{{ t('沉浸式阅读') }}</h3>
            </div>
            <button @click="isOutputExpanded = false" class="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full font-bold flex items-center gap-2">{{ t('⤡ 收回') }}</button>
          </div>
          <div class="p-8 md:p-12 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/30 dark:bg-slate-900/30">
            <div class="markdown-output max-w-4xl mx-auto" v-html="renderedOutput"></div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showPasswordModal" class="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex justify-center items-center p-4">
        <div class="bg-white/90 dark:bg-slate-800/90 backdrop-blur-3xl p-8 rounded-[2rem] border border-white dark:border-slate-700 shadow-2xl w-full max-w-md text-center">
          <div class="w-16 h-16 bg-blue-50 dark:bg-slate-900 text-blue-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">🔒</div>
          <h3 class="text-xl font-bold text-slate-800 dark:text-white mb-2">{{ t('安全导出设定') }}</h3>
          <p class="text-sm text-slate-500 mb-6">为保护企业敏感数据，请设置查看密码</p>
          <input v-model="pdfPassword" type="password" placeholder="输入文档密码" class="glass-input mb-6 bg-slate-50 dark:bg-slate-900 focus:bg-white" autofocus />
          <div class="flex gap-3">
            <button @click="showPasswordModal = false" class="flex-1 py-3 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">{{ t('取消') }}</button>
            <button @click="secureExportToPDF(pdfPassword)" :disabled="isExporting" class="flex-1 py-3 rounded-full bg-blue-600 text-white font-medium shadow-lg shadow-blue-500/30">
              {{ isExporting ? t('深度运算中') : t('确认下载') }}
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
