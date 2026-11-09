import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api, getToken, setToken } from './api.js'
import { ToastProvider, Logo, fmtWhen } from './ui.jsx'
import Login from './pages/Login.jsx'
import Beranda from './pages/Beranda.jsx'
import Proyek from './pages/Proyek.jsx'
import ProjectDetail from './pages/ProjectDetail.jsx'
import Keputusan from './pages/Keputusan.jsx'
import Vendor from './pages/Vendor.jsx'
import Saya from './pages/Saya.jsx'
import Laporan from './pages/Laporan.jsx'
import Survey from './pages/Survey.jsx'

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
  { key: 'keputusan', label: 'Keputusan', icon: 'M5 13l4 4L19 7' },
  { key: 'vendor', label: 'Vendor', icon: 'M3 7h18l-2 12H5zM8 7V5a4 4 0 0 1 8 0v2' },
  { key: 'saya', label: 'Saya', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0' },
]

function Shell() {
  const [authed, setAuthed] = useState(!!getToken())
  const [state, setState] = useState(null)
  const [err, setErr] = useState(null)
  const [refreshedAt, setRefreshedAt] = useState(null)
  const hash = useHash()
  const timer = useRef(null)

  const load = useCallback(async () => {
    if (!getToken()) return
    try {
      const s = await api('/api/state')
      setState(s); setErr(null); setRefreshedAt(new Date().toISOString())
    } catch (e) { setErr(e.message) }
  }, [])

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

  const [, page, id] = hash.replace('#', '').split('/')
  const waiting = state.projects.filter((p) => p.waitingDecision).length
  const isHead = state.me.role === 'pid_head' || state.me.isAdmin
  const ctx = { state, reload: load }

  let body
  if (page === 'proyek' && id) body = <ProjectDetail key={id} id={id} {...ctx} />
  else if (page === 'proyek') body = <Proyek {...ctx} />
  else if (page === 'keputusan') body = <Keputusan {...ctx} />
  else if (page === 'vendor') body = <Vendor {...ctx} />
  else if (page === 'saya') body = <Saya {...ctx} onLogout={async () => { try { await api('/api/auth/logout', { method: 'POST' }) } catch {} setToken(null); setAuthed(false) }} />
  else body = <Beranda {...ctx} />

  return (
    <div className="min-h-screen pb-[84px] sm:pb-0 sm:pl-[220px]">
      <header className="sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5">
          <div>
            <div className="text-[19px] leading-none text-bata"><b className="font-extrabold">PID</b> Dashboard</div>
            <div className="mt-0.5 text-[11px] text-char/60">Product Innovation Development</div>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <a href={`/laporan?t=${state.settings.shareToken}`} target="_blank" rel="noreferrer" className="rounded-full border border-bata px-2.5 py-1 text-[11px] font-bold text-bata sm:hidden">Reporting ↗</a>
            <span className="hidden sm:block"><Logo /></span>
            <div className="flex items-center gap-1 text-[10px] text-char/50"><span className={`h-1.5 w-1.5 rounded-full ${err ? 'bg-amber' : 'bg-hijau'}`} />{err ? 'Offline' : `Refresh ${fmtWhen(refreshedAt).split(' ').pop()}`}</div>
          </div>
        </div>
      </header>

      {/* desktop side nav */}
      <nav className="fixed inset-y-0 left-0 hidden w-[220px] flex-col border-r border-line bg-card px-3 py-5 sm:flex">
        <div className="mb-6 px-2"><Logo /></div>
        {NAV.map((n) => (
          <a key={n.key} href={`#/${n.key}`} className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${page === n.key || (!page && n.key === 'beranda') ? 'bg-bata text-cream' : 'text-char/80 hover:bg-tint2'}`}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
            {n.label}{n.key === 'keputusan' && waiting > 0 && <span className="ml-auto rounded-full bg-amber px-1.5 text-[11px] text-white">{waiting}</span>}
          </a>
        ))}
        <a href={`/laporan?t=${state.settings.shareToken}`} target="_blank" rel="noreferrer" className="mt-auto px-3 text-xs font-semibold text-bata underline">Buka Reporting ↗</a>
      </nav>

      <main className="mx-auto max-w-6xl px-4 pt-4">{body}</main>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] sm:hidden">
        {NAV.map((n) => {
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
