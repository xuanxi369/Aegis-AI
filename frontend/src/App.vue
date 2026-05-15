<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
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
// currentView: 'landing' | 'dashboard' | 'tool_select' | 'tool_text' | 'tool_file'
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

// ── 工作区及双轨历史逻辑 ──────────────────────────
const loading = ref(false), output = ref(''), error = ref(''), userInput = ref(''), elapsedMs = ref(0)
const selectedFile = ref(null), parsedText = ref(''), parseStatus = ref(''), ocrProgress = ref(0)
const isDragOver = ref(false), fileInputRef = ref(null), showHistoryModal = ref(false)
const showPasswordModal = ref(false), pdfPassword = ref(''), isExporting = ref(false)
let currentRequestId = 0 
const startTime = ref(0)

// 独立历史记录库
const historyText = ref([])
const historyFile = ref([])

// 综合历史记录（时间倒序排列）
const combinedHistory = computed(() => {
  return [...historyText.value, ...historyFile.value].sort((a, b) => b.id - a.id)
})

// 当前激活的单一历史记录列表（根据当前所在页面）
const currentHistoryList = computed(() => {
  return inputMode.value === 'text' ? historyText.value : historyFile.value
})

const exportDate = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`
})

// 工具依赖注入
const tools = computed(() => {
  const lang = currentLang.value; 
  return Object.values(TOOLS_CONFIG).map(tool => {
    let customInputType = tool.inputType;
    let customExample = tool.example;

    if (tool.id === 'hr_resume') {
      customInputType = 'text'; 
      customExample = `基本信息：张某某，男，8年工作经验\n求职意向：高级产品经理/产品总监\n\n【核心经历】\n2021.05 - 至今 | 某出海互联网公司 | 产品总监\n- 负责公司核心社交产品从0到1的搭建，带领15人产研团队。\n- 期间日活突破100万，但由于公司资金链问题，近期准备看机会。\n\n2018.03 - 2021.04 | 某一线大厂 | 高级产品经理\n- 负责电商核心交易链路重构，提升转化率约 15%。\n- 参与多次大促活动，具有极强的抗压能力。\n\n【自我评价】\n逻辑清晰，对数据高度敏感。能快速适应高压环境，执行力强，但有时对团队细节管理偏于严苛。`;
    } else if (tool.id === 'finance_audit') {
      customInputType = 'text'; 
      customExample = `报销单号：EX-2026-0515\n申请人：李四 (大客户销售部)\n申请日期：2026-05-02\n\n【报销明细】\n1. 4月30日 差旅机票：¥1,500 (符合标准出差审批)\n2. 5月01日 客户招待费：¥5,000 (备注：均为五一假期当天开具的连号餐饮发票，且金额为整数)\n3. 5月02日 办公用品采购：¥3,800 (备注：购买电子设备，但未见财务资产库入库单，且为节假日发生)\n4. 5月03日 市内交通费：¥800 (备注：全为出租车定额发票)`;
    }

    return {
      ...tool,
      inputType: customInputType,
      example: customExample || tool.example,
      displayName: t(tool.name),
      displayDesc: t(tool.description)
    }
  })
})

const currentTool = computed(() => selectedTool.value ? tools.value.find(t => t.id === selectedTool.value) : null)

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

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return `${date.getMonth()+1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// ── 核心路由体系 ──────────────────────────

// 1. 进入工具 (主入口)
function openTool(toolId) {
  selectedTool.value = toolId
  resetWorkspace()
  loadHistory(toolId)
  
  if (toolId === 'ocr_corrector') {
    // 图片音频识别：跳过选择页，直达文件页
    inputMode.value = 'file'
    currentView.value = 'tool_file'
  } else {
    // 其他功能：进入选择分发页
    currentView.value = 'tool_select'
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// 2. 从选择页 -> 具体功能页
function openMode(mode) {
  resetWorkspace()
  inputMode.value = mode
  currentView.value = mode === 'text' ? 'tool_text' : 'tool_file'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// 3. 返回上一级
function goBack() {
  if (currentView.value === 'tool_select' || selectedTool.value === 'ocr_corrector') {
    currentView.value = 'dashboard'
    selectedTool.value = null
  } else {
    // 从具体功能页返回选择页
    currentView.value = 'tool_select'
    resetWorkspace()
    loadHistory(selectedTool.value) 
  }
}

function goBackToDashboard() {
  currentView.value = 'dashboard'
  selectedTool.value = null
  resetWorkspace()
}

function resetWorkspace() {
  output.value = ''; error.value = ''; userInput.value = ''; elapsedMs.value = 0
  showHistoryModal.value = false; selectedFile.value = null; parsedText.value = ''; parseStatus.value = ''; ocrProgress.value = 0
  currentRequestId++ 
}

// ── 数据加载与保存 ──────────────────────────

function loadHistory(t_id) {
  try { historyText.value = JSON.parse(localStorage.getItem(`ag_${t_id}_text`)||'[]') } catch{ historyText.value = [] }
  try { historyFile.value = JSON.parse(localStorage.getItem(`ag_${t_id}_file`)||'[]') } catch{ historyFile.value = [] }
}

function saveToHistory(t_id, mode, i, r) {
  const k = `ag_${t_id}_${mode}`;
  try { 
    const h = JSON.parse(localStorage.getItem(k)||'[]'); 
    h.unshift({id: Date.now(), input: i, output: r, mode: mode}); 
    localStorage.setItem(k, JSON.stringify(h.slice(0,20)));
    // 更新内存状态
    if(mode === 'text') historyText.value = h.slice(0,20);
    else historyFile.value = h.slice(0,20);
  } catch(e){} 
}

function loadHistoryItem(item) {
  inputMode.value = item.mode
  currentView.value = item.mode === 'text' ? 'tool_text' : 'tool_file'
  userInput.value = item.mode === 'text' ? item.input : ''
  output.value = item.output
  showHistoryModal.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function clearCurrentHistory() { 
  localStorage.removeItem(`ag_${selectedTool.value}_${inputMode.value}`); 
  if (inputMode.value === 'text') historyText.value = [];
  else historyFile.value = [];
  showHistoryModal.value = false; 
  showToast(t('历史记录已清空')) 
}

function clearCombinedHistory() {
  localStorage.removeItem(`ag_${selectedTool.value}_text`); 
  localStorage.removeItem(`ag_${selectedTool.value}_file`); 
  historyText.value = []; historyFile.value = [];
  showToast(t('所有历史记录已清空')) 
}

// ── 业务处理 ──────────────────────────

function renderFinanceJSON(json) {
  const score = json.risk_score ?? 0
  const scoreColor = score < 30 ? '#10B981' : score < 60 ? '#F59E0B' : '#EF4444'
  let html = `<div class="bg-white/60 dark:bg-slate-800/60 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">`
  html += `<div class="flex justify-between items-center mb-6 border-b border-slate-200 dark:border-slate-700 pb-4">`
  html += `<h3 class="text-lg font-bold text-slate-800 dark:text-white m-0">📄 ${json.document_type || t('财务单据')}</h3>`
  html += `<span class="px-3 py-1 rounded-md text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm">${json.audit_status}</span>`
  html += `</div>`
  
  html += `<div class="mb-6"><p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">${t('综合风险评分')}</p>`
  html += `<div class="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"><div style="width:${score}%;background:${scoreColor}" class="h-full rounded-full transition-all"></div></div>`
  html += `</div>`

  if (json.anomaly_detection?.length) {
    html += `<div class="space-y-3">`
    json.anomaly_detection.forEach(a => {
      html += `<div class="bg-white/80 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">`
      html += `<div class="font-bold text-sm text-slate-800 dark:text-white mb-1 flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full ${a.severity==='High'?'bg-red-500':'bg-yellow-500'}"></span>${a.issue}</div>`
      if(a.remediation) html += `<div class="text-xs text-slate-600 dark:text-slate-400 mt-2 bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">${a.remediation}</div>`
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
    if (!selectedFile.value || parseStatus.value !== 'done') return showToast(t('⚠️ 请先上传文件'), 'warn')
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
    saveToHistory(selectedTool.value, 'text', text.substring(0, 80) + '...', result)
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
    saveToHistory(selectedTool.value, 'file', `[文档] ${selectedFile.value.name}`, result)
  } catch (err) { 
    if (reqId !== currentRequestId) return
    error.value = err.message 
  } finally { 
    if (reqId === currentRequestId) loading.value = false 
  }
}

function fillExample() { if(currentTool.value?.example) userInput.value = currentTool.value.example }
function copyOutput() { navigator.clipboard.writeText(output.value).then(()=>showToast(t('复制成功'))) }

async function secureExportToPDF(password) {
  if (!password) return; isExporting.value = true; const el = document.getElementById('report-content')
  try {
    const opt = { margin: 0, html2canvas: { scale: 2, useCORS: true, onclone: (doc) => { const e = doc.getElementById('report-content'); e.style.position='static'; e.style.left='0'; e.style.zIndex='99999'; } }, jsPDF: { format: 'a4', orientation: 'portrait' } }
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
  <div class="min-h-screen relative font-sans transition-colors duration-500 selection:bg-blue-500/30">
    <div class="bg-scene">
      <div class="orb-container" :style="{ transform: `translate(${currentX*0.1}px, ${currentY*0.1}px)` }"><div class="orb orb-blue"></div></div>
      <div class="orb-container" :style="{ transform: `translate(${currentX*-0.08}px, ${currentY*-0.08}px)` }"><div class="orb orb-pink"></div></div>
      <div class="orb-container" :style="{ transform: `translate(${currentX*0.05}px, ${currentY*0.05}px)` }"><div class="orb orb-mint"></div></div>
    </div>

    <transition name="fade">
      <div v-if="toast.show" class="fixed top-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full bg-slate-900/90 backdrop-blur-xl border border-slate-700 shadow-xl text-sm font-bold text-white flex items-center gap-3">
        <span v-if="toast.type==='success'" class="w-2 h-2 rounded-full bg-green-400"></span>
        <span v-else-if="toast.type==='warn'" class="w-2 h-2 rounded-full bg-yellow-400"></span>
        <span v-else class="w-2 h-2 rounded-full bg-red-400"></span>
        {{ toast.message }}
      </div>
    </transition>

    <header class="fixed top-0 w-full z-50 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border-b border-white/50 dark:border-slate-800">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3 cursor-pointer group" @click="goBackToDashboard">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-base shadow-md group-hover:shadow-lg transition">A</div>
          <span class="text-lg font-black tracking-tight dark:text-white">Aegis Hub</span>
        </div>
        
        <div class="flex items-center gap-4">
          <button @click="toggleTheme" class="w-8 h-8 rounded-full bg-white/60 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm hover:bg-slate-50 transition text-sm">
            {{ isDark ? '🌙' : '☀️' }}
          </button>
          <select :value="currentLang" @change="changeLang" class="glass-input !py-1.5 !px-4 !w-auto !rounded-full !text-xs font-bold cursor-pointer dark:bg-slate-800 outline-none">
            <option value="zh-CN">简体中文</option>
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
            <option value="de">Deutsch</option>
          </select>
        </div>
      </div>
    </header>

    <main class="relative z-10 pt-24 pb-16 px-6 max-w-7xl mx-auto min-h-screen flex flex-col">
      <transition name="fade" mode="out-in">
        
        <div v-if="currentView === 'landing'" class="flex-1 flex flex-col items-center justify-center text-center py-20 min-h-[70vh]">
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 text-xs text-blue-600 dark:text-blue-400 font-bold mb-8">
            <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            {{ t('IIEAO · 企业效能引擎') }}
          </div>
          <h1 class="text-5xl md:text-[5.5rem] font-black text-slate-800 dark:text-white tracking-tight leading-tight mb-8">
            {{ t('数智赋能职场') }} <br/> 
            <span class="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">{{ t('释放极简效能') }}</span>
          </h1>
          <h3 class="text-base text-slate-500 dark:text-slate-400 font-medium max-w-2xl">{{ t('✨面向传统企业文职人员的智能办公平台') }}</h3>
          <button @click="currentView = 'dashboard'" class="mt-10 px-8 py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full font-bold text-sm shadow-xl hover:shadow-2xl transition hover:-translate-y-1">
            {{ t('进入功能中枢') }} →
          </button>
        </div>

        <div v-else-if="currentView === 'dashboard'" class="py-6">
          <h2 class="text-3xl font-black text-slate-800 dark:text-white mb-2">{{ t('欢迎回来，探索Aegis') }}</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mb-12">{{ t('选择一个专属配置的 Agent 开始您的工作') }}</p> 
          
          <div class="mb-12">
            <div class="flex items-center gap-2 mb-6">
              <span class="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Core Modules</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div v-for="tool in tools.slice(0, 3)" :key="tool.id" @click="openTool(tool.id)" class="glass-card cursor-pointer p-8 rounded-[1.5rem] border border-slate-200 dark:border-slate-700/50 hover:border-blue-500 dark:hover:border-blue-500 transition-all group">
                <div class="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-2xl mb-6 border border-slate-100 dark:border-slate-700">{{ tool.icon }}</div>
                <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-2">{{ tool.displayName }}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">{{ tool.displayDesc }}</p>
                <div class="flex justify-between items-center text-xs font-bold">
                  <span class="text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform">{{ t('开始使用') }} →</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div class="flex items-center gap-2 mb-6">
              <span class="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Extended Modules</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div v-for="tool in tools.slice(3, 6)" :key="tool.id" @click="openTool(tool.id)" class="glass-card cursor-pointer p-8 rounded-[1.5rem] border border-slate-200 dark:border-slate-700/50 hover:border-emerald-500 dark:hover:border-emerald-500 transition-all group">
                <div class="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-2xl mb-6 border border-slate-100 dark:border-slate-700">{{ tool.icon }}</div>
                <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-2">{{ tool.displayName }}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">{{ tool.displayDesc }}</p>
                <div class="flex justify-between items-center text-xs font-bold">
                  <span class="text-emerald-600 dark:text-emerald-400 group-hover:translate-x-1 transition-transform">{{ t('开始使用') }} →</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="currentView === 'tool_select'" class="py-4">
          <div class="flex items-center gap-3 mb-8 text-sm font-medium">
            <button @click="goBackToDashboard" class="text-slate-400 hover:text-blue-500 transition">{{ t('工作台') }}</button>
            <span class="text-slate-300 dark:text-slate-600">/</span>
            <span class="text-slate-800 dark:text-slate-200 font-bold">{{ currentTool.displayName }}</span>
          </div>

          <div class="glass-panel p-8 md:p-12 rounded-[2rem] border border-white/60 dark:border-slate-700">
            <div class="mb-10">
              <h2 class="text-3xl font-black text-slate-800 dark:text-white">{{ currentTool.displayName }}</h2>
              <p class="text-sm text-slate-500 mt-2">{{ currentTool.displayDesc }}</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
              <div @click="openMode('text')" class="group cursor-pointer bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 p-8 rounded-[1.5rem] transition-all">
                <div class="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-xl mb-5 text-blue-600">✍️</div>
                <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-2">{{ t('段落描述分析') }}</h3>
                <p class="text-xs text-slate-500">{{ t('直接输入或粘贴文本片段，获取精准的结构化分析与建议') }}</p>
              </div>
              <div @click="openMode('file')" class="group cursor-pointer bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 p-8 rounded-[1.5rem] transition-all">
                <div class="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-xl mb-5 text-indigo-600">📄</div>
                <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-2">{{ t('上传文件解析') }}</h3>
                <p class="text-xs text-slate-500">{{ t('支持 PDF、Word、Excel 等多种格式文件的深度扫描分析') }}</p>
              </div>
            </div>

            <div>
              <div class="flex justify-between items-center mb-6">
                <h4 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <span class="w-1.5 h-4 bg-slate-400 rounded-full"></span>
                  {{ t('综合处理历史') }}
                </h4>
                <button v-if="combinedHistory.length > 0" @click="clearCombinedHistory" class="text-xs text-red-500 font-bold hover:underline">{{ t('清空记录') }}</button>
              </div>

              <div v-if="combinedHistory.length === 0" class="py-12 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-slate-400 text-xs font-medium bg-slate-50/50 dark:bg-slate-800/30">
                {{ t('暂无操作历史') }}
              </div>
              
              <div v-else class="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                <div v-for="h in combinedHistory" :key="h.id" @click="loadHistoryItem(h)" class="flex items-center justify-between p-4 bg-white/60 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-xl hover:border-slate-300 dark:hover:border-slate-500 cursor-pointer transition group">
                  <div class="flex flex-col flex-1 min-w-0 pr-4">
                    <div class="flex items-center gap-3 mb-1.5">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border" :class="h.mode === 'text' ? 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/30 dark:border-blue-800' : 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-900/30 dark:border-indigo-800'">
                        {{ h.mode === 'text' ? 'TEXT' : 'FILE' }}
                      </span>
                      <span class="text-xs text-slate-400">{{ formatDate(h.id) }}</span>
                    </div>
                    <div class="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{{ h.input }}</div>
                  </div>
                  <span class="text-slate-300 group-hover:text-slate-600 dark:group-hover:text-white transition">→</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="currentView === 'tool_text' || currentView === 'tool_file'" class="py-4">
          <div class="flex items-center gap-3 mb-8 text-sm font-medium">
            <button @click="goBackToDashboard" class="text-slate-400 hover:text-blue-500 transition">{{ t('工作台') }}</button>
            <span class="text-slate-300 dark:text-slate-600">/</span>
            <button v-if="selectedTool !== 'ocr_corrector'" @click="goBack" class="text-slate-400 hover:text-blue-500 transition">{{ currentTool.displayName }}</button>
            <span v-else class="text-slate-400">{{ currentTool.displayName }}</span>
            <template v-if="selectedTool !== 'ocr_corrector'">
              <span class="text-slate-300 dark:text-slate-600">/</span>
              <span class="text-slate-800 dark:text-slate-200 font-bold">{{ inputMode === 'text' ? t('段落描述分析') : t('上传文件解析') }}</span>
            </template>
          </div>

          <div class="glass-panel p-8 md:p-10 rounded-[2rem] border border-white/60 dark:border-slate-700 relative">
            
            <div class="flex justify-between items-center mb-8 pb-6 border-b border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xl">{{ currentTool.icon }}</div>
                <div>
                  <h2 class="text-xl font-bold text-slate-800 dark:text-white">{{ inputMode === 'text' ? t('段落描述分析') : t('上传文件解析') }}</h2>
                  <p class="text-xs text-slate-500 mt-1">{{ selectedTool === 'ocr_corrector' ? currentTool.displayDesc : (inputMode === 'text' ? t('基于纯文本内容进行结构化推演') : t('基于文档内容进行结构化推演')) }}</p>
                </div>
              </div>
              <button @click="showHistoryModal = true" class="px-4 py-2 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md font-bold text-xs border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition">
                📂 {{ t('当前模式记录') }} ({{ currentHistoryList.length }})
              </button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              <div class="lg:col-span-5 flex flex-col gap-5">
                <div class="flex justify-between items-center">
                  <h3 class="text-sm font-bold text-slate-800 dark:text-white">{{ t('输入源') }}</h3>
                  <button v-if="inputMode === 'text'" @click="fillExample" class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">{{ t('加载示例') }}</button>
                </div>

                <textarea v-if="inputMode === 'text'" v-model="userInput" :placeholder="t(currentTool.placeholder) || t('在此输入需要分析的具体内容...')" class="glass-input min-h-[350px] !text-sm !rounded-xl resize-none font-mono"></textarea>
                
                <div v-else class="flex flex-col">
                  <div v-if="!selectedFile && !output" @click="fileInputRef?.click()" @drop="onDrop" @dragover="onDragOver" @dragleave="onDragLeave" :class="['file-drop-zone min-h-[350px] flex flex-col items-center justify-center !rounded-xl transition-all', isDragOver&&'file-drop-active']">
                    <input ref="fileInputRef" type="file" @change="onFileSelect" class="hidden" />
                    <div class="text-3xl mb-3 opacity-50">📤</div>
                    <p class="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{{ t('点击或拖拽上传文件') }}</p>
                    <p class="text-xs text-slate-500">{{ t(currentTool.acceptHint) || t('支持 PDF, Word, TXT 等格式') }}</p>
                  </div>
                  <div v-else class="bg-slate-50 dark:bg-slate-800/50 p-8 rounded-xl border border-slate-200 dark:border-slate-700 min-h-[350px] flex flex-col justify-center items-center text-center">
                    <div class="text-3xl mb-4">📄</div>
                    <p class="text-sm font-bold text-slate-800 dark:text-white mb-1 truncate w-full px-4">{{ selectedFile?.name || '历史关联文件' }}</p>
                    <p v-if="selectedFile" class="text-xs text-slate-500 mb-6">{{ (selectedFile.size/1024).toFixed(1) }} KB</p>
                    <p v-else class="text-xs text-slate-500 mb-6">历史读取无法获取文件本体</p>
                    <button @click="removeFile" class="px-5 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-red-50 hover:text-red-500 transition">移除 / 重选</button>
                  </div>
                </div>

                <div class="mt-2">
                  <button v-if="!loading" @click="processInput" :disabled="inputMode === 'file' ? (parseStatus!=='done' && !output) : !userInput" class="w-full py-3.5 bg-slate-900 dark:bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed">
                    {{ t('执行智能分析') }}
                  </button>
                  <div v-else class="flex gap-3">
                    <button disabled class="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg flex justify-center items-center text-sm font-bold border border-slate-200 dark:border-slate-700">
                      <span class="loading-dots mr-2"><span></span><span></span><span></span></span> Processing...
                    </button>
                    <button @click="cancelAnalysis" class="px-6 py-3.5 bg-red-50 dark:bg-red-900/20 text-red-600 font-bold rounded-lg hover:bg-red-100 transition border border-red-100 dark:border-red-900/50 text-sm">
                      {{ t('取消') }}
                    </button>
                  </div>
                </div>
              </div>

              <div class="lg:col-span-7 bg-white dark:bg-slate-900/60 rounded-xl p-8 border border-slate-200 dark:border-slate-800 min-h-[500px] flex flex-col relative shadow-sm">
                <div class="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <h3 class="text-sm font-bold text-slate-800 dark:text-white">{{ t('结构化输出') }}</h3>
                  <div v-if="output && !loading" class="flex gap-2">
                    <button @click="isOutputExpanded = true" class="px-3 py-1.5 rounded text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">⤢ {{ t('全屏阅读') }}</button>
                    <button @click="copyOutput" class="px-3 py-1.5 rounded text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">{{ t('复制全文') }}</button>
                    <button @click="showPasswordModal = true" class="px-3 py-1.5 rounded text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm transition">{{ t('导出报告') }}</button>
                  </div>
                </div>

                <div v-if="!output && !loading" class="flex-1 flex flex-col items-center justify-center text-center opacity-60">
                  <div class="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-2xl mb-4 border border-slate-200 dark:border-slate-700">🧊</div>
                  <h4 class="text-sm font-bold mb-1 dark:text-slate-300">{{ t('等待信号接入') }}</h4>
                  <p class="text-xs text-slate-400">{{ t('数据处理引擎空闲中') }}</p>
                </div>
                
                <div v-else-if="loading" class="flex-1 flex flex-col items-center justify-center">
                  <div class="w-10 h-10 border-4 border-slate-100 dark:border-slate-800 border-t-slate-800 dark:border-t-slate-400 rounded-full animate-spin"></div>
                  <p class="mt-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Analyzing Data...</p>
                </div>

                <div v-else class="flex-1 overflow-y-auto markdown-output custom-scrollbar pr-3 text-sm" v-html="renderedOutput"></div>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </main>

    <transition name="fade">
      <div v-if="showHistoryModal" class="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex justify-end">
        <div class="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col">
          <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
            <h3 class="font-bold text-slate-800 dark:text-white">{{ inputMode === 'text' ? '文本模式记录' : '文件模式记录' }}</h3>
            <button @click="showHistoryModal = false" class="text-slate-400 hover:text-slate-600 text-xl font-bold">×</button>
          </div>
          <div class="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar bg-slate-50 dark:bg-slate-900">
            <div v-if="currentHistoryList.length === 0" class="text-center text-sm text-slate-400 mt-10">{{ t('暂无记录') }}</div>
            <div v-for="h in currentHistoryList" :key="h.id" @click="loadHistoryItem(h)" class="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-blue-500 cursor-pointer transition group shadow-sm">
              <div class="text-xs text-slate-400 mb-2">{{ formatDate(h.id) }}</div>
              <div class="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">{{ h.input }}</div>
            </div>
          </div>
          <div v-if="currentHistoryList.length > 0" class="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <button @click="clearCurrentHistory" class="w-full py-2.5 rounded text-xs font-bold text-red-500 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 transition">清空当前记录</button>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="isOutputExpanded" class="fixed inset-0 z-[250] bg-slate-900/80 backdrop-blur-md flex justify-center items-center p-6 md:p-12">
        <div class="bg-white dark:bg-slate-900 w-full max-w-4xl h-full rounded-2xl flex flex-col relative overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700">
          <div class="px-8 py-5 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <h3 class="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">{{ t('报告阅览') }}</h3>
            <button @click="isOutputExpanded = false" class="text-slate-500 hover:text-slate-800 dark:hover:text-white text-xl transition">×</button>
          </div>
          <div class="p-10 overflow-y-auto custom-scrollbar flex-1">
            <div class="markdown-output max-w-3xl mx-auto text-base" v-html="renderedOutput"></div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showPasswordModal" class="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4">
        <div class="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md">
          <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-2">{{ t('安全导出设定') }}</h3>
          <p class="text-xs text-slate-500 mb-6">{{ t('为保护企业敏感数据，请设置查看密码') }}</p>
          <input v-model="pdfPassword" type="password" :placeholder="t('输入文档密码')" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white p-3 rounded-lg mb-6 text-sm outline-none focus:border-blue-500" autofocus />
          <div class="flex gap-3">
            <button @click="showPasswordModal = false" class="flex-1 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-sm">{{ t('取消') }}</button>
            <button @click="secureExportToPDF(pdfPassword)" :disabled="isExporting" class="flex-1 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white font-bold text-sm">
              {{ isExporting ? '处理中...' : t('确认下载') }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <div id="report-content" class="pdf-export-area">
       <div class="p-10 font-sans text-black">
         <h1 class="text-2xl font-bold border-b-2 border-black pb-4 mb-6">{{ t('Aegis 效能中枢 · 安全报告') }}</h1>
         <div v-html="renderedOutput" class="markdown-output !text-black"></div>
         <div class="mt-10 pt-4 border-t border-gray-300 text-xs text-gray-500">Powered by Aegis AI · {{ exportDate }}</div>
       </div>
    </div>
  </div>
</template>
