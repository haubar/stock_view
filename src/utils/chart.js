/**
 * 日線資料聚合成週/月
 */
export function aggregateData(data, period) {
  if (period === 'D') return data

  const groups = {}
  data.forEach(row => {
    const d = new Date(row.trade_date)
    let key
    if (period === 'W') {
      const day = d.getDay() || 7
      const mon = new Date(d)
      mon.setDate(d.getDate() - day + 1)
      key = mon.toISOString().slice(0, 10)
    } else {
      key = row.trade_date.slice(0, 7) + '-01'
    }
    if (!groups[key]) groups[key] = []
    groups[key].push(row)
  })

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => ({
      trade_date:  key,
      stock_id:    rows[0].stock_id,
      stock_name:  rows[0].stock_name,
      open_price:  rows[0].open_price,
      high_price:  Math.max(...rows.map(r => r.high_price || 0)),
      low_price:   Math.min(...rows.map(r => r.low_price || Infinity)),
      close_price: rows[rows.length - 1].close_price,
      volume:      rows.reduce((s, r) => s + (r.volume || 0), 0),
      price_diff:  (rows[rows.length - 1].close_price || 0) - (rows[0].open_price || 0),
      pe_ratio:    rows[rows.length - 1].pe_ratio,
    }))
}

/**
 * 計算 N 日均線
 */
export function calcMA(data, n) {
  const result = []
  for (let i = n - 1; i < data.length; i++) {
    const slice = data.slice(i - n + 1, i + 1)
    const avg = slice.reduce((s, r) => s + (r.close_price || 0), 0) / n
    result.push({ time: data[i].trade_date, value: parseFloat(avg.toFixed(2)) })
  }
  return result
}

/**
 * 格式化成交量（張）
 */
export function formatVolume(v) {
  if (!v) return '-'
  const zhang = Math.round(v / 1000)
  return zhang >= 10000
    ? (zhang / 10000).toFixed(2) + ' 萬張'
    : zhang.toLocaleString() + ' 張'
}

/**
 * 漲跌方向 class
 */
export function diffClass(diff) {
  if (diff > 0) return 'up'
  if (diff < 0) return 'down'
  return 'flat'
}
