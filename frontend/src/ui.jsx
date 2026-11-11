import React, { useEffect, useState, createContext, useContext } from 'react'

export const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
export const STAGE_NAMES = ['Pencarian Ide', 'Penyaringan Ide', 'Pembuatan Konsep', 'Pengujian Konsep', 'Pembuatan Prototipe', 'Pengujian Prototipe', 'Komersialisasi']

/** Friendly meta per stage: emoji, everyday name, official name, what happens, what to do. */
export const STAGE = [
  { emoji: '💡', santai: 'Cari Ide', resmi: 'Pencarian Ide', bg: '#FFF4D6',
    arti: 'Kumpulkan sebanyak mungkin ide menu baru.', tugas: 'Tulis ide-ide menu dan dari mana idenya (expo, data GoFood, tren, dll).' },
  { emoji: '🔍', santai: 'Saring Ide', resmi: 'Penyaringan Ide', bg: '#E8F1FF',
    arti: 'Pilih ide yang paling layak dari semua ide.', tugas: 'Beri nilai 1–5 untuk tiap ide. Ide dengan nilai tinggi otomatis lolos.' },
  { emoji: '✏️', santai: 'Bikin Konsep', resmi: 'Pembuatan Konsep', bg: '#F3E8FF',
    arti: 'Gambarkan produknya: untuk siapa, harga berapa, dijual di mana.', tugas: 'Isi kartu konsep tiap ide yang lolos.' },
  { emoji: '🗳️', santai: 'Tes Konsep', resmi: 'Pengujian Konsep', bg: '#FFEAD9',
    arti: 'Konsep dinilai Direksi / panel, lalu PID Head memutuskan.', tugas: 'Catat nilai dari panel, lalu minta keputusan PID Head.' },
  { emoji: '🧪', santai: 'Bikin Contoh', resmi: 'Pembuatan Prototipe', bg: '#E2F5EA',
    arti: 'Buat contoh produk asli: resep, porsi, dan hitung modal (HPP).', tugas: 'Isi bahan & takaran, foto contohnya, dan cek food cost.' },
  { emoji: '👅', santai: 'Tes Rasa', resmi: 'Pengujian Prototipe', bg: '#FFE4E6',
    arti: 'Customer mencicipi dan memberi nilai (mis. 30 orang di Braga).', tugas: 'Buka survey QR, kumpulkan responden, lalu minta keputusan.' },
  { emoji: '🚀', santai: 'Siap Jual', resmi: 'Komersialisasi', bg: '#FCE7DA',
    arti: 'Siapkan launch bersama divisi lain.', tugas: 'Isi harga final & tanggal launch, centang checklist serah terima.' },
]
export const stageLabel = (n) => `${STAGE[n - 1].emoji} ${STAGE[n - 1].santai}`

export const CAT = {
  varian_cimol: { emoji: '🍡', color: '#B42F27', soft: '#F8E1DC' },
  minuman: { emoji: '🧋', color: '#2C6E8F', soft: '#DDEEF5' },
  online_food: { emoji: '🛵', color: '#2F6B4A', soft: '#DCEFE3' },
  new_brand: { emoji: '✨', color: '#7A4FA0', soft: '#ECE2F5' },
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
  not_started: { label: 'Belum mulai', emoji: '⏸️', color: '#8A8378', soft: '#EEEAE3' },
  on_track: { label: 'Aman', emoji: '✅', color: '#2F6B4A', soft: '#DCEFE3' },
  at_risk: { label: 'Perlu perhatian', emoji: '⚠️', color: '#B8741A', soft: '#FBEBD2' },
  blocked: { label: 'Tersendat', emoji: '🛑', color: '#B42F27', soft: '#F8DCD8' },
  done: { label: 'Sudah launch', emoji: '🎉', color: '#212121', soft: '#E7E2DA' },
  dropped: { label: 'Dihentikan', emoji: '✖️', color: '#8A8378', soft: '#EEEAE3' },
}
export const KSTATUS = {
  ide: 'Ide', lolos_screening: 'Lolos saring', gugur: 'Tidak lolos', konsep: 'Konsep', prototipe: 'Contoh',
  lolos_uji: 'Lolos tes rasa', launch: 'Launch 🎉', drop: 'Dihentikan',
}
export const VSTATUS = { prospek: 'Calon', sampling: 'Coba sampel', approved: 'Disetujui', blacklist: 'Diblokir' }

export function Title({ children, sub, right, emoji }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-[22px] font-extrabold leading-tight text-char">{emoji && <span className="mr-1.5">{emoji}</span>}{children}</h2>
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
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-bold ${big ? 'px-3 py-1 text-[13px]' : 'px-2.5 py-0.5 text-[11.5px]'}`}
    style={{ background: s.soft, color: s.color }}>{s.emoji} {s.label}</span>
}

/** Journey of 7 steps with emoji bubbles. */
export function Stepper({ stages, current, flags, status, size = 'sm', onTap, active, labels }) {
  const dim = size === 'lg' ? 'h-10 w-10 text-[18px]' : 'h-7 w-7 text-[13px]'
  return (
    <div>
      <div className="flex items-center">
        {stages.map((s, i) => {
          const n = i + 1
          const isCur = n === current && !['done', 'dropped'].includes(status)
          const over = isCur && flags?.lewatSla
          let cls = 'bg-white/60 border-line grayscale opacity-50'
          if (s.state === 'skipped') cls = 'border-dashed border-abu bg-transparent grayscale opacity-40'
          else if (s.state === 'done' || status === 'done') cls = 'border-hijau bg-[#DCEFE3]'
          else if (over) cls = 'border-bata bg-[#F8DCD8] ring-4 ring-bata/15'
          else if (isCur) cls = 'border-bata bg-white ring-4 ring-bata/15 scale-110'
          return (
            <React.Fragment key={n}>
              {i > 0 && <div className={`h-[3px] flex-1 rounded-full ${(s.state === 'done' || status === 'done') && s.state !== 'skipped' ? 'bg-hijau' : 'bg-line'}`} />}
              <button type="button" onClick={onTap ? () => onTap(n) : undefined}
                className={`relative flex ${dim} shrink-0 items-center justify-center rounded-full border-2 transition ${cls} ${active === n ? 'outline outline-2 outline-offset-2 outline-char' : ''} ${onTap ? '' : 'pointer-events-none'}`}
                title={`${STAGE[i].santai} (${STAGE_NAMES[i]})`} aria-label={`Langkah ${n} ${STAGE[i].santai}`}>
                <span>{STAGE[i].emoji}</span>
                {(s.state === 'done' || status === 'done') && s.state !== 'skipped' && size === 'lg' &&
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-hijau text-[9px] font-bold text-white">✓</span>}
              </button>
            </React.Fragment>
          )
        })}
      </div>
      {labels && (
        <div className="mt-1.5 flex justify-between">
          {stages.map((s, i) => (
            <div key={i} className={`w-10 text-center text-[9.5px] leading-tight ${i + 1 === current ? 'font-bold text-bata' : 'text-char/50'}`}>{STAGE[i].santai}</div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Thin progress bar with friendly caption. */
export function Progress({ value, color = '#2F6B4A' }) {
  return <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]"><div className="h-2 rounded-full transition-all" style={{ width: `${Math.max(3, value)}%`, background: color }} /></div>
}

export function Tile({ label, value, sub, emoji, tone = 'cream', onClick }) {
  const bg = { cream: 'bg-card', green: 'bg-[#DCEFE3]', amber: 'bg-[#FBEBD2]', red: 'bg-[#F8DCD8]', blue: 'bg-[#DDEEF5]', purple: 'bg-[#ECE2F5]' }[tone]
  return (
    <button onClick={onClick} className={`flex min-h-[92px] flex-col items-start justify-between rounded-2xl p-3 text-left shadow-[0_1px_0_rgba(0,0,0,0.04)] transition active:scale-[.97] ${bg}`}>
      <div className="flex w-full items-start justify-between gap-1">
        <div className="text-[12px] font-semibold leading-tight text-char/70">{label}</div>
        {emoji && <div className="text-[18px] leading-none">{emoji}</div>}
      </div>
      <div className="text-[28px] font-extrabold leading-none text-char">{value}</div>
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
        className={`flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-cream sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}>
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
      {t && <div className="fixed inset-x-3 bottom-[92px] z-[60] mx-auto max-w-md rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-xl"
        style={{ background: t.type === 'err' ? '#B42F27' : '#212121' }}>{t.type === 'err' ? '😕 ' : '👍 '}{t.msg}</div>}
    </ToastCtx.Provider>
  )
}

export function Empty({ children, emoji = '🌱' }) {
  return <div className="rounded-2xl border-2 border-dashed border-line p-5 text-center text-sm text-char/60"><div className="mb-1 text-2xl">{emoji}</div>{children}</div>
}

/** Section with optional fold. */
export function Section({ title, sub, right, children, className = '', emoji, fold, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!fold) return <section className={`mb-7 ${className}`}><Title sub={sub} right={right} emoji={emoji}>{title}</Title>{children}</section>
  return (
    <section className={`mb-4 ${className}`}>
      <button onClick={() => setOpen(!open)} className="mb-2 flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 text-left">
        <div><div className="text-[16px] font-extrabold">{emoji && <span className="mr-1.5">{emoji}</span>}{title}</div>{sub && <div className="text-[12px] text-char/60">{sub}</div>}</div>
        <span className={`text-lg text-char/50 transition ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open && children}
    </section>
  )
}

export function Bold({ text }) {
  const parts = String(text || '').split('**')
  return <>{parts.map((p, i) => i % 2 ? <b key={i} className="text-bata">{p}</b> : <span key={i}>{p}</span>)}</>
}

/** "⏰ 13 hari lagi" / "Telat 4 hari". */
export function slaText(f) {
  if (!f || f.slaSisa === null || f.slaSisa === undefined) return null
  if (f.slaSisa > 0) return `⏰ ${f.slaSisa} hari lagi`
  if (f.slaSisa === 0) return '⏰ Hari ini batasnya'
  return `🐢 Telat ${-f.slaSisa} hari`
}

export function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jakarta' }))
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
