// ============================================================
// API 配置 — 部署前请务必修改以下三项
// ============================================================

// ⚠️ 替换为你的 Cloudflare Worker 部署地址
//const WORKER_URL = 'https://aegis-worker.millychck-033.workers.dev'
const WORKER_URL = 'https://api-ai.iieao.com'

// ⚠️ 替换为你在 Worker 中设置的 AUTH_TOKEN（必须一致）
const AUTH_TOKEN='dcfdfb354856b9f5df0c3bb880821363'

// ⚠️ 替换为你在 Worker 中设置的 EXPECTED_CLIENT_ID（若启用了客户端指纹验证）
const CLIENT_ID = ''

/**
 * 构建请求 Headers（环境指纹的一部分）
 */
function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'X-Access-Token': AUTH_TOKEN,
  }
  if (CLIENT_ID) {
    headers['X-Client-ID'] = CLIENT_ID
  }
  return headers
}

/**
 * 调用 AI 工具（文本输入）
 */
export async function callAI(toolType, userInput) {
  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ tool_type: toolType, user_input: userInput }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '请求失败' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }
  const data = await response.json()
  if (data.success && data.choices && data.choices[0]) {
    return data.choices[0].message.content
  }
  if (data.choices && data.choices[0]) {
    return data.choices[0].message.content
  }
  throw new Error('AI 返回数据格式异常')
}

/**
 * 调用 AI 工具（音频输入 → Whisper 转写 + Agent 纠错）
 */
export async function callAudioAI(toolType, audioBase64, mimeType) {
  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      tool_type: toolType,
      raw_audio: audioBase64,
      audio_mime: mimeType,
    }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '请求失败' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }
  const data = await response.json()
  if (data.success && data.choices && data.choices[0]) {
    return data.choices[0].message.content
  }
  throw new Error('AI 返回数据格式异常')
}

// ═══════════════════════════════════════════════════════════════
// 文件解析工具库
// ═══════════════════════════════════════════════════════════════

/**
 * 解析 Excel/CSV 文件 → 文本
 */
export async function parseExcel(file) {
  const XLSX = await import('xlsx')
  const data = await file.arrayBuffer()
  const workbook = XLSX.read(data, { type: 'array' })
  let allText = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    if (json.length > 0) {
      allText.push(`【工作表: ${sheetName}】`)
      json.forEach(row => {
        if (row.some(cell => cell !== undefined && cell !== '')) {
          allText.push(row.map(c => c ?? '').join(' | '))
        }
      })
    }
  }
  return allText.join('\n')
}

/**
 * 解析 PDF 文件 → 文本
 */
export async function parsePDF(file) {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
  const data = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  let allText = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map(item => item.str).join(' ')
    if (text.trim()) allText.push(`--- 第 ${i} 页 ---\n${text}`)
  }
  return allText.join('\n\n')
}

/**
 * 解析 Word (DOCX/DOC) 文件 → 文本
 */
export async function parseWord(file) {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

/**
 * 解析纯文本文件 (TXT/MD/CSV) → 文本
 */
export async function parseText(file) {
  return await file.text()
}

/**
 * 图片 → Base64 (用于 OCR)
 */
export async function imageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 音频 → Base64 (用于 Whisper)
 */
export async function audioToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 根据文件类型自动解析
 */
export async function autoParseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  const mime = file.type || ''

  // Excel / CSV
  if (['xlsx', 'xls', 'csv'].includes(ext) || mime.includes('spreadsheet') || mime.includes('csv')) {
    return { text: await parseExcel(file), type: 'excel' }
  }
  // PDF
  if (ext === 'pdf' || mime === 'application/pdf') {
    return { text: await parsePDF(file), type: 'pdf' }
  }
  // Word
  if (['docx', 'doc'].includes(ext) || mime.includes('word') || mime.includes('document')) {
    return { text: await parseWord(file), type: 'word' }
  }
  // 纯文本
  if (['txt', 'md', 'rtf'].includes(ext) || mime.includes('text')) {
    return { text: await parseText(file), type: 'text' }
  }
  // 图片 → OCR 在前端用 Tesseract 处理
  if (['jpg', 'jpeg', 'png'].includes(ext) || mime.startsWith('image/')) {
    return { base64: await imageToBase64(file), type: 'image', mimeType: mime }
  }
  // 音频 → 发送到 Worker 用 Whisper 处理
  if (['wav', 'flac', 'ape', 'mp3', 'aac', 'wma', 'aiff', 'mp4'].includes(ext) || mime.startsWith('audio/')) {
    return { base64: await audioToBase64(file), type: 'audio', mimeType: mime }
  }

  throw new Error(`不支持的文件格式: .${ext}`)
}

// ═══════════════════════════════════════════════════════════════
// 工具配置（6 个模块）
// ═══════════════════════════════════════════════════════════════

export const TOOLS_CONFIG = {
  // ── 原有三大模块 ──────────────────────────────────────
  writer: {
    id: 'writer',
    name: 'Aegis文书助手',
    icon: '✎',
    description: '零散要点，即可生成专业职场公文',
    color: 'blue',
    inputType: 'text',
    placeholder: `在此输入你的周报要点，例如：

这周做了用户系统的重构，修了几个bug
和财务那边沟通了预算的事，他们说要下周才能批
下周计划开始做移动端适配...`,
    example: `本周工作要点：

1. 完成了用户权限管理模块的重构开发，涉及12个接口的重写
2. 修复了线上3个紧急bug，包括支付回调超时和数据统计偏差
3. 与财务部门沟通Q2预算方案，目前等待审批中
4. 组织了2次技术评审会议，确定了微服务拆分方案
5. 带领新入职实习生熟悉项目架构，完成开发环境搭建
6. 项目整体进度约65%，比计划延迟约1周

下周计划：
- 启动移动端H5适配工作
- 完成支付模块的压力测试
- 推进微服务拆分第一阶段
- 准备月底的项目汇报材料`,
  },
  auditor: {
    id: 'auditor',
    name: '合同·文档审核',
    icon: '§',
    description: '全量扫描文本条款，深度评估法务合规风险',
    color: 'pink',
    inputType: 'text',
    placeholder: `在此粘贴需要审核的合同或文档内容，例如：

甲方应在合同签署后30个工作日内完成系统交付。
如乙方未按时付款，甲方有权暂停服务。`,
    example: `技术服务合同（节选）

第三条 服务内容与交付
甲方应在合同签署后30个工作日内完成系统的开发与部署工作，包括但不限于：需求分析、系统设计、编码开发、测试验收。最终交付物包括完整源代码、部署文档及操作手册。

第四条 付款方式
乙方应在合同签署后15个工作日内支付首期款项人民币50,000元整。尾款人民币30,000元整应在系统验收通过后10个工作日内支付。如乙方未按时支付任何一期款项，甲方有权暂停所有服务且不承担任何违约责任。

第五条 违约责任
如甲方未能在约定时间内完成交付，每延迟一天应向乙方支付合同总额0.5%的违约金，但违约金总额不超过合同总额的20%。如延迟超过30天，乙方有权解除合同。`,
  },
  converter: {
    id: 'converter',
    name: '格式化转换器',
    icon: '⇄',
    description: '粘贴会议纪要或笔记，自动提取结构化待办清单',
    color: 'green',
    inputType: 'text',
    placeholder: `在此粘贴会议纪要或工作笔记，例如：

今天开会讨论了新项目，张三说他负责前端，下周二之前搞定。李四那边后端接口还没写完...`,
    example: `【3月15日 周一例会纪要】

参会人员：张三、李四、王五、赵六

一、项目进度同步
张三反馈：前端页面重构工作已完成80%，剩余用户中心模块预计下周二（3月19日）前完成。
李四反馈：后端API接口开发进度滞后，目前只完成了用户模块和订单模块。
王五提到：甲方客户对项目进度非常关注，要求我们在本月底前完成第一版交付。

二、下周安排
1. 张三完成用户中心前端开发
2. 李四优先完成订单模块的接口文档
3. 王五跟进预算审批
4. 全员周五下午3点进行代码评审`,
  },

  // ── 新增三大模块 ──────────────────────────────────────
  //👤
  hr_resume: {
    id: 'hr_resume',
    name: '简历·面向HR',
    icon: 'Ω',
    description: '多维度解析履历数据，构建候选人胜任力画像',
    color: 'violet',
    inputType: 'file',
    accept: '.pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls',
    acceptHint: '支持 PDF / Word / Excel / TXT / MD 格式',
    category: '人事模块',
  },
  finance_audit: {
    id: 'finance_audit',
    name: 'Aegis审计',
    icon: '$',
    description: '上传财务单据，系统自动审计异常并生成风险报告',
    color: 'amber',
    inputType: 'file',
    accept: '.pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.jpg,.jpeg,.png',
    acceptHint: '支持 PDF / Word / Excel / 图片 等格式',
    category: '财务模块',
  },
  ocr_corrector: {
    id: 'ocr_corrector',
    name: '图片/音频内容识别',
    icon: '📁',
    description: '上传图片/音频，实现高精度数据总结归纳',
    color: 'cyan',
    inputType: 'file',
    accept: '.jpg,.jpeg,.png,.wav,.flac,.ape,.mp3,.aac,.wma,.aiff,.mp4',
    acceptHint: '图片: JPG/PNG | 音频: MP3/WAV/FLAC/AAC/MP4 等',
    category: '识别模块',
  },
}
