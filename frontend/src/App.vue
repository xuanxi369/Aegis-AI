<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { marked } from 'marked'
import html2pdf from 'html2pdf.js'
// 💡 已彻底移除引入：encryptPDFWithPassword
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

// ── 工作区及双轨历史逻辑 ──────────────────────────
const loading = ref(false), output = ref(''), error = ref(''), userInput = ref(''), elapsedMs = ref(0)
const selectedFile = ref(null), parsedText = ref(''), parseStatus = ref(''), ocrProgress = ref(0)
const isDragOver = ref(false), fileInputRef = ref(null), showHistory = ref(false)
const isExporting = ref(false) // 💡 仅保留这一个状态控制按钮
let currentRequestId = 0 
const startTime = ref(0)

// 独立历史记录库
const historyText = ref([])
const historyFile = ref([])

// 综合历史记录（选择页使用，按时间倒序排列）
const combinedHistoryList = computed(() => {
  return [...historyText.value, ...historyFile.value].sort((a, b) => b.id - a.id)
})

// 单一模式历史记录（工作页使用）
const historyList = computed(() => {
  return inputMode.value === 'text' ? historyText.value : historyFile.value
})

const exportDate = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`
})

// 核心修复：强制注入响应式依赖，并在前端拦截重写模块配置
const tools = computed(() => {
  const lang = currentLang.value; // 强制 Vue 收集依赖
  return Object.values(TOOLS_CONFIG).map(tool => {
    
    // 初始化自定义配置
    let customInputType = tool.inputType;
    let customExample = tool.example;

    // 针对后三个模块进行配置拦截重写
    if (tool.id === 'hr_resume') {
      customInputType = 'text'; // 强制改为 text，开启双模式
      customExample = `基本信息：张某某，男，8年工作经验\n求职意向：高级产品经理/产品总监\n\n【核心经历】\n2021.05 - 至今 | 某出海互联网公司 | 产品总监\n- 负责公司核心社交产品从0到1的搭建，带领15人产研团队。\n- 期间日活突破100万，但由于公司资金链问题，近期准备看机会。\n\n2018.03 - 2021.04 | 某一线大厂 | 高级产品经理\n- 负责电商核心交易链路重构，提升转化率约 15%。\n- 参与多次大促活动，具有极强的抗压能力。\n\n【自我评价】\n逻辑清晰，对数据高度敏感。能快速适应高压环境，执行力强，但有时对团队细节管理偏于严苛。`;
    } else if (tool.id === 'finance_audit') {
      customInputType = 'text'; // 强制改为 text，开启双模式
      customExample = `报销单号：EX-2026-0515\n申请人：李四 (大客户销售部)\n申请日期：2026-05-02\n\n【报销明细】\n1. 4月30日 差旅机票：¥1,500 (符合标准出差审批)\n2. 5月01日 客户招待费：¥5,000 (备注：均为五一假期当天开具的连号餐饮发票，且金额为整数)\n3. 5月02日 办公用品采购：¥3,800 (备注：购买电子设备，但未见财务资产库入库单，且为节假日发生)\n4. 5月03日 市内交通费：¥800 (备注：全为出租车定额发票)`;
    } else if (tool.id === 'ocr_corrector') {
      customInputType = 'file'; // 最后一个模块保持纯文件模式
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

// ── 页面路由与跳转逻辑 ──────────────────────────

function openTool(toolId) {
  selectedTool.value = toolId
  resetWorkspace()
  loadHistory(toolId)
  
  if (toolId === 'ocr_corrector') {
    inputMode.value = 'file'
    currentView.value = 'tool_file'
  } else {
    currentView.value = 'tool_select'
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function openMode(mode) {
  resetWorkspace()
  inputMode.value = mode
  currentView.value = mode === 'text' ? 'tool_text' : 'tool_file'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function goBack() {
  if (currentView.value === 'tool_select' || selectedTool.value === 'ocr_corrector') {
    currentView.value = 'dashboard'
    selectedTool.value = null
  } else {
    currentView.value = 'tool_select'
    resetWorkspace()
    loadHistory(selectedTool.value) 
  }
}

function goBackToDashboard() {
  currentView.value = 'dashboard'
  selectedTool.value = null
  isOutputExpanded.value = false 
  showHistory.value = false
  resetWorkspace()
}

function resetWorkspace() {
  output.value = ''; error.value = ''; userInput.value = ''; elapsedMs.value = 0
  showHistory.value = false; selectedFile.value = null; parsedText.value = ''; parseStatus.value = ''; ocrProgress.value = 0
  currentRequestId++ 
}

// ── 数据历史隔离与保存 ──────────────────────────

function saveToHistory(t_id, mode, i, r) {
  const k = `ag_${t_id}_${mode}`;
  try { 
    const h = JSON.parse(localStorage.getItem(k)||'[]'); 
    h.unshift({id: Date.now(), input: i, output: r, mode: mode}); 
    localStorage.setItem(k, JSON.stringify(h.slice(0,20)));
    if(mode === 'text') historyText.value = h.slice(0,20);
    else historyFile.value = h.slice(0,20);
  } catch(e){} 
}

function loadHistory(t_id) {
  try { historyText.value = JSON.parse(localStorage.getItem(`ag_${t_id}_text`)||'[]') } catch{ historyText.value = [] }
  try { historyFile.value = JSON.parse(localStorage.getItem(`ag_${t_id}_file`)||'[]') } catch{ historyFile.value = [] }
}

function loadHistoryItem(item) {
  inputMode.value = item.mode
  currentView.value = item.mode === 'text' ? 'tool_text' : 'tool_file'
  userInput.value = item.mode === 'text' ? item.input : ''
  output.value = item.output
  showHistory.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function clearCurrentHistory() { 
  localStorage.removeItem(`ag_${selectedTool.value}_${inputMode.value}`); 
  if (inputMode.value === 'text') historyText.value = [];
  else historyFile.value = [];
  showHistory.value = false; 
  showToast(t('历史记录已清空')) 
}

function clearCombinedHistory() {
  localStorage.removeItem(`ag_${selectedTool.value}_text`); 
  localStorage.removeItem(`ag_${selectedTool.value}_file`); 
  historyText.value = []; historyFile.value = [];
  showToast(t('所有历史记录已清空')) 
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
    saveToHistory(selectedTool.value, 'text', text.substring(0, 50), result)
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
    saveToHistory(selectedTool.value, 'file', `[文件] ${selectedFile.value.name}`, result)
  } catch (err) { 
    if (reqId !== currentRequestId) return
    error.value = err.message 
  } finally { 
    if (reqId === currentRequestId) loading.value = false 
  }
}

function fillExample() { if(currentTool.value?.example) userInput.value = currentTool.value.example }
function copyOutput() { navigator.clipboard.writeText(output.value).then(()=>showToast(t('复制成功'))) }

// 💡 彻底修复白屏问题的纯净导出函数
async function exportToPDF() {
  isExporting.value = true; 
  const el = document.getElementById('report-content');
  
  // 核心：强制重写元素样式，把它从 -9999px 拉回正常的文档流，
  // 使用 z-index: -9999 藏在底层保证你看不见，但浏览器能完美渲染。
  const originalStyle = el.style.cssText;
  el.style.cssText = 'position: absolute !important; top: 0 !important; left: 0 !important; z-index: -9999 !important; width: 794px !important; display: block !important; background-color: #ffffff !important;';

  // 必须等待一段时间让浏览器进行 Repaint 重绘，否则 html2canvas 依然会抓到隐藏前的状态
  await new Promise(resolve => setTimeout(resolve, 300));

  try {
    const opt = { 
      margin: 10, 
      filename: `Aegis报告_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        logging: false,
        scrollY: 0,       // 强制截取顶部防止滚动条位移
      }, 
      jsPDF: { format: 'a4', orientation: 'portrait' } 
    };
    
    // 直接走基础保存路线
    await html2pdf().set(opt).from(el).save();
    showToast(t('✅ PDF 导出成功'));
  } catch(e) { 
    console.error(e);
    showToast(t('❌ PDF 导出失败'), 'error'); 
  } finally { 
    // 导出完成后立即恢复原样，隐藏在屏幕外
    el.style.cssText = originalStyle;
    isExporting.value = false; 
  }
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
      <div v-if="toast.show" class="fixed top-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white dark:border-slate-700 shadow-xl text-sm font-medium text-slate-800 dark:text-white flex items-center gap-2">
        <span v-if="toast.type==='success'" class="text-green-500">✓</span>
        <span v-else-if="toast.type==='warn'" class="text-yellow-500">!</span>
        <span v-else class="text-red-500">✕</span>
        {{ toast.message }}
      </div>
    </transition>

    <header class="fixed top-0 w-full z-50 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border-b border-white/50 dark:border-slate-800">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3 cursor-pointer group" @click="currentView = 'landing'">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-pink-500 flex items-center justify-center text-white font-black text-lg shadow-md group-hover:scale-110 transition">A</div>
          <span class="text-xl font-black tracking-tight dark:text-white">Aegis AI</span>
        </div>
        
        <div class="flex items-center gap-4">
          <button @click="toggleTheme" class="w-9 h-9 rounded-full bg-white/60 dark:bg-slate-800 border border-white dark:border-slate-700 flex items-center justify-center shadow-sm hover:scale-110 transition text-lg">
            {{ isDark ? '🌙' : '☀️' }}
          </button>
          <select :value="currentLang" @change="changeLang" class="glass-input !py-1.5 !px-4 !w-auto !rounded-full !text-sm font-bold cursor-pointer dark:bg-slate-800 outline-none">
            <option value="zh-CN">简体中文</option>
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
            <option value="de">Deutsch</option>
          </select>
          <button v-if="currentView !== 'landing' && currentView !== 'dashboard'" @click="goBackToDashboard" class="text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors ml-2">
            {{ t('返回大厅') }}
          </button>
        </div>
      </div>
    </header>

    <main class="relative z-10 pt-24 pb-16 px-6 max-w-7xl mx-auto min-h-screen flex flex-col">
      <transition name="fade" mode="out-in">
        
        <div v-if="currentView === 'landing'" class="flex-1 flex flex-col items-center justify-center text-center py-20 min-h-[70vh]">
          <div class="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/60 dark:bg-slate-800/60 border border-white dark:border-slate-700 shadow-sm text-sm text-blue-600 dark:text-blue-400 font-bold mb-8 backdrop-blur-md">
            <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            {{ t('IIEAO · 企业效能引擎') }}
          </div>
          
          <h1 class="text-5xl md:text-[5.5rem] font-black text-slate-800 dark:text-white tracking-tight leading-tight mb-8">
            {{ t('数智赋能职场') }} <br/> 
            <span class="bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">{{ t('释放极简效能') }}</span>
          </h1>
          <h3 class="text-lg text-slate-600 dark:text-slate-300 font-medium">{{ t('✨面向传统企业文职人员的智能办公平台') }}</h3>
          <h3 class="text-lg text-slate-600 dark:text-slate-300 font-medium">{{ t('开启全自动化极简排版导出') }}</h3>
          
          <button @click="currentView = 'dashboard'" class="btn-fluid text-lg px-10 py-4 shadow-xl shadow-blue-500/30 flex items-center gap-3 group mt-4">
            {{ t('进入功能中枢') }} <span class="group-hover:translate-x-2 transition-transform">→</span>
          </button>
        </div>

        <div v-else-if="currentView === 'dashboard'" class="py-10">
          <h2 class="text-3xl font-black text-slate-800 dark:text-white mb-2">{{ t('欢迎回来，探索Aegis') }}</h2>
          <p class="text-base text-slate-500 dark:text-slate-400 mb-14">{{ t('选择一个专属配置的 Agent 开始您的工作') }}<br/>{{ t('隐私声明：本站采用无服务器架构部署，您的数据仅在本地解构分析，不存在泄漏风险') }}</p> 
          
          <div class="mb-14">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-1.5 h-6 rounded-full bg-gradient-to-b from-blue-500 to-purple-500"></div>
              <span class="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Core Modules</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div v-for="tool in tools.slice(0, 3)" :key="tool.id" @click="openTool(tool.id)" class="glass-card cursor-pointer p-8 group rounded-[2rem]">
                <div class="w-14 h-14 rounded-[1.25rem] bg-white/80 dark:bg-slate-800 shadow-sm flex items-center justify-center text-3xl mb-6 border border-white dark:border-slate-700 group-hover:scale-110 transition-transform">{{ tool.icon }}</div>
                <h3 class="text-xl font-black text-slate-800 dark:text-white mb-3">{{ tool.displayName }}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6 h-10 overflow-hidden">{{ tool.displayDesc }}</p>
                <div class="flex justify-between items-center text-sm font-bold">
                  <span class="text-blue-500 group-hover:text-pink-500 transition-colors">{{ t('开始使用') }} ↗</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div class="flex items-center gap-3 mb-6">
              <div class="w-1.5 h-6 rounded-full bg-gradient-to-b from-emerald-500 to-cyan-500"></div>
              <span class="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Extended Modules</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div v-for="tool in tools.slice(3, 6)" :key="tool.id" @click="openTool(tool.id)" class="glass-card cursor-pointer p-8 group rounded-[2rem]">
                <div class="w-14 h-14 rounded-[1.25rem] bg-white/80 dark:bg-slate-800 shadow-sm flex items-center justify-center text-3xl mb-6 border border-white dark:border-slate-700 group-hover:scale-110 transition-transform">{{ tool.icon }}</div>
                <h3 class="text-xl font-black text-slate-800 dark:text-white mb-3">{{ tool.displayName }}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6 h-10 overflow-hidden">{{ tool.displayDesc }}</p>
                <div class="flex justify-between items-center text-sm font-bold">
                  <span class="text-emerald-500 group-hover:text-cyan-500 transition-colors">{{ t('开始使用') }} ↗</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="currentView === 'tool_select'" class="py-4">
          <div class="flex items-center gap-2 mb-6 text-sm font-medium px-4 text-slate-500 dark:text-slate-400">
            <span @click="goBackToDashboard" class="cursor-pointer hover:text-blue-500 transition">{{ t('工作台') }}</span>
            <span class="mx-1">/</span>
            <span class="text-slate-800 dark:text-slate-200 font-bold">{{ currentTool.displayName }}</span>
          </div>

          <div class="glass-panel p-10 md:p-14 rounded-[2.5rem]">
            
            <div class="flex items-center gap-6 mb-12">
              <div class="w-20 h-20 bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center text-4xl">
                {{ currentTool.icon }}
              </div>
              <div>
                <h2 class="text-3xl font-black text-slate-800 dark:text-white mb-2">{{ currentTool.displayName }}</h2>
                <p class="text-sm text-slate-500">{{ currentTool.displayDesc }}</p>
              </div>
            </div>

            <div class="mb-14">
              <h3 class="text-sm font-medium text-slate-400 mb-5">{{ t('选择处理模式') }}</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div @click="openMode('text')" class="bg-white/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 p-8 rounded-3xl cursor-pointer hover:shadow-lg hover:border-blue-300 transition-all duration-300 group">
                  <div class="text-3xl mb-4 group-hover:scale-110 transition-transform origin-left">✑</div>
                  <h4 class="text-xl font-bold text-slate-800 dark:text-white mb-2">{{ t('段落描述分析') }}</h4>
                  <p class="text-xs text-slate-500">{{ t('输入或粘贴文本片段进行智能结构化解析') }}</p>
                </div>
                <div @click="openMode('file')" class="bg-white/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 p-8 rounded-3xl cursor-pointer hover:shadow-lg hover:border-blue-300 transition-all duration-300 group">
                  <div class="text-3xl mb-4 group-hover:scale-110 transition-transform origin-left">⇅</div>
                  <h4 class="text-xl font-bold text-slate-800 dark:text-white mb-2">{{ t('上传文件解析') }}</h4>
                  <p class="text-xs text-slate-500">{{ t('支持多种格式文档上传扫描提取核心数据') }}</p>
                </div>
              </div>
            </div>

            <div class="bg-white/60 dark:bg-slate-800/50 border border-white dark:border-slate-700 rounded-3xl p-8">
              <div class="flex justify-between items-center mb-6">
                <h4 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">{{ t('综合历史记录') }}</h4>
                <button v-if="combinedHistoryList.length > 0" @click="clearCombinedHistory" class="px-4 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-500 font-bold text-xs rounded-full hover:bg-red-100 transition">{{ t('清空记录') }}</button>
              </div>

              <div v-if="combinedHistoryList.length === 0" class="border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-10 text-center text-sm text-slate-400">
                {{ t('暂无历史记录') }}
              </div>
              
              <div v-else class="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                <div v-for="h in combinedHistoryList" :key="h.id" @click="loadHistoryItem(h)" class="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl cursor-pointer hover:border-blue-300 transition group shadow-sm">
                  <div class="flex items-center gap-4 overflow-hidden pr-4">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border" :class="h.mode === 'text' ? 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/30' : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-700/50'">
                      {{ h.mode === 'text' ? 'TEXT' : 'FILE' }}
                    </span>
                    <span class="text-xs text-slate-400 whitespace-nowrap">{{ formatDate(h.id) }}</span>
                    <span class="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{{ h.input }}</span>
                  </div>
                  <span class="text-slate-300 group-hover:text-blue-500 transition">→</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div v-else-if="currentView === 'tool_text' || currentView === 'tool_file'" class="py-4">
          <div class="flex items-center gap-2 mb-6 text-sm font-medium px-4 text-slate-500 dark:text-slate-400">
            <span @click="goBackToDashboard" class="cursor-pointer hover:text-blue-500 transition">{{ t('工作台') }}</span>
            <span class="mx-1">/</span>
            <span @click="goBack" class="cursor-pointer hover:text-blue-500 transition">{{ currentTool.displayName }}</span>
            <span class="mx-1">/</span>
            <span class="text-slate-800 dark:text-slate-200 font-bold">{{ inputMode === 'text' ? t('语句段落分析') : t('上传文件解析') }}</span>
          </div>

          <div class="glass-panel p-8 md:p-10 rounded-[2.5rem]">
            <div class="flex flex-col md:flex-row justify-between items-center mb-10 border-b border-slate-200 dark:border-slate-800 pb-8 gap-6">
              <div class="flex items-center gap-5">
                <div class="text-4xl p-4 bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-100 dark:border-slate-700">{{ currentTool.icon }}</div>
                <div>
                  <h2 class="text-3xl font-black text-slate-800 dark:text-white leading-tight">{{ currentTool.displayName }}</h2>
                  <p class="text-base text-slate-500 mt-2">{{ currentTool.displayDesc }}</p>
                </div>
              </div>
              <button @click="showHistory = !showHistory" class="px-6 py-2.5 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-full font-bold text-sm shadow-sm border border-blue-100 dark:border-slate-700 transition hover:bg-blue-100">
                {{ t('本页记录') }} ({{ historyList.length }})
              </button>
            </div>

            <transition name="fade">
              <div v-if="showHistory" class="mb-10 p-6 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl border border-white dark:border-slate-700 rounded-[2rem] shadow-xl">
                <div class="flex justify-between items-center mb-5">
                  <h4 class="text-lg font-black text-slate-800 dark:text-white">{{ inputMode === 'text' ? t('段落分析历史') : t('文件解析历史') }}</h4>
                  <button v-if="historyList.length > 0" @click="clearCurrentHistory" class="text-xs text-red-500 font-bold bg-red-50 dark:bg-red-900/30 px-4 py-1.5 rounded-full transition">{{ t('清空记录') }}</button>
                </div>
                <div v-if="historyList.length === 0" class="py-8 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-slate-400 text-sm">{{ t('暂无历史记录') }}</div>
                <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                  <div v-for="h in historyList" :key="h.id" @click="loadHistoryItem(h)" class="p-5 hover:bg-white dark:hover:bg-slate-700 cursor-pointer rounded-2xl border border-slate-100 dark:border-slate-600 transition-all duration-300 group">
                    <div class="text-sm text-slate-700 dark:text-slate-300 line-clamp-3 mb-3">{{ h.input }}</div>
                    <span class="text-blue-500 opacity-0 group-hover:opacity-100 transition font-bold text-xs">{{ t('载入此记录 →') }}</span>
                  </div>
                </div>
              </div>
            </transition>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <div class="lg:col-span-5 flex flex-col gap-6">
                <div class="flex justify-between items-center">
                  <h3 class="text-lg font-black text-slate-800 dark:text-white">{{ t('提供分析内容') }}</h3>
                  <button v-if="inputMode === 'text'" @click="fillExample" class="text-xs font-bold px-3 py-1.5 rounded-full bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition">{{ t('示例') }}</button>
                </div>

                <textarea v-if="inputMode==='text'" v-model="userInput" :placeholder="t(currentTool.placeholder) || t('在此输入您需要分析的具体段落或描述内容...')" class="glass-input min-h-[300px] !text-base !rounded-2xl resize-none"></textarea>
                
                <div v-else class="flex flex-col">
                  <div v-if="!selectedFile" @click="fileInputRef?.click()" @drop="onDrop" @dragover="onDragOver" @dragleave="onDragLeave" :class="['file-drop-zone min-h-[300px] flex flex-col items-center justify-center !rounded-[1.5rem] transition-all duration-500', isDragOver&&'file-drop-active']">
                    <input ref="fileInputRef" type="file" @change="onFileSelect" class="hidden" />
                    <div class="text-4xl mb-4 bg-white dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center shadow-sm">📤</div>
                    <p class="text-lg font-bold dark:text-slate-200 mb-2">{{ t('点击或拖拽上传文件') }}</p>
                    <p class="text-sm text-slate-500">{{ t(currentTool.acceptHint) || t('支持 PDF, Word, TXT 等格式文本提取') }}</p>
                  </div>
                  <div v-else class="bg-white/60 dark:bg-slate-800/60 p-8 rounded-[1.5rem] border border-white dark:border-slate-700 shadow-sm min-h-[300px] flex flex-col justify-center text-center">
                    <div class="text-4xl mb-4">📄</div>
                    <p class="text-lg font-bold text-slate-800 dark:text-white mb-2 truncate px-4">{{ selectedFile.name }}</p>
                    <p class="text-xs text-slate-500 mb-6">{{ (selectedFile.size/1024).toFixed(1) }} KB</p>
                    <button @click="removeFile" class="self-center px-6 py-1.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-500 font-bold text-sm hover:bg-red-100">✕ 移除文件</button>
                  </div>
                </div>

                <div class="flex gap-3">
                  <button v-if="!loading" @click="processInput" :disabled="inputMode === 'file' ? parseStatus!=='done' : !userInput" class="btn-fluid flex-1 py-4 text-lg font-bold">
                    {{ t('执行 Aegis 分析') }}
                  </button>
                  <div v-else class="flex-1 flex gap-3">
                    <button disabled class="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full flex justify-center items-center text-lg font-bold border border-slate-200 dark:border-slate-700">
                      <span class="loading-dots px-3"><span></span><span></span><span></span></span> {{ t('Aegis深度运算中') }}
                    </button>
                    <button @click="cancelAnalysis" class="px-8 py-4 bg-red-50 dark:bg-red-900/30 text-red-600 font-bold rounded-full hover:bg-red-100 transition shadow-sm border border-red-100 dark:border-red-900/50">
                      {{ t('取消') }}
                    </button>
                  </div>
                </div>
              </div>

              <div class="lg:col-span-7 bg-white/40 dark:bg-slate-900/50 rounded-[2rem] p-8 shadow-inner min-h-[500px] max-h-[650px] flex flex-col relative border border-white/80 dark:border-slate-800">
                <div class="flex justify-between items-center mb-6">
                  <h3 class="text-lg font-black text-slate-800 dark:text-white">{{ t('输出结果') }}</h3>
                  <div v-if="output && !loading" class="flex gap-2">
                    <button @click="isOutputExpanded = true" class="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-full text-sm font-bold text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-slate-700">{{ t('⤢ 展开') }}</button>
                    <button @click="copyOutput" class="px-4 py-2 bg-white dark:bg-slate-800 rounded-full text-sm font-bold border border-slate-100 dark:border-slate-700 shadow-sm dark:text-white">{{ t('复制') }}</button>
                    
                    <button @click="exportToPDF" :disabled="isExporting" class="px-4 py-2 bg-blue-600 rounded-full text-sm font-bold text-white shadow-md disabled:opacity-50">
                      {{ isExporting ? t('正在导出...') : t('导出 PDF') }}
                    </button>
                  </div>
                </div>

                <div v-if="!output && !loading" class="flex-1 flex flex-col items-center justify-center text-center">
                  <div class="w-20 h-20 bg-blue-50 dark:bg-slate-800/80 rounded-full flex items-center justify-center text-3xl mb-6 animate-pulse border border-blue-100 dark:border-slate-700 shadow-inner">✨</div>
                  <h4 class="text-xl font-bold mb-2 dark:text-white">{{ t('等待指令中') }}</h4>
                  <p class="text-sm text-slate-500 dark:text-slate-400 max-w-xs">{{ t('请在左侧提供内容，Aegis已准备就绪') }}</p>
                </div>
                
                <div v-else-if="loading" class="flex-1 flex flex-col items-center justify-center">
                  <div class="w-14 h-14 border-[6px] border-blue-100 dark:border-slate-800 border-t-blue-600 rounded-full animate-spin"></div>
                  <p class="mt-5 text-lg font-bold text-blue-500">{{ t('Aegis深度运算中') }}</p>
                </div>

                <div v-else class="flex-1 overflow-y-auto markdown-output custom-scrollbar pr-3 text-base" v-html="renderedOutput"></div>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </main>

    <transition name="fade">
      <div v-if="isOutputExpanded" class="fixed inset-0 z-[250] bg-slate-900/60 backdrop-blur-md flex justify-center items-center p-6 md:p-12">
        <div class="bg-white/95 dark:bg-slate-900/95 backdrop-blur-3xl w-full max-w-5xl h-full h-full rounded-[2.5rem] flex flex-col relative overflow-hidden border border-white dark:border-slate-700 shadow-2xl">
          <div class="px-8 py-6 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
            <div class="flex items-center gap-3">
              <span class="text-2xl">✨</span><h3 class="text-xl font-black text-slate-800 dark:text-white">{{ t('沉浸式阅读') }}</h3>
            </div>
            <button @click="isOutputExpanded = false" class="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-full font-bold text-sm">{{ t('⤡ 收回') }}</button>
          </div>
          <div class="p-10 overflow-y-auto custom-scrollbar flex-1">
            <div class="markdown-output max-w-4xl mx-auto text-base" v-html="renderedOutput"></div>
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
