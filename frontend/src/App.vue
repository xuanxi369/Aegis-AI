<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import html2pdf from 'html2pdf.js'
import { encryptPDFWithPassword } from './utils/pdfEncrypt.js'
import {
  callAI, callAudioAI, autoParseFile, TOOLS_CONFIG
} from './utils/api.js'

marked.setOptions({ breaks: true, gfm: true })

// ── 核心状态 ──────────────────────────────────────────────
const selectedTool = ref(null)
const loading = ref(false)
const output = ref('')
const error = ref('')
const userInput = ref('')
const startTime = ref(0)
const elapsedMs = ref(0)

// ── 文件上传状态 ──────────────────────────────────────────
const selectedFile = ref(null)
const parsedText = ref('')
const parseStatus = ref('') // '' | 'parsing' | 'done' | 'error'
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

// ── 历史记录 ──────────────────────────────────────────────
const showHistory = ref(false)
const historyList = ref([])

// ── 计算属性 ──────────────────────────────────────────────
const tools = computed(() => Object.values(TOOLS_CONFIG))
const currentTool = computed(() => selectedTool.value ? TOOLS_CONFIG[selectedTool.value] : null)
const isFileTool = computed(() => currentTool.value?.inputType === 'file')
const renderedOutput = computed(() => {
  if (!output.value) return ''
  // 财务模块 JSON 特殊渲染
  if (selectedTool.value === 'finance_audit') {
    try {
      const json = JSON.parse(output.value)
      return renderFinanceJSON(json)
    } catch {
      return marked.parse(output.value)
    }
  }
  return marked.parse(output.value)
})
const elapsed = computed(() => {
  if (elapsedMs.value < 1000) return `${elapsedMs.value}ms`
  return `${(elapsedMs.value / 1000).toFixed(1)}s`
})

// ── 财务模块 JSON 渲染 ────────────────────────────────────
function renderFinanceJSON(json) {
  const statusColors = { PASS: 'green', WARNING: 'yellow', CRITICAL: 'red' }
  const statusLabels = { PASS: '✅ 通过', WARNING: '⚠️ 警告', CRITICAL: '🚨 严重' }
  const sevColors = { High: 'red', Medium: 'yellow', Low: 'green' }

  let html = `<div class="finance-report">`
  html += `<div class="fr-header">`
  html += `<h3>📄 ${json.document_type || '未识别'}</h3>`
  const sc = statusColors[json.audit_status] || 'gray'
  html += `<span class="fr-badge fr-badge-${sc}">${statusLabels[json.audit_status] || json.audit_status}</span>`
  html += `</div>`

  // Risk Score
  const score = json.risk_score ?? 0
  const scoreColor = score < 30 ? '#10B981' : score < 60 ? '#F59E0B' : '#EF4444'
  html += `<div class="fr-score-section">`
  html += `<div class="fr-score-bar"><div class="fr-score-fill" style="width:${score}%;background:${scoreColor}"></div></div>`
  html += `<span class="fr-score-text" style="color:${scoreColor}">${score}/100</span>`
  html += `</div>`

  // Key Data
  if (json.extracted_key_data) {
    const kd = json.extracted_key_data
    html += `<div class="fr-section"><h4>📊 核心数据</h4><div class="fr-kv-grid">`
    if (kd.total_amount) html += `<div class="fr-kv"><span>金额</span><strong>${kd.total_amount}</strong></div>`
    if (kd.date) html += `<div class="fr-kv"><span>日期</span><strong>${kd.date}</strong></div>`
    if (kd.subject) html += `<div class="fr-kv"><span>摘要</span><strong>${kd.subject}</strong></div>`
    html += `</div></div>`
  }

  // Anomalies
  if (json.anomaly_detection && json.anomaly_detection.length > 0) {
    html += `<div class="fr-section"><h4>🔍 异常检测 (${json.anomaly_detection.length} 项)</h4>`
    json.anomaly_detection.forEach((a, i) => {
      const sc2 = sevColors[a.severity] || 'gray'
      html += `<div class="fr-anomaly">`
      html += `<div class="fr-anomaly-head"><span class="fr-sev fr-sev-${sc2}">${a.severity}</span><span>${a.issue}</span></div>`
      if (a.tax_policy_reference) html += `<p class="fr-anomaly-ref">📌 ${a.tax_policy_reference}</p>`
      if (a.remediation) html += `<p class="fr-anomaly-fix">🔧 ${a.remediation}</p>`
      html += `</div>`
    })
    html += `</div>`
  }

  // Advice
  if (json.financial_advice) {
    html += `<div class="fr-section fr-advice">💬 ${json.financial_advice}</div>`
  }

  html += `</div>`
  return html
}

// ── 选择工具 ──────────────────────────────────────────────
function selectTool(toolId) {
  if (selectedTool.value === toolId) {
    selectedTool.value = null
    resetWorkspace()
  } else {
    selectedTool.value = toolId
    resetWorkspace()
    setTimeout(() => {
      document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
    loadHistory(toolId)
  }
}

function resetWorkspace() {
  output.value = ''
  error.value = ''
  userInput.value = ''
  elapsedMs.value = 0
  showHistory.value = false
  selectedFile.value = null
  parsedText.value = ''
  parseStatus.value = ''
  ocrProgress.value = 0
}

// ── 文件处理 ──────────────────────────────────────────────
function onFileSelect(e) {
  const file = e.target.files?.[0]
  if (file) handleFile(file)
}

function onDrop(e) {
  e.preventDefault()
  isDragOver.value = false
  const file = e.dataTransfer.files?.[0]
  if (file) handleFile(file)
}

function onDragOver(e) { e.preventDefault(); isDragOver.value = true }
function onDragLeave() { isDragOver.value = false }

function handleFile(file) {
  // 文件大小校验
  const MAX_DOC = 20 * 1024 * 1024   // 文档 20MB
  const MAX_AUDIO = 10 * 1024 * 1024  // 音频 10MB
  const MAX_IMG = 10 * 1024 * 1024    // 图片 10MB
  const ext = file.name.split('.').pop().toLowerCase()
  const audioExts = ['wav', 'flac', 'ape', 'mp3', 'aac', 'wma', 'aiff', 'mp4']
  const imageExts = ['jpg', 'jpeg', 'png']
  const limit = audioExts.includes(ext) ? MAX_AUDIO : imageExts.includes(ext) ? MAX_IMG : MAX_DOC

  if (file.size > limit) {
    const limitMB = Math.round(limit / 1024 / 1024)
    showToast(`⚠️ 文件过大，最大支持 ${limitMB}MB`, 'warn')
    return
  }

  selectedFile.value = file
  parsedText.value = ''
  parseStatus.value = 'parsing'
  output.value = ''
  error.value = ''

  // 音频文件不需要前端解析，直接标记为 ready
  if (audioExts.includes(ext)) {
    parseStatus.value = 'done'
    parsedText.value = '__AUDIO__'
    showToast(`🎵 已选择音频: ${file.name} (${(file.size/1024/1024).toFixed(1)}MB)`)
    return
  }

  // 图片文件 — 使用 Tesseract.js OCR
  if (imageExts.includes(ext)) {
    parseImageOCR(file)
    return
  }

  // 其他文件 — 自动解析
  autoParseFile(file).then(result => {
    parsedText.value = result.text || ''
    parseStatus.value = 'done'
    const preview = parsedText.value.substring(0, 100).replace(/\n/g, ' ')
    showToast(`✅ 文件解析完成: ${file.name} (${parsedText.value.length}字)`)
  }).catch(err => {
    parseStatus.value = 'error'
    error.value = `文件解析失败: ${err.message}`
    showToast(`❌ ${error.value}`, 'error')
  })
}

async function parseImageOCR(file) {
  try {
    const Tesseract = await import('tesseract.js')
    const { data } = await Tesseract.recognize(file, 'chi_sim+eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          ocrProgress.value = Math.round(m.progress * 100)
        }
      }
    })
    parsedText.value = data.text
    parseStatus.value = 'done'
    ocrProgress.value = 0
    showToast(`✅ OCR 识别完成: ${file.name}`)
  } catch (err) {
    parseStatus.value = 'error'
    error.value = `OCR 识别失败: ${err.message}`
    showToast(`❌ ${error.value}`, 'error')
  }
}

function removeFile() {
  selectedFile.value = null
  parsedText.value = ''
  parseStatus.value = ''
  ocrProgress.value = 0
  if (fileInputRef.value) fileInputRef.value.value = ''
}

// ── 填入示例 ──────────────────────────────────────────────
function fillExample() {
  if (currentTool.value?.example) {
    userInput.value = currentTool.value.example
    showToast('✅ 已填入示例内容')
  }
}

function clearInput() {
  userInput.value = ''
  output.value = ''
  error.value = ''
  elapsedMs.value = 0
}

// ── 处理提交 ──────────────────────────────────────────────
async function processInput() {
  if (loading.value) return

  // 文件工具
  if (isFileTool.value) {
    if (!selectedFile.value || parseStatus.value !== 'done') {
      showToast('⚠️ 请先上传并等待文件解析完成', 'warn')
      return
    }
    await processFileInput()
    return
  }

  // 文本工具
  const text = userInput.value.trim()
  if (!text) return
  if (text.length < 10) {
    showToast('⚠️ 输入内容过短，建议至少 10 个字符', 'warn')
    return
  }
  await processTextInput(text)
}

async function processTextInput(text) {
  loading.value = true
  output.value = ''
  error.value = ''
  startTime.value = Date.now()

  try {
    const result = await callAI(selectedTool.value, text)
    output.value = result
    elapsedMs.value = Date.now() - startTime.value
    saveToHistory(selectedTool.value, text.substring(0, 300), result)
    loadHistory(selectedTool.value)
    showToast(`✅ 处理完成，耗时 ${elapsed.value}`)
  } catch (err) {
    error.value = err.message || '处理失败，请稍后重试'
    showToast(`❌ ${error.value}`, 'error')
  } finally {
    loading.value = false
  }
}

async function processFileInput() {
  loading.value = true
  output.value = ''
  error.value = ''
  startTime.value = Date.now()

  try {
    let result
    const ext = selectedFile.value.name.split('.').pop().toLowerCase()
    const audioExts = ['wav', 'flac', 'ape', 'mp3', 'aac', 'wma', 'aiff', 'mp4']

    if (audioExts.includes(ext)) {
      // 音频 → 读取 base64 后发送到 Worker (Whisper ASR + Agent 纠错)
      const { audioToBase64 } = await import('./utils/api.js')
      const b64 = await audioToBase64(selectedFile.value)
      result = await callAudioAI(selectedTool.value, b64, selectedFile.value.type || 'audio/mpeg')
    } else {
      // 文本文件 → 直接发送解析后的文本
      result = await callAI(selectedTool.value, parsedText.value)
    }

    output.value = result
    elapsedMs.value = Date.now() - startTime.value
    saveToHistory(selectedTool.value, `[文件] ${selectedFile.value.name}`, result)
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
    history.unshift({ id: Date.now(), input: input.substring(0, 300), output: result, timestamp: new Date().toISOString() })
    localStorage.setItem(key, JSON.stringify(history.slice(0, 30)))
  } catch (e) { /* 静默 */ }
}

function loadHistory(toolType) {
  try { historyList.value = JSON.parse(localStorage.getItem(`aegis_history_${toolType}`) || '[]') }
  catch { historyList.value = [] }
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
  localStorage.removeItem(`aegis_history_${selectedTool.value}`)
  historyList.value = []
  showHistory.value = false
  showToast('🗑️ 历史记录已清空')
}

function formatTime(iso) {
  const d = new Date(iso)
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
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

// ── PDF 安全导出 ──────────────────────────────────────────
function openExportModal() {
  pdfPassword.value = ''
  showPasswordModal.value = true
}

// async function secureExportToPDF(password) {
//   if (!password || password.length < 1) return
//   isExporting.value = true

//   const element = document.getElementById('report-content')
//   if (!element) return showToast('导出区域未找到', 'error')
  
//   try {
//     showToast('📄 正在渲染 PDF...')

//     // 第一步：视觉渲染 — html2pdf 将 HTML 区域生成 PDF Blob
//     //const element = document.getElementById('report-content')
//     //if (!element) throw new Error('导出区域未找到，请确认内容仍在屏幕上可见')
    
//     // 🌟 1. 渲染前：强制拉回到正常坐标，并藏在底层
//     element.style.left = '0px'
//     element.style.zIndex = '-9999'
     
//     const opt = {
//       margin: 0,
//       filename: 'report.pdf',
//       image: { type: 'jpeg', quality: 0.98 },
//       html2canvas: { 
//         scale: 2, 
//         useCORS: true, 
//         backgroundColor: '#ffffff',
//       },
//       jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
//     }

//    // 👇👇👇 临时加这一行：直接下载原始 PDF，停止后续加密 👇👇👇
//     await html2pdf().set(opt).from(element).save('test-raw.pdf');
//     return; // 终止函数，先不走加密逻辑
//     // 👆👆👆 临时加这一行：直接下载原始 PDF，停止后续加密 👆👆👆

    
//     // 【关键修复】使用 .toPdf().output('blob') 保证异步渲染队列 2026-05-14
//     // const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob')  
//     const pdfBlob = await html2pdf().set(opt).from(element).toPdf().output('blob')
//     // 第二步：PDF 加密 — RC4 加密算法保护文档
//     showToast('🔐 正在进行 RC4 加密...')
//     const pdfBytes = await pdfBlob.arrayBuffer()
//     const encryptedBytes = await encryptPDFWithPassword(pdfBytes, password)

//     // 第三步：触发浏览器下载
//     const encryptedBlob = new Blob([encryptedBytes], { type: 'application/pdf' })
//     const url = URL.createObjectURL(encryptedBlob)
//     const a = document.createElement('a')
//     a.href = url
//     a.download = `报告单_${Date.now()}.pdf`
//     document.body.appendChild(a)
//     a.click()
//     document.body.removeChild(a)
//     URL.revokeObjectURL(url)

//     showToast('✅ PDF 已安全导出（密码保护 + 权限锁定）')
//     showPasswordModal.value = false
//     pdfPassword.value = ''
//   } catch (err) {
//     console.error('PDF export error:', err)
//     showToast(`❌ 导出失败: ${err.message}`, 'error')
//   } finally {
//     // 🌟 3. 渲染完成后：重新把它踢出屏幕外
//     element.style.left = '-9999px'
//     isExporting.value = false
//   }
// }




  //////////////////////////////////////////////////////////////
//   async function secureExportToPDF(password) {
//   if (!password || password.length < 1) return
//   isExporting.value = true

//   const element = document.getElementById('report-content')
//   if (!element) return showToast('导出区域未找到', 'error')
  
//   try {
//     showToast('📄 正在渲染并加密 PDF...')

//     // 把元素拉回可见区域底层
//     element.style.left = '0px'
//     element.style.zIndex = '-9999'

//     // 🌟 核心魔法在这里：直接启用 jsPDF 原生加密！
//     const opt = {
//       margin: 0,
//       filename: `企业级安全报告_${Date.now()}.pdf`,
//       image: { type: 'jpeg', quality: 0.98 },
//       html2canvas: { 
//         scale: 2, 
//         useCORS: true, 
//         backgroundColor: '#ffffff'
//       },
//       jsPDF: { 
//         unit: 'mm', 
//         format: 'a4', 
//         orientation: 'portrait',
//         // 直接告诉底层 jsPDF 进行加密，彻底抛弃那个会毁坏文件的脚本
//         encryption: {
//           userPassword: password,            // 用户打开需要输入的密码
//           ownerPassword: 'MASTER_KEY_BY_AEGIS', // 管理员密码
//           userPermissions: ['print', 'copy'] // 可选：控制打印和复制权限
//         }
//       },
//     }

//     // 这一步会直接输出【已经加密好、且内容完好】的 Blob！
//     const encryptedBlob = await html2pdf().set(opt).from(element).outputPdf('blob')

//     // 触发下载
//     const url = URL.createObjectURL(encryptedBlob)
//     const a = document.createElement('a')
//     a.href = url
//     a.download = opt.filename
//     document.body.appendChild(a)
//     a.click()
//     document.body.removeChild(a)
//     URL.revokeObjectURL(url)

//     showToast('✅ PDF 已安全导出（密码保护生效）')
//     showPasswordModal.value = false
//     pdfPassword.value = ''
//   } catch (err) {
//     console.error('PDF export error:', err)
//     showToast(`❌ 导出失败: ${err.message}`, 'error')
//   } finally {
//     // 踢回屏幕外
//     element.style.left = '-9999px'
//     isExporting.value = false
//   }
// }

async function secureExportToPDF(password) {
  if (!password || password.length < 1) return
  isExporting.value = true

  const element = document.getElementById('report-content')
  if (!element) {
    isExporting.value = false
    return showToast('导出区域未找到', 'error')
  }
  
  try {
    showToast('📄 正在准备报告内容...')

    // 1. 把隐藏的导出区域拉回页面底层，方便截图
    element.style.left = '0px'
    element.style.zIndex = '-9999'

    // 2. 强制等待 100 毫秒，让浏览器把上面加的“深色文字” CSS 渲染出来！
    await new Promise(resolve => setTimeout(resolve, 100))

    const opt = {
      margin: 0,
      filename: `Report_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }

    // 3. 生成包含实际内容的 PDF Blob
    const pdfBlob = await html2pdf().set(opt).from(element).toPdf().output('blob')

    // 4. 开始加密（这里就不会再报 is not defined 了）
    showToast('🔐 正在执行安全加密...')
    const pdfBytes = await pdfBlob.arrayBuffer()
    const encryptedBytes = await encryptPDFWithPassword(pdfBytes, password)

    // 5. 触发下载
    const encryptedBlob = new Blob([encryptedBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(encryptedBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `安全报告单_${Date.now()}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    showToast('✅ 加密报告已下载')
    showPasswordModal.value = false
    pdfPassword.value = ''
  } catch (err) {
    console.error('PDF export error:', err)
    showToast(`❌ 导出失败: ${err.message}`, 'error')
  } finally {
    // 渲染完再踢出屏幕外
    element.style.left = '-9999px'
    isExporting.value = false
  }
}

  

  

// ── 键盘快捷键 ────────────────────────────────────────────
function handleKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    if (selectedTool.value && !loading.value) processInput()
  }
  if (e.key === 'Escape') {
    if (showPasswordModal.value) { showPasswordModal.value = false; return }
    if (selectedTool.value) { selectedTool.value = null; resetWorkspace() }
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

const currentYear = new Date().getFullYear()

// 工具分组
const originalTools = computed(() => tools.value.filter(t => !t.category))
const moduleTools = computed(() => tools.value.filter(t => t.category))
const moduleCategories = computed(() => {
  const cats = {}
  moduleTools.value.forEach(t => { (cats[t.category] = cats[t.category] || []).push(t) })
  return cats
})
</script>

<template>
  <div class="min-h-screen relative">
    <!-- ═══ Toast ═══ -->
    <transition name="toast">
      <div v-if="toast.show" :class="[
        'fixed bottom-6 right-6 z-[100] px-5 py-3 rounded-xl text-sm font-medium shadow-2xl backdrop-blur-xl border',
        toast.type === 'error' && 'bg-red-500/15 border-red-500/30 text-red-300',
        toast.type === 'warn' && 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300',
        toast.type === 'success' && 'bg-green-500/15 border-green-500/30 text-green-300',
      ]">{{ toast.message }}</div>
    </transition>

    <!-- ═══ PDF 密码保护弹窗 ═══ -->
    <transition name="modal">
      <div v-if="showPasswordModal" class="modal-backdrop" @click.self="showPasswordModal = false">
        <div class="modal-card glass-strong">
          <div class="modal-icon">🔒</div>
          <h3 class="text-lg font-bold text-white mb-2">安全导出 PDF</h3>
          <p class="text-sm text-slate-400 mb-5 leading-relaxed">为保护企业数据安全，请设置文档开启密码<br/><span class="text-slate-600 text-xs">（建议 6 位以上数字或字母）</span></p>
          <input
            v-model="pdfPassword"
            type="password"
            placeholder="请输入文档密码"
            class="glass-input mb-4"
            autofocus
            @keyup.enter="pdfPassword.length >= 1 && secureExportToPDF(pdfPassword)"
          />
          <div class="modal-actions">
            <button @click="showPasswordModal = false" class="modal-btn-cancel">取消</button>
            <button
              @click="secureExportToPDF(pdfPassword)"
              :disabled="!pdfPassword || isExporting"
              class="btn-gradient text-sm"
            >
              <span v-if="!isExporting">📥 确认下载</span>
              <span v-else class="flex items-center gap-2">
                <span class="loading-dots"><span></span><span></span><span></span></span>
                正在进行 128-bit AES 加密...
              </span>
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ═══ 背景 ═══ -->
    <div class="bg-scene"><div class="orb orb-blue"></div><div class="orb orb-pink"></div><div class="orb orb-green"></div></div>

    <!-- ═══ 导航 ═══ -->
    <header class="glass-header fixed top-0 left-0 right-0 z-50">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-500/20">A</div>
          <span class="text-lg font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Aegis AI</span>
        </div>
        <nav class="hidden md:flex items-center gap-6 text-sm text-slate-400">
          <a href="#tools" class="hover:text-white transition-colors">功能模块</a>
          <a href="#about" class="hover:text-white transition-colors">安全说明</a>
          <span class="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-500">🔒 数据仅存本地</span>
        </nav>
      </div>
    </header>

    <!-- ═══ 主内容 ═══ -->
    <main class="relative pt-24 pb-16 px-6">
      <div class="max-w-7xl mx-auto">

        <!-- Hero -->
        <section class="text-center mb-16 animate-fade-in">
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-slate-400 mb-6">
            <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            Powered by DeepSeek / Gemini · Built on Cloudflare
          </div>
          <h1 class="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
            <span class="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">企业级 AI 效能中枢</span>
          </h1>
          <p class="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            面向传统企业人事、财务、行政的智能办公平台<br class="hidden md:block" />
            <span class="text-slate-500">AI 深度分析 · 风险预警 · 排查纠错 · 增效降时</span>
          </p>
        </section>

        <!-- ═══ 工具卡片 ═══ -->
        <section id="tools" class="mb-12">
          <!-- 原有三大模块 -->
          <div class="mb-3 flex items-center gap-2 text-xs text-slate-500">
            <span class="w-8 h-px bg-white/10"></span>
            <span>办公效能</span>
            <span class="flex-1 h-px bg-white/10"></span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <div v-for="tool in originalTools" :key="tool.id" @click="selectTool(tool.id)"
              :class="['tool-card', `card-${tool.color}`, { active: selectedTool === tool.id }]">
              <div class="relative z-10">
                <div class="text-4xl mb-4">{{ tool.icon }}</div>
                <h3 class="text-lg font-bold text-white mb-2">{{ tool.name }}</h3>
                <p class="text-sm text-slate-400 leading-relaxed">{{ tool.description }}</p>
                <div class="mt-4 text-xs">
                  <span :class="['px-2.5 py-1 rounded-md font-medium transition-all',
                    tool.color === 'blue' && (selectedTool === tool.id ? 'bg-blue-500/25 text-blue-300' : 'bg-blue-500/10 text-blue-400'),
                    tool.color === 'pink' && (selectedTool === tool.id ? 'bg-pink-500/25 text-pink-300' : 'bg-pink-500/10 text-pink-400'),
                    tool.color === 'green' && (selectedTool === tool.id ? 'bg-green-500/25 text-green-300' : 'bg-green-500/10 text-green-400'),
                  ]">{{ selectedTool === tool.id ? '✓ 使用中' : '点击使用' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 新增三大模块 -->
          <div class="mb-3 flex items-center gap-2 text-xs text-slate-500">
            <span class="w-8 h-px bg-white/10"></span>
            <span>智能 Agent 模块</span>
            <span class="flex-1 h-px bg-white/10"></span>
            <span class="px-2 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px] font-medium">NEW</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div v-for="tool in moduleTools" :key="tool.id" @click="selectTool(tool.id)"
              :class="['tool-card', `card-${tool.color}`, { active: selectedTool === tool.id }]">
              <div class="relative z-10">
                <div class="flex items-center gap-2 mb-4">
                  <span class="text-4xl">{{ tool.icon }}</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-slate-300">{{ tool.category }}</span>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">{{ tool.name }}</h3>
                <p class="text-sm text-slate-400 leading-relaxed">{{ tool.description }}</p>
                <div class="mt-4 flex items-center gap-2 text-xs">
                  <span :class="['px-2.5 py-1 rounded-md font-medium transition-all',
                    tool.color === 'violet' && (selectedTool === tool.id ? 'bg-violet-500/25 text-violet-300' : 'bg-violet-500/10 text-violet-400'),
                    tool.color === 'amber' && (selectedTool === tool.id ? 'bg-amber-500/25 text-amber-300' : 'bg-amber-500/10 text-amber-400'),
                    tool.color === 'cyan' && (selectedTool === tool.id ? 'bg-cyan-500/25 text-cyan-300' : 'bg-cyan-500/10 text-cyan-400'),
                  ]">{{ selectedTool === tool.id ? '✓ 使用中' : '点击使用' }}</span>
                  <span class="text-slate-600">📁 上传文件</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ═══ 工作区 ═══ -->
        <transition name="slide">
          <section v-if="selectedTool" id="workspace" class="glass-strong p-6 md:p-8 mb-12">
            <!-- 头部 -->
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-3">
                <span class="text-2xl">{{ currentTool.icon }}</span>
                <div>
                  <h2 class="text-xl font-bold text-white">{{ currentTool.name }}</h2>
                  <p class="text-xs text-slate-500">{{ currentTool.description }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button @click="showHistory = !showHistory"
                  :class="['px-3 py-2 rounded-lg text-xs font-medium transition-all border',
                    showHistory ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10']">
                  📂 历史 ({{ historyList.length }})
                </button>
                <button @click="selectTool(selectedTool)"
                  class="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all" title="关闭 (Esc)">✕</button>
              </div>
            </div>

            <!-- 历史面板 -->
            <transition name="fade">
              <div v-if="showHistory" class="mb-5 glass p-4">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-semibold text-slate-300">处理历史</h3>
                  <button v-if="historyList.length > 0" @click="clearHistory" class="text-xs text-red-400 hover:text-red-300">🗑️ 清空</button>
                </div>
                <div v-if="historyList.length === 0" class="text-xs text-slate-600 text-center py-4">暂无历史记录</div>
                <div v-else class="space-y-2 max-h-48 overflow-y-auto">
                  <div v-for="item in historyList.slice(0, 10)" :key="item.id" @click="loadHistoryItem(item)"
                    class="flex items-start gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-all group">
                    <span class="text-xs text-slate-600 whitespace-nowrap mt-0.5">{{ formatTime(item.timestamp) }}</span>
                    <p class="text-xs text-slate-400 line-clamp-2 flex-1 group-hover:text-slate-300">{{ item.input }}</p>
                  </div>
                </div>
              </div>
            </transition>

            <!-- ═══ 文本输入工作区 ═══ -->
            <div v-if="!isFileTool" class="mb-5">
              <div class="flex items-center justify-between mb-2">
                <label class="text-sm font-medium text-slate-300">输入内容</label>
                <div class="flex items-center gap-3">
                  <button v-if="userInput" @click="clearInput" class="text-xs text-slate-500 hover:text-slate-300">🗑️ 清空</button>
                  <button @click="fillExample" class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><span>💡</span> 填入示例</button>
                </div>
              </div>
              <textarea v-model="userInput" :placeholder="currentTool.placeholder" class="glass-input" rows="8"></textarea>
              <div class="flex items-center justify-between mt-2">
                <div class="flex items-center gap-3">
                  <span class="text-xs text-slate-600">{{ userInput.length }} 字</span>
                  <span class="text-xs text-slate-700">Ctrl+Enter 提交</span>
                </div>
                <button @click="processInput" :disabled="!userInput.trim() || loading" class="btn-gradient text-sm">
                  <span v-if="!loading">🚀 开始处理</span>
                  <span v-else class="flex items-center gap-2"><span class="loading-dots"><span></span><span></span><span></span></span>AI 处理中...</span>
                </button>
              </div>
            </div>

            <!-- ═══ 文件上传工作区 ═══ -->
            <div v-if="isFileTool" class="mb-5">
              <!-- 上传区域 -->
              <div v-if="!selectedFile" @drop="onDrop" @dragover="onDragOver" @dragleave="onDragLeave"
                :class="['file-drop-zone', { 'file-drop-active': isDragOver }]"
                @click="fileInputRef?.click()">
                <input ref="fileInputRef" type="file" :accept="currentTool.accept" @change="onFileSelect" class="hidden" />
                <div class="text-4xl mb-3">📤</div>
                <p class="text-sm text-slate-300 font-medium mb-1">拖拽文件到此处，或点击选择</p>
                <p class="text-xs text-slate-500">{{ currentTool.acceptHint }}</p>
                <!-- 财务模块：支持的单据类型提示 -->
                <div v-if="selectedTool === 'finance_audit'" class="mt-4 text-left max-w-md mx-auto">
                  <p class="text-[11px] text-slate-600 mb-1">支持的单据类型：</p>
                  <div class="flex flex-wrap gap-1">
                    <span v-for="t in ['费用报销单','付款单','收款单','记账凭证','工资发放表','入库单','出库单','发票','银行回单']" :key="t"
                      class="px-2 py-0.5 rounded bg-white/5 text-[10px] text-slate-500">{{ t }}</span>
                  </div>
                </div>
                <!-- 识别模块：支持的格式提示 -->
                <div v-if="selectedTool === 'ocr_corrector'" class="mt-4 text-left max-w-md mx-auto">
                  <div class="grid grid-cols-2 gap-2">
                    <div class="p-2 rounded-lg bg-white/5 text-center">
                      <p class="text-[11px] text-cyan-400 font-medium">📷 图片 OCR</p>
                      <p class="text-[10px] text-slate-600">JPG / JPEG / PNG</p>
                    </div>
                    <div class="p-2 rounded-lg bg-white/5 text-center">
                      <p class="text-[11px] text-cyan-400 font-medium">🎤 音频转写</p>
                      <p class="text-[10px] text-slate-600">MP3 / WAV / FLAC / AAC</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 已选择文件 -->
              <div v-if="selectedFile" class="glass p-4">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="text-2xl">📎</span>
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-white truncate">{{ selectedFile.name }}</p>
                      <p class="text-xs text-slate-500">{{ (selectedFile.size / 1024).toFixed(1) }} KB · {{ selectedFile.type || '未知类型' }}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <button v-if="parseStatus !== 'parsing'" @click="removeFile"
                      class="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-400 hover:text-white transition-all">🗑️ 移除</button>
                  </div>
                </div>

                <!-- 解析状态 -->
                <div v-if="parseStatus === 'parsing'" class="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <span class="loading-dots"><span></span><span></span><span></span></span>
                  <span class="text-sm text-blue-300">
                    {{ ocrProgress > 0 ? `OCR 识别中... ${ocrProgress}%` : '文件解析中...' }}
                  </span>
                </div>
                <div v-if="parseStatus === 'done'" class="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <span class="text-green-400">✅</span>
                  <span class="text-sm text-green-300">
                    {{ parsedText === '__AUDIO__' ? '音频就绪，将通过 Whisper API 转写' : `解析完成，共 ${parsedText.length} 字` }}
                  </span>
                </div>
                <div v-if="parseStatus === 'error'" class="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p class="text-sm text-red-300">❌ {{ error }}</p>
                </div>
              </div>

              <!-- 提交按钮 -->
              <div class="flex items-center justify-between mt-3">
                <span class="text-xs text-slate-600">Ctrl+Enter 提交</span>
                <button @click="processInput"
                  :disabled="!selectedFile || parseStatus !== 'done' || loading"
                  class="btn-gradient text-sm">
                  <span v-if="!loading">🚀 开始分析</span>
                  <span v-else class="flex items-center gap-2"><span class="loading-dots"><span></span><span></span><span></span></span>AI 处理中...</span>
                </button>
              </div>
            </div>

            <!-- 输出区域 -->
            <transition name="fade">
              <div v-if="output || error || loading" class="border-t border-white/5 pt-5">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-3">
                    <label class="text-sm font-medium text-slate-300">{{ loading ? '⏳ 处理中...' : '📋 处理结果' }}</label>
                    <span v-if="!loading && elapsedMs > 0" class="text-xs text-slate-600">耗时 {{ elapsed }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button v-if="output && !loading" @click="copyOutput" class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">📋 复制结果</button>
                    <button v-if="output && !loading" @click="openExportModal" class="text-xs text-green-400 hover:text-green-300 flex items-center gap-1">📥 导出 PDF</button>
                  </div>
                </div>
                <div v-if="loading && !output" class="glass p-8 text-center">
                  <div class="loading-dots mb-3" style="justify-content: center; display: flex;"><span></span><span></span><span></span></div>
                  <p class="text-sm text-slate-500">AI 正在分析处理中，请稍候...</p>
                </div>
                <div v-if="error" class="glass p-6 border-red-500/30"><p class="text-red-400 text-sm">❌ {{ error }}</p></div>
                <div v-if="output" class="glass p-6 max-h-[600px] overflow-y-auto">
                  <div class="markdown-output" v-html="renderedOutput"></div>
                </div>
              </div>
            </transition>
          </section>
        </transition>

        <!-- 使用说明 -->
        <transition name="fade">
          <section v-if="!selectedTool" class="glass p-8 mb-12">
            <h2 class="text-xl font-bold text-white mb-6 text-center">📋 使用指南</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div class="text-center">
                <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-2xl mx-auto mb-3">📝</div>
                <h3 class="font-semibold text-white mb-1">智能文书助手</h3>
                <p class="text-sm text-slate-400">输入零散工作要点 → AI 生成结构化周报/计划书</p>
              </div>
              <div class="text-center">
                <div class="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center text-2xl mx-auto mb-3">🔍</div>
                <h3 class="font-semibold text-white mb-1">合同/文档审核</h3>
                <p class="text-sm text-slate-400">粘贴合同文本 → AI 三轮扫描合规风险</p>
              </div>
              <div class="text-center">
                <div class="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-2xl mx-auto mb-3">🔄</div>
                <h3 class="font-semibold text-white mb-1">格式化转换器</h3>
                <p class="text-sm text-slate-400">粘贴会议纪要 → AI 提取标准任务清单</p>
              </div>
            </div>
            <div class="border-t border-white/5 pt-6">
              <div class="flex items-center justify-center gap-2 mb-4">
                <span class="px-2 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px] font-bold">NEW</span>
                <h3 class="text-sm font-semibold text-slate-300">智能 Agent 模块（文件驱动）</h3>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="text-center">
                  <div class="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center text-2xl mx-auto mb-3">👤</div>
                  <h3 class="font-semibold text-white mb-1">人事·简历透视</h3>
                  <p class="text-sm text-slate-400">上传简历 → AI 深度拆解分析候选人潜力与风险</p>
                </div>
                <div class="text-center">
                  <div class="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-2xl mx-auto mb-3">💰</div>
                  <h3 class="font-semibold text-white mb-1">财务·智能审计</h3>
                  <p class="text-sm text-slate-400">上传财务单据 → AI 自动识别异常并输出风险评级</p>
                </div>
                <div class="text-center">
                  <div class="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center text-2xl mx-auto mb-3">🔎</div>
                  <h3 class="font-semibold text-white mb-1">识别·智能纠错</h3>
                  <p class="text-sm text-slate-400">上传图片/音频 → AI 精准识别并结构化输出</p>
                </div>
              </div>
            </div>
          </section>
        </transition>

        <!-- 安全说明 -->
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
              <p class="text-sm text-slate-400">Token + Origin + ClientID 三重验证</p>
            </div>
            <div class="text-center">
              <div class="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-2xl mx-auto mb-3">💾</div>
              <h3 class="font-semibold text-white mb-1">本地化存储</h3>
              <p class="text-sm text-slate-400">文档数据仅保存在浏览器本地，不上传任何服务器</p>
            </div>
          </div>
        </section>

        <footer class="text-center text-xs text-slate-600">
          <p>Aegis AI · 企业级 AI 效能中枢 · {{ currentYear }}</p>
          <p class="mt-1">Built with Vue 3 · Tailwind CSS · Cloudflare Workers · DeepSeek / Gemini</p>
        </footer>
      </div>
    </main>

    <!-- ═══ 隐藏的 PDF 导出区域 ═══ -->
    <div id="report-content" class="pdf-export-area">
      <!-- 渐变页眉 -->
      <div class="pdf-header">
        <div class="pdf-header-inner">
          <div class="pdf-logo">A</div>
          <div>
            <h1 class="pdf-title">Aegis AI · 企业级 AI 效能中枢</h1>
            <p class="pdf-subtitle">智能分析报告 · {{ exportDate }}</p>
          </div>
        </div>
      </div>
      <!-- 工具信息 -->
      <div class="pdf-tool-info" v-if="currentTool">
        <span class="pdf-tool-icon">{{ currentTool.icon }}</span>
        <span class="pdf-tool-name">{{ currentTool.name }}</span>
      </div>
      <!-- 内容区域 -->
      <div class="pdf-content">
        <div v-html="renderedOutput"></div>
      </div>
      <!-- AI 免责声明 -->
      <div class="pdf-footer">
        <p><strong>IIEAO 免责声明：</strong>本报告由 Aegis AI 分析引擎生成，仅靠参考。报告内容不构成任何法律、财务或人事决策建议。最终决策请以人工审核为准。</p>
        <p><strong>©️Charles </strong> <strong> Business Contact：millychck@gmail.com </strong> <strong> Work Contact：Charles@iieao.com </strong></p>
        <p class="pdf-footer-meta">Powered by Aegis AI · DeepSeek / Gemini · {{ exportDate }} · 文件已加密保护</p>
      </div>
    </div>
  </div>
</template>
