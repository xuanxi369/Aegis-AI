import { ref, watch } from 'vue'

// 从本地存储读取用户上次选择的语言，默认简体中文
export const currentLang = ref(localStorage.getItem('aegis_lang') || 'zh-CN')

// 监听语言变化并保存
watch(currentLang, (newLang) => {
  localStorage.setItem('aegis_lang', newLang)
})

// 翻译字典 (以简体中文为 Key)
const dictionary = {
  'zh-TW': {
    '智驭未来办公': '智馭未來辦公', '释放极简效能': '釋放極簡效能', '全新视觉 · 企业效能引擎': '全新視覺 · 企業效能引擎', '进入功能中枢': '進入功能中樞',
    '模块大厅': '模組大廳', '欢迎回来，探索智能模块': '歡迎回來，探索智能模組', '选择一个专门配置的 AI Agent 开始您的工作': '選擇一個專門配置的 AI Agent 開始您的工作',
    '开始使用': '開始使用', '全模式支持': '全模式支援', '返回大厅': '返回大廳', '📂 历史记录': '📂 歷史記錄',
    '提供分析内容': '提供分析內容', '填入示例': '填入示例', '📝 文本段落描述': '📝 文本段落描述', '📄 完整文件解析': '📄 完整文件解析',
    '点击或拖拽上传文件': '點擊或拖拽上傳文件', '🚀 立即执行 AI 分析': '🚀 立即執行 AI 分析', '深度运算中': '深度運算中', '⏹ 取消': '⏹ 取消',
    '输出结果': '輸出結果', '⤢ 展开': '⤢ 展開', '复制': '複製', '导出 PDF': '導出 PDF', '沉浸式阅读': '沉浸式閱讀', '⤡ 收回': '⤡ 收回',
    '安全导出设定': '安全導出設定', '取消': '取消', '确认下载': '確認下載',
    // --- 六大模块动态数据补充 ---
    '公文·精研撰写': '公文·精研撰寫', '输入核心要点，AI 自动生成结构化、去口语化的高质量公文': '輸入核心要點，AI 自動生成結構化、去口語化的高質量公文',
    '法务·合同审核': '法務·合約審核', '上传合同文本，AI 自动进行条款风险诊断与漏洞提示': '上傳合約文本，AI 自動進行條款風險診斷與漏洞提示',
    '人事·简历透视': '人事·履歷透視', '上传简历文件，AI 深度拆解分析候选人潜力与风险': '上傳履歷文件，AI 深度拆解分析候選人潛力與風險',
    '格式化转换器': '格式化轉換器', '粘贴会议纪要或笔记，AI 提取标准任务清单': '粘貼會議紀要或筆記，AI 提取標準任務清單',
    '财务·智能审计': '財務·智能審計', '上传财务报表或单据，AI 自动抓取异常数据并评估风险': '上傳財務報表或單據，AI 自動抓取異常數據並評估風險',
    '会议·纪要提取': '會議·紀要提取', '上传会议录音，AI 自动识别语音并提取核心结论与代办': '上傳會議錄音，AI 自動識別語音並提取核心結論與代辦',
    '支持 PDF, Word, TXT 等格式文本提取': '支援 PDF, Word, TXT 等格式文本提取', '支持上传录音或音视频提取': '支援上傳錄音或音視頻提取'
  },
  'en': {
    '智驭未来办公': 'Smart Future Workspace', '释放极简效能': 'Unleash Minimalist Efficiency', '全新视觉 · 企业效能引擎': 'New Vision · Enterprise Engine', '进入功能中枢': 'Enter Dashboard',
    '模块大厅': 'Module Lobby', '欢迎回来，探索智能模块': 'Welcome back, explore smart modules', '选择一个专门配置的 AI Agent 开始您的工作': 'Select an AI Agent to begin your work',
    '开始使用': 'Start ↗', '全模式支持': 'All Modes', '返回大厅': '← Back to Lobby', '📂 历史记录': '📂 History',
    '提供分析内容': 'Provide Content', '填入示例': 'Fill Example', '📝 文本段落描述': '📝 Text Input', '📄 完整文件解析': '📄 File Parse',
    '点击或拖拽上传文件': 'Click or Drag to Upload', '🚀 立即执行 AI 分析': '🚀 Run AI Analysis', '深度运算中': 'Computing...', '⏹ 取消': '⏹ Cancel',
    '输出结果': 'Output Result', '⤢ 展开': '⤢ Expand', '复制': 'Copy', '导出 PDF': 'Export PDF', '沉浸式阅读': 'Immersive Reading', '⤡ 收回': '⤡ Collapse',
    '安全导出设定': 'Secure Export Settings', '取消': 'Cancel', '确认下载': 'Confirm Download',
    // --- 六大模块动态数据补充 ---
    '公文·精研撰写': 'Doc · Refined Writing', '输入核心要点，AI 自动生成结构化、去口语化的高质量公文': 'Input key points, AI generates structured & professional docs.',
    '法务·合同审核': 'Legal · Contract Review', '上传合同文本，AI 自动进行条款风险诊断与漏洞提示': 'Upload contract, AI diagnoses clause risks and loopholes.',
    '人事·简历透视': 'HR · Resume Analysis', '上传简历文件，AI 深度拆解分析候选人潜力与风险': 'Upload resume, AI deeply analyzes candidate potential and risks.',
    '格式化转换器': 'Format Converter', '粘贴会议纪要或笔记，AI 提取标准任务清单': 'Paste notes, AI extracts standard task lists.',
    '财务·智能审计': 'Finance · Smart Audit', '上传财务报表或单据，AI 自动抓取异常数据并评估风险': 'Upload financial docs, AI detects anomalies and assesses risks.',
    '会议·纪要提取': 'Meeting · Minutes Extraction', '上传会议录音，AI 自动识别语音并提取核心结论与代办': 'Upload audio, AI extracts core conclusions and to-dos.',
    '支持 PDF, Word, TXT 等格式文本提取': 'Supports PDF, Word, TXT extraction', '支持上传录音或音视频提取': 'Supports audio/video extraction'
  },
  'ja': {
    '智驭未来办公': '未来のオフィスを制御', '释放极简效能': '極限の効率を解放', '全新视觉 · 企业效能引擎': '新ビジョン · 企業効率化エンジン', '进入功能中枢': 'ダッシュボードへ',
    '模块大厅': 'モジュールロビー', '欢迎回来，探索智能模块': 'お帰りなさい、モジュールを探索', '选择一个专门配置的 AI Agent 开始您的工作': 'AIエージェントを選択して開始',
    '开始使用': '開始 ↗', '全模式支持': '全モード対応', '返回大厅': '← ロビーに戻る', '📂 历史记录': '📂 履歴',
    '提供分析内容': '分析内容を提供', '填入示例': '例を入力', '📝 文本段落描述': '📝 テキスト入力', '📄 完整文件解析': '📄 ファイル解析',
    '点击或拖拽上传文件': 'クリックまたはドラッグしてアップロード', '🚀 立即执行 AI 分析': '🚀 AI分析を実行', '深度运算中': '計算中...', '⏹ 取消': '⏹ キャンセル',
    '输出结果': '出力結果', '⤢ 展开': '⤢ 展開', '复制': 'コピー', '导出 PDF': 'PDF出力', '沉浸式阅读': '没入型読書', '⤡ 收回': '⤡ 閉じる',
    '安全导出设定': '安全エクスポート設定', '取消': 'キャンセル', '确认下载': 'ダウンロード確認',
    // --- 六大模块动态数据补充 ---
    '公文·精研撰写': '公文書作成', '输入核心要点，AI 自动生成结构化、去口语化的高质量公文': '要点を入力し、AIが構造化された高品質な公文書を生成します',
    '法务·合同审核': '法務・契約書審査', '上传合同文本，AI 自动进行条款风险诊断与漏洞提示': '契約書をアップロードし、AIがリスク診断を行います',
    '人事·简历透视': '人事・履歴書分析', '上传简历文件，AI 深度拆解分析候选人潜力与风险': '履歴書をアップロードし、候補者の潜在能力とリスクを分析します',
    '格式化转换器': 'フォーマット変換', '粘贴会议纪要或笔记，AI 提取标准任务清单': 'メモを貼り付け、AIがタスクリストを抽出します',
    '财务·智能审计': '財務・スマート監査', '上传财务报表或单据，AI 自动抓取异常数据并评估风险': '財務諸表をアップロードし、異常データを検出します',
    '会议·纪要提取': '会議・議事録抽出', '上传会议录音，AI 自动识别语音并提取核心结论与代办': '音声をアップロードし、結論とTo-Doを抽出します',
    '支持 PDF, Word, TXT 等格式文本提取': 'PDF, Word, TXT をサポート', '支持上传录音或音视频提取': '音声/動画のアップロードをサポート'
  }
}

export function t(text) {
  if (!text) return ''
  if (currentLang.value === 'zh-CN') return text
  return dictionary[currentLang.value]?.[text] || text
}
