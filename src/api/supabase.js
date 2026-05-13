const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
}

/**
 * 查詢單一股票的所有歷史資料
 * 自動判斷輸入是股號（純數字）還是股名（文字）
 */
export async function fetchStockHistory(keyword) {
  const isId = /^\d+$/.test(keyword.trim())

  // 股號：精確匹配；股名：用 ilike 模糊搜尋
  const filter = isId
    ? `stock_id=eq.${encodeURIComponent(keyword.trim())}`
    : `stock_name=ilike.*${encodeURIComponent(keyword.trim())}*`

  // 先找出符合的股號（名稱搜尋可能有多筆，取第一筆的 stock_id）
  const searchUrl =
    `${SUPABASE_URL}/rest/v1/stock_daily` +
    `?${filter}` +
    `&order=trade_date.desc` +
    `&limit=1` +
    `&select=stock_id`

  const searchRes = await fetch(searchUrl, { headers })
  if (!searchRes.ok) throw new Error(`Supabase error: ${searchRes.status}`)
  const found = await searchRes.json()

  if (!found || !found.length) return []

  // 用找到的 stock_id 撈完整歷史
  const stockId = found[0].stock_id
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


/**
 * 撈指定日期的所有預測驗證結果
 */
export async function fetchValidationByDate(date) {
  const url =
    `${SUPABASE_URL}/rest/v1/stock_validation` +
    `?trade_date=eq.${date}` +
    `&order=stock_id.asc` +
    `&select=*`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`)
  return res.json()
}

/**
 * 撈所有日期的勝率統計（用於趨勢折線圖）
 */
export async function fetchValidationStats() {
  const url =
    `${SUPABASE_URL}/rest/v1/stock_validation` +
    `?order=trade_date.desc` +
    `&select=trade_date,short_result,mid_result,long_result,kd_result,macd_result`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`)
  return res.json()
}