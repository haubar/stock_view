<template>
  <div class="institution">

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="toolbar-label">查詢日期</span>
        <select v-model="selectedDate" @change="loadInstitution" class="date-select">
          <option v-for="d in recentDates" :key="d.value" :value="d.value">{{ d.label }}</option>
        </select>
      </div>
      <div class="toolbar-right">
        <div class="search-bar">
          <input v-model="brokerQuery" placeholder="輸入代號查券商明細..." maxlength="10" @keydown.enter="loadBroker" />
          <button class="btn" @click="loadBroker">查券商</button>
        </div>
      </div>
    </div>

    <!-- 三大法人 loading -->
    <div v-if="instLoading" class="section-loading"><div class="spinner"></div><span>載入三大法人...</span></div>
    <div v-else-if="instError" class="section-error">⚠️ {{ instError }}</div>
    <template v-else-if="instData.length">

      <!-- 三大法人合計排行 -->
      <div class="section">
        <div class="section-header">
          <span class="section-title">🏦 三大法人買賣超排行</span>
          <div class="sub-tabs">
            <button v-for="t in instTabs" :key="t.value" class="stab" :class="{ active: instTab === t.value }" @click="instTab = t.value">{{ t.label }}</button>
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
                <th>#</th>
                <th>股號</th>
                <th>股名</th>
                <th v-if="instTab==='all'||instTab==='foreign'">外資買超(張)</th>
                <th v-if="instTab==='all'||instTab==='invest'">投信買超(張)</th>
                <th v-if="instTab==='all'||instTab==='dealer'">自營商買超(張)</th>
                <th>合計買超(張)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, idx) in sortedInstData" :key="r.股票代號">
                <td class="rank-cell">{{ idx + 1 }}</td>
                <td class="id-cell" @click="quickBroker(r.股票代號)" style="cursor:pointer;">{{ r.股票代號 }}</td>
                <td>{{ r.股票名稱 }}</td>
                <td v-if="instTab==='all'||instTab==='foreign'" :class="numClass(r._foreign)">{{ fmtNum(r._foreign) }}</td>
                <td v-if="instTab==='all'||instTab==='invest'" :class="numClass(r._invest)">{{ fmtNum(r._invest) }}</td>
                <td v-if="instTab==='all'||instTab==='dealer'" :class="numClass(r._dealer)">{{ fmtNum(r._dealer) }}</td>
                <td :class="numClass(r._total)" class="total-cell">{{ fmtNum(r._total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- 券商買賣超 -->
    <div class="section" v-if="brokerStockId">
      <div class="section-header">
        <span class="section-title">🏢 {{ brokerStockId }} {{ brokerStockName }} 各券商買賣超</span>
        <span class="date-badge">{{ selectedDate }}</span>
      </div>
      <div v-if="brokerLoading" class="section-loading"><div class="spinner"></div><span>載入券商資料...</span></div>
      <div v-else-if="brokerError" class="section-error">⚠️ {{ brokerError }}</div>
      <template v-else-if="brokerData.length">
        <div class="broker-summary">
          <div class="bsum-card" v-for="s in brokerSummary" :key="s.label">
            <span class="bsum-label">{{ s.label }}</span>
            <span class="bsum-val" :class="numClass(s.value)">{{ fmtNum(s.value) }} 張</span>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>券商代號</th>
                <th>券商名稱</th>
                <th>買進(張)</th>
                <th>賣出(張)</th>
                <th>買賣超(張)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, idx) in sortedBrokerData" :key="r.券商代號 + idx">
                <td class="rank-cell">{{ idx + 1 }}</td>
                <td class="mono">{{ r.券商代號 }}</td>
                <td>{{ r.券商名稱 }}</td>
                <td class="up mono">{{ fmtNum(r._buy) }}</td>
                <td class="down mono">{{ fmtNum(r._sell) }}</td>
                <td :class="numClass(r._net)" class="total-cell mono">{{ fmtNum(r._net) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

// ── 近5個交易日（跳過週末）──
function getRecentTradingDates(n = 5) {
  const dates = []
  const d = new Date()
  while (dates.length < n) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      dates.push({
        value: `${y}${m}${dd}`,
        label: `${y}-${m}-${dd}`,
      })
    }
    d.setDate(d.getDate() - 1)
  }
  return dates
}

const PROXY = 'https://twse-proxy.kerker.workers.dev'

const recentDates  = ref(getRecentTradingDates(5))
const selectedDate = ref(recentDates.value[0].value)

// 三大法人
const instData    = ref([])
const instLoading = ref(false)
const instError   = ref('')
const instTab     = ref('all')
const instSort    = ref('buy')

const instTabs = [
  { label: '全部',   value: 'all'     },
  { label: '外資',   value: 'foreign' },
  { label: '投信',   value: 'invest'  },
  { label: '自營商', value: 'dealer'  },
]

// 券商
const brokerQuery    = ref('')
const brokerStockId  = ref('')
const brokerStockName = ref('')
const brokerData     = ref([])
const brokerLoading  = ref(false)
const brokerError    = ref('')

// ── 三大法人：排序 ──
const sortedInstData = computed(() => {
  const data = [...instData.value]
  const sign = instSort.value === 'buy' ? -1 : 1
  return data
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

// ── 券商統計 ──
const brokerSummary = computed(() => {
  const totalBuy  = brokerData.value.reduce((s, r) => s + r._buy,  0)
  const totalSell = brokerData.value.reduce((s, r) => s + r._sell, 0)
  const net = totalBuy - totalSell
  return [
    { label: '法人買進', value: totalBuy  },
    { label: '法人賣出', value: -totalSell },
    { label: '合計買超', value: net       },
  ]
})

const sortedBrokerData = computed(() => {
  return [...brokerData.value].sort((a, b) => b._net - a._net)
})

// ── 抓三大法人 ──
async function loadInstitution() {
  instLoading.value = true
  instError.value   = ''
  instData.value    = []
  try {
    // 透過你現有的 proxy
    const url = `${PROXY}?api=BFIAMU&date=${selectedDate.value}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()

    // 解析欄位：外資買賣超、投信買賣超、自營商買賣超
    const fields = json.fields || json.fields9 || []
    const rows   = json.data   || json.data9   || []

    const fi = (name) => fields.indexOf(name)
    const colId      = fi('股票代號')
    const colName    = fi('股票名稱')
    const colFBuy    = fi('外陸資買進股數')
    const colFSell   = fi('外陸資賣出股數')
    const colIBuy    = fi('投信買進股數')
    const colISell   = fi('投信賣出股數')
    const colDBuy    = fi('自營商買進股數')
    const colDSell   = fi('自營商賣出股數')

    instData.value = rows.map(r => {
      const n = (v) => parseInt((r[v] || '0').toString().replace(/,/g, '')) || 0
      const foreign = Math.round((n(colFBuy) - n(colFSell)) / 1000)
      const invest  = Math.round((n(colIBuy) - n(colISell)) / 1000)
      const dealer  = Math.round((n(colDBuy) - n(colDSell)) / 1000)
      return {
        股票代號: r[colId],
        股票名稱: r[colName],
        _foreign: foreign,
        _invest:  invest,
        _dealer:  dealer,
        _total:   foreign + invest + dealer,
      }
    }).filter(r => r.股票代號 && /^\d{4}$/.test(r.股票代號.trim()))

  } catch(e) {
    instError.value = `三大法人載入失敗：${e.message}`
    console.error(e)
  } finally {
    instLoading.value = false
  }
}

// ── 抓券商買賣超 ──
async function loadBroker() {
  const kw = brokerQuery.value.trim()
  if (!kw) return
  brokerStockId.value   = kw
  brokerStockName.value = ''
  brokerLoading.value   = true
  brokerError.value     = ''
  brokerData.value      = []

  try {
    const url = `${PROXY}?api=BHSYB7&date=${selectedDate.value}&stockNo=${kw}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()

    const fields = json.fields || []
    const rows   = json.data   || []

    if (!rows.length) {
      brokerError.value = `查無 ${kw} 的券商資料（可能非交易日或代號錯誤）`
      return
    }

    brokerStockName.value = json.title?.match(/\d{4}\s+(.+?)\s/)?.[1] || ''

    const fi = (name) => fields.indexOf(name)
    const colCode = fi('券商代號')
    const colName = fi('券商名稱')
    const colBuy  = fi('買進股數')
    const colSell = fi('賣出股數')

    brokerData.value = rows.map(r => {
      const n = (v) => parseInt((r[v] || '0').toString().replace(/,/g, '')) || 0
      const buy  = Math.round(n(colBuy)  / 1000)
      const sell = Math.round(n(colSell) / 1000)
      return {
        券商代號: r[colCode],
        券商名稱: r[colName],
        _buy:  buy,
        _sell: sell,
        _net:  buy - sell,
      }
    }).filter(r => r._buy > 0 || r._sell > 0)

  } catch(e) {
    brokerError.value = `券商資料載入失敗：${e.message}`
    console.error(e)
  } finally {
    brokerLoading.value = false
  }
}

// 從三大法人表點股號快速查券商
function quickBroker(id) {
  brokerQuery.value = id
  loadBroker()
}

// ── helpers ──
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

/* Toolbar */
.toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 10px; }
.toolbar-label { font-size: 12px; color: var(--text3); letter-spacing: 1px; }
.date-select { background: var(--bg3); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 5px 10px; font-size: 13px; font-family: 'JetBrains Mono', monospace; cursor: pointer; outline: none; }
.date-select:focus { border-color: var(--accent); }
.search-bar { display: flex; align-items: center; gap: 8px; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 5px 10px; }
.search-bar input { background: none; border: none; outline: none; color: var(--text); font-family: 'JetBrains Mono', monospace; font-size: 13px; width: 180px; }
.search-bar input::placeholder { color: var(--text3); }
.btn { background: var(--accent); color: #0d0f14; border: none; border-radius: 6px; padding: 6px 14px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: opacity .15s; font-family: 'Noto Sans TC', sans-serif; }
.btn:hover { opacity: .85; }

/* Section */
.section { background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.section-header { padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.section-title { font-size: 13px; color: var(--text2); font-weight: 500; }
.date-badge { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text3); background: var(--bg3); padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border); }

.sub-tabs { display: flex; gap: 3px; }
.stab { background: none; border: 1px solid var(--border); color: var(--text2); border-radius: 5px; padding: 3px 10px; font-size: 12px; cursor: pointer; font-family: 'Noto Sans TC', sans-serif; transition: all .12s; }
.stab.active { background: var(--accent); color: #0d0f14; border-color: var(--accent); font-weight: 700; }
.stab:hover:not(.active) { border-color: var(--accent); color: var(--accent); }

/* Table */
.table-wrap { overflow-x: auto; max-height: 420px; overflow-y: auto; }
.table-wrap::-webkit-scrollbar { width: 3px; height: 3px; }
.table-wrap::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.data-table th { padding: 8px 12px; text-align: right; color: var(--text3); font-weight: 500; border-bottom: 1px solid var(--border); white-space: nowrap; font-size: 11px; letter-spacing: .5px; text-transform: uppercase; position: sticky; top: 0; background: var(--bg2); z-index: 1; }
.data-table th:first-child, .data-table th:nth-child(2), .data-table th:nth-child(3) { text-align: left; }
.data-table td { padding: 7px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; text-align: right; color: var(--text); }
.data-table td:first-child, .data-table td:nth-child(2), .data-table td:nth-child(3) { text-align: left; }
.data-table tr:last-child td { border-bottom: none; }
.data-table tr:hover td { background: var(--bg3); }
.rank-cell { color: var(--text3); font-size: 11px; width: 30px; }
.id-cell { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--accent); }
.id-cell:hover { text-decoration: underline; }
.total-cell { font-weight: 600; }
.mono { font-family: 'JetBrains Mono', monospace; }

/* Broker summary */
.broker-summary { display: flex; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.bsum-card { display: flex; flex-direction: column; gap: 2px; }
.bsum-label { font-size: 10px; color: var(--text3); letter-spacing: 1px; text-transform: uppercase; }
.bsum-val { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 600; }

/* Loading / Error */
.section-loading { display: flex; align-items: center; gap: 10px; padding: 24px; color: var(--text3); font-size: 13px; }
.section-error { padding: 20px; color: #ef5350; font-size: 13px; }
.spinner { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; flex-shrink: 0; }
@keyframes spin { to { transform: rotate(360deg); } }

.up   { color: var(--red); }
.down { color: var(--green); }
.flat { color: var(--text2); }
</style>
