import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api, getToken, setToken, getQueue, flushQueue } from './api.js'
import { ToastProvider, Logo, fmtWhen, useToast } from './ui.jsx'
import Login from './pages/Login.jsx'
import Beranda from './pages/Beranda.jsx'
import Proyek from './pages/Proyek.jsx'
import ProjectDetail from './pages/ProjectDetail.jsx'
import Keputusan from './pages/Keputusan.jsx'
import Vendor from './pages/Vendor.jsx'
import Saya from './pages/Saya.jsx'
import Laporan from './pages/Laporan.jsx'
import Survey from './pages/Survey.jsx'
import Timeline from './pages/Timeline.jsx'

function useHash() {
  const [h, setH] = useState(window.location.hash || '#/beranda')
  useEffect(() => {
    const f = () => { setH(window.location.hash || '#/beranda'); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return h
}
export const go = (path) => { window.location.hash = path }

const NAV = [
  { key: 'beranda', label: 'Beranda', icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { key: 'proyek', label: 'Proyek', icon: 'M4 5h16M4 12h16M4 19h10' },
  { key: 'timeline', label: 'Timeline', icon: 'M3 5h18M7 3v4M17 3v4M4 9h16v11H4zM8 13h5M8 17h8', desktopOnly: true },
  { key: 'keputusan', label: 'Keputusan', icon: 'M5 13l4 4L19 7' },
  { key: 'vendor', label: 'Vendor', icon: 'M3 7h18l-2 12H5zM8 7V5a4 4 0 0 1 8 0v2' },
  { key: 'saya', label: 'Saya', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0' },
]

const ROLE_LABEL = { pid_head: 'PID Head', pid_supervisor: 'PID Supervisor', pid_staff: 'PID Staff / R&D', viewer: 'Viewer' }

function UserMenu({ me, onLogout }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const id = setTimeout(() => document.addEventListener('click', close), 0)
    return () => { clearTimeout(id); document.removeEventListener('click', close) }
  }, [open])
  const initials = me.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} aria-label="Menu akun"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-bata text-[11px] font-bold text-cream">{initials}</button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-48 rounded-xl border border-line bg-card p-2 shadow-lg" onClick={(e) => e.stopPropagation()}>
          <div className="px-2 py-1"><div className="truncate text-sm font-bold">{me.name}</div><div className="text-[11px] text-char/60">{ROLE_LABEL[me.role]}{me.isAdmin ? ' · Admin' : ''}</div></div>
          <a href="#/saya" onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-sm hover:bg-tint2">Profil & tugas saya</a>
          <button onClick={() => { setOpen(false); onLogout() }} className="w-full rounded-lg px-2 py-2 text-left text-sm font-semibold text-bata hover:bg-tint2">Logout</button>
        </div>
      )}
    </div>
  )
}

function OfflineBar({ offline, onSync }) {
  const [n, setN] = useState(getQueue().length)
  useEffect(() => { const f = () => setN(getQueue().length); window.addEventListener('pid-queue', f); return () => window.removeEventListener('pid-queue', f) }, [])
  if (!offline && !n) return null
  return (
    <div className={`flex items-center justify-between gap-2 px-4 py-2 text-xs font-semibold text-white ${offline ? 'bg-char' : 'bg-amber'}`}>
      <span>{offline ? 'Offline — menampilkan data terakhir.' : 'Online kembali.'}{n > 0 && ` ${n} perubahan menunggu dikirim.`}</span>
      {!offline && n > 0 && <button className="rounded-full border border-white px-3 py-1" onClick={onSync}>Kirim sekarang</button>}
    </div>
  )
}

function Shell() {
  const toast = useToast()
  const [offline, setOffline] = useState(!navigator.onLine)
  const [authed, setAuthed] = useState(!!getToken())
  const [state, setState] = useState(null)
  const [err, setErr] = useState(null)
  const [refreshedAt, setRefreshedAt] = useState(null)
  const hash = useHash()
  const timer = useRef(null)

  const sync = useCallback(async () => {
    if (!getQueue().length) return
    const r = await flushQueue()
    if (r.sent) toast(`${r.sent} perubahan offline terkirim`)
    if (r.failed.length) toast(`${r.failed.length} perubahan ditolak server: ${r.failed[0]}`, 'err')
  }, [])
  const load = useCallback(async () => {
    if (!getToken()) return
    try {
      if (navigator.onLine && getQueue().length) await sync()
      const s = await api('/api/state')
      setState(s); setErr(null)
      setOffline(!!s.__offline || !navigator.onLine)
      if (!s.__offline) setRefreshedAt(new Date().toISOString())
    } catch (e) { setErr(e.message); setOffline(!navigator.onLine) }
  }, [sync])
  useEffect(() => {
    const on = () => { setOffline(false); load() }, off = () => setOffline(true)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [load])

  useEffect(() => {
    const out = () => { setAuthed(false); setState(null) }
    window.addEventListener('pid-logout', out)
    return () => window.removeEventListener('pid-logout', out)
  }, [])

  useEffect(() => {
    if (!authed) return
    load()
    const tick = () => { if (!document.hidden) load() }
    timer.current = setInterval(tick, 8000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(timer.current); document.removeEventListener('visibilitychange', tick) }
  }, [authed, load])

  if (!authed) return <Login onLogin={() => { setAuthed(true); go('#/beranda') }} />
  if (!state) return <div className="flex min-h-screen items-center justify-center text-sm text-char/60">{err || 'Memuat dashboard…'}</div>

  const [hpath, hquery = ''] = hash.replace('#', '').split('?')
  const [, page, id] = hpath.split('/')
  const logout = async () => {
    if (getQueue().length && !confirm(`Masih ada ${getQueue().length} perubahan offline yang belum terkirim dan akan hilang. Tetap logout?`)) return
    try { await api('/api/auth/logout', { method: 'POST' }) } catch {}
    setToken(null); setAuthed(false); go('#/beranda')
  }
  const present = page === 'timeline' && hquery.includes('present=1')
  const waiting = state.projects.filter((p) => p.waitingDecision).length
  const isHead = state.me.role === 'pid_head' || state.me.isAdmin
  const ctx = { state, reload: load }

  let body
  if (page === 'proyek' && id) body = <ProjectDetail key={id} id={id} {...ctx} />
  else if (page === 'proyek') body = <Proyek {...ctx} />
  else if (page === 'timeline') body = <Timeline {...ctx} present={present} />
  else if (page === 'keputusan') body = <Keputusan {...ctx} />
  else if (page === 'vendor') body = <Vendor {...ctx} />
  else if (page === 'saya') body = <Saya {...ctx} onLogout={logout} />
  else body = <Beranda {...ctx} />

  if (present) return <div className="min-h-screen bg-cream">{body}</div>
  return (
    <div className="min-h-screen pb-[84px] sm:pb-0 sm:pl-[220px] print:p-0">
      <header className="sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur print:hidden">
        <OfflineBar offline={offline} onSync={() => sync().then(load)} />
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5">
          <div>
            <div className="text-[19px] leading-none text-bata"><b className="font-extrabold">PID</b> Dashboard</div>
            <div className="mt-0.5 text-[11px] text-char/60">Product Innovation Development</div>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1.5">
              <a href={`/laporan?t=${state.settings.shareToken}`} target="_blank" rel="noreferrer" className="rounded-full border border-bata px-2.5 py-1 text-[11px] font-bold text-bata sm:hidden">Reporting ↗</a>
              <UserMenu me={state.me} onLogout={logout} />
            </div>
            <span className="hidden sm:block"><Logo /></span>
            <div className="flex items-center gap-1 text-[10px] text-char/50"><span className={`h-1.5 w-1.5 rounded-full ${err || offline ? 'bg-amber' : 'bg-hijau'}`} />{err || offline ? 'Offline' : `Refresh ${fmtWhen(refreshedAt).split(' ').pop()}`}</div>
          </div>
        </div>
      </header>

      {/* desktop side nav */}
      <nav className="fixed inset-y-0 left-0 hidden w-[220px] flex-col border-r border-line bg-card px-3 py-5 sm:flex print:!hidden">
        <div className="mb-6 px-2"><Logo /></div>
        {NAV.map((n) => (
          <a key={n.key} href={`#/${n.key}`} className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${page === n.key || (!page && n.key === 'beranda') ? 'bg-bata text-cream' : 'text-char/80 hover:bg-tint2'}`}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
            {n.label}{n.key === 'keputusan' && waiting > 0 && <span className="ml-auto rounded-full bg-amber px-1.5 text-[11px] text-white">{waiting}</span>}
          </a>
        ))}
        <a href={`/laporan?t=${state.settings.shareToken}`} target="_blank" rel="noreferrer" className="mt-auto px-3 text-xs font-semibold text-bata underline">Buka Reporting ↗</a>
        <div className="mt-3 border-t border-line px-3 pt-3">
          <div className="truncate text-sm font-semibold">{state.me.name}</div>
          <div className="mb-2 text-[11px] text-char/60">{ROLE_LABEL[state.me.role]}{state.me.isAdmin ? ' · Admin' : ''}</div>
          <button className="btn-o h-9 min-h-0 w-full text-xs" onClick={logout}>Logout</button>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 pt-4">{body}</main>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] sm:hidden print:!hidden">
        {NAV.filter((n) => !n.desktopOnly).map((n) => {
          const on = page === n.key || (!page && n.key === 'beranda')
          return (
            <a key={n.key} href={`#/${n.key}`} className={`relative flex h-[60px] flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold ${on ? 'text-bata' : 'text-char/60'}`}>
              {on && <span className="absolute top-0 h-[3px] w-8 rounded-b bg-bata" />}
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
              {n.label}
              {n.key === 'keputusan' && waiting > 0 && isHead && <span className="absolute right-[22%] top-2 rounded-full bg-amber px-1.5 text-[10px] text-white">{waiting}</span>}
            </a>
          )
        })}
      </nav>
    </div>
  )
}

export default function App() {
  const path = window.location.pathname
  return <ToastProvider>{path.startsWith('/laporan') ? <Laporan /> : path.startsWith('/survey/') ? <Survey /> : <Shell />}</ToastProvider>
}
