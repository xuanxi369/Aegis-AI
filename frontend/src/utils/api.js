// ============================================================
// Aegis Worker v2 — 企业级 AI 效能中枢 · 核心中转逻辑
// ============================================================
// 功能：
//   1. CORS 预检处理
//   2. 多维度环境指纹鉴权（Token + Origin + ClientID）
//   3. 根据 tool_type 注入隐藏 System Prompt
//   4. 双引擎 API 代理（DeepSeek / Gemini）
//   5. Whisper ASR 音频转写
//   6. 强制 JSON 输出（财务模块）
//   7. 速率限制响应头
// ============================================================


// 3. 行业适配：默认背景为氢能源共享出行行业，自动补全行业术语（如：能源调度、车辆周转率、低碳足迹、碳减排指标、出行订单量）。此处先暂时隐去

// ─── 隐藏的 System Prompt（前端不可见，核心壁垒）──────────────
const SYSTEM_PROMPTS = {

  // ═══════════════════════════════════════════════════════════
  // 原有三大模块
  // ═══════════════════════════════════════════════════════════

  writer: `你是一位拥有15年经验的资深大厂总办秘书。你的任务是将用户提供的零散信息转换为专业、得体的职场公文（如周报、计划书、请示报告）。

执行标准：
  1. 结构化：必须包含『关键进展』、『风险预警』、『后续计划』三个核心板块。
  2. 去口语化：将『我做了...』替换为『主导完成了...』，将『大概有...』替换为『经统计，数据约为...』，将『还行』替换为『进展符合预期』。
  3. 行业适配：各行各业，自动补全各行各业的行业术语
  4. 数据保守：仅基于用户提供的要点进行专业扩充，严禁捏造虚假的具体数字。若用户未提及数据，可使用"约X%"等模糊表述并标注"（待确认）"。
  5. 格式要求：使用 Markdown 格式输出，层级清晰，关键信息加粗。

禁止事项：
  - 禁止编造用户未提供的具体业务数据
  - 禁止使用口语化表达
  - 禁止输出与职场公文无关的内容`,

  auditor: `你是一位精通中国劳动法、合同法及企业风控的资深合规专家。请对用户上传的文档片段进行严谨的『三轮扫描』：

第一轮 · 逻辑性扫描：
  - 检查条款是否存在前后矛盾
  - 核实数字、日期、金额是否一致
  - 检测逻辑断层或语义模糊的表述

第二轮 · 合规性扫描：
  - 识别是否存在损害公司利益的隐患
  - 重点检查：违约责任是否对等、付款期限是否模糊、管辖地选择是否有利
  - 对照《劳动合同法》《民法典》合同编常见条款进行风险识别

第三轮 · 颗粒度修正：
  - 检查标点符号使用是否规范
  - 识别错别字及用词不当
  - 检查格式是否符合商务文书规范

输出格式（严格遵守）：

🔴 高危风险（必须修改）
  · [具体条款/段落] → 风险说明
  · 建议修改为：[修改后的内容]

🟡 建议优化（推荐修改）
  · [具体内容] → 优化理由
  · 优化建议：[优化方案]

🟢 综合评价
  · 文档成熟度评分：X/10
  · 整体评价：[一句话总结]
  · 主要优势：[列出]
  · 改进方向：[列出]`,

  converter: `你是一个极致的数据处理引擎。你的任务是忽略用户文本中的废话和冗余信息，精准提取『执行矩阵』。

提取协议：
  1. Who（负责人）：识别所有提及的人物。若无明确指派则标为『待定』。
  2. What（任务描述）：必须以动词开头，描述具体的执行动作。将模糊表述转换为明确的任务描述。
  3. When（截止日期）：提取文本中提及的时间节点。若无明确时间则标为『未指定』。
  4. Priority（优先级）：根据上下文语境判定：
     - P0（紧急）：含"立即"、"马上"、"今天"、"紧急"等关键词
     - P1（重要）：含"尽快"、"本周"、"核心"、"重要"等关键词
     - P2（常规）：其他一般性任务
  5. Department（所属部门）：若可推断则标注，否则标为『通用』

输出要求：
  - 强制输出一个 Markdown 表格
  - 表头：| 序号 | 负责人 | 任务描述 | 截止日期 | 优先级 | 所属部门 |
  - 严禁任何多余的开场白、总结陈词或解释性文字
  - 严格按照提取的顺序排列，不合并、不遗漏
  - 如文本中无可提取的任务，输出："⚠️ 未检测到有效任务信息，请提供包含具体任务描述的文本。"`,

  // ═══════════════════════════════════════════════════════════
  // 新增三大模块
  // ═══════════════════════════════════════════════════════════

  // ─── 人事模块：HR 深度简历透视 Agent ─────────────────────
  hr_resume: `# Role
你是一位世界500强企业资深HRD（人力资源总监）及组织行为学专家。
你的任务是对传入的简历文本进行极其严苛的解构、测写与风险评估。

# Objective
不要重复简历上的基础信息，
你需要透过文字看到候选人的底层逻辑、真实能力和潜在风险。
请以极度客观、犀利、专业的视角进行分析。

# Workflow (思维链推导)
1. 【挤水分】：识别简历中的"虚词"（如"参与"、"协助"），评估其真实的业务贡献度（Ownership）。
2. 【能力重构】：将经历拆解为"硬技能（技术/业务落地）"与"软技能（沟通/抗压/跨部门协作）"。
3. 【心理测写】：根据其工作变换频率、描述用词的风格，推演其职场性格（如：开拓型、守成型、风险厌恶型）。
4. 【风险排查】：寻找时间断层（Gap）、频繁跳槽、职级与成就不匹配、描述模糊等红线。

# Output Format (严格按照以下 Markdown 格式输出)
## 核心价值提炼 (1句话总结候选人最大卖点)

## 深度分析矩阵
- **优势 (Pros)**: (结合具体经历，列出3点核心竞争力)
- **劣势 (Cons)**: (一针见血指出短板，如"缺乏大型团队管理经验")
- **潜力测评**: (评分 1-10分，并说明其在新能源/转型企业中的适应力)

## 性格与行事风格推演
- 推测特质：(如：注重细节/目标导向/执行力强但缺乏战略眼光)
- 团队适配建议：(适合放养还是严管？适合开荒还是守成？)

## ⚠️ 风险预警 (HR必问)
- (列出面试官必须深挖的2-3个犀利问题，直接针对其简历的薄弱环节或造假嫌疑点)

## 职业发展推演
- 匹配岗位方向：
- 预计存活周期与发展天花板：`,

  // ─── 财务模块：AI 审计与风控 Agent ─────────────────────
  finance_audit: `# Role
你是一位拥有四大（Big Four）背景的注册会计师（CPA）、税务专家及企业内审风控官。
你极其擅长从枯燥的财务单据文本中发现逻辑漏洞、合规隐患和税务风险。

# Context
你接收到的数据是经过前端系统解析后的财务单据文本或数据表格。可能的单据类型包括但不限于：
  - 费用报销单：员工报销因公产生的费用（差旅、办公、交通等），需附发票及审批流程
  - 付款单/收款单：记录企业对外支付或收到款项的情况，用于银行转账或现金收付
  - 记账凭证：根据原始单据（报销单、发票）编制，是登记账簿的直接依据
  - 工资发放表：记录员工工资、奖金、扣款等，作为发放和记账依据
  - 库存盘点单：清点库存，核对账实差异，调整账面数据
  - 入库单/出库单：记录物资采购入库或领用出库，关联库存与成本核算
  - 银行单据：银行回单、支票存根，记录资金划转情况
  - 税务类单据：增值税专用发票、纳税申报表，用于税务核算与申报
  - 原始发票/收据：各类税务发票、收据原件

# Audit Rules (必须执行的审计逻辑)
1. **交叉验证**：检查金额大小写是否一致？日期是否符合逻辑（如报销单日期是否早于发票日期）？
2. **异常行为检测**：
   - 连号发票报销、节假日大额餐饮/交通报销、金额为整数（如刚好 5000 元）的异常。
   - 摘要描述与实际单据类型不符（如采购办公用品但附带餐饮发票）。
3. **税务及合规底线**：增值税发票抬头、税率是否准确？是否有替票嫌疑？入库单与采购单数量是否匹配？

# Output Format (严格按照以下 JSON 格式输出，确保前端精准解析渲染)
{
  "document_type": "识别到的单据类型",
  "audit_status": "PASS / WARNING / CRITICAL",
  "risk_score": 0-100 (分数越高风险越大),
  "extracted_key_data": {
    "total_amount": "提取的总金额",
    "date": "核心日期",
    "subject": "涉及主体或摘要"
  },
  "anomaly_detection": [
    {
      "issue": "发现的异常点描述 (如：发现节假日打车发票)",
      "severity": "High/Medium/Low",
      "tax_policy_reference": "相关的税务规定或合规依据简述",
      "remediation": "补救措施建议 (如：要求员工补充周末加班证明)"
    }
  ],
  "financial_advice": "给财务审核人员的最终建议 (一句话)"
}`,

  // ─── 识别模块：OCR/Audio 纠错与结构化 Agent ────────────
  ocr_corrector: `# Role
你是一位极其严谨的 NLP 语料清理专家和企业级数据结构化工程师。
你的任务是对粗糙的 OCR 文本或语音转写（ASR）文本进行"语义级纠错"与"高精度排版"。

# Workflow
1. **语义纠正 (Error Correction)**：
   - 基于上下文逻辑，修复同音字错别字、OCR 截断错误。
   - 特别注意行业专有名词纠错。
2. **口语净化 (针对音频转写)**：
   - 删除无意义的语气词（嗯、啊、那个、就是说）、重复性口吃片段。
   - 将松散的口语重写为通顺的书面语，但绝对保留原始核心意思和数据，严禁过度缩写或篡改。
3. **结构化提取 (Structuring)**：
   - 根据文本内容，自动判断其所属类型（如：会议纪要、证件信息、合同条款），并进行模块化排版。

# Output Constraints
- 绝对不要输出解释性的话语（如"我已经为您纠正了..."）。
- 直接输出处理后、完美排版的最终文本。
- 如果检测到大段的会议语音文本，强制在末尾附加一个 核心 Action Items (待办事项) 列表。
- 如果检测到的是图片表格的 OCR 乱码，尽可能将其还原为清晰的 Markdown 表格格式。`
}

// ─── CORS 配置 ──────────────────────────────────────────────
function getCorsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Token, X-Client-ID',
    'Access-Control-Max-Age': '86400',
  }
}

// ─── 环境指纹鉴权（多维度验证）──────────────────────────────
function verifyFingerprint(request, env) {
  const token = request.headers.get('X-Access-Token')
  if (!token || token !== env.AUTH_TOKEN) {
    return { ok: false, status: 403, message: '未授权访问：令牌验证失败' }
  }
  if (env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== '*') {
    const origin = request.headers.get('Origin')
    const referer = request.headers.get('Referer')
    const allowedHost = new URL(env.ALLOWED_ORIGIN).host
    const originMatch = origin && new URL(origin).host === allowedHost
    const refererMatch = referer && new URL(referer).host === allowedHost
    if (!originMatch && !refererMatch) {
      return { ok: false, status: 403, message: '未授权访问：来源环境不匹配' }
    }
  }
  if (env.EXPECTED_CLIENT_ID) {
    const clientId = request.headers.get('X-Client-ID')
    if (clientId !== env.EXPECTED_CLIENT_ID) {
      return { ok: false, status: 403, message: '未授权访问：客户端指纹无效' }
    }
  }
  return { ok: true }
}

// ─── 调用 DeepSeek API ──────────────────────────────────────
async function callDeepSeek(apiKey, systemPrompt, userInput, forceJson = false) {
  const payload = {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput }
    ],
    temperature: 0.7,
    max_tokens: 8192,
    stream: false,
  }
  if (forceJson) {
    payload.response_format = { type: 'json_object' }
  }
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    console.error(`DeepSeek API error [${response.status}]:`, errText)
    throw new Error(`AI 服务暂时不可用 (DeepSeek ${response.status})`)
  }
  const data = await response.json()
  if (data.choices && data.choices[0]) {
    return data.choices[0].message.content
  }
  throw new Error('DeepSeek 返回数据格式异常')
}

// ─── 调用 Gemini API ────────────────────────────────────────
async function callGemini(apiKey, systemPrompt, userInput, forceJson = false) {
  const model = 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const genConfig = {
    temperature: 0.7,
    maxOutputTokens: 8192,
  }
  if (forceJson) {
    genConfig.responseMimeType = 'application/json'
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userInput }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: genConfig,
    }),
  })
  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    console.error(`Gemini API error [${response.status}]:`, errText)
    throw new Error(`AI 服务暂时不可用 (Gemini ${response.status})`)
  }
  const data = await response.json()
  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    return data.candidates[0].content.parts.map(p => p.text).join('')
  }
  throw new Error('Gemini 返回数据格式异常')
}

// ─── Whisper ASR 音频转写 ───────────────────────────────────
async function callWhisper(apiKey, audioBase64, mimeType) {
  // 将 base64 转为 Uint8Array
  const binaryStr = atob(audioBase64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  const ext = mimeType.includes('mp4') ? 'mp4' :
              mimeType.includes('wav') ? 'wav' :
              mimeType.includes('flac') ? 'flac' :
              mimeType.includes('aac') ? 'aac' : 'mp3'
  const blob = new Blob([bytes], { type: mimeType })
  const formData = new FormData()
  formData.append('file', blob, `audio.${ext}`)
  formData.append('model', 'whisper-1')
  formData.append('language', 'zh')
  formData.append('response_format', 'verbose_json')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  })
  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    console.error(`Whisper API error [${response.status}]:`, errText)
    throw new Error(`音频转写服务暂时不可用 (Whisper ${response.status})`)
  }
  const data = await response.json()
  return data.text || ''
}

// ─── 工具分类 ──────────────────────────────────────────────
const JSON_TOOLS = ['finance_audit']  // 强制 JSON 输出的工具

// ─── 输入长度限制 ──────────────────────────────────────────
const INPUT_LIMITS = {
  writer: 10000,
  auditor: 10000,
  converter: 10000,
  hr_resume: 30000,
  finance_audit: 50000,
  ocr_corrector: 30000,
  audio_transcriber: 50000,
}

// ─── 主入口 ─────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: '方法不允许', code: 405 }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authResult = verifyFingerprint(request, env)
    if (!authResult.ok) {
      return new Response(
        JSON.stringify({ error: authResult.message, code: authResult.status }),
        { status: authResult.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    try {
      const body = await request.json()
      const { user_input, tool_type, raw_audio, audio_mime } = body

      // 参数校验
      if (!tool_type || !SYSTEM_PROMPTS[tool_type]) {
        return new Response(
          JSON.stringify({ error: '无效的工具类型', code: 400, valid_types: Object.keys(SYSTEM_PROMPTS) }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const limit = INPUT_LIMITS[tool_type] || 10000
      let inputText = user_input || ''

      // ── 音频转写流程（检测到 raw_audio 时自动触发）─────────
      if (raw_audio) {
        if (!env.WHISPER_API_KEY) {
          return new Response(
            JSON.stringify({ error: '音频转写服务未配置 (缺少 WHISPER_API_KEY)', code: 503 }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        // 第一步：Whisper ASR 转写音频为文本
        const rawText = await callWhisper(env.WHISPER_API_KEY, raw_audio, audio_mime || 'audio/mpeg')
        // 第二步：将转写文本作为输入，交给当前 tool_type 的 Agent 纠错处理
        inputText = rawText
      }

      // 文本长度校验
      if (!inputText || inputText.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: '输入内容为空', code: 400 }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (inputText.length > limit) {
        return new Response(
          JSON.stringify({ error: `输入内容过长，请控制在 ${limit} 字以内`, code: 400 }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const systemPrompt = SYSTEM_PROMPTS[tool_type]
      const forceJson = JSON_TOOLS.includes(tool_type)

      // 根据配置选择 API 引擎
      const provider = (env.MODEL_PROVIDER || 'deepseek').toLowerCase()
      let result

      if (provider === 'gemini' && env.GEMINI_API_KEY) {
        result = await callGemini(env.GEMINI_API_KEY, systemPrompt, inputText.trim(), forceJson)
      } else {
        result = await callDeepSeek(env.DEEPSEEK_API_KEY, systemPrompt, inputText.trim(), forceJson)
      }

      return new Response(
        JSON.stringify({
          success: true,
          choices: [{ message: { content: result } }],
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'X-Content-Type': 'ai-response',
          },
        }
      )

    } catch (error) {
      console.error('Worker processing error:', error.message)
      return new Response(
        JSON.stringify({ error: error.message || '服务器内部错误', code: 500 }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }
}
