import { ref, onUnmounted } from 'vue'
import { createChart, CrosshairMode } from 'lightweight-charts'
import { calcMA } from '../utils/chart.js'

const MA_COLORS = {
  5:   '#f0b429',
  10:  '#7ec8e3',
  20:  '#ff7eb3',
  60:  '#a78bfa',
  120: '#fb923c',
}

export function useChart() {
  let chart    = null
  let volChart = null
  let candleSeries  = null
  let volSeries     = null
  const maSeries    = {}
  const maVisible   = ref({ 5: true, 10: true, 20: true, 60: true, 120: true })
  let roChart = null, roVol = null

  function initCharts(chartEl, volEl) {
    destroyCharts()

    const base = {
      layout:     { background: { color: '#0d0f14' }, textColor: '#8b90a0' },
      grid:       { vertLines: { color: '#1a1e2a' }, horzLines: { color: '#1a1e2a' } },
      crosshair:  { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#252836' },
      timeScale:  { borderColor: '#252836', timeVisible: true },
      handleScroll: true,
      handleScale:  true,
    }

    chart = createChart(chartEl, base)
    volChart = createChart(volEl, {
      ...base,
      grid: { vertLines: { color: '#1a1e2a' }, horzLines: { color: 'transparent' } },
      rightPriceScale: { borderColor: '#252836', scaleMargins: { top: 0.1, bottom: 0 } },
      timeScale: { ...base.timeScale, visible: false },
    })

    candleSeries = chart.addCandlestickSeries({
      upColor: '#ef5350', downColor: '#26a69a',
      borderUpColor: '#ef5350', borderDownColor: '#26a69a',
      wickUpColor: '#ef5350', wickDownColor: '#26a69a',
    })

    volSeries = volChart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'right',
    })

    // 同步時間軸
    chart.timeScale().subscribeVisibleLogicalRangeChange(r => {
      if (r) volChart.timeScale().setVisibleLogicalRange(r)
    })
    volChart.timeScale().subscribeVisibleLogicalRangeChange(r => {
      if (r) chart.timeScale().setVisibleLogicalRange(r)
    })

    // ResizeObserver
    roChart = new ResizeObserver(() => {
      if (chart) chart.resize(chartEl.clientWidth, chartEl.clientHeight)
    })
    roVol = new ResizeObserver(() => {
      if (volChart) volChart.resize(volEl.clientWidth, volEl.clientHeight)
    })
    roChart.observe(chartEl)
    roVol.observe(volEl)
  }

  function setData(aggData) {
    // K線
    const candles = aggData.map(r => ({
      time:  r.trade_date,
      open:  r.open_price  || r.close_price,
      high:  r.high_price  || r.close_price,
      low:   r.low_price   || r.close_price,
      close: r.close_price || 0,
    })).filter(r => r.close > 0)

    candleSeries.setData(candles)

    // 均線
    Object.keys(maSeries).forEach(n => {
      chart.removeSeries(maSeries[n])
      delete maSeries[n]
    })
    ;[5, 10, 20, 60, 120].forEach(n => {
      const s = chart.addLineSeries({
        color: MA_COLORS[n], lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false,
        visible: maVisible.value[n],
      })
      s.setData(calcMA(aggData, n))
      maSeries[n] = s
    })

    // 成交量
    volSeries.setData(aggData.map(r => ({
      time:  r.trade_date,
      value: r.volume || 0,
      color: (r.price_diff >= 0) ? '#ef535055' : '#26a69a55',
    })))

    chart.timeScale().fitContent()
    volChart.timeScale().fitContent()
  }

  function toggleMA(n) {
    maVisible.value[n] = !maVisible.value[n]
    if (maSeries[n]) maSeries[n].applyOptions({ visible: maVisible.value[n] })
  }

  function destroyCharts() {
    roChart?.disconnect()
    roVol?.disconnect()
    if (chart)    { chart.remove();    chart = null }
    if (volChart) { volChart.remove(); volChart = null }
    Object.keys(maSeries).forEach(k => delete maSeries[k])
  }

  onUnmounted(destroyCharts)

  return { maVisible, initCharts, setData, toggleMA, destroyCharts, MA_COLORS }
}
