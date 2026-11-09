import React, { useEffect, useState, createContext, useContext } from 'react'

export const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

export const fmtTgl = (s, short = false) => {
  if (!s) return '-'
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return short ? `${d} ${BULAN[m - 1]}` : `${d} ${BULAN[m - 1]} ${y}`
}
export const fmtPeriod = (p) => { if (!p) return '-'; const [y, m] = p.split('-').map(Number); return `${BULAN[m - 1]} ${y}` }
export const fmtNum = (n, dec = 0) => (n === null || n === undefined || n === '' || isNaN(n)) ? '-' :
  Number(n).toLocaleString('id-ID', { minimumFractionDigits: dec, maximumFractionDigits: dec })
export const fmtRp = (n) => (n === null || n === undefined || n === '' || isNaN(n)) ? '-' : 'Rp' + fmtNum(Math.round(n))
export const fmtPct = (n) => (n === null || n === undefined) ? '-' : fmtNum(n, 1).replace(/,0$/, '') + '%'
export const fmtWhen = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
}

export const STATUS = {
  not_started: { label: 'Not started', color: '#8A8378' },
  on_track: { label: 'On track', color: '#2F6B4A' },
  at_risk: { label: 'At risk', color: '#B8741A' },
  blocked: { label: 'Blocked', color: '#B42F27' },
  done: { label: 'Launched', color: '#212121' },
  dropped: { label: 'Dropped', color: '#8A8378' },
}
export const KSTATUS = {
  ide: 'Ide', lolos_screening: 'Lolos screening', gugur: 'Gugur', konsep: 'Konsep', prototipe: 'Prototipe',
  lolos_uji: 'Lolos uji', launch: 'Launch', drop: 'Drop',
}
export const VSTATUS = { prospek: 'Prospek', sampling: 'Sampling', approved: 'Approved', blacklist: 'Blacklist' }

export function Title({ children, sub, right }) {
  const words = String(children).split(' ')
  return (
    <div className="mb-3 flex items-end justify-between gap-2">
      <div>
        <h2 className="text-[22px] leading-tight text-bata"><b className="font-extrabold">{words[0]}</b> {words.slice(1).join(' ')}</h2>
        {sub && <div className="mt-1 inline-block border-b border-bata pb-0.5 text-[13px] font-semibold text-char/80">{sub}</div>}
      </div>
      {right}
    </div>
  )
}

export function Pill({ children, color = '#B42F27', className = '' }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}
    style={{ borderColor: color, color }}>{children}</span>
}

export function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.not_started
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: s.color }}>
    {status === 'done' && '✓ '}{s.label}</span>
}

export function Stepper({ stages, current, flags, status, size = 'sm', onTap, active }) {
  const dim = size === 'lg' ? 'h-9 w-9 text-[11px]' : 'h-7 w-7 text-[10px]'
  return (
    <div className="flex items-center">
      {stages.map((s, i) => {
        const n = i + 1
        const isCur = n === current && !['done', 'dropped'].includes(status)
        const over = isCur && flags?.lewatSla
        let cls = 'border-line text-abu bg-transparent'
        if (s.state === 'done' || status === 'done') cls = 'border-hijau bg-hijau text-white'
        else if (s.state === 'skipped') cls = 'border-dashed border-abu text-abu bg-transparent'
        else if (over) cls = 'border-bata bg-bata text-white'
        else if (isCur) cls = 'border-hijau text-hijau bg-white ring-2 ring-hijau/25'
        return (
          <React.Fragment key={n}>
            {i > 0 && <div className={`h-[2px] flex-1 ${s.state === 'done' || status === 'done' ? 'bg-hijau' : 'bg-line'}`} />}
            <button type="button" onClick={onTap ? () => onTap(n) : undefined}
              className={`flex ${dim} shrink-0 items-center justify-center rounded-full border-2 font-extrabold ${cls} ${active === n ? 'outline outline-2 outline-offset-2 outline-bata' : ''} ${onTap ? '' : 'pointer-events-none'}`}
              title={s.nama}>{ROMAN[i]}</button>
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function Tile({ label, value, sub, accent, onClick }) {
  return (
    <button onClick={onClick} className="card flex min-h-[86px] flex-col items-start justify-between p-3 text-left">
      <div className="text-[11px] font-semibold leading-tight text-char/70">{label}</div>
      <div className={`text-[26px] font-extrabold leading-none ${accent || 'text-bata'}`}>{value}</div>
      {sub && <div className="text-[11px] leading-tight text-char/60">{sub}</div>}
    </button>
  )
}

export function Sheet({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-cream sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="text-base font-bold text-bata">{title}</div>
          <button onClick={onClose} className="btn-g -mr-2 h-10 min-h-0 w-10 px-0 text-xl" aria-label="Tutup">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="border-t border-line px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children, hint }) {
  return <label className="mb-3 block"><span className="lbl">{label}</span>{children}{hint && <span className="mt-1 block text-[11px] text-char/60">{hint}</span>}</label>
}

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }) {
  const [t, setT] = useState(null)
  useEffect(() => { if (t) { const id = setTimeout(() => setT(null), 3500); return () => clearTimeout(id) } }, [t])
  return (
    <ToastCtx.Provider value={(msg, type = 'ok') => setT({ msg, type })}>
      {children}
      {t && <div className="fixed inset-x-3 bottom-[84px] z-[60] mx-auto max-w-md rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg"
        style={{ background: t.type === 'err' ? '#B42F27' : '#212121' }}>{t.msg}</div>}
    </ToastCtx.Provider>
  )
}

export function Empty({ children }) {
  return <div className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-char/60">{children}</div>
}

export function Section({ title, sub, right, children, className = '' }) {
  return <section className={`mb-6 ${className}`}><Title sub={sub} right={right}>{title}</Title>{children}</section>
}

export function Bold({ text }) {
  const parts = String(text || '').split('**')
  return <>{parts.map((p, i) => i % 2 ? <b key={i} className="text-bata">{p}</b> : <span key={i}>{p}</span>)}</>
}

export function slaText(f) {
  if (!f || f.slaSisa === null || f.slaSisa === undefined) return null
  return f.slaSisa >= 0 ? `SLA sisa ${f.slaSisa} hari` : `Lewat ${-f.slaSisa} hari`
}

export function Logo({ light }) {
  const [img, setImg] = useState(true)
  return (
    <div className="flex items-center gap-2">
      {img && <img src="/logo.png" alt="" className="h-8 w-auto" onError={() => setImg(false)} />}
      <div className={`text-[10px] font-bold tracking-[2.5px] ${light ? 'text-cream/90' : 'text-bata'}`}>CRK GROUP</div>
    </div>
  )
}
