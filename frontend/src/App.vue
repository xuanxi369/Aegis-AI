<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import html2pdf from 'html2pdf.js'
import { encryptPDFWithPassword } from './utils/pdfEncrypt.js'
import { callAI, callAudioAI, autoParseFile, TOOLS_CONFIG } from './utils/api.js'

marked.setOptions({ breaks: true, gfm: true })

// ── 页面视图路由 ──────────────────────────────────────────
// 'landing' | 'dashboard' | 'tool'
const currentView = ref('landing')

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
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
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

// ── 格式化序号 ────────────────────────────────────────────
function formatNum(num) {
  return String(num).padStart(3, '0')
}

// ── 财务模块 JSON 渲染 (重构为极简黑白红风格) ──────────────
function renderFinanceJSON(json) {
  const statusColors = { PASS: 'green', WARNING: 'yellow', CRITICAL: 'red' }
  const statusLabels = { PASS: 'APPROVED', WARNING: 'WARNING', CRITICAL: 'CRITICAL' }
  const sevColors = { High: 'red', Medium: 'yellow', Low: 'green' }

  let html = `<div class="finance-report">`
  html += `<div class="fr-header">`
  html += `<h3>${json.document_type || 'DOCUMENT'}</h3>`
  const sc = statusColors[json.audit_status] || 'gray'
  html += `<span class="fr-badge fr-badge-${sc}">${statusLabels[json.audit_status] || json.audit_status}</span>`
  html += `</div>`

  const score = json.risk_score ?? 0
  const scoreColor = score < 30 ? '#111' : score < 60 ? '#FDE047' : '#E63946'
  html += `<div class="fr-score-section">`
  html += `<span style="font-weight:700; font-size:12px;">RISK SCORE</span>`
  html += `<div class="fr-score-bar"><div class="fr-score-fill" style="width:${score}%;background:${scoreColor}"></div></div>`
  html += `<span class="fr-score-text" style="color:${scoreColor}">${score}</span>`
  html += `</div>`

  if (json.extracted_key_data) {
    const kd = json.extracted_key_data
    html += `<div class="fr-kv-grid">`
    if (kd.total_amount) html += `<div class="fr-kv"><span>AMOUNT</span><strong>${kd.total_amount}</strong></div>`
    if (kd.date) html += `<div class="fr-kv"><span>DATE</span><strong>${kd.date}</strong></div>`
    if (kd.subject) html += `<div class="fr-kv"><span>SUBJECT</span><strong>${kd.subject}</strong></div>`
    html += `</div>`
  }

  if (json.anomaly_detection && json.anomaly_detection.length > 0) {
    html += `<div style="margin-top:40px; margin-bottom:16px; font-weight:800;">ANOMALIES DETECTED</div>`
    json.anomaly_detection.forEach((a) => {
      const sc2 = sevColors[a.severity] || 'gray'
      html += `<div class="fr-anomaly">`
      html += `<div style="display:flex; align-items:flex-start; margin-bottom:12px;"><span class="fr-sev fr-sev-${sc2}">${a.severity}</span><span style="font-weight:700;">${a.issue}</span></div>`
      if (a.tax_policy_reference) html += `<div style="font-size:12px; color:#71717A; margin-bottom:8px;">REF: ${a.tax_policy_reference}</div>`
      if (a.remediation) html += `<div style="font-size:13px; font-weight:500;">FIX: ${a.remediation}</div>`
      html += `</div>`
    })
  }

  if (json.financial_advice) {
    html += `<div class="fr-advice">ADVICE: ${json.financial_advice}</div>`
  }
  html += `</div>`
  return html
}

// ── 路由与工具选择 ────────────────────────────────────────
function navigate(view) {
  currentView.value = view
  if (view === 'dashboard' || view === 'landing') {
    selectedTool.value = null
    resetWorkspace()
  }
}

function openTool(toolId) {
  selectedTool.value = toolId
  resetWorkspace()
  currentView.value = 'tool'
  loadHistory(toolId)
  window.scrollTo(0, 0)
}

function resetWorkspace() {
  output.value = ''; error.value = ''; userInput.value = ''; elapsedMs.value = 0
  showHistory.value = false; selectedFile.value = null; parsedText.value = ''
  parseStatus.value = ''; ocrProgress.value = 0
}

// ── 文件处理 (逻辑完全保留) ────────────────────────────────
function onFileSelect(e) { const file = e.target.files?.[0]; if (file) handleFile(file) }
function onDrop(e) { e.preventDefault(); isDragOver.value = false; const file = e.dataTransfer.files?.[0]; if (file) handleFile(file) }
function onDragOver(e) { e.preventDefault(); isDragOver.value = true }
function onDragLeave() { isDragOver.value = false }

function handleFile(file) {
  const MAX_DOC = 20 * 1024 * 1024; const MAX_AUDIO = 10 * 1024 * 1024; const MAX_IMG = 10 * 1024 * 1024
  const ext = file.name.split('.').pop().toLowerCase()
  const audioExts = ['wav', 'flac', 'ape', 'mp3', 'aac', 'wma', 'aiff', 'mp4']
  const imageExts = ['jpg', 'jpeg', 'png']
  const limit = audioExts.includes(ext) ? MAX_AUDIO : imageExts.includes(ext) ? MAX_IMG : MAX_DOC

  if (file.size > limit) {
    showToast(`FILE TOO LARGE. MAX ${Math.round(limit / 1024 / 1024)}MB`, 'error')
    return
  }

  selectedFile.value = file; parsedText.value = ''; parseStatus.value = 'parsing'; output.value = ''; error.value = ''

  if (audioExts.includes(ext)) {
    parseStatus.value = 'done'; parsedText.value = '__AUDIO__'
    showToast(`AUDIO SELECTED: ${file.name}`)
    return
  }

  if (imageExts.includes(ext)) {
    parseImageOCR(file)
    return
  }

  autoParseFile(file).then(result => {
    parsedText.value = result.text || ''
    parseStatus.value = 'done'
    showToast(`PARSED: ${parsedText.value.length} CHARACTERS`)
  }).catch(err => {
    parseStatus.value = 'error'; error.value = err.message
    showToast(`PARSE FAILED`, 'error')
  })
}

async function parseImageOCR(file) {
  try {
    const Tesseract = await import('tesseract.js')
    const { data } = await Tesseract.recognize(file, 'chi_sim+eng', {
      logger: m => { if (m.status === 'recognizing text') ocrProgress.value = Math.round(m.progress * 100) }
    })
    parsedText.value = data.text; parseStatus.value = 'done'; ocrProgress.value = 0
    showToast(`OCR COMPLETED`)
  } catch (err) {
    parseStatus.value = 'error'; error.value = err.message; showToast(`OCR FAILED`, 'error')
  }
}

function removeFile() {
  selectedFile.value = null; parsedText.value = ''; parseStatus.value = ''; ocrProgress.value = 0
  if (fileInputRef.value) fileInputRef.value.value = ''
}

// ── 处理提交 (逻辑完全保留) ────────────────────────────────
function fillExample() {
  if (currentTool.value?.example) { userInput.value = currentTool.value.example; showToast('EXAMPLE LOADED') }
}
function clearInput() { userInput.value = ''; output.value = ''; error.value = ''; elapsedMs.value = 0 }

async function processInput() {
  if (loading.value) return
  if (isFileTool.value) {
    if (!selectedFile.value || parseStatus.value !== 'done') return showToast('AWAITING FILE PARSE', 'error')
    await processFileInput()
    return
  }
  const text = userInput.value.trim()
  if (!text) return
  if (text.length < 10) return showToast('INPUT TOO SHORT', 'error')
  await processTextInput(text)
}

async function processTextInput(text) {
  loading.value = true; output.value = ''; error.value = ''; startTime.value = Date.now()
  try {
    const result = await callAI(selectedTool.value, text)
    output.value = result; elapsedMs.value = Date.now() - startTime.value
    saveToHistory(selectedTool.value, text.substring(0, 300), result); loadHistory(selectedTool.value)
    showToast(`COMPLETED IN ${elapsed.value}`)
  } catch (err) {
    error.value = err.message; showToast(`FAILED`, 'error')
  } finally { loading.value = false }
}

async function processFileInput() {
  loading.value = true; output.value = ''; error.value = ''; startTime.value = Date.now()
  try {
    let result; const ext = selectedFile.value.name.split('.').pop().toLowerCase()
    const audioExts = ['wav', 'flac', 'ape', 'mp3', 'aac', 'wma', 'aiff', 'mp4']
    if (audioExts.includes(ext)) {
      const { audioToBase64 } = await import('./utils/api.js')
      const b64 = await audioToBase64(selectedFile.value)
      result = await callAudioAI(selectedTool.value, b64, selectedFile.value.type || 'audio/mpeg')
    } else {
      result = await callAI(selectedTool.value, parsedText.value)
    }
    output.value = result; elapsedMs.value = Date.now() - startTime.value
    saveToHistory(selectedTool.value, `[FILE] ${selectedFile.value.name}`, result); loadHistory(selectedTool.value)
    showToast(`COMPLETED IN ${elapsed.value}`)
  } catch (err) {
    error.value = err.message; showToast(`FAILED`, 'error')
  } finally { loading.value = false }
}

// ── 本地记录 (逻辑保留) ────────────────────────────────────
function saveToHistory(toolType, input, result) {
  try {
    const key = `aegis_history_${toolType}`
    const history = JSON.parse(localStorage.getItem(key) || '[]')
    history.unshift({ id: Date.now(), input: input.substring(0, 100), output: result, timestamp: new Date().toISOString() })
    localStorage.setItem(key, JSON.stringify(history.slice(0, 10)))
  } catch (e) {}
}
function loadHistory(toolType) {
  try { historyList.value = JSON.parse(localStorage.getItem(`aegis_history_${toolType}`) || '[]') }
  catch { historyList.value = [] }
}
function loadHistoryItem(item) {
  userInput.value = item.input; output.value = item.output; error.value = ''; showHistory.value = false; showToast('HISTORY LOADED')
}

// ── PDF 加密导出 (逻辑完全保留) ────────────────────────────
async function secureExportToPDF(password) {
  if (!password) return;
  isExporting.value = true;
  const element = document.getElementById('report-content');
  if (!element) { isExporting.value = false; return showToast('EXPORT AREA NOT FOUND', 'error'); }

  try {
    showToast('PREPARING PDF...');
    const opt = {
      margin: [10, 10, 10, 10],
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, useCORS: true, backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          const el = clonedDoc.getElementById('report-content');
          el.style.position = 'static'; el.style.left = '0'; el.style.visibility = 'visible'; el.style.display = 'block';
        }
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    const pdfBlob = await html2pdf().set(opt).from(element).toPdf().output('blob');
    showToast('LOCKING SECURE FINGERPRINT...');
    const pdfBytes = await pdfBlob.arrayBuffer();
    const encryptedBytes = await encryptPDFWithPassword(pdfBytes, password);

    const url = URL.createObjectURL(new Blob([encryptedBytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = `AEGIS_REPORT_${Date.now()}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);

    showToast('EXPORT SUCCESS');
    showPasswordModal.value = false; pdfPassword.value = '';
  } catch (err) {
    showToast(`EXPORT FAILED`, 'error');
  } finally {
    isExporting.value = false;
  }
}
async function copyOutput() {
  if (!output.value) return
  try { await navigator.clipboard.writeText(output.value); showToast('COPIED TO CLIPBOARD') } catch {}
}

function handleKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (selectedTool.value && !loading.value) processInput() }
  if (e.key === 'Escape' && showPasswordModal.value) showPasswordModal.value = false
}
onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="app-container relative">
    <div v-if="toast.show" :class="['studio-toast', toast.type === 'error' ? 'error' : '']">{{ toast.message }}</div>

    <div v-if="showPasswordModal" class="studio-modal-overlay" @click.self="showPasswordModal = false">
      <div class="studio-modal">
        <h3 style="font-size:24px; font-weight:900; margin-bottom:12px;">SECURE EXPORT</h3>
        <p style="color:var(--text-muted); font-size:14px; margin-bottom:24px;">Enter a password to encrypt and lock the PDF document.</p>
        <input v-model="pdfPassword" type="password" placeholder="PASSWORD" class="studio-input" style="margin-bottom:24px;" autofocus @keyup.enter="pdfPassword.length >= 1 && secureExportToPDF(pdfPassword)" />
        <div style="display:flex; justify-content:flex-end; gap:16px;">
          <button @click="showPasswordModal = false" class="studio-btn-outline" style="padding:12px 24px;">CANCEL</button>
          <button @click="secureExportToPDF(pdfPassword)" :disabled="!pdfPassword || isExporting" class="studio-btn accent-block" style="padding:12px 24px;">
            {{ isExporting ? 'ENCRYPTING...' : 'DOWNLOAD' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="currentView === 'landing'" class="view-landing">
      <header class="studio-header" style="border:none;">
        <div class="studio-logo">Aegis.</div>
        <div class="studio-nav" style="color:var(--text-muted);">Lab. 001</div>
      </header>
      <main class="landing-main">
        <div class="landing-bg-block"></div>
        <div class="landing-content">
          <div style="font-weight:700; color:var(--accent-color); margin-bottom:16px; letter-spacing:2px; font-size:14px;">ENTERPRISE EFFICIENCY HUB</div>
          <h1 class="huge-text">Communication<br/>through quality<br/>intelligence.</h1>
          <button @click="navigate('dashboard')" class="studio-btn" style="margin-top:40px; font-size:16px; padding:20px 40px;">
            ENTER WORKSPACE <span style="margin-left:12px;">→</span>
          </button>
        </div>
      </main>
    </div>

    <div v-else-if="currentView === 'dashboard'" class="view-dashboard">
      <header class="studio-header">
        <div class="studio-logo" @click="navigate('landing')">Aegis.</div>
        <div class="studio-nav">MODULES</div>
      </header>
      <div class="dashboard-grid">
        <div v-for="(tool, index) in tools" :key="tool.id" @click="openTool(tool.id)" class="tool-item">
          <span class="tool-num">LAB. {{ formatNum(index + 1) }}</span>
          <h2 class="tool-name">{{ tool.name }}</h2>
          <p class="tool-desc">{{ tool.description }}</p>
        </div>
      </div>
    </div>

    <div v-else-if="currentView === 'tool'" class="view-tool">
      <header class="studio-header">
        <div class="studio-logo" @click="navigate('landing')">Aegis.</div>
        <button @click="navigate('dashboard')" class="studio-btn-outline" style="padding:8px 16px; font-size:12px;">← BACK TO MODULES</button>
      </header>
      
      <div class="tool-layout">
        <aside class="tool-sidebar">
          <div style="font-weight:900; font-size:40px; line-height:1; letter-spacing:-1px; margin-bottom:16px;">{{ currentTool.name }}</div>
          <p style="color:var(--text-muted); font-size:14px; margin-bottom:40px; line-height:1.6;">{{ currentTool.description }}</p>
          
          <div v-if="historyList.length > 0" style="margin-top:40px; border-top:2px solid var(--border-color); padding-top:24px;">
            <div style="font-weight:700; font-size:12px; margin-bottom:16px;">RECENT HISTORY</div>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <div v-for="item in historyList" :key="item.id" @click="loadHistoryItem(item)" 
                   style="font-size:12px; color:var(--text-muted); cursor:pointer; padding:12px; border:1px solid #E4E4E7; transition:border 0.2s;">
                <div style="font-weight:700; color:var(--text-main); margin-bottom:4px;">{{ item.timestamp.split('T')[0] }}</div>
                <div class="line-clamp-2">{{ item.input }}</div>
              </div>
            </div>
          </div>
        </aside>

        <main class="tool-workspace">
          <div v-if="!isFileTool" style="margin-bottom:40px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
              <label style="font-weight:800; font-size:14px;">INPUT DATA</label>
              <button @click="fillExample" style="background:none; border:none; font-size:12px; font-weight:700; color:var(--accent-color); cursor:pointer; text-decoration:underline;">LOAD EXAMPLE</button>
            </div>
            <textarea v-model="userInput" :placeholder="currentTool.placeholder" class="studio-input" rows="8"></textarea>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
              <span style="font-size:12px; color:var(--text-muted); font-weight:700;">CTRL + ENTER TO SUBMIT</span>
              <button @click="processInput" :disabled="!userInput.trim() || loading" class="studio-btn accent-block">
                {{ loading ? 'PROCESSING...' : 'EXECUTE' }}
              </button>
            </div>
          </div>

          <div v-if="isFileTool" style="margin-bottom:40px;">
             <div style="margin-bottom:12px; font-weight:800; font-size:14px;">UPLOAD FILE</div>
             <div v-if="!selectedFile" @drop="onDrop" @dragover="onDragOver" @dragleave="onDragLeave"
                  :class="['file-drop-area', { 'active': isDragOver }]" @click="fileInputRef?.click()">
               <input ref="fileInputRef" type="file" :accept="currentTool.accept" @change="onFileSelect" style="display:none;" />
               <div style="font-weight:900; font-size:24px; margin-bottom:8px;">CLICK OR DRAG FILE HERE</div>
               <div style="font-size:14px; color:var(--text-muted);">{{ currentTool.acceptHint }}</div>
             </div>

             <div v-if="selectedFile" style="border:2px solid var(--border-color); padding:24px; background:#fff;">
               <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                 <div>
                   <div style="font-weight:800; font-size:18px; margin-bottom:4px;">{{ selectedFile.name }}</div>
                   <div style="font-size:12px; color:var(--text-muted); font-weight:700;">{{ (selectedFile.size / 1024).toFixed(1) }} KB</div>
                 </div>
                 <button v-if="parseStatus !== 'parsing'" @click="removeFile" style="background:none; border:none; color:var(--accent-color); font-weight:700; font-size:12px; cursor:pointer;">REMOVE</button>
               </div>
               
               <div style="font-size:12px; font-weight:700; padding:12px; background:#F4F4F5;">
                 <span v-if="parseStatus === 'parsing'">ANALYZING... {{ ocrProgress > 0 ? ocrProgress+'%' : '' }}</span>
                 <span v-if="parseStatus === 'done'" style="color:var(--text-main);">READY. {{ parsedText.length > 10 ? parsedText.length + ' CHARACTERS' : '' }}</span>
                 <span v-if="parseStatus === 'error'" style="color:var(--accent-color);">ERROR: {{ error }}</span>
               </div>

               <div style="display:flex; justify-content:space-between; align-items:center; margin-top:24px;">
                 <span style="font-size:12px; color:var(--text-muted); font-weight:700;">CTRL + ENTER TO SUBMIT</span>
                 <button @click="processInput" :disabled="!selectedFile || parseStatus !== 'done' || loading" class="studio-btn accent-block">
                   {{ loading ? 'PROCESSING...' : 'EXECUTE' }}
                 </button>
               </div>
             </div>
          </div>

          <div v-if="output || loading" style="border-top:4px solid var(--border-color); padding-top:40px;">
             <div style="display:flex; justify-content:space-between; margin-bottom:24px;">
               <label style="font-weight:900; font-size:20px;">OUTPUT</label>
               <div v-if="output && !loading" style="display:flex; gap:16px;">
                 <button @click="copyOutput" style="background:none; border:none; font-size:12px; font-weight:700; cursor:pointer; text-decoration:underline;">COPY TEXT</button>
                 <button @click="showPasswordModal = true" style="background:none; border:none; font-size:12px; font-weight:700; color:var(--accent-color); cursor:pointer; text-decoration:underline;">EXPORT SECURE PDF</button>
               </div>
             </div>
             
             <div v-if="loading && !output" style="padding:60px 20px; text-align:center; font-weight:900; font-size:24px; color:var(--text-muted); animation: pulse 1.5s infinite;">
               GENERATING INTELLIGENCE...
             </div>
             
             <div v-if="output" class="markdown-output" v-html="renderedOutput" style="background:#fff; border:2px solid var(--border-color); padding:32px;"></div>
          </div>
        </main>
      </div>
    </div>

    <div id="report-content" class="pdf-export-area">
      <div style="border-bottom:4px solid #111; padding-bottom:24px; margin-bottom:32px; display:flex; justify-content:space-between; align-items:flex-end;">
        <div>
          <div style="font-size:32px; font-weight:900; letter-spacing:-1px; margin-bottom:8px;">Aegis.</div>
          <div style="font-size:18px; font-weight:700;">INTELLIGENCE REPORT</div>
        </div>
        <div style="text-align:right; font-size:12px; font-weight:700;">
          DATE: {{ exportDate }}<br>MODULE: {{ currentTool?.name || 'SYSTEM' }}
        </div>
      </div>
      <div v-html="renderedOutput" style="font-size:14px; line-height:1.6;"></div>
      <div style="margin-top:60px; border-top:2px solid #111; padding-top:16px; font-size:10px; font-weight:700;">
        <p>DISCLAIMER: GENERATED BY AEGIS AI. FOR REFERENCE ONLY.</p>
        <p>CONTACT: Charles@iieao.com | millychck@gmail.com</p>
      </div>
    </div>

  </div>
</template>

<style scoped>
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
