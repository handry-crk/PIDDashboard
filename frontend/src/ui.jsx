import React, { useEffect, useState, createContext, useContext } from 'react'

export const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
export const STAGE_NAMES = ['Pencarian Ide', 'Penyaringan Ide', 'Pembuatan Konsep', 'Pengujian Konsep', 'Pembuatan Prototipe', 'Pengujian Prototipe', 'Komersialisasi']

/** Friendly meta per stage: emoji, everyday name, official name, what happens, what to do. */
export const STAGE = [
  { emoji: '', santai: 'Cari Ide', resmi: 'Pencarian Ide', bg: '#FFF4D6',
    arti: 'Kumpulkan sebanyak mungkin ide menu baru.', tugas: 'Tulis ide-ide menu dan dari mana idenya (expo, data GoFood, tren, dll).' },
  { emoji: '', santai: 'Saring Ide', resmi: 'Penyaringan Ide', bg: '#E8F1FF',
    arti: 'Pilih ide yang paling layak dari semua ide.', tugas: 'Beri nilai 1–5 untuk tiap ide. Ide dengan nilai tinggi otomatis lolos.' },
  { emoji: '', santai: 'Bikin Konsep', resmi: 'Pembuatan Konsep', bg: '#F3E8FF',
    arti: 'Gambarkan produknya: untuk siapa, harga berapa, dijual di mana.', tugas: 'Isi kartu konsep tiap ide yang lolos.' },
  { emoji: '', santai: 'Tes Konsep', resmi: 'Pengujian Konsep', bg: '#FFEAD9',
    arti: 'Konsep dinilai Direksi / panel, lalu PID Head memutuskan.', tugas: 'Catat nilai dari panel, lalu minta keputusan PID Head.' },
  { emoji: '', santai: 'Bikin Contoh', resmi: 'Pembuatan Prototipe', bg: '#E2F5EA',
    arti: 'Buat contoh produk asli: resep, porsi, dan hitung modal (HPP).', tugas: 'Isi bahan & takaran, foto contohnya, dan cek food cost.' },
  { emoji: '', santai: 'Tes Rasa', resmi: 'Pengujian Prototipe', bg: '#FFE4E6',
    arti: 'Customer mencicipi dan memberi nilai (mis. 30 orang di Braga).', tugas: 'Buka survey QR, kumpulkan responden, lalu minta keputusan.' },
  { emoji: '', santai: 'Siap Jual', resmi: 'Komersialisasi', bg: '#FCE7DA',
    arti: 'Siapkan launch bersama divisi lain.', tugas: 'Isi harga final & tanggal launch, centang checklist serah terima.' },
]
export const stageLabel = (n) => `${STAGE[n - 1].santai}`

export const CAT = {
  varian_cimol: { emoji: '', short: 'VC', color: '#B42F27', soft: '#F8E1DC' },
  minuman: { emoji: '', short: 'MN', color: '#2C6E8F', soft: '#DDEEF5' },
  online_food: { emoji: '', short: 'OF', color: '#2F6B4A', soft: '#DCEFE3' },
  new_brand: { emoji: '', short: 'NB', color: '#7A4FA0', soft: '#ECE2F5' },
}

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
  not_started: { label: 'Belum mulai', emoji: '', color: '#8A8378', soft: '#EEEAE3' },
  on_track: { label: 'Aman', emoji: '', color: '#2F6B4A', soft: '#DCEFE3' },
  at_risk: { label: 'Perlu perhatian', emoji: '', color: '#B8741A', soft: '#FBEBD2' },
  blocked: { label: 'Tersendat', emoji: '', color: '#B42F27', soft: '#F8DCD8' },
  done: { label: 'Sudah launch', emoji: '', color: '#212121', soft: '#E7E2DA' },
  dropped: { label: 'Dihentikan', emoji: '', color: '#8A8378', soft: '#EEEAE3' },
}
export const KSTATUS = {
  ide: 'Ide', lolos_screening: 'Lolos saring', gugur: 'Tidak lolos', konsep: 'Konsep', prototipe: 'Contoh',
  lolos_uji: 'Lolos tes rasa', launch: 'Launch ', drop: 'Dihentikan',
}
export const VSTATUS = { prospek: 'Calon', sampling: 'Coba sampel', approved: 'Disetujui', blacklist: 'Diblokir' }

export function Title({ children, sub, right, emoji }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-[21px] font-extrabold leading-tight tracking-tight text-char">{children}</h2>
        {sub && <div className="mt-0.5 text-[13px] text-char/60">{sub}</div>}
      </div>
      {right}
    </div>
  )
}

export function Pill({ children, color = '#B42F27', className = '' }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${className}`}
    style={{ borderColor: color, color }}>{children}</span>
}

export function StatusPill({ status, big }) {
  const s = STATUS[status] || STATUS.not_started
  const live = status === 'at_risk' || status === 'blocked'
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${big ? 'px-3 py-1 text-[13px]' : 'px-2.5 py-0.5 text-[11.5px]'}`}
    style={{ background: s.soft, color: s.color }}>
    <span className="relative flex h-2 w-2">
      {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: s.color }} />}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: s.color }} />
    </span>{s.label}</span>
}

/** Small colored badge with category initials. */
export function CatBadge({ cat, size = 44, onTint }) {
  const c = CAT[cat] || CAT.varian_cimol
  return <div className="flex shrink-0 items-center justify-center rounded-2xl font-extrabold tracking-wide"
    style={{ width: size, height: size, background: onTint ? '#fff' : c.soft, color: c.color, fontSize: size * 0.32 }}>{c.short}</div>
}

/** Numbered step badge. */
export function StepBadge({ n, size = 40, tone = 'current' }) {
  const st = { current: 'bg-bata text-white', done: 'bg-hijau text-white', idle: 'bg-black/[0.06] text-char/50' }[tone]
  return <div className={`flex shrink-0 items-center justify-center rounded-full font-extrabold ${st}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>{n}</div>
}

/** Journey of 7 steps: numbered dots, animated connectors, pulsing current step. */
export function Stepper({ stages, current, flags, status, size = 'sm', onTap, active, labels }) {
  const dim = size === 'lg' ? 'h-9 w-9 text-[13px]' : 'h-6 w-6 text-[10.5px]'
  return (
    <div>
      <div className="flex items-center">
        {stages.map((s, i) => {
          const n = i + 1
          const isCur = n === current && !['done', 'dropped'].includes(status)
          const over = isCur && flags?.lewatSla
          const done = (s.state === 'done' || status === 'done') && s.state !== 'skipped'
          let cls = 'bg-black/[0.06] text-char/45'
          if (s.state === 'skipped') cls = 'border border-dashed border-char/30 text-char/35 bg-transparent'
          else if (done) cls = 'bg-hijau text-white'
          else if (over) cls = 'bg-bata text-white'
          else if (isCur) cls = 'bg-bata text-white'
          return (
            <React.Fragment key={n}>
              {i > 0 && <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-black/[0.07]">
                <div className="step-fill absolute inset-y-0 left-0 rounded-full bg-hijau" style={{ width: done ? '100%' : '0%', animationDelay: `${i * 70}ms` }} />
              </div>}
              <button type="button" onClick={onTap ? () => onTap(n) : undefined}
                className={`relative flex ${dim} shrink-0 items-center justify-center rounded-full font-bold transition-all duration-300 ${cls} ${active === n && !isCur ? 'ring-2 ring-char ring-offset-2 ring-offset-card' : ''} ${onTap ? 'hover:scale-110' : 'pointer-events-none'}`}
                title={`${STAGE[i].santai} (${STAGE_NAMES[i]})`} aria-label={`Langkah ${n} ${STAGE[i].santai}`}>
                {isCur && <span className={`absolute inset-0 rounded-full ${over ? 'bg-bata' : 'bg-bata'} pulse-ring`} />}
                <span className="relative">{done ? '✓' : n}</span>
              </button>
            </React.Fragment>
          )
        })}
      </div>
      {labels && (
        <div className="mt-2 flex justify-between">
          {stages.map((s, i) => (
            <div key={i} className={`w-11 text-center text-[10px] leading-tight transition-colors ${i + 1 === current ? 'font-bold text-bata' : 'text-char/45'}`}>{STAGE[i].santai}</div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Progress bar that fills on mount. */
export function Progress({ value, color = '#2F6B4A' }) {
  const [w, setW] = useState(0)
  useEffect(() => { const id = requestAnimationFrame(() => setW(value)); return () => cancelAnimationFrame(id) }, [value])
  return <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]"><div className="h-2 rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(2, w)}%`, background: color }} /></div>
}

/** Number that counts up when it appears. */
export function CountUp({ value }) {
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'))
  const suffix = typeof value === 'string' ? String(value).replace(/^[\d.,]+/, '') : ''
  const [n, setN] = useState(0)
  useEffect(() => {
    if (isNaN(num)) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(num); return }
    let raf, start
    const step = (t) => { start = start || t; const k = Math.min(1, (t - start) / 700); setN(Math.round(num * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [num])
  if (isNaN(num)) return <>{value}</>
  return <>{n}{suffix}</>
}

export function Tile({ label, value, sub, tone = 'cream', onClick, i = 0 }) {
  const bar = { cream: '#D9CDB8', green: '#2F6B4A', amber: '#B8741A', red: '#B42F27', blue: '#2C6E8F', purple: '#7A4FA0' }[tone]
  return (
    <button onClick={onClick} style={{ animationDelay: `${i * 60}ms` }}
      className="anim-in relative flex min-h-[96px] flex-col items-start justify-between overflow-hidden rounded-2xl bg-card p-3.5 pl-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:shadow-md active:scale-[.98]">
      <span className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: bar }} />
      <div className="text-[12px] font-semibold leading-tight text-char/60">{label}</div>
      <div className="text-[28px] font-extrabold leading-none text-char"><CountUp value={value} /></div>
      {sub && <div className="text-[11px] leading-tight text-char/55">{sub}</div>}
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
    <div className="fade-bg fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`sheet-up flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-cream sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}>
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-black/15 sm:hidden" />
        <div className="flex items-center justify-between px-5 py-3">
          <div className="text-[17px] font-extrabold text-char">{title}</div>
          <button onClick={onClose} className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/5 text-xl" aria-label="Tutup">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-3">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
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
      {t && <div key={t.msg} className="toast-in fixed inset-x-3 bottom-[92px] z-[60] mx-auto max-w-md rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-xl"
        style={{ background: t.type === 'err' ? '#B42F27' : '#212121' }}>{t.msg}</div>}
    </ToastCtx.Provider>
  )
}

export function Empty({ children }) {
  return <div className="anim-in rounded-2xl border-2 border-dashed border-black/10 p-5 text-center text-sm text-char/55">{children}</div>
}

/** Section with optional animated fold. */
export function Section({ title, sub, right, children, className = '', fold, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!fold) return <section className={`anim-in mb-7 ${className}`}><Title sub={sub} right={right}>{title}</Title>{children}</section>
  return (
    <section className={`mb-3 ${className}`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:bg-white">
        <div><div className="text-[15.5px] font-extrabold">{title}</div>{sub && <div className="text-[12px] text-char/55">{sub}</div>}</div>
        <span className={`text-char/40 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg></span>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden"><div className="pt-2">{children}</div></div>
      </div>
    </section>
  )
}

export function Bold({ text }) {
  const parts = String(text || '').split('**')
  return <>{parts.map((p, i) => i % 2 ? <b key={i} className="text-bata">{p}</b> : <span key={i}>{p}</span>)}</>
}

/** "13 hari lagi" / "Telat 4 hari". */
export function slaText(f) {
  if (!f || f.slaSisa === null || f.slaSisa === undefined) return null
  if (f.slaSisa > 0) return `${f.slaSisa} hari lagi`
  if (f.slaSisa === 0) return 'Batasnya hari ini'
  return `Telat ${-f.slaSisa} hari`
}

export function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jakarta' }))
  if (h < 4) return 'Selamat malam'
  if (h < 11) return 'Selamat pagi'
  if (h < 15) return 'Selamat siang'
  if (h < 18) return 'Selamat sore'
  return 'Selamat malam'
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
