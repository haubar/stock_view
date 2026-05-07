<template>
  <div class="validation">

    <!-- 日期選擇 -->
    <div class="toolbar">
      <span class="toolbar-label">交易日期</span>
      <select v-model="selectedDate" @change="loadData" class="date-select">
        <option v-for="d in availableDates" :key="d" :value="d">{{ d }}</option>
      </select>
      <span class="total-hint" v-if="records.length">共 {{ records.length }} 筆</span>
      <div class="toolbar-spacer" />
      <div class="filter-tabs">
        <button v-for="f in filters" :key="f.value" class="ftab" :class="{ active: activeFilter === f.value }" @click="activeFilter = f.value">
          {{ f.label }}
        </button>
      </div>
    </div>

    <!-- 載入中 -->
    <div v-if="loading" class="empty-state"><div class="spinner"></div><p>載入中...</p></div>
    <div v-else-if="error"  class="empty-state"><div class="icon">⚠️</div><p>{{ error }}</p></div>
    <template v-else>

      <!-- 勝率統計卡片 -->
      <div class="stat-cards">
        <div v-for="s in statCards" :key="s.key" class="stat-card">
          <div class="card-label">{{ s.label }}</div>
          <div class="card-rate" :class="rateClass(s.rate)">{{ s.rate }}%</div>
          <div class="card-sub">{{ s.win }}勝 / {{ s.total }}筆</div>
          <div class="card-bar">
            <div class="card-bar-fill" :style="{ width: s.rate + '%', background: rateColor(s.rate) }"></div>
          </div>
        </div>
      </div>

      <!-- 勝率趨勢折線圖 -->
      <div class="trend-section">
        <div class="section-title">📈 各指標勝率趨勢</div>
        <div ref="trendChartRef" class="trend-chart"></div>
      </div>

      <!-- 個股對錯記錄 -->
      <div class="table-section">
        <div class="section-title">📋 個股預測對錯紀錄</div>
        <div class="table-wrap">
          <table class="record-table">
            <thead>
              <tr>
                <th>股號</th>
                <th>股名</th>
                <th>收盤</th>
                <th>漲跌%</th>
                <th>短期</th>
                <th>中期</th>
                <th>長期</th>
                <th>KD</th>
                <th>MACD</th>
                <th>結論</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in filteredRecords" :key="r.stock_id">
                <td class="id-cell">{{ r.stock_id }}</td>
                <td>{{ r.stock_name }}</td>
                <td class="mono">{{ r.close_price?.toFixed(2) ?? '-' }}</td>
                <td class="mono" :class="r.change_pct > 0 ? 'up' : r.change_pct < 0 ? 'down' : 'flat'">
                  {{ r.change_pct > 0 ? '+' : '' }}{{ r.change_pct?.toFixed(2) ?? '-' }}%
                </td>
                <td><span class="badge" :class="badgeClass(r.short_result)">{{ r.short_result ?? '-' }}</span></td>
                <td><span class="badge" :class="badgeClass(r.mid_result)">{{ r.mid_result ?? '-' }}</span></td>
                <td><span class="badge" :class="badgeClass(r.long_result)">{{ r.long_result ?? '-' }}</span></td>
                <td><span class="badge" :class="badgeClass(r.kd_result)">{{ r.kd_result ?? '-' }}</span></td>
                <td><span class="badge" :class="badgeClass(r.macd_result)">{{ r.macd_result ?? '-' }}</span></td>
                <td class="comment-cell">{{ r.comment ?? '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { createChart, LineSeries } from 'lightweight-charts'
import { fetchValidationByDate, fetchValidationStats } from '../api/supabase.js'

const selectedDate   = ref('')
const availableDates = ref([])
const records        = ref([])
const trendData      = ref([])
const loading        = ref(false)
const error          = ref('')
const activeFilter   = ref('all')
const trendChartRef  = ref(null)
let trendChart       = null
let roTrend          = null

const filters = [
  { label: '全部',     value: 'all'    },
  { label: '全對 ⭕',  value: 'allwin' },
  { label: '全錯 ❌',  value: 'allfail'},
  { label: '短線準',   value: 'short'  },
]

// ── 勝率統計卡片 ──
const statCards = computed(() => {
  const keys = [
    { key: 'short', label: '短期預測', result: 'short_result' },
    { key: 'mid',   label: '中期預測', result: 'mid_result'   },
    { key: 'long',  label: '長期預測', result: 'long_result'  },
    { key: 'kd',    label: 'KD 預測',  result: 'kd_result'    },
    { key: 'macd',  label: 'MACD 預測',result: 'macd_result'  },
  ]
  return keys.map(k => {
    const valid = records.value.filter(r => r[k.result] && r[k.result] !== '-')
    const win   = valid.filter(r => r[k.result]?.includes('⭕')).length
    const rate  = valid.length ? parseFloat((win / valid.length * 100).toFixed(1)) : 0
    return { ...k, win, total: valid.length, rate }
  })
})

// ── 篩選記錄 ──
const filteredRecords = computed(() => {
  const r = records.value
  if (activeFilter.value === 'all')     return r
  if (activeFilter.value === 'allwin')  return r.filter(x => isAllWin(x))
  if (activeFilter.value === 'allfail') return r.filter(x => isAllFail(x))
  if (activeFilter.value === 'short')   return r.filter(x => x.short_result?.includes('⭕'))
  return r
})

function isAllWin(r)  { return ['short_result','mid_result','long_result'].every(k => r[k]?.includes('⭕')) }
function isAllFail(r) { return ['short_result','mid_result','long_result'].every(k => r[k]?.includes('❌')) }

// ── 樣式 helpers ──
function badgeClass(val) {
  if (!val || val === '-') return 'badge-na'
  if (val.includes('⭕'))  return 'badge-win'
  if (val.includes('❌'))  return 'badge-fail'
  return 'badge-na'
}
function rateClass(rate) {
  if (rate >= 60) return 'rate-good'
  if (rate >= 45) return 'rate-mid'
  return 'rate-bad'
}
function rateColor(rate) {
  if (rate >= 60) return '#26a69a'
  if (rate >= 45) return '#f0b429'
  return '#ef5350'
}

// ── 計算趨勢資料 ──
function buildTrendSeries(raw) {
  const byDate = {}
  raw.forEach(r => {
    if (!byDate[r.trade_date]) byDate[r.trade_date] = { short:[], mid:[], long:[], kd:[], macd:[] }
    const d = byDate[r.trade_date]
    const push = (arr, val) => { if (val && val !== '-') arr.push(val.includes('⭕') ? 1 : 0) }
    push(d.short, r.short_result)
    push(d.mid,   r.mid_result)
    push(d.long,  r.long_result)
    push(d.kd,    r.kd_result)
    push(d.macd,  r.macd_result)
  })

  const dates = Object.keys(byDate).sort()
  const series = { short: [], mid: [], long: [], kd: [], macd: [] }
  dates.forEach(date => {
    const d = byDate[date]
    Object.keys(series).forEach(k => {
      const arr = d[k]
      if (arr.length) {
        series[k].push({ time: date, value: parseFloat((arr.reduce((a,b)=>a+b,0)/arr.length*100).toFixed(1)) })
      }
    })
  })
  return series
}

// ── 繪製趨勢圖 ──
function renderTrendChart(seriesData) {
  if (!trendChartRef.value) return
  if (trendChart) { trendChart.remove(); trendChart = null }
  roTrend?.disconnect()

  trendChart = createChart(trendChartRef.value, {
    layout:          { background: { color: '#0d0f14' }, textColor: '#8b90a0' },
    grid:            { vertLines: { color: '#1a1e2a' }, horzLines: { color: '#1a1e2a' } },
    rightPriceScale: { borderColor: '#252836', scaleMargins: { top: 0.1, bottom: 0.1 } },
    timeScale:       { borderColor: '#252836', timeVisible: true },
    handleScroll:    true,
    handleScale:     true,
  })

  const colors = { short: '#f0b429', mid: '#7ec8e3', long: '#ff7eb3', kd: '#a78bfa', macd: '#fb923c' }
  const labels = { short: '短期', mid: '中期', long: '長期', kd: 'KD', macd: 'MACD' }

  Object.entries(seriesData).forEach(([key, data]) => {
    if (!data.length) return
    const s = trendChart.addSeries(LineSeries, {
      color: colors[key], lineWidth: 2,
      title: labels[key],
      priceLineVisible: false,
    })
    s.setData(data)
  })

  trendChart.timeScale().fitContent()

  roTrend = new ResizeObserver(() => {
    if (trendChart && trendChartRef.value)
      trendChart.resize(trendChartRef.value.clientWidth, trendChartRef.value.clientHeight)
  })
  roTrend.observe(trendChartRef.value)
}

// ── 取得可用日期 ──
async function loadAvailableDates() {
  try {
    const raw = await fetchValidationStats()
    trendData.value = raw

    // 取得不重複日期
    const dates = [...new Set(raw.map(r => r.trade_date))].sort((a,b) => b.localeCompare(a))
    availableDates.value = dates
    if (dates.length) {
      selectedDate.value = dates[0]
      await loadData()
    }

    // 畫趨勢圖
    const series = buildTrendSeries(raw)
    await new Promise(r => setTimeout(r, 100))
    renderTrendChart(series)
  } catch (e) {
    error.value = '載入失敗，請確認 Supabase 設定'
    console.error(e)
  }
}

async function loadData() {
  if (!selectedDate.value) return
  loading.value = true
  error.value = ''
  try {
    records.value = await fetchValidationByDate(selectedDate.value)
  } catch (e) {
    error.value = '載入失敗'
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => { loadAvailableDates() })
onUnmounted(() => {
  roTrend?.disconnect()
  trendChart?.remove()
})
</script>

<style scoped>
.validation { display: flex; flex-direction: column; height: 100%; overflow-y: auto; padding: 16px 20px; gap: 20px; }
.validation::-webkit-scrollbar { width: 4px; }
.validation::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* Toolbar */
.toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.toolbar-label { font-size: 12px; color: var(--text3); letter-spacing: 1px; }
.date-select { background: var(--bg3); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 5px 10px; font-size: 13px; font-family: 'JetBrains Mono', monospace; cursor: pointer; outline: none; }
.date-select:focus { border-color: var(--accent); }
.total-hint { font-size: 12px; color: var(--text3); }
.toolbar-spacer { flex: 1; }
.filter-tabs { display: flex; gap: 4px; }
.ftab { background: none; border: 1px solid var(--border); color: var(--text2); border-radius: 5px; padding: 4px 12px; font-size: 12px; cursor: pointer; font-family: 'Noto Sans TC', sans-serif; transition: all .12s; }
.ftab.active { background: var(--accent); color: #0d0f14; border-color: var(--accent); font-weight: 700; }
.ftab:hover:not(.active) { border-color: var(--accent); color: var(--accent); }

/* Stat cards */
.stat-cards { display: flex; gap: 12px; flex-wrap: wrap; }
.stat-card { flex: 1; min-width: 140px; background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.card-label { font-size: 11px; color: var(--text3); letter-spacing: 1px; text-transform: uppercase; }
.card-rate { font-family: 'JetBrains Mono', monospace; font-size: 28px; font-weight: 700; }
.card-sub { font-size: 11px; color: var(--text3); }
.card-bar { height: 4px; background: var(--bg3); border-radius: 2px; margin-top: 6px; overflow: hidden; }
.card-bar-fill { height: 100%; border-radius: 2px; transition: width .4s; }
.rate-good { color: #26a69a; }
.rate-mid  { color: #f0b429; }
.rate-bad  { color: #ef5350; }

/* Trend chart */
.trend-section { background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.section-title { font-size: 13px; color: var(--text2); margin-bottom: 12px; }
.trend-chart { height: 200px; }

/* Table */
.table-section { background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.table-wrap { overflow-x: auto; margin-top: 4px; }
.record-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.record-table th { padding: 8px 10px; text-align: left; color: var(--text3); font-weight: 500; border-bottom: 1px solid var(--border); white-space: nowrap; font-size: 11px; letter-spacing: .5px; text-transform: uppercase; }
.record-table td { padding: 7px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; color: var(--text); }
.record-table tr:last-child td { border-bottom: none; }
.record-table tr:hover td { background: var(--bg3); }
.id-cell { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--accent); }
.mono { font-family: 'JetBrains Mono', monospace; }
.comment-cell { color: var(--text2); font-size: 11px; }

.badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
.badge-win  { background: #26a69a22; color: #26a69a; }
.badge-fail { background: #ef535022; color: #ef5350; }
.badge-na   { color: var(--text3); }

.up   { color: var(--red); }
.down { color: var(--green); }
.flat { color: var(--text2); }

.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; gap: 12px; color: var(--text3); }
.empty-state .icon { font-size: 36px; opacity: .4; }
.empty-state p { font-size: 14px; }
.spinner { width: 28px; height: 28px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
