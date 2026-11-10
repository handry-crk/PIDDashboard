const KEY = 'pid_token'
const QKEY = 'pid_queue'
export const getToken = () => { try { return localStorage.getItem(KEY) } catch { return null } }
export const setToken = (t) => {
  try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY) } catch {}
  if (!t) {
    try { localStorage.removeItem(QKEY) } catch {}
    navigator.serviceWorker?.controller?.postMessage('clear-data')
  }
}

// ---------- offline queue ----------
export const getQueue = () => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]') } catch { return [] } }
const saveQueue = (q) => { try { localStorage.setItem(QKEY, JSON.stringify(q)) } catch {} window.dispatchEvent(new Event('pid-queue')) }
const enqueue = (item) => saveQueue([...getQueue(), { ...item, at: new Date().toISOString() }])
let flushing = false

/** Replays queued edits in order. Returns { sent, failed: [messages] }. Stops at the first network error. */
export async function flushQueue() {
  if (flushing) return { sent: 0, failed: [] }
  flushing = true
  let sent = 0
  const failed = []
  try {
    let q = getQueue()
    while (q.length) {
      const it = q[0]
      let res
      try {
        res = await fetch(it.path, { method: it.method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: it.body })
      } catch { break }
      if (!res.ok) {
        let msg = `Error ${res.status}`
        try { msg = (await res.json()).detail || msg } catch {}
        failed.push(`${it.label || it.path}: ${msg}`)
      } else sent++
      q = getQueue().slice(1)
      saveQueue(q)
    }
  } finally { flushing = false }
  return { sent, failed }
}

export async function api(path, { method = 'GET', body, form, label } = {}) {
  const headers = {}
  const t = getToken()
  if (t) headers.Authorization = `Bearer ${t}`
  let payload
  if (form) payload = form
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
  let res
  try {
    res = await fetch(path, { method, headers, body: payload })
  } catch (e) {
    if (method !== 'GET' && !path.startsWith('/api/auth')) {
      if (form) throw new Error('Upload file butuh koneksi internet. Coba lagi saat online.')
      enqueue({ path, method, body: payload, label })
      return { queued: true }
    }
    throw new Error('Tidak ada koneksi internet')
  }
  if (res.status === 401 && t && !path.startsWith('/api/auth')) { setToken(null); window.dispatchEvent(new Event('pid-logout')) }
  const ct = res.headers.get('content-type') || ''
  const data = ct.includes('json') ? await res.json() : await res.text()
  if (!res.ok) throw new Error((data && data.detail) || `Error ${res.status}`)
  if (res.headers.get('X-From-Cache') && data && typeof data === 'object' && !Array.isArray(data)) data.__offline = true
  return data
}

export async function download(path, filename) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok) throw new Error('Download gagal')
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
