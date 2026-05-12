// ============================================================
// Aegis Worker — 企业级 AI 效能中枢 · 核心中转逻辑
// ============================================================
// 功能：
//   1. CORS 预检处理
//   2. 多维度环境指纹鉴权（Token + Origin + ClientID）
//   3. 根据 tool_type 注入隐藏 System Prompt
//   4. 双引擎 API 代理（DeepSeek / Gemini）
//   5. 速率限制响应头
//   6. 返回 AI 推理结果
// ============================================================

// ─── 隐藏的 System Prompt（前端不可见，核心壁垒）──────────────
const SYSTEM_PROMPTS = {
  // ─── 智能文书助手 ──────────────────────────────────────────
  writer: `你是一位拥有15年经验的资深大厂总办秘书。你的任务是将用户提供的零散信息转换为专业、得体的职场公文（如周报、计划书、请示报告）。

执行标准：
  1. 结构化：必须包含『关键进展』、『风险预警』、『后续计划』三个核心板块。
  2. 去口语化：将『我做了...』替换为『主导完成了...』，将『大概有...』替换为『经统计，数据约为...』，将『还行』替换为『进展符合预期』。
  3. 行业适配：默认背景为氢能源共享出行行业，自动补全行业术语（如：能源调度、车辆周转率、低碳足迹、碳减排指标、出行订单量）。
  4. 数据保守：仅基于用户提供的要点进行专业扩充，严禁捏造虚假的具体数字。若用户未提及数据，可使用"约X%"等模糊表述并标注"（待确认）"。
  5. 格式要求：使用 Markdown 格式输出，层级清晰，关键信息加粗。

禁止事项：
  - 禁止编造用户未提供的具体业务数据
  - 禁止使用口语化表达
  - 禁止输出与职场公文无关的内容`,

  // ─── 合同/文档审核 ──────────────────────────────────────────
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

  // ─── 格式化转换器 ──────────────────────────────────────────
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
  - 如文本中无可提取的任务，输出："⚠️ 未检测到有效任务信息，请提供包含具体任务描述的文本。"`
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
  // 第一层：核心令牌验证
  const token = request.headers.get('X-Access-Token')
  if (!token || token !== env.AUTH_TOKEN) {
    return { ok: false, status: 403, message: '未授权访问：令牌验证失败' }
  }

  // 第二层：Origin 环境指纹验证（可选增强）
  if (env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== '*') {
    const origin = request.headers.get('Origin')
    const referer = request.headers.get('Referer')
    const allowedHost = new URL(env.ALLOWED_ORIGIN).host

    // 允许 Origin 匹配 OR Referer 匹配（兼容预览环境）
    const originMatch = origin && new URL(origin).host === allowedHost
    const refererMatch = referer && new URL(referer).host === allowedHost

    if (!originMatch && !refererMatch) {
      return { ok: false, status: 403, message: '未授权访问：来源环境不匹配' }
    }
  }

  // 第三层：客户端指纹验证（可选增强）
  if (env.EXPECTED_CLIENT_ID) {
    const clientId = request.headers.get('X-Client-ID')
    if (clientId !== env.EXPECTED_CLIENT_ID) {
      return { ok: false, status: 403, message: '未授权访问：客户端指纹无效' }
    }
  }

  return { ok: true }
}

// ─── 调用 DeepSeek API ──────────────────────────────────────
async function callDeepSeek(apiKey, systemPrompt, userInput) {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput }
      ],
      temperature: 0.7,
      max_tokens: 4096,
      stream: false,
    }),
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
async function callGemini(apiKey, systemPrompt, userInput) {
  const model = 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: userInput }] }
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    console.error(`Gemini API error [${response.status}]:`, errText)
    throw new Error(`AI 服务暂时不可用 (Gemini ${response.status})`)
  }

  const data = await response.json()
  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    const parts = data.candidates[0].content.parts
    return parts.map(p => p.text).join('')
  }
  throw new Error('Gemini 返回数据格式异常')
}

// ─── 主入口 ─────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(env)

    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // 仅允许 POST
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: '方法不允许', code: 405 }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 多维度环境指纹鉴权
    const authResult = verifyFingerprint(request, env)
    if (!authResult.ok) {
      return new Response(
        JSON.stringify({ error: authResult.message, code: authResult.status }),
        { status: authResult.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    try {
      const { user_input, tool_type } = await request.json()

      // 参数校验
      if (!user_input || typeof user_input !== 'string' || user_input.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: '请输入需要处理的内容', code: 400 }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!tool_type || !SYSTEM_PROMPTS[tool_type]) {
        return new Response(
          JSON.stringify({ error: '无效的工具类型', code: 400, valid_types: Object.keys(SYSTEM_PROMPTS) }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 输入长度限制（防止滥用）
      if (user_input.length > 10000) {
        return new Response(
          JSON.stringify({ error: '输入内容过长，请控制在 10000 字以内', code: 400 }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      

      const systemPrompt = SYSTEM_PROMPTS[tool_type]

      // 根据配置选择 API 引擎
      const provider = (env.MODEL_PROVIDER || 'deepseek').toLowerCase()
      let result

      if (provider === 'gemini' && env.GEMINI_API_KEY) {
        result = await callGemini(env.GEMINI_API_KEY, systemPrompt, user_input.trim())
      } else {
        // 默认使用 DeepSeek
        result = await callDeepSeek(env.DEEPSEEK_API_KEY, systemPrompt, user_input.trim())
      }

      // 返回结果（带速率限制提示头）
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
            'X-RateLimit-Policy': 'cloudflare-standard',
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
