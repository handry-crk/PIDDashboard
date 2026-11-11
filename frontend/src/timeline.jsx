import React, { useMemo, useState } from 'react'
import { BULAN, ROMAN, STAGE_NAMES, STAGE, Pill, fmtTgl } from './ui.jsx'

const DAY = 864e5
const pd = (s) => (s ? new Date(s.slice(0, 10) + 'T00:00:00') : null)
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const GATE = { 4: 'Keputusan lanjut/stop', 6: 'Keputusan lanjut/stop', 7: 'Persetujuan launch' }

export function monthOf(today) {
  const t = pd(today) || new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

/** Builds rows (project → stages overlapping the month) and an agenda for the month. */
export function buildMonth(projects, month, today = '') {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, m - 1, 1), end = new Date(y, m, 0)
  const s0 = iso(start), e0 = iso(end)
  const overlaps = (a, b) => a && b && a <= e0 && b >= s0
  const rows = [], agenda = []
  for (const p of projects) {
    if (p.status === 'dropped') continue
    const stages = []
    p.stages.forEach((s, i) => {
      if (s.state === 'skipped') return
      const n = i + 1
      const aEnd = s.actualEnd || (s.actualStart ? null : null)
      const plannedIn = overlaps(s.plannedStart, s.plannedEnd)
      const actualIn = s.actualStart && overlaps(s.actualStart, s.actualEnd || e0)
      if (!plannedIn && !actualIn) return
      stages.push({ n, ...s, aEnd })
      const label = `${STAGE[i].santai}`
      const stStart = s.actualStart ? 'done' : (today && s.plannedStart < today ? 'late' : 'upcoming')
      const stEnd = s.state === 'done' ? 'done' : (today && s.plannedEnd < today ? 'late' : 'upcoming')
      if (s.plannedStart && s.plannedStart >= s0 && s.plannedStart <= e0)
        agenda.push({ date: s.plannedStart, p, n, kind: GATE[n] ? 'gatestart' : 'mulai', text: `Mulai ${label}`, note: s.notes, status: stStart })
      if (s.plannedEnd && s.plannedEnd >= s0 && s.plannedEnd <= e0)
        agenda.push({ date: s.plannedEnd, p, n, kind: GATE[n] ? 'gate' : 'selesai', text: GATE[n] ? `${GATE[n]} · ${label}` : `Target selesai ${label}`, note: GATE[n] ? s.notes : '', status: stEnd })
    })
    if (p.targetLaunch && p.targetLaunch >= s0 && p.targetLaunch <= e0)
      agenda.push({ date: p.targetLaunch, p, n: 8, kind: 'launch', text: 'Target launch', status: p.status === 'done' ? 'done' : 'upcoming' })
    if (stages.length) rows.push({ p, stages })
  }
  agenda.sort((a, b) => a.date.localeCompare(b.date) || a.n - b.n)
  // merge the same event on the same date across projects (e.g. two projects start Pengujian Konsep on 23 Nov)
  const merged = []
  for (const a of agenda) {
    const prev = merged.find((x) => x.date === a.date && x.text === a.text && x.status === a.status)
    if (prev) { prev.items.push(a) } else merged.push({ ...a, items: [a] })
  }
  return { rows, agenda: merged, start, end, days: end.getDate(), s0, e0 }
}

export function monthSummary(projects, month, today) {
  const { rows, agenda } = buildMonth(projects, month, today)
  const [y, m] = month.split('-').map(Number)
  const gates = agenda.filter((a) => a.kind === 'gate' || a.kind === 'gatestart').reduce((n, a) => n + a.items.length, 0)
  const launches = agenda.filter((a) => a.kind === 'launch').length
  const stageCount = rows.reduce((a, r) => a + r.stages.length, 0)
  const late = rows.flatMap((r) => r.stages.filter((s) => s.state === 'in_progress' && s.plannedEnd && s.plannedEnd < today).map((s) => `${r.p.nama} di ${STAGE[s.n - 1].santai}`))
  let txt = `${BULAN[m - 1]} ${y}: ${rows.length} proyek, ${stageCount} langkah dikerjakan`
  txt += gates ? `; ${gates} agenda tes/keputusan bersama Direksi & PID Head` : ''
  txt += launches ? `; ${launches} target launch` : ''
  txt += '.'
  if (late.length) txt += ` Yang telat: ${late.join(', ')}.`
  return txt
}

export function TimelineMonth({ projects, categories, today, month, setMonth, onEdit, present }) {
  const [cat, setCat] = useState('')
  const filtered = useMemo(() => projects.filter((p) => !cat || p.category === cat), [projects, cat])
  const { rows, agenda, start, days, s0, e0 } = useMemo(() => buildMonth(filtered, month, today), [filtered, month, today])
  const [y, m] = month.split('-').map(Number)
  const shift = (d) => { const t = new Date(y, m - 1 + d, 1); setMonth(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`) }
  const col = (s) => Math.max(0, Math.min(days, (pd(s) - start) / DAY))  // 0..days
  const todayIn = today >= s0 && today <= e0
  const LW = present ? 230 : 170
  const W = present ? 38 : 26
  const dayList = Array.from({ length: days }, (_, i) => new Date(y, m - 1, i + 1))
  const summary = monthSummary(filtered, month, today)

  return (
    <div className={present ? 'tl-present' : ''}>
      <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
        <button className="btn-o h-10 min-h-0 w-10 px-0" onClick={() => shift(-1)} aria-label="Bulan sebelumnya">‹</button>
        <div className="min-w-[150px] text-center text-[17px] font-extrabold text-bata">{BULAN[m - 1]} {y}</div>
        <button className="btn-o h-10 min-h-0 w-10 px-0" onClick={() => shift(1)} aria-label="Bulan berikutnya">›</button>
        <select className="inp ml-auto w-auto py-2" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Semua kategori</option>
          {Object.entries(categories).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
        </select>
      </div>
      <div className="mb-3 border-t-2 border-bata pt-2 text-[14px] font-semibold leading-snug"><span className="mr-1 text-bata">→</span>{summary}</div>

      <div className="card overflow-hidden">
        <div className="no-scrollbar overflow-x-auto">
          <div style={{ width: LW + days * W }}>
            {/* header */}
            <div className="flex border-b border-line bg-bata text-cream">
              <div className="sticky left-0 z-20 shrink-0 bg-bata px-2 py-1.5 text-[11px] font-bold" style={{ width: LW }}>Proyek / langkah</div>
              {dayList.map((d) => {
                const we = d.getDay() === 0 || d.getDay() === 6
                const isT = iso(d) === today
                return <div key={d.getDate()} className={`shrink-0 py-1 text-center leading-tight ${we ? 'bg-black/10' : ''} ${isT ? 'bg-cream text-bata' : ''}`} style={{ width: W }}>
                  <div className="text-[9px] opacity-80">{HARI[d.getDay()]}</div><div className="text-[11px] font-bold">{d.getDate()}</div></div>
              })}
            </div>
            {/* rows */}
            {rows.length === 0 && <div className="p-4 text-sm text-char/60">Tidak ada langkah yang dijadwalkan bulan ini </div>}
            {rows.map(({ p, stages }) => (
              <div key={p.id} className="border-b border-line last:border-0">
                <div className="flex bg-tint2/60">
                  <div className="sticky left-0 z-10 shrink-0 bg-[#F3E6DF] px-2 py-1.5" style={{ width: LW }}>
                    <div className={`truncate font-bold ${present ? 'text-[14px]' : 'text-[12px]'}`}>{p.nama}</div>
                    <div className="truncate text-[10px] text-char/60">{p.kode} · {categories[p.category].label}{p.targetLaunch ? ` · launch ${fmtTgl(p.targetLaunch)}` : ''}</div>
                  </div>
                  <div className="relative flex-1">
                    {p.targetLaunch && p.targetLaunch >= s0 && p.targetLaunch <= e0 && (
                      <div className="absolute top-1 text-[13px]" style={{ left: col(p.targetLaunch) * W + W / 2 - 7 }} title="Target launch"></div>)}
                  </div>
                </div>
                {stages.map((s) => {
                  const pS = s.plannedStart && col(s.plannedStart), pE = s.plannedEnd && Math.min(days, col(s.plannedEnd) + 1)
                  const cont = s.plannedEnd && s.plannedEnd > e0
                  const aS = s.actualStart && col(s.actualStart)
                  const aE = s.actualStart && Math.min(days, s.actualEnd ? col(s.actualEnd) + 1 : (todayIn ? col(today) + 1 : (today > e0 ? days : 0)))
                  const late = s.plannedEnd && ((s.actualEnd && s.actualEnd > s.plannedEnd) || (!s.actualEnd && s.state === 'in_progress' && today > s.plannedEnd))
                  const gate = GATE[s.n]
                  return (
                    <div key={s.n} className="flex">
                      <button className="sticky left-0 z-10 shrink-0 border-r border-line bg-card px-2 py-1 text-left" style={{ width: LW }}
                        onClick={() => onEdit?.(p, s.n)} disabled={!onEdit}>
                        <span className="mr-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/[0.07] text-[9px] font-bold text-char/60">{s.n}</span>
                        <span className={`ml-1 font-semibold ${present ? 'text-[12.5px]' : 'text-[11px]'}`}>{STAGE[s.n - 1].santai}</span>
                        {s.state === 'done' && <span className="ml-1 text-[10px] font-bold text-hijau">✓</span>}
                        {s.state === 'in_progress' && <span className={`ml-1 text-[10px] font-bold ${late ? 'text-bata' : 'text-amber'}`}>●</span>}
                      </button>
                      <div className="relative" style={{ width: days * W, height: present ? 34 : 30 }} onClick={() => onEdit?.(p, s.n)}>
                        {dayList.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) && <div key={i} className="absolute inset-y-0 bg-black/[0.03]" style={{ left: i * W, width: W }} />)}
                        {s.plannedStart && s.plannedEnd && pE > pS && (
                          <div className={`absolute top-1 flex items-center overflow-hidden rounded px-1 text-[10px] font-semibold ${gate ? 'bg-tint text-bata' : 'bg-tint/80 text-char'} ${onEdit ? 'cursor-pointer' : ''}`}
                            style={{ left: pS * W + 1, width: Math.max(W - 2, (pE - pS) * W - 2), height: present ? 16 : 14 }}
                            title={`${STAGE_NAMES[s.n - 1]}: ${fmtTgl(s.plannedStart)} – ${fmtTgl(s.plannedEnd)}${s.notes ? ' · ' + s.notes : ''}`}>
                            <span className="truncate">{fmtTgl(s.plannedStart, true)}–{fmtTgl(s.plannedEnd, true)}{s.notes ? ` · ${s.notes}` : ''}</span>{cont && <span className="ml-auto pl-1">›</span>}
                          </div>
                        )}
                        {gate && s.plannedEnd && s.plannedEnd >= s0 && s.plannedEnd <= e0 && (
                          <div className="absolute top-0.5 h-3.5 w-3.5 rotate-45 border-2 border-bata bg-cream" style={{ left: col(s.plannedEnd) * W + W / 2 - 7 }} title={gate} />
                        )}
                        {s.actualStart && aE > aS && (
                          <div className={`absolute rounded ${late ? 'bg-bata' : 'bg-hijau'}`} style={{ left: aS * W + 1, width: Math.max(4, (aE - aS) * W - 2), bottom: 4, height: 5 }} title="Aktual" />
                        )}
                        {todayIn && <div className="absolute inset-y-0 w-[2px] bg-bata" style={{ left: col(today) * W + W / 2 }} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line px-3 py-2 text-[10.5px] text-char/70">
          <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-5 rounded bg-tint" />Rencana</span>
          <span className="flex items-center gap-1"><i className="inline-block h-1.5 w-5 rounded bg-hijau" />Aktual</span>
          <span className="flex items-center gap-1"><i className="inline-block h-1.5 w-5 rounded bg-bata" />Lewat jadwal</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rotate-45 border-2 border-bata" />Titik keputusan</span>
          <span>Target launch</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-[2px] bg-bata" />Hari ini</span>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-[17px] text-bata"><b className="font-extrabold">Agenda</b> {BULAN[m - 1]} {y}</div>
        {agenda.length ? (
          <div className="card agenda-card divide-y divide-line">
            {agenda.map((a, i) => (
              <div key={i} className="agenda-row flex gap-3 px-3 py-2">
                <div className={`w-14 shrink-0 text-center ${a.date < today ? 'opacity-60' : ''}`}>
                  <div className="text-[18px] font-extrabold leading-none text-bata">{Number(a.date.slice(8, 10))}</div>
                  <div className="text-[10px] text-char/60">{HARI[pd(a.date).getDay()]}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`${present ? 'text-[14px]' : 'text-[13px]'} font-semibold`}>
                    {(a.kind === 'gate' || a.kind === 'gatestart') && <span className="mr-1 text-bata">◆</span>}{a.text}</div>
                  {a.items.map((it, j) => <div key={j} className="text-[11.5px] text-char/65">{it.p.nama} · {it.p.kode}{it.note ? ` · ${it.note}` : ''}</div>)}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {a.status === 'done' && <Pill color="#2F6B4A">{a.kind === 'mulai' || a.kind === 'gatestart' ? '✓ Sudah mulai' : '✓ Selesai'}</Pill>}
                  {a.status === 'late' && <Pill color="#B42F27">Terlambat</Pill>}
                  {(a.kind === 'gate' || a.kind === 'gatestart') && a.status !== 'done' && <Pill color="#B8741A">Direksi / PID Head</Pill>}
                </div>
              </div>
            ))}
          </div>
        ) : <div className="card p-3 text-sm text-char/60">Tidak ada tanggal penting di bulan ini.</div>}
      </div>
    </div>
  )
}
