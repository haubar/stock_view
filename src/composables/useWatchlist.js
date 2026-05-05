import { ref } from 'vue'
import { fetchLatestPrices } from '../api/supabase.js'

const STORAGE_KEY = 'tw_watchlist'

const watchlist = ref(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist.value))
}

export function useWatchlist() {
  function add(stock, lastRow) {
    if (watchlist.value.find(s => s.id === stock.id)) return false
    watchlist.value.push({
      id:    stock.id,
      name:  stock.name,
      price: lastRow?.close_price ?? null,
      diff:  lastRow?.price_diff  ?? null,
    })
    save()
    return true
  }

  function remove(id) {
    watchlist.value = watchlist.value.filter(s => s.id !== id)
    save()
  }

  function has(id) {
    return !!watchlist.value.find(s => s.id === id)
  }

  async function refreshPrices() {
    if (!watchlist.value.length) return
    try {
      const latest = await fetchLatestPrices(watchlist.value.map(s => s.id))
      latest.forEach(r => {
        const item = watchlist.value.find(s => s.id === r.stock_id)
        if (item) {
          item.price = r.close_price
          item.diff  = r.price_diff
        }
      })
      save()
    } catch (e) {
      console.warn('更新自選報價失敗', e)
    }
  }

  return { watchlist, add, remove, has, refreshPrices }
}
