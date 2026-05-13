<template>
  <div class="institution">

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="toolbar-label">資料日期</span>
        <span class="date-badge-lg">{{ apiDate || '載入中...' }}</span>
      </div>
      <div class="toolbar-right">
        <div class="search-bar">
          <input v-model="brokerQuery" placeholder="輸入股號查券商明細..." maxlength="10" @keydown.enter="loadBroker" />
          <button class="btn" @click="loadBroker">查券商</button>
        </div>
      </div>
    </div>

    <!-- 三大法人 -->
    <div v-if="instLoading" class="section-loading"><div class="spinner"></div><span>載入三大法人...</span></div>
    <div v-else-if="instError" class="section-error">⚠️ {{ instError }}</div>
    <template v-else-if="instData.length">
      <div class="section">
        <div class="section-header">
          <span class="section-title">🏦 三大法人買賣超排行</span>
          <div class="sub-tabs">
            <button v-for="t in instTabs" :key="t.value" class="stab"
              :class="{ active: instTab === t.value }" @click="instTab = t.value">{{ t.label }}</button>
          </div>
          <div class="sub-tabs" style="margin-left:12px;">
            <button class="stab" :class="{ active: instSort === 'buy' }" @click="instSort='buy'">買超排行</button>
            <button class="stab" :class="{ active: instSort === 'sell' }" @click="instSort='sell'">賣超排行</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th><th>股號</th><th>股名</th>
                <th v-if="instTab==='all'||instTab==='foreign'">外資(張)</th>
                <th v-if="instTab==='all'||instTab==='invest'">投信(張)</th>
                <th v-if="instTab==='all'||instTab==='dealer'">自營商(張)</th>
                <th>合計(張)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, idx) in sortedInstData" :key="r.股票代號">
                <td class="rank-cell">{{ idx + 1 }}</td>
                <td class="id-cell" @click="quickBroker(r.股票代號)">{{ r.股票代號 }}</td>
                <td>{{ r.股票名稱 }}</td>
                <td v-if="instTab==='all'||instTab==='foreign'" :class="numClass(r._foreign)">{{ fmtNum(r._foreign) }}</td>
                <td v-if="instTab==='all'||instTab==='invest'"  :class="numClass(r._invest)">{{ fmtNum(r._invest) }}</td>
                <td v-if="instTab==='all'||instTab==='dealer'"  :class="numClass(r._dealer)">{{ fmtNum(r._dealer) }}</td>
                <td :class="numClass(r._total)" class="total-cell">{{ fmtNum(r._total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- 券商買賣超（目前暫不支援，等待正確API） -->
    <div class="section" v-if="brokerStockId">
      <div class="section-header">
        <span class="section-title">🏢 {{ brokerStockId }} 各券商買賣超</span>
        <span class="date-badge">功能開發中</span>
      </div>
      <div class="section-error" style="color:var(--text3);">
        ⚠️ 券商進出明細 API 端點確認中，請稍候。
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const PROXY = 'https://twse-proxy.kerker.workers.dev'

const apiDate     = ref('')
const instData    = ref([])
const instLoading = ref(false)
const instError   = ref('')
const instTab     = ref('all')
const instSort    = ref('buy')
const brokerQuery   = ref('')
const brokerStockId = ref('')

const instTabs = [
  { label: '全部',   value: 'all'     },
  { label: '外資',   value: 'foreign' },
  { label: '投信',   value: 'invest'  },
  { label: '自營商', value: 'dealer'  },
]

// ── 排序 ──
const sortedInstData = computed(() => {
  const sign = instSort.value === 'buy' ? -1 : 1
  return [...instData.value]
    .filter(r => {
      if (instTab.value === 'foreign') return r._foreign !== 0
      if (instTab.value === 'invest')  return r._invest  !== 0
      if (instTab.value === 'dealer')  return r._dealer  !== 0
      return true
    })
    .sort((a, b) => {
      if (instTab.value === 'foreign') return sign * (b._foreign - a._foreign)
      if (instTab.value === 'invest')  return sign * (b._invest  - a._invest)
      if (instTab.value === 'dealer')  return sign * (b._dealer  - a._dealer)
      return sign * (b._total - a._total)
    })
    .slice(0, 50)
})

// ── 解析單一 API 回傳 → Map<股號, {name, net}> ──
function parseInst(json) {
  const map  = {}
  const rows = json.data || []
  rows.forEach(r => {
    const id  = r[1]?.toString().trim()
    if (!id || !/^\d{4,6}$/.test(id)) return
    const net = parseInt((r[5] || '0').toString().replace(/,/g, '')) || 0
    map[id] = { name: r[2]?.toString().trim() || '', net: Math.round(net / 1000) }
  })
  return map
}

// ── 抓三大法人（分三支 API 同時抓，再合併）──
async function loadInstitution() {
  instLoading.value = true
  instError.value   = ''
  instData.value    = []
  try {
    const [rForeign, rInvest, rDealer] = await Promise.all([
      fetch(`${PROXY}?api=TWT38U`).then(r => r.json()), // 外資
      fetch(`${PROXY}?api=TWT44U`).then(r => r.json()), // 投信
      fetch(`${PROXY}?api=TWT43U`).then(r => r.json()), // 自營
    ])

    // 取日期（外資回傳）
    if (rForeign.date) {
      const d = rForeign.date.toString()
      apiDate.value = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`
    }

    const foreignMap = parseInst(rForeign)
    const investMap  = parseInst(rInvest)
    const dealerMap  = parseInst(rDealer)

    // 合併所有出現過的股號
    const allIds = new Set([
      ...Object.keys(foreignMap),
      ...Object.keys(investMap),
      ...Object.keys(dealerMap),
    ])

    instData.value = [...allIds].map(id => {
      const name    = foreignMap[id]?.name || investMap[id]?.name || dealerMap[id]?.name || ''
      const foreign = foreignMap[id]?.net || 0
      const invest  = investMap[id]?.net  || 0
      const dealer  = dealerMap[id]?.net  || 0
      return {
        股票代號: id,
        股票名稱: name,
        _foreign: foreign,
        _invest:  invest,
        _dealer:  dealer,
        _total:   foreign + invest + dealer,
      }
    })

  } catch(e) {
    instError.value = `三大法人載入失敗：${e.message}`
    console.error(e)
  } finally {
    instLoading.value = false
  }
}

function quickBroker(id) {
  brokerQuery.value   = id
  brokerStockId.value = id
}

function loadBroker() {
  const kw = brokerQuery.value.trim()
  if (!kw) return
  brokerStockId.value = kw
}

function fmtNum(v) {
  if (v === null || v === undefined) return '-'
  return v.toLocaleString()
}
function numClass(v) {
  if (!v) return 'flat'
  return v > 0 ? 'up' : 'down'
}

onMounted(() => { loadInstitution() })
</script>

<style scoped>
.institution { display: flex; flex-direction: column; height: 100%; overflow-y: auto; padding: 16px 20px; gap: 20px; }
.institution::-webkit-scrollbar { width: 4px; }
.institution::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 10px; }
.toolbar-label { font-size: 12px; color: var(--text3); letter-spacing: 1px; }
.date-badge-lg { font-family: 'JetBrains Mono', monospace; font-size: 15px; color: var(--accent); font-weight: 600; }
.search-bar { display: flex; align-items: center; gap: 8px; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 5px 10px; }
.search-bar input { background: none; border: none; outline: none; color: var(--text); font-family: 'JetBrains Mono', monospace; font-size: 13px; width: 180px; }
.search-bar input::placeholder { color: var(--text3); }
.btn { background: var(--accent); color: #0d0f14; border: none; border-radius: 6px; padding: 6px 14px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: opacity .15s; font-family: 'Noto Sans TC', sans-serif; }
.btn:hover { opacity: .85; }

.section { background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.section-header { padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.section-title { font-size: 13px; color: var(--text2); font-weight: 500; }
.date-badge { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text3); background: var(--bg3); padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border); }

.sub-tabs { display: flex; gap: 3px; }
.stab { background: none; border: 1px solid var(--border); color: var(--text2); border-radius: 5px; padding: 3px 10px; font-size: 12px; cursor: pointer; font-family: 'Noto Sans TC', sans-serif; transition: all .12s; }
.stab.active { background: var(--accent); color: #0d0f14; border-color: var(--accent); font-weight: 700; }
.stab:hover:not(.active) { border-color: var(--accent); color: var(--accent); }

.table-wrap { overflow-x: auto; max-height: 520px; overflow-y: auto; }
.table-wrap::-webkit-scrollbar { width: 3px; height: 3px; }
.table-wrap::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.data-table th { padding: 8px 12px; text-align: right; color: var(--text3); font-weight: 500; border-bottom: 1px solid var(--border); white-space: nowrap; font-size: 11px; letter-spacing: .5px; text-transform: uppercase; position: sticky; top: 0; background: var(--bg2); z-index: 1; }
.data-table th:nth-child(1), .data-table th:nth-child(2), .data-table th:nth-child(3) { text-align: left; }
.data-table td { padding: 7px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; text-align: right; color: var(--text); }
.data-table td:nth-child(1), .data-table td:nth-child(2), .data-table td:nth-child(3) { text-align: left; }
.data-table tr:last-child td { border-bottom: none; }
.data-table tr:hover td { background: var(--bg3); }
.rank-cell { color: var(--text3); font-size: 11px; width: 30px; }
.id-cell { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--accent); cursor: pointer; }
.id-cell:hover { text-decoration: underline; }
.total-cell { font-weight: 600; }

.section-loading { display: flex; align-items: center; gap: 10px; padding: 24px; color: var(--text3); font-size: 13px; }
.section-error { padding: 20px; color: #ef5350; font-size: 13px; }
.spinner { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; flex-shrink: 0; }
@keyframes spin { to { transform: rotate(360deg); } }

.up   { color: var(--red); }
.down { color: var(--green); }
.flat { color: var(--text2); }
</style>