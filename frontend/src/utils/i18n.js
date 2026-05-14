import { ref, watch } from 'vue'

// 从本地存储读取用户上次选择的语言，默认简体中文
export const currentLang = ref(localStorage.getItem('aegis_lang') || 'zh-CN')

// 监听语言变化并保存
watch(currentLang, (newLang) => {
  localStorage.setItem('aegis_lang', newLang)
})

// 翻译字典 (以简体中文为 Key，方便你以后直接修改代码里的中文)
const dictionary = {
  'zh-TW': {
    '智驭未来办公': '智馭未來辦公', '释放极简效能': '釋放極簡效能', '全新视觉 · 企业效能引擎': '全新視覺 · 企業效能引擎', '进入功能中枢': '進入功能中樞',
    '模块大厅': '模組大廳', '欢迎回来，探索智能模块': '歡迎回來，探索智能模組', '选择一个专门配置的 AI Agent 开始您的工作': '選擇一個專門配置的 AI Agent 開始您的工作',
    '开始使用': '開始使用', '全模式支持': '全模式支援', '返回大厅': '返回大廳', '📂 历史记录': '📂 歷史記錄',
    '提供分析内容': '提供分析內容', '填入示例': '填入示例', '📝 文本段落描述': '📝 文本段落描述', '📄 完整文件解析': '📄 完整文件解析',
    '点击或拖拽上传文件': '點擊或拖拽上傳文件', '🚀 立即执行 AI 分析': '🚀 立即執行 AI 分析', '深度运算中': '深度運算中', '⏹ 取消': '⏹ 取消',
    '输出结果': '輸出結果', '⤢ 展开': '⤢ 展開', '复制': '複製', '导出 PDF': '導出 PDF', '沉浸式阅读': '沉浸式閱讀', '⤡ 收回': '⤡ 收回',
    '安全导出设定': '安全導出設定', '取消': '取消', '确认下载': '確認下載'
  },
  'en': {
    '智驭未来办公': 'Smart Future Workspace', '释放极简效能': 'Unleash Minimalist Efficiency', '全新视觉 · 企业效能引擎': 'New Vision · Enterprise Engine', '进入功能中枢': 'Enter Dashboard',
    '模块大厅': 'Module Lobby', '欢迎回来，探索智能模块': 'Welcome back, explore smart modules', '选择一个专门配置的 AI Agent 开始您的工作': 'Select an AI Agent to begin your work',
    '开始使用': 'Start ↗', '全模式支持': 'All Modes', '返回大厅': '← Back to Lobby', '📂 历史记录': '📂 History',
    '提供分析内容': 'Provide Content', '填入示例': 'Fill Example', '📝 文本段落描述': '📝 Text Description', '📄 完整文件解析': '📄 Full File Parse',
    '点击或拖拽上传文件': 'Click or Drag to Upload', '🚀 立即执行 AI 分析': '🚀 Run AI Analysis', '深度运算中': 'Computing...', '⏹ 取消': '⏹ Cancel',
    '输出结果': 'Output Result', '⤢ 展开': '⤢ Expand', '复制': 'Copy', '导出 PDF': 'Export PDF', '沉浸式阅读': 'Immersive Reading', '⤡ 收回': '⤡ Collapse',
    '安全导出设定': 'Secure Export Settings', '取消': 'Cancel', '确认下载': 'Confirm Download'
  },
  'ja': {
    '智驭未来办公': '未来のオフィスを制御', '释放极简效能': '極限の効率を解放', '全新视觉 · 企业效能引擎': '新ビジョン · 企業効率化エンジン', '进入功能中枢': 'ダッシュボードへ',
    '模块大厅': 'モジュールロビー', '欢迎回来，探索智能模块': 'お帰りなさい、モジュールを探索', '选择一个专门配置的 AI Agent 开始您的工作': 'AIエージェントを選択して開始',
    '开始使用': '開始 ↗', '全模式支持': '全モード対応', '返回大厅': '← ロビーに戻る', '📂 历史记录': '📂 履歴',
    '提供分析内容': '分析内容を提供', '填入示例': '例を入力', '📝 文本段落描述': '📝 テキスト入力', '📄 完整文件解析': '📄 ファイル解析',
    '点击或拖拽上传文件': 'クリックまたはドラッグしてアップロード', '🚀 立即执行 AI 分析': '🚀 AI分析を実行', '深度运算中': '計算中...', '⏹ 取消': '⏹ キャンセル',
    '输出结果': '出力結果', '⤢ 展开': '⤢ 展開', '复制': 'コピー', '导出 PDF': 'PDF出力', '沉浸式阅读': '没入型読書', '⤡ 收回': '⤡ 閉じる'
  },
  'ko': {
    '智驭未来办公': '스마트 미래 사무실', '释放极简效能': '극한의 효율성 해방', '全新视觉 · 企业效能引擎': '새로운 비전 · 기업 엔진', '进入功能中枢': '대시보드 진입',
    '模块大厅': '모듈 로비', '欢迎回来，探索智能模块': '환영합니다, 모듈 탐색', '选择一个专门配置的 AI Agent 开始您的工作': 'AI 에이전트를 선택하여 시작하세요',
    '开始使用': '시작하기 ↗', '全模式支持': '모든 모드 지원', '返回大厅': '← 로비로 돌아가기', '📂 历史记录': '📂 기록',
    '提供分析内容': '분석 내용 제공', '填入示例': '예제 채우기', '📝 文本段落描述': '📝 텍스트 입력', '📄 完整文件解析': '📄 파일 구문 분석',
    '点击或拖拽上传文件': '클릭하거나 드래그하여 업로드', '🚀 立即执行 AI 分析': '🚀 AI 분석 실행', '深度运算中': '계산 중...', '⏹ 取消': '⏹ 취소',
    '输出结果': '출력 결과', '⤢ 展开': '⤢ 확장', '复制': '복사', '导出 PDF': 'PDF 내보내기', '沉浸式阅读': '몰입형 읽기', '⤡ 收回': '⤡ 축소'
  },
  'de': {
    '智驭未来办公': 'Intelligenter Arbeitsplatz', '释放极简效能': 'Minimalistische Effizienz', '全新视觉 · 企业效能引擎': 'Neue Vision · Unternehmens-Engine', '进入功能中枢': 'Dashboard betreten',
    '模块大厅': 'Modul-Lobby', '欢迎回来，探索智能模块': 'Willkommen zurück', '选择一个专门配置的 AI Agent 开始您的工作': 'Wählen Sie einen AI-Agenten',
    '开始使用': 'Starten ↗', '全模式支持': 'Alle Modi', '返回大厅': '← Zurück zur Lobby', '📂 历史记录': '📂 Verlauf',
    '提供分析内容': 'Inhalt bereitstellen', '填入示例': 'Beispiel einfügen', '📝 文本段落描述': '📝 Textbeschreibung', '📄 完整文件解析': '📄 Dateianalyse',
    '点击或拖拽上传文件': 'Klicken oder ziehen zum Hochladen', '🚀 立即执行 AI 分析': '🚀 AI-Analyse ausführen', '深度运算中': 'Berechnung...', '⏹ 取消': '⏹ Abbrechen',
    '输出结果': 'Ergebnis', '⤢ 展开': '⤢ Erweitern', '复制': 'Kopieren', '导出 PDF': 'PDF exportieren', '沉浸式阅读': 'Immersives Lesen', '⤡ 收回': '⤡ Einklappen'
  }
}

// 核心翻译函数：如果在字典中找不到，就直接返回原简体中文
export function t(text) {
  if (currentLang.value === 'zh-CN') return text
  return dictionary[currentLang.value]?.[text] || text
}
