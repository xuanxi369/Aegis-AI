// ============================================================
// API 配置 — 部署前请务必修改以下三项
// ============================================================

// ⚠️ 替换为你的 Cloudflare Worker 部署地址
const WORKER_URL = 'https://aegis-worker.millychck-033.workers.dev'

// ⚠️ 替换为你在 Worker 中设置的 AUTH_TOKEN（必须一致）
const AUTH_TOKEN = 'dcfdfb354856b9f5df0c3bb880821363'

// ⚠️ 替换为你在 Worker 中设置的 EXPECTED_CLIENT_ID（若启用了客户端指纹验证）
// 若 Worker 未配置此值，则留空字符串即可
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
 * 调用 AI 工具
 * @param {string} toolType - 工具类型: 'writer' | 'auditor' | 'converter'
 * @param {string} userInput - 用户输入文本
 * @returns {Promise<string>} AI 返回的 Markdown 文本
 */
export async function callAI(toolType, userInput) {
  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      tool_type: toolType,
      user_input: userInput,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '请求失败' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  // 统一返回格式：支持 DeepSeek 格式和 Worker 包装格式
  if (data.success && data.choices && data.choices[0]) {
    return data.choices[0].message.content
  }

  // 兼容直接透传的 DeepSeek 格式
  if (data.choices && data.choices[0]) {
    return data.choices[0].message.content
  }

  throw new Error('AI 返回数据格式异常')
}

/**
 * 工具配置
 */
export const TOOLS_CONFIG = {
  writer: {
    id: 'writer',
    name: '智能文书助手',
    icon: '📝',
    description: '输入零散要点，AI 自动转换为结构化职场公文',
    color: 'blue',
    placeholder: `在此输入你的周报要点，例如：

这周做了用户系统的重构，修了几个bug
和财务那边沟通了预算的事，他们说要下周才能批
下周计划开始做移动端适配
组里新来了个实习生，我带了他两天
项目整体进度大概完成了60%...`,
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
    name: '合同/文档审核',
    icon: '🔍',
    description: '粘贴合同或文档文本，AI 自动扫描合规风险',
    color: 'pink',
    placeholder: `在此粘贴需要审核的合同或文档内容，例如：

甲方应在合同签署后30个工作日内完成系统交付。
如乙方未按时付款，甲方有权暂停服务。
双方发生争议应协商解决...`,
    example: `技术服务合同（节选）

第三条 服务内容与交付
甲方应在合同签署后30个工作日内完成系统的开发与部署工作，包括但不限于：需求分析、系统设计、编码开发、测试验收。最终交付物包括完整源代码、部署文档及操作手册。

第四条 付款方式
乙方应在合同签署后15个工作日内支付首期款项人民币50,000元整。尾款人民币30,000元整应在系统验收通过后10个工作日内支付。如乙方未按时支付任何一期款项，甲方有权暂停所有服务且不承担任何违约责任。

第五条 违约责任
如甲方未能在约定时间内完成交付，每延迟一天应向乙方支付合同总额0.5%的违约金，但违约金总额不超过合同总额的20%。如延迟超过30天，乙方有权解除合同。

第六条 知识产权
本合同项下开发的所有软件及相关文档的知识产权归甲方所有。乙方仅有权在合同期限内使用该系统。

第七条 争议解决
双方因本合同发生争议，应首先通过友好协商解决。协商不成的，任何一方均可向甲方所在地人民法院提起诉讼。`,
  },
  converter: {
    id: 'converter',
    name: '格式化转换器',
    icon: '🔄',
    description: '粘贴会议纪要或笔记，AI 提取标准任务清单',
    color: 'green',
    placeholder: `在此粘贴会议纪要或工作笔记，例如：

今天开会讨论了新项目，张三说他负责前端，下周二之前搞定。李四那边后端接口还没写完，可能要到月底。王五提到客户那边催得紧，预算要尽快确认...`,
    example: `【3月15日 周一例会纪要】

参会人员：张三、李四、王五、赵六

一、项目进度同步
张三反馈：前端页面重构工作已完成80%，剩余用户中心模块预计下周二（3月19日）前完成。需要设计组尽快提供新的UI稿。
李四反馈：后端API接口开发进度滞后，目前只完成了用户模块和订单模块，其他模块预计要到3月底才能全部完成。原因是接口文档不清晰，需要和产品组再对齐。
王五提到：甲方客户对项目进度非常关注，已经催了三次，要求我们在本月底前完成第一版交付。预算方面，追加的10万预算还需要走审批流程，王五说这周内搞定。

二、问题讨论
赵六提出测试环境不稳定，经常出现数据丢失问题，严重影响了测试效率。建议运维组本周内解决。
张三和李四需要在本周三之前完成一次前后端联调。

三、下周安排
1. 张三完成用户中心前端开发
2. 李四优先完成订单模块的接口文档
3. 王五跟进预算审批
4. 赵六协调运维解决测试环境问题
5. 全员周五下午3点进行代码评审`,
  },
}
