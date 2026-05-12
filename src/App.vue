<template>
  <div class="app">
    <!-- Page tab -->
    <div class="page-tabs">
      <button class="ptab" :class="{ active: activePage === 'chart' }" @click="activePage = 'chart'">📈 看盤</button>
      <button class="ptab" :class="{ active: activePage === 'validation' }" @click="activePage = 'validation'">🎯 預測驗證</button>
      <button class="ptab" :class="{ active: activePage === 'institution' }" @click="activePage = 'institution'">🏦 三大法人</button>

    </div>

    <header class="header" v-show="activePage === 'chart'">
      <div class="logo">台股<span>／</span>看盤</div>
      <div class="search-bar">
        <input v-model="searchQuery" placeholder="股票代號或名稱..." maxlength="10" @keydown.enter="doSearch" />
        <button class="btn" @click="doSearch">查詢</button>
      </div>
      <div class="period-tabs">
        <button v-for="p in periods" :key="p.value" class="tab" :class="{ active: currentPeriod === p.value }" @click="changePeriod(p.value)">{{ p.label }}</button>
      </div>
    </header>

    <div class="main" v-show="activePage === 'chart'">
      <aside class="sidebar">
        <div class="sidebar-header">
          <span>自選清單</span>
          <button class="btn ghost small" @click="addCurrent">＋ 加入</button>
        </div>
        <div class="stock-list">
          <div v-if="!watchlist.length" class="empty-hint">查詢後可加入自選</div>
          <div v-for="s in watchlist" :key="s.id" class="stock-item" :class="{ active: currentStock?.id === s.id }" @click="selectStock(s.id)">
            <div>
              <div class="stock-item-id">{{ s.id }}</div>
              <div class="stock-item-name">{{ s.name }}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
              <div class="stock-item-price" :class="diffClass(s.diff)">{{ s.price?.toFixed(2) ?? '-' }}</div>
              <button class="remove-btn" @click.stop="removeStock(s.id)">✕</button>
            </div>
          </div>
        </div>
      </aside>

      <div class="content">
        <div class="info-bar">
          <template v-if="currentStock && lastRow">
            <div class="info-name">
              <span class="id">{{ currentStock.id }}</span>
              <span class="name">{{ currentStock.name }}</span>
            </div>
            <div class="info-price" :class="diffClass(lastRow.price_diff)">{{ lastRow.close_price?.toFixed(2) ?? '-' }}</div>
            <div class="info-diff" :class="diffClass(lastRow.price_diff)">
              {{ (lastRow.price_diff ?? 0) >= 0 ? '▲' : '▼' }} {{ Math.abs(lastRow.price_diff ?? 0).toFixed(2) }} ({{ pctStr }})
            </div>
            <div class="info-stats">
              <div class="stat" v-for="s in statItems" :key="s.label">
                <span class="stat-label">{{ s.label }}</span>
                <span class="stat-value" :class="s.cls">{{ s.value }}</span>
              </div>
            </div>
          </template>
          <div v-else class="placeholder-hint"><span>📈</span> 請輸入股票代號開始查詢</div>
        </div>

        <div class="ma-bar" v-if="currentStock">
          <span class="ma-label">均線</span>
          <div v-for="n in [5,10,20,60,120]" :key="n" class="ma-toggle" :class="{ off: !maVisible[n] }" @click="toggleMA(n)">
            <div class="ma-dot" :style="{ background: MA_COLORS[n] }"></div>
            <span>MA{{ n }}</span>
          </div>
        </div>

        <div class="chart-area">
          <template v-if="status === 'idle'">
            <div class="empty-state"><div class="icon">🕯️</div><p>查詢股票後顯示K線圖</p></div>
          </template>
          <template v-else-if="status === 'loading'">
            <div class="empty-state"><div class="spinner"></div><p>載入中...</p></div>
          </template>
          <template v-else-if="status === 'error'">
            <div class="empty-state"><div class="icon">⚠️</div><p>{{ errorMsg }}</p></div>
          </template>
          <template v-else>
            <div ref="chartRef" class="chart-inner"></div>
            <div ref="volRef" class="vol-inner"></div>
          </template>
        </div>
      </div>
    </div>

    <!-- 預測驗證頁 -->
    <div class="page-validation" v-show="activePage === 'validation'">
      <ValidationView v-if="activePage === 'validation'" />
    </div>
    <div class="page-validation" v-show="activePage === 'institution'">
      <InstitutionView v-if="activePage === 'institution'" />
    </div>

    <transition name="toast">
      <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { fetchStockHistory } from './api/supabase.js'
import { aggregateData, formatVolume, diffClass } from './utils/chart.js'
import { useWatchlist } from './composables/useWatchlist.js'
import { useChart } from './composables/useChart.js'
import ValidationView from './components/ValidationView.vue'
import InstitutionView from './components/InstitutionView.vue'


const activePage    = ref('chart')
const searchQuery   = ref('')
const currentStock  = ref(null)
const currentPeriod = ref('D')
const rawData       = ref([])
const status        = ref('idle')
const errorMsg      = ref('')
const toastMsg      = ref('')
const chartRef      = ref(null)
const volRef        = ref(null)

const periods = [
  { label: '日線', value: 'D' },
  { label: '週線', value: 'W' },
  { label: '月線', value: 'M' },
]

const { watchlist, add, remove, refreshPrices } = useWatchlist()
const { maVisible, MA_COLORS, initCharts, setData, toggleMA } = useChart()

const lastRow = computed(() => rawData.value[rawData.value.length - 1] ?? null)

const pctStr = computed(() => {
  if (!lastRow.value) return '-'
  const base = (lastRow.value.close_price || 0) - (lastRow.value.price_diff || 0)
  if (!base) return '-'
  return Math.abs((lastRow.value.price_diff / base) * 100).toFixed(2) + '%'
})

const statItems = computed(() => {
  const r = lastRow.value
  if (!r) return []
  return [
    { label: '開盤',    value: r.open_price?.toFixed(2) ?? '-', cls: '' },
    { label: '最高',    value: r.high_price?.toFixed(2) ?? '-', cls: 'up' },
    { label: '最低',    value: r.low_price?.toFixed(2)  ?? '-', cls: 'down' },
    { label: '成交量',  value: formatVolume(r.volume),           cls: '' },
    { label: '本益比',  value: r.pe_ratio ?? '-',                cls: '' },
    { label: '資料筆數', value: rawData.value.length + ' 日',   cls: '' },
  ]
})

async function doSearch() {
  const kw = searchQuery.value.trim()
  if (!kw) return
  status.value = 'loading'
  try {
    const data = await fetchStockHistory(kw)
    if (!data || !data.length) {
      status.value = 'error'
      errorMsg.value = `查無「${kw}」的資料`
      return
    }
    rawData.value = data
    currentStock.value = { id: data[0].stock_id, name: data[0].stock_name }
    status.value = 'loaded'
    await nextTick()
    renderChart()
  } catch (e) {
    status.value = 'error'
    errorMsg.value = '連線失敗，請確認 Supabase 設定'
    console.error(e)
  }
}

async function selectStock(id) {
  searchQuery.value = id
  await doSearch()
}

function changePeriod(p) {
  currentPeriod.value = p
  if (status.value === 'loaded') renderChart()
}

function renderChart() {
  if (!chartRef.value || !volRef.value) return
  const agg = aggregateData(rawData.value, currentPeriod.value)
  initCharts(chartRef.value, volRef.value)
  setData(agg)
}

function addCurrent() {
  if (!currentStock.value) { toast('請先查詢股票'); return }
  const ok = add(currentStock.value, lastRow.value)
  toast(ok ? `✅ ${currentStock.value.id} 已加入自選` : '已在自選清單中')
}

function removeStock(id) {
  remove(id)
  toast('已移除')
}

let toastTimer = null
function toast(msg) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 2500)
}

onMounted(() => { refreshPrices() })
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=JetBrains+Mono:wght@400;600&display=swap');

:root {
  --bg: #0d0f14; --bg2: #13161e; --bg3: #1a1e2a;
  --border: #252836; --accent: #f0b429;
  --green: #26a69a; --red: #ef5350;
  --text: #e8eaf0; --text2: #8b90a0; --text3: #555a6e;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { height: 100%; }
.app { display: flex; flex-direction: column; height: 100vh; background: var(--bg); color: var(--text); font-family: 'Noto Sans TC', sans-serif; }

.header { background: var(--bg2); border-bottom: 1px solid var(--border); padding: 12px 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; flex-shrink: 0; }
.logo { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 600; color: var(--accent); letter-spacing: 2px; white-space: nowrap; }
.logo span { color: var(--text2); font-weight: 400; }
.search-bar { display: flex; align-items: center; gap: 8px; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; flex: 1; max-width: 320px; }
.search-bar input { background: none; border: none; outline: none; color: var(--text); font-family: 'JetBrains Mono', monospace; font-size: 14px; width: 100%; }
.search-bar input::placeholder { color: var(--text3); }
.btn { background: var(--accent); color: #0d0f14; border: none; border-radius: 6px; padding: 7px 16px; font-family: 'Noto Sans TC', sans-serif; font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity .15s; white-space: nowrap; }
.btn:hover { opacity: .85; }
.btn.ghost { background: var(--bg3); color: var(--text2); border: 1px solid var(--border); font-weight: 500; }
.btn.ghost:hover { border-color: var(--accent); color: var(--accent); }
.btn.small { padding: 3px 8px; font-size: 11px; }
.period-tabs { display: flex; gap: 4px; margin-left: auto; }
.tab { background: none; border: 1px solid var(--border); color: var(--text2); border-radius: 6px; padding: 5px 14px; font-size: 13px; cursor: pointer; font-family: 'Noto Sans TC', sans-serif; transition: all .15s; }
.tab.active { background: var(--accent); color: #0d0f14; border-color: var(--accent); font-weight: 700; }
.tab:hover:not(.active) { border-color: var(--accent); color: var(--accent); }

.main { display: flex; flex: 1; overflow: hidden; min-height: 0; }
.sidebar { width: 210px; background: var(--bg2); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden; }
.sidebar-header { padding: 10px 12px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.sidebar-header span { font-size: 11px; color: var(--text2); letter-spacing: 1px; text-transform: uppercase; }
.stock-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.stock-list::-webkit-scrollbar { width: 3px; }
.stock-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.empty-hint { padding: 16px 12px; color: var(--text3); font-size: 12px; }
.stock-item { padding: 9px 12px; cursor: pointer; border-left: 3px solid transparent; display: flex; align-items: center; justify-content: space-between; transition: all .1s; }
.stock-item:hover { background: var(--bg3); border-left-color: var(--text3); }
.stock-item.active { background: var(--bg3); border-left-color: var(--accent); }
.stock-item-id { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; color: var(--accent); }
.stock-item-name { font-size: 11px; color: var(--text2); margin-top: 2px; }
.stock-item-price { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.remove-btn { background: none; border: none; color: var(--text3); cursor: pointer; font-size: 10px; padding: 0 2px; }
.remove-btn:hover { color: var(--red); }

.content { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.info-bar { background: var(--bg2); border-bottom: 1px solid var(--border); padding: 10px 18px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; flex-shrink: 0; min-height: 56px; }
.placeholder-hint { display: flex; align-items: center; gap: 8px; color: var(--text3); font-size: 13px; }
.info-name { display: flex; align-items: baseline; gap: 8px; }
.info-name .id { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 600; color: var(--accent); }
.info-name .name { font-size: 14px; color: var(--text2); }
.info-price { font-family: 'JetBrains Mono', monospace; font-size: 26px; font-weight: 600; }
.info-diff { font-family: 'JetBrains Mono', monospace; font-size: 13px; }
.info-stats { display: flex; gap: 18px; margin-left: auto; flex-wrap: wrap; }
.stat { display: flex; flex-direction: column; align-items: flex-end; }
.stat-label { font-size: 10px; color: var(--text3); letter-spacing: 1px; text-transform: uppercase; }
.stat-value { font-family: 'JetBrains Mono', monospace; font-size: 13px; margin-top: 2px; }
.up { color: var(--red); } .down { color: var(--green); } .flat { color: var(--text2); }

.ma-bar { background: var(--bg2); border-bottom: 1px solid var(--border); padding: 6px 18px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex-shrink: 0; }
.ma-label { font-size: 11px; color: var(--text3); letter-spacing: 1px; }
.ma-toggle { display: flex; align-items: center; gap: 5px; cursor: pointer; padding: 3px 9px; border-radius: 5px; border: 1px solid var(--border); transition: all .12s; user-select: none; }
.ma-toggle:hover { background: var(--bg3); }
.ma-toggle.off { opacity: .3; }
.ma-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.ma-toggle span { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text); }

.chart-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.chart-inner { flex: 1; min-height: 0; }
.vol-inner { height: 90px; border-top: 1px solid var(--border); flex-shrink: 0; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; color: var(--text3); }
.empty-state .icon { font-size: 44px; opacity: .4; }
.empty-state p { font-size: 14px; }
.spinner { width: 30px; height: 30px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.toast { position: fixed; bottom: 24px; right: 24px; background: var(--bg3); border: 1px solid var(--border); color: var(--text); padding: 10px 18px; border-radius: 8px; font-size: 13px; z-index: 999; pointer-events: none; }
.toast-enter-active, .toast-leave-active { transition: all .25s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(10px); }

.page-tabs { display: flex; background: var(--bg); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.ptab { background: none; border: none; border-bottom: 3px solid transparent; color: var(--text2); padding: 10px 24px; font-size: 14px; cursor: pointer; font-family: 'Noto Sans TC', sans-serif; transition: all .15s; }
.ptab:hover { color: var(--text); }
.ptab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 700; }
.page-validation { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }

@media (max-width: 640px) {
  .sidebar { display: none; }
  .period-tabs { margin-left: 0; }
  .info-stats { display: none; }
}
</style>
