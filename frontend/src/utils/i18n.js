import { ref, watch } from 'vue'

export const currentLang = ref(localStorage.getItem('aegis_lang') || 'zh-CN')

watch(currentLang, (newLang) => {
  localStorage.setItem('aegis_lang', newLang)
})

const dictionary = {
  'zh-TW': {
    '智驭未来办公': '智馭未來辦公', '释放极简效能': '釋放極簡效能', '全新视觉 · 企业效能引擎': '全新視覺 · 企業效能引擎', '进入功能中枢': '進入功能中枢',
    '模块大厅': '模組大廳', '欢迎回来，探索智能模块': '歡迎回來，探索智能模組', '选择一个专门配置的 AI Agent 开始您的工作': '選擇一個專門配置的 AI Agent 開始您的工作',
    '开始使用': '開始使用', '全模式支持': '全模式支援', '返回大厅': '返回大廳', '📂 历史记录': '📂 歷史記錄',
    '提供分析内容': '提供分析內容', '填入示例': '填入示例', '📝 文本段落描述': '📝 文本段落描述', '📄 完整文件解析': '📄 完整文件解析',
    '点击或拖拽上传文件': '點擊或拖拽上傳文件', '🚀 立即执行 AI 分析': '🚀 立即執行 AI 分析', '深度运算中': '深度運算中', '⏹ 取消': '⏹ 取消',
    '输出结果': '輸出結果', '⤢ 展开': '⤢ 展開', '复制': '複製', '导出 PDF': '導出 PDF', '沉浸式阅读': '沉浸式閱讀', '⤡ 收回': '⤡ 收回',
    '安全导出设定': '安全導出設定', '取消': '取消', '确认下载': '確認下載',
    // --- 模块与提示语 ---
    '公文·精研撰写': '公文·精研撰寫', '输入核心要点，AI 自动生成结构化、去口语化的高质量公文': '輸入核心要點，AI 自動生成結構化、去口語化的高質量公文',
    '法务·合同审核': '法務·合約審核', '上传合同文本，AI 自动进行条款风险诊断与漏洞提示': '上傳合約文本，AI 自動進行條款風險診斷與漏洞提示',
    '人事·简历透视': '人事·履歷透視', '上传简历文件，AI 深度拆解分析候选人潜力与风险': '上傳履歷文件，AI 深度拆解分析候選人潛力與風險',
    '格式化转换器': '格式化轉換器', '粘贴会议纪要或笔记，AI 提取标准任务清单': '粘貼會議紀要或筆記，AI 提取標準任務清單',
    '财务·智能审计': '財務·智能審計', '上传财务报表或单据，AI 自动抓取异常数据并评估风险': '上傳財務報表或單據，AI 自動抓取異常數據並評估風險',
    '会议·纪要提取': '會議·紀要提取', '上传会议录音，AI 自动识别语音并提取核心结论与代办': '上傳會議錄音，AI 自動識別語音並提取核心結論與代辦',
    '支持 PDF, Word, TXT 等格式文本提取': '支援 PDF, Word, TXT 等格式文本提取', '支持上传录音或音视频提取': '支援上傳錄音或音視頻提取',
    // --- 深度交互与 Toast ---
    '暂无历史记录': '暫無歷史記錄', '最近处理历史': '最近處理歷史', '清空历史': '清空歷史', '载入此记录 →': '載入此記錄 →',
    '⚠️ 文件过大': '⚠️ 文件過大', '🎵 音频就绪: ': '🎵 音頻就緒: ', '✅ 解析完成': '✅ 解析完成', '❌ 解析失败': '❌ 解析失敗',
    '⚠️ 请先上传': '⚠️ 請先上傳', '⚠️ 内容过短': '⚠️ 內容過短', '复制成功': '複製成功', '历史记录已清空': '歷史記錄已清空',
    '在此输入您需要分析的具体段落或描述内容...': '在此輸入您需要分析的具體段落或描述內容...', 'Aegis AI 效能中枢 · 安全报告': 'Aegis AI 效能中樞 · 安全報告'
  },
  'en': {
    '智驭未来办公': 'Smart Future Workspace', '释放极简效能': 'Unleash Minimalist Efficiency', '全新视觉 · 企业效能引擎': 'New Vision · Enterprise Engine', '进入功能中枢': 'Enter Dashboard',
    '模块大厅': 'Module Lobby', '欢迎回来，探索智能模块': 'Welcome back, explore smart modules', '选择一个专门配置的 AI Agent 开始您的工作': 'Select an AI Agent to begin your work',
    '开始使用': 'Start ↗', '全模式支持': 'All Modes', '返回大厅': '← Back to Lobby', '📂 历史记录': '📂 History',
    '提供分析内容': 'Provide Content', '填入示例': 'Fill Example', '📝 文本段落描述': '📝 Text Input', '📄 完整文件解析': '📄 File Parse',
    '点击或拖拽上传文件': 'Click or Drag to Upload', '🚀 立即执行 AI 分析': '🚀 Run AI Analysis', '深度运算中': 'Computing...', '⏹ 取消': '⏹ Cancel',
    '输出结果': 'Output Result', '⤢ 展开': '⤢ Expand', '复制': 'Copy', '导出 PDF': 'Export PDF', '沉浸式阅读': 'Immersive Reading', '⤡ 收回': '⤡ Collapse',
    '安全导出设定': 'Secure Export Settings', '取消': 'Cancel', '确认下载': 'Confirm Download',
    '公文·精研撰写': 'Doc · Refined Writing', '输入核心要点，AI 自动生成结构化、去口语化的高质量公文': 'Input key points, AI generates structured & professional docs.',
    '法务·合同审核': 'Legal · Contract Review', '上传合同文本，AI 自动进行条款风险诊断与漏洞提示': 'Upload contract, AI diagnoses clause risks and loopholes.',
    '人事·简历透视': 'HR · Resume Analysis', '上传简历文件，AI 深度拆解分析候选人潜力与风险': 'Upload resume, AI deeply analyzes candidate potential and risks.',
    '格式化转换器': 'Format Converter', '粘贴会议纪要或笔记，AI 提取标准任务清单': 'Paste notes, AI extracts standard task lists.',
    '财务·智能审计': 'Finance · Smart Audit', '上传财务报表或单据，AI 自动抓取异常数据并评估风险': 'Upload financial docs, AI detects anomalies and assesses risks.',
    '会议·纪要提取': 'Meeting · Minutes Extraction', '上传会议录音，AI 自动识别语音并提取核心结论与代办': 'Upload audio, AI extracts core conclusions and to-dos.',
    '支持 PDF, Word, TXT 等格式文本提取': 'Supports PDF, Word, TXT extraction', '支持上传录音或音视频提取': 'Supports audio/video extraction',
    '暂无历史记录': 'No history records', '最近处理历史': 'Recent History', '清空历史': 'Clear History', '载入此记录 →': 'Load this record →',
    '⚠️ 文件过大': '⚠️ File too large', '🎵 音频就绪: ': '🎵 Audio ready: ', '✅ 解析完成': '✅ Parsing complete', '❌ 解析失败': '❌ Parsing failed',
    '⚠️ 请先上传': '⚠️ Please upload first', '⚠️ 内容过短': '⚠️ Content too short', '复制成功': 'Copy successful', '历史记录已清空': 'History cleared',
    '在此输入您需要分析的具体段落或描述内容...': 'Enter the specific paragraph or description to analyze...', 'Aegis AI 效能中枢 · 安全报告': 'Aegis AI Core · Security Report'
  },
  'ja': {
    '智驭未来办公': '未来のオフィスを制御', '释放极简效能': '極限の効率を解放', '全新视觉 · 企业效能引擎': '新ビジョン · 企業効率化エンジン', '进入功能中枢': 'ダッシュボードへ',
    '模块大厅': 'モジュールロビー', '欢迎回来，探索智能模块': 'お帰りなさい、モジュールを探索', '选择一个专门配置的 AI Agent 开始您的工作': 'AIエージェントを選択して開始',
    '开始使用': '開始 ↗', '全模式支持': '全モード対応', '返回大厅': '← ロビーに戻る', '📂 历史记录': '📂 履歴',
    '提供分析内容': '分析内容を提供', '填入示例': '例を入力', '📝 文本段落描述': '📝 テキスト入力', '📄 完整文件解析': '📄 ファイル解析',
    '点击或拖拽上传文件': 'クリックまたはドラッグしてアップロード', '🚀 立即执行 AI 分析': '🚀 AI分析を実行', '深度运算中': '計算中...', '⏹ 取消': '⏹ キャンセル',
    '输出结果': '出力結果', '⤢ 展开': '⤢ 展開', '复制': 'コピー', '导出 PDF': 'PDF出力', '沉浸式阅读': '没入型読書', '⤡ 收回': '⤡ 閉じる',
    '安全导出设定': '安全エクスポート設定', '取消': 'キャンセル', '确认下载': 'ダウンロード確認',
    '公文·精研撰写': '公文書作成', '输入核心要点，AI 自动生成结构化、去口语化的高质量公文': '要点を入力し、AIが構造化された高品質な公文書を生成します',
    '法务·合同审核': '法務・契約書審査', '上传合同文本，AI 自动进行条款风险诊断与漏洞提示': '契約書をアップロードし、AIがリスク診断を行います',
    '人事·简历透视': '人事・履歴書分析', '上传简历文件，AI 深度拆解分析候选人潜力与风险': '履歴書をアップロードし、候補者の潜在能力とリスクを分析します',
    '格式化转换器': 'フォーマット変換', '粘贴会议纪要或笔记，AI 提取标准任务清单': 'メモを貼り付け、AIがタスクリストを抽出します',
    '财务·智能审计': '財務・スマート監査', '上传财务报表或单据，AI 自动抓取异常数据并评估风险': '財務諸表をアップロードし、異常データを検出します',
    '会议·纪要提取': '会議・議事録抽出', '上传会议录音，AI 自动识别语音并提取核心结论与代办': '音声をアップロードし、結論とTo-Doを抽出します',
    '支持 PDF, Word, TXT 等格式文本提取': 'PDF, Word, TXT をサポート', '支持上传录音或音视频提取': '音声/動画のアップロードをサポート',
    '暂无历史记录': '履歴がありません', '最近处理历史': '最近の処理履歴', '清空历史': '履歴をクリア', '载入此记录 →': 'この記録を読み込む →',
    '⚠️ 文件过大': '⚠️ ファイルが大きすぎます', '🎵 音频就绪: ': '🎵 音声準備完了: ', '✅ 解析完成': '✅ 解析完了', '❌ 解析失败': '❌ 解析失敗',
    '⚠️ 请先上传': '⚠️ 先にアップロードしてください', '⚠️ 内容过短': '⚠️ 内容が短すぎます', '复制成功': 'コピー成功', '历史记录已清空': '履歴をクリアしました',
    '在此输入您需要分析的具体段落或描述内容...': '分析したい段落や詳細を入力してください...', 'Aegis AI 效能中枢 · 安全报告': 'Aegis AI · セキュリティレポート'
  },
  'de': {
    '智驭未来办公': 'Intelligenter Arbeitsplatz', '释放极简效能': 'Minimalistische Effizienz', '全新视觉 · 企业效能引擎': 'Neue Vision · Unternehmens-Engine', '进入功能中枢': 'Dashboard betreten',
    '模块大厅': 'Modul-Lobby', '欢迎回来，探索智能模块': 'Willkommen zurück', '选择一个专门配置的 AI Agent 开始您的工作': 'Wählen Sie einen AI-Agenten',
    '开始使用': 'Starten ↗', '全模式支持': 'Alle Modi', '返回大厅': '← Zurück', '📂 历史记录': '📂 Verlauf',
    '提供分析内容': 'Inhalt bereitstellen', '填入示例': 'Beispiel einfügen', '📝 文本段落描述': '📝 Texteingabe', '📄 完整文件解析': '📄 Dateianalyse',
    '点击或拖拽上传文件': 'Klicken oder ziehen', '🚀 立即执行 AI 分析': '🚀 Analyse ausführen', '深度运算中': 'Berechnung...', '⏹ 取消': '⏹ Abbrechen',
    '输出结果': 'Ergebnis', '⤢ 展开': '⤢ Erweitern', '复制': 'Kopieren', '导出 PDF': 'PDF exportieren', '沉浸式阅读': 'Immersives Lesen', '⤡ 收回': '⤡ Einklappen',
    '安全导出设定': 'Sichere Exporteinstellungen', '取消': 'Abbrechen', '确认下载': 'Download bestätigen',
    '暂无历史记录': 'Keine Historie', '最近处理历史': 'Letzter Verlauf', '清空历史': 'Verlauf löschen', '载入此记录 →': 'Laden →',
    '⚠️ 文件过大': '⚠️ Datei zu groß', '🎵 音频就绪: ': '🎵 Audio bereit: ', '✅ 解析完成': '✅ Analyse fertig', '❌ 解析失败': '❌ Fehler',
    '⚠️ 请先上传': '⚠️ Bitte zuerst hochladen', '⚠️ 内容过短': '⚠️ Inhalt zu kurz', '复制成功': 'Erfolgreich kopiert', '历史记录已清空': 'Verlauf geleert',
    '在此输入您需要分析的具体段落或描述内容...': 'Geben Sie hier den zu analysierenden Text ein...', 'Aegis AI 效能中枢 · 安全报告': 'Aegis AI · Sicherheitsbericht'
  }
}

export function t(text) {
  if (!text) return ''
  if (currentLang.value === 'zh-CN') return text
  // 核心容错机制：如果你在 api.js 中改了长串的 Placeholder，字典里找不到时会自动显示原中文
  return dictionary[currentLang.value]?.[text] || text
}
