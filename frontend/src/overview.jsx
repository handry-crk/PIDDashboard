import React, { useState } from 'react'
import { Bold, Empty, Pill, Section, StatusPill, Stepper, Tile, fmtPeriod, fmtTgl, slaText, BULAN, ROMAN } from './ui.jsx'

export function Takeaway({ text }) {
  return (
    <div className="mb-4 border-t-2 border-bata pt-3 text-[15px] font-semibold leading-snug">
      <span className="mr-1 text-bata">→</span><Bold text={text} />
    </div>
  )
}

export function Tiles({ s, onTile }) {
  const nl = s.nextLaunch
  return (
    <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      <Tile label="Proyek aktif" value={s.activeProjects} sub={`${s.atRisk} at risk · ${s.blocked} blocked`} onClick={() => onTile?.('aktif')} />
      <Tile label="On track" value={s.onTrackPct === null ? '-' : `${s.onTrackPct}%`} sub={`${s.onTrack} dari ${s.started} proyek berjalan`} accent="text-hijau" onClick={() => onTile?.('aktif')} />
      <Tile label="Lewat SLA" value={s.overSla} sub="Stage melewati batas hari" accent={s.overSla ? 'text-bata' : 'text-char'} onClick={() => onTile?.('sla')} />
      <Tile label="Menunggu keputusan" value={s.waitingDecision} sub="Go / Revisi / Drop" accent={s.waitingDecision ? 'text-amber' : 'text-char'} onClick={() => onTile?.('keputusan')} />
      <Tile label="Launch berikutnya" value={nl ? `H-${nl.daysTo}` : '-'} sub={nl ? `${nl.nama} · ${fmtTgl(nl.date)}` : 'Belum ada target'} onClick={() => nl && onTile?.('next', nl.id)} />
      <Tile label={`Launch ${new Date().getFullYear()}`} value={`${s.launchesYtd}/${s.launchTargetYtd}`} sub="Actual / target cadence" accent="text-char" />
    </div>
  )
}

export function LaunchCalendar({ slots, categories, order, today, onSlot, onDelete }) {
  const t = new Date(today || Date.now())
  const months = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(t.getFullYear(), t.getMonth() + i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const [sel, setSel] = useState(null)
  return (
    <Section title="Launch Calendar" sub="Slot launch 12 bulan ke depan per kategori">
      <div className="card overflow-hidden">
        <div className="no-scrollbar overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[11px]">
            <thead>
              <tr className="bg-bata text-cream">
                <th className="sticky left-0 z-10 w-[96px] bg-bata px-2 py-2 text-left font-bold">Kategori</th>
                {months.map((m) => <th key={m} className="px-1 py-2 text-center font-bold">{BULAN[+m.slice(5) - 1]}<div className="text-[9px] font-normal opacity-80">{m.slice(2, 4)}</div></th>)}
              </tr>
            </thead>
            <tbody>
              {order.map((cat) => (
                <tr key={cat} className="border-b border-line last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-2 py-2.5 font-semibold leading-tight">{categories[cat].label}<div className="text-[9.5px] font-normal text-char/55">{categories[cat].cadence}</div></td>
                  {months.map((m) => {
                    const ss = slots.filter((s) => s.category === cat && s.period === m)
                    return (
                      <td key={m} className="px-0.5 py-2 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {ss.map((s) => {
                            const f = s.flags
                            let cls = 'border-2 border-bata bg-transparent', mark = ''
                            if (f.launched) { cls = 'bg-hijau border-2 border-hijau text-white'; mark = '✓' }
                            else if (f.hasProject) {
                              const st = s.project?.status
                              cls = `border-2 text-white ${st === 'at_risk' ? 'bg-amber border-amber' : st === 'blocked' ? 'bg-bata border-bata ring-2 ring-bata/30' : 'bg-bata border-bata'}`
                            } else if (f.slotTerlambat) cls = 'border-2 border-bata border-dashed ring-2 ring-bata/40 bg-tint2'
                            return (
                              <button key={s.id} onClick={() => setSel(s)} title={s.label}
                                className={`flex h-[26px] w-[26px] items-center justify-center rounded-full text-[10px] font-bold ${cls}`}>{mark}</button>
                            )
                          })}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line px-3 py-2 text-[10.5px] text-char/70">
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full bg-bata" />Ada proyek</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full bg-amber" />At risk</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full border-2 border-bata" />Slot kosong</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-bata bg-tint2" />Terlambat mulai</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full bg-hijau" />Launched</span>
        </div>
        {sel && (
          <div className="flex items-center justify-between gap-2 border-t border-line bg-tint2/60 px-3 py-2.5 text-sm">
            <div className="min-w-0">
              <div className="font-bold">{sel.label}</div>
              <div className="truncate text-xs text-char/70">
                {sel.project ? `${sel.project.kode} · ${sel.project.nama}` : sel.flags.slotTerlambat ? 'Belum ada proyek — seharusnya sudah mulai' : 'Belum ada proyek'}
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {onDelete && !sel.project && <button className="btn-g px-2 text-xs text-bata" onClick={() => { onDelete(sel); setSel(null) }}>Delete</button>}
              {onSlot && <button className="btn-o px-3 text-xs" onClick={() => onSlot(sel)}>{sel.project ? 'Buka' : 'Buat proyek'}</button>}
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

export function ProjectCard({ p, stages, categories, onClick }) {
  const f = p.flags
  const sla = slaText(f)
  return (
    <button onClick={onClick} className="card block w-full p-3 text-left active:bg-tint2/50">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold leading-tight">{p.nama}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-char/60">
            <span>{p.kode}</span>
            {(p.subType || []).map((s) => <Pill key={s}>{s}</Pill>)}
            {p.kandidatNames?.length > 0 && <span className="truncate">· {p.kandidatNames.slice(0, 3).join(', ')}</span>}
          </div>
        </div>
        <StatusPill status={f.effectiveStatus} />
      </div>
      <div className="my-2.5"><Stepper stages={p.stages} current={p.currentStage} flags={f} status={p.status} /></div>
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <div className="min-w-0 truncate"><b className="text-hijau">{ROMAN[p.currentStage - 1]}</b> {stages[p.currentStage - 1].nama}
          {p.waitingDecision && <span className="ml-1 font-semibold text-amber">· menunggu keputusan</span>}</div>
        {sla && p.status !== 'done' && <span className={`shrink-0 font-semibold ${f.lewatSla ? 'text-bata' : 'text-char/70'}`}>{sla}</span>}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-char/60">
        <span>Launch {p.targetLaunch ? fmtTgl(p.targetLaunch) : 'TBD'}{f.daysToLaunch != null && f.daysToLaunch >= 0 && p.status !== 'done' ? ` · H-${f.daysToLaunch}` : ''}</span>
        {f.risikoLaunch && <span className="font-semibold text-amber">Risiko mundur launch</span>}
        {f.stalled && !f.risikoLaunch && <span className="font-semibold text-amber">Stalled</span>}
      </div>
    </button>
  )
}

export function PipelineByCategory({ projects, stages, categories, order, onOpen, showDone = false }) {
  const [closed, setClosed] = useState({})
  return (
    <Section title="Pipeline per Kategori" sub="Progres 7 stage tiap proyek aktif">
      {order.map((cat) => {
        const ps = projects.filter((p) => p.category === cat && (showDone || !['done', 'dropped'].includes(p.status)))
        const c = categories[cat]
        return (
          <div key={cat} className="mb-3">
            <button onClick={() => setClosed({ ...closed, [cat]: !closed[cat] })} className="mb-2 flex w-full items-center justify-between border-b border-line pb-1.5">
              <span className="text-[14px] font-bold">{c.label} <span className="font-normal text-char/55">· {c.cadence}</span></span>
              <span className="text-xs text-char/60">{ps.length} proyek {closed[cat] ? '▸' : '▾'}</span>
            </button>
            {!closed[cat] && (ps.length ? <div className="grid gap-2.5 md:grid-cols-2">{ps.map((p) => <ProjectCard key={p.id} p={p} stages={stages} categories={categories} onClick={() => onOpen?.(p)} />)}</div>
              : <Empty>Belum ada proyek aktif di kategori ini</Empty>)}
          </div>
        )
      })}
    </Section>
  )
}

export function Funnel({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <Section title="Funnel Inovasi" sub="Kandidat ide sampai launch, 12 bulan terakhir">
      <div className="card p-3">
        {rows.map((r, i) => (
          <div key={r.label} className="mb-2 last:mb-0">
            <div className="mb-0.5 flex justify-between text-[12px]"><span className="font-semibold">{r.label}</span><span><b>{r.count}</b>{i > 0 && <span className="text-char/55"> · {r.pct}%</span>}</span></div>
            <div className="h-3 rounded-full bg-tint2"><div className="h-3 rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: i === rows.length - 1 ? '#2F6B4A' : '#B42F27', opacity: 1 - i * 0.08 }} /></div>
          </div>
        ))}
      </div>
    </Section>
  )
}

export function SlaCompliance({ rows }) {
  const has = rows.some((r) => r.n > 0)
  const max = Math.max(1, ...rows.map((r) => Math.max(r.avgActual || 0, r.avgSla || 0)))
  return (
    <Section title="SLA Compliance" sub="Rata-rata hari aktual vs SLA per stage (stage selesai)">
      <div className="card p-3">
        {!has && <div className="mb-2 text-xs text-char/60">Belum ada stage selesai dengan tanggal aktual lengkap.</div>}
        {rows.map((r) => {
          const over = r.avgActual != null && r.avgSla != null && r.avgActual > r.avgSla
          return (
            <div key={r.stage} className="mb-2 grid grid-cols-[34px_1fr_64px] items-center gap-2 last:mb-0">
              <span className="text-[12px] font-extrabold text-hijau">{r.roman}</span>
              <div>
                <div className="truncate text-[11px] text-char/70">{r.nama}</div>
                <div className="relative h-2.5 rounded-full bg-tint2">
                  {r.avgActual != null && <div className="h-2.5 rounded-full" style={{ width: `${(r.avgActual / max) * 100}%`, background: over ? '#B42F27' : '#2F6B4A' }} />}
                  {r.avgSla != null && <div className="absolute top-[-3px] h-4 w-[2px] bg-char" style={{ left: `${(r.avgSla / max) * 100}%` }} />}
                </div>
              </div>
              <span className="text-right text-[11px]">{r.avgActual != null ? <><b className={over ? 'text-bata' : ''}>{String(r.avgActual).replace('.', ',')}</b>/{String(r.avgSla).replace('.', ',')} hr</> : '-'}</span>
            </div>
          )
        })}
        <div className="mt-2 text-[10.5px] text-char/55">Garis hitam = SLA. Bar merah = rata-rata melewati SLA.</div>
      </div>
    </Section>
  )
}
