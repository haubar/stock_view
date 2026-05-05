const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
}

/**
 * 查詢單一股票的所有歷史資料
 */
export async function fetchStockHistory(stockId) {
  const url =
    `${SUPABASE_URL}/rest/v1/stock_daily` +
    `?stock_id=eq.${encodeURIComponent(stockId)}` +
    `&order=trade_date.asc` +
    `&select=trade_date,stock_id,stock_name,open_price,high_price,low_price,close_price,volume,price_diff,pe_ratio`

  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`)
  return res.json()
}

/**
 * 查詢最新一天所有股票（用於自選清單更新報價）
 */
export async function fetchLatestPrices(stockIds) {
  if (!stockIds.length) return []
  const inList = stockIds.map(id => `"${id}"`).join(',')
  const url =
    `${SUPABASE_URL}/rest/v1/stock_daily` +
    `?stock_id=in.(${inList})` +
    `&order=trade_date.desc` +
    `&select=trade_date,stock_id,stock_name,close_price,price_diff`

  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`)
  const all = await res.json()

  // 每支股票只取最新一筆
  const map = {}
  all.forEach(r => {
    if (!map[r.stock_id]) map[r.stock_id] = r
  })
  return Object.values(map)
}
