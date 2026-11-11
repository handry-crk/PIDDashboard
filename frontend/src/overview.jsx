import React, { useState } from 'react'
import { Bold, Empty, Pill, Progress, Section, StatusPill, Stepper, Tile, fmtPeriod, fmtTgl, slaText, BULAN, ROMAN, STAGE, CAT } from './ui.jsx'

export function Takeaway({ text }) {
  return (
    <div className="mb-5 flex gap-3 rounded-2xl bg-[#FFF4D6] p-3.5">
      <div className="text-2xl leading-none">📣</div>
      <div className="text-[14.5px] leading-snug"><Bold text={text} /></div>
    </div>
  )
}

export function Tiles({ s, onTile }) {
  const nl = s.nextLaunch
  return (
    <div className="mb-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      <Tile emoji="🏃" label="Proyek berjalan" value={s.activeProjects} sub={s.atRisk || s.blocked ? `${s.atRisk + s.blocked} perlu perhatian` : 'Semua terpantau'} onClick={() => onTile?.('aktif')} />
      <Tile emoji="✅" tone="green" label="Sesuai jadwal" value={s.onTrackPct === null ? '-' : `${s.onTrackPct}%`} sub={`${s.onTrack} dari ${s.started} proyek`} onClick={() => onTile?.('aktif')} />
      <Tile emoji="🐢" tone={s.overSla ? 'red' : 'cream'} label="Telat jadwal" value={s.overSla} sub={s.overSla ? 'Ketuk untuk lihat' : 'Tidak ada yang telat'} onClick={() => onTile?.('sla')} />
      <Tile emoji="🗳️" tone={s.waitingDecision ? 'amber' : 'cream'} label="Tunggu keputusan" value={s.waitingDecision} sub="oleh PID Head" onClick={() => onTile?.('keputusan')} />
      <Tile emoji="🚀" tone="blue" label="Launch berikutnya" value={nl ? `${nl.daysTo} hr` : '-'} sub={nl ? nl.nama : 'Belum ada target'} onClick={() => nl && onTile?.('next', nl.id)} />
      <Tile emoji="🎉" tone="purple" label={`Sudah launch ${new Date().getFullYear()}`} value={`${s.launchesYtd}`} sub={`target ${s.launchTargetYtd} menu/tahun`} />
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
    <Section emoji="📅" title="Kalender Launch" sub="Kapan menu baru direncanakan keluar, 12 bulan ke depan">
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
                  <td className="sticky left-0 z-10 bg-card px-2 py-2.5 font-semibold leading-tight"><span className="mr-1">{CAT[cat].emoji}</span>{categories[cat].label}<div className="text-[9.5px] font-normal text-char/55">{categories[cat].cadence}</div></td>
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
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full bg-amber" />Perlu perhatian</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full border-2 border-bata" />Belum ada proyek</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-bata bg-tint2" />Harusnya sudah mulai</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full bg-hijau" />Sudah launch</span>
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
              {onDelete && !sel.project && <button className="btn-g px-2 text-xs text-bata" onClick={() => { onDelete(sel); setSel(null) }}>Hapus</button>}
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
  const cat = CAT[p.category]
  const st = STAGE[p.currentStage - 1]
  const done = p.status === 'done'
  return (
    <button onClick={onClick} className="card block w-full overflow-hidden text-left transition active:scale-[.99]">
      <div className="flex items-start gap-3 p-3.5 pb-2">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[22px]" style={{ background: cat.soft }}>{cat.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[16px] font-extrabold leading-tight">{p.nama}</div>
          <div className="mt-0.5 truncate text-[12px] text-char/55">{categories[p.category].label}{(p.subType || []).length ? ` · ${p.subType.join(', ')}` : ''}{p.kandidatNames?.length ? ` · ${p.kandidatNames.slice(0, 3).join(', ')}` : ''}</div>
        </div>
        <StatusPill status={f.effectiveStatus} />
      </div>
      <div className="px-3.5 pb-3">
        <div className="mb-2 flex items-center gap-2">
          <Progress value={f.progress} color={f.lewatSla ? '#B42F27' : '#2F6B4A'} />
          <span className="shrink-0 text-[11px] font-bold text-char/60">{f.progress}%</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 text-[13px]">
            {done ? <span className="font-semibold">🎉 Sudah launch</span> : <>
              <span className="text-char/55">Sekarang: </span><span className="font-bold">{st.emoji} {st.santai}</span>
              {p.waitingDecision && <span className="ml-1 rounded-full bg-[#FBEBD2] px-2 py-0.5 text-[11px] font-bold text-amber">tunggu keputusan</span>}
            </>}
          </div>
          {sla && !done && <span className={`shrink-0 text-[12px] font-bold ${f.lewatSla ? 'text-bata' : 'text-char/70'}`}>{sla}</span>}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-black/[0.05] bg-black/[0.02] px-3.5 py-2 text-[11.5px] text-char/60">
        <span>🚀 Launch {p.targetLaunch ? fmtTgl(p.targetLaunch) : 'belum ditentukan'}{f.daysToLaunch != null && f.daysToLaunch >= 0 && !done ? ` · ${f.daysToLaunch} hari lagi` : ''}</span>
        {f.risikoLaunch && <span className="font-bold text-amber">bisa mundur ⚠️</span>}
        {f.stalled && !f.risikoLaunch && <span className="font-bold text-amber">lama tak ada update</span>}
      </div>
    </button>
  )
}

export function PipelineByCategory({ projects, stages, categories, order, onOpen, showDone = false }) {
  const [closed, setClosed] = useState({})
  return (
    <Section emoji="🧭" title="Semua Proyek" sub="Dikelompokkan per kategori menu">
      {order.map((cat) => {
        const ps = projects.filter((p) => p.category === cat && (showDone || !['done', 'dropped'].includes(p.status)))
        const c = categories[cat]
        return (
          <div key={cat} className="mb-3">
            <button onClick={() => setClosed({ ...closed, [cat]: !closed[cat] })} className="mb-2 flex w-full items-center justify-between border-b border-line pb-1.5">
              <span className="text-[15px] font-extrabold"><span className="mr-1.5">{CAT[cat].emoji}</span>{c.label} <span className="text-[12px] font-normal text-char/50">· {c.cadence}</span></span>
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-bold text-char/60">{ps.length} {closed[cat] ? '▸' : '▾'}</span>
            </button>
            {!closed[cat] && (ps.length ? <div className="grid gap-2.5 md:grid-cols-2">{ps.map((p) => <ProjectCard key={p.id} p={p} stages={stages} categories={categories} onClick={() => onOpen?.(p)} />)}</div>
              : <Empty emoji={CAT[cat].emoji}>Belum ada proyek di kategori ini</Empty>)}
          </div>
        )
      })}
    </Section>
  )
}

export function Funnel({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <Section emoji="🔻" title="Dari Ide sampai Launch" sub="Berapa ide yang bertahan di tiap langkah (12 bulan terakhir)">
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

export function SlaCompliance({ rows: allRows, byCat, categories, order }) {
  const [cat, setCat] = useState('')
  const rows = cat && byCat ? byCat[cat] : allRows
  const has = rows.some((r) => r.n > 0)
  const max = Math.max(1, ...rows.map((r) => Math.max(r.avgActual || 0, r.avgSla || 0)))
  return (
    <Section emoji="⏱️" title="Ketepatan Waktu" sub="Rata-rata lama tiap langkah dibanding batas waktunya">
      <div className="card p-3">
        {byCat && <select className="inp mb-3 py-2" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Semua kategori</option>{order.map((k) => <option key={k} value={k}>{categories[k].label}</option>)}</select>}
        {!has && <div className="mb-2 text-xs text-char/60">Belum ada langkah yang selesai, jadi belum bisa dihitung.</div>}
        {rows.map((r) => {
          const over = r.avgActual != null && r.avgSla != null && r.avgActual > r.avgSla
          return (
            <div key={r.stage} className="mb-2 grid grid-cols-[34px_1fr_64px] items-center gap-2 last:mb-0">
              <span className="text-[16px]">{STAGE[r.stage - 1].emoji}</span>
              <div>
                <div className="truncate text-[11.5px] text-char/70">{STAGE[r.stage - 1].santai}</div>
                <div className="relative h-2.5 rounded-full bg-tint2">
                  {r.avgActual != null && <div className="h-2.5 rounded-full" style={{ width: `${(r.avgActual / max) * 100}%`, background: over ? '#B42F27' : '#2F6B4A' }} />}
                  {r.avgSla != null && <div className="absolute top-[-3px] h-4 w-[2px] bg-char" style={{ left: `${(r.avgSla / max) * 100}%` }} />}
                </div>
              </div>
              <span className="text-right text-[11px]">{r.avgActual != null ? <><b className={over ? 'text-bata' : ''}>{String(r.avgActual).replace('.', ',')}</b>/{String(r.avgSla).replace('.', ',')} hr</> : '-'}</span>
            </div>
          )
        })}
        <div className="mt-2 text-[10.5px] text-char/55">Garis hitam = batas waktu. Bar merah = rata-rata lebih lama dari batas.</div>
      </div>
    </Section>
  )
}

export function LaunchScorecard({ sc, categories, onOpen }) {
  if (!sc) return null
  const V = { hit: ['🎯 Laris', '#2F6B4A'], miss: ['📉 Di bawah target', '#B42F27'], berjalan: ['⏳ Berjalan', '#B8741A'], 'belum ada data': ['Belum ada data', '#8A8378'] }
  return (
    <Section emoji="🏆" title="Hasil Setelah Launch" sub="Penjualan 4 minggu pertama dibanding target">
      <div className="card p-3">
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-tint2/70 p-2"><div className="text-[10.5px] text-char/60">Sudah launch</div><div className="text-lg font-extrabold text-bata">{sc.overall.launched}</div></div>
          <div className="rounded-xl bg-tint2/70 p-2"><div className="text-[10.5px] text-char/60">Sudah 4 minggu</div><div className="text-lg font-extrabold">{sc.overall.evaluated}</div></div>
          <div className="rounded-xl bg-tint2/70 p-2"><div className="text-[10.5px] text-char/60">Yang laris</div><div className="text-lg font-extrabold text-hijau">{sc.overall.hitRate == null ? '-' : `${sc.overall.hitRate}%`}</div></div>
        </div>
        {sc.byCategoryYear.length > 0 && (
          <div className="mb-3 overflow-hidden rounded-lg border border-line">
            <table className="w-full text-[12px]"><thead className="bg-bata text-cream"><tr><th className="px-2 py-1.5 text-left">Kategori</th><th className="px-1">Tahun</th><th className="px-1">Launch</th><th className="px-1">Laris</th><th className="px-2 text-right">%</th></tr></thead>
              <tbody>{sc.byCategoryYear.map((b) => <tr key={b.year + b.category} className="border-t border-line text-center"><td className="px-2 py-1.5 text-left font-semibold">{categories[b.category].label}</td><td>{b.year}</td><td>{b.launched}</td><td>{b.hit}/{b.evaluated}</td><td className="px-2 text-right font-bold">{b.hitRate == null ? '-' : `${b.hitRate}%`}</td></tr>)}</tbody></table>
          </div>
        )}
        {sc.projects.length ? sc.projects.slice(0, 8).map((r) => (
          <button key={r.id} onClick={() => onOpen?.(r)} className="mb-1.5 flex w-full items-center justify-between gap-2 border-b border-line pb-1.5 text-left text-[12.5px]">
            <div className="min-w-0"><div className="truncate font-semibold">{r.nama}</div><div className="text-[11px] text-char/60">{categories[r.category].label} · launch {r.launchedAt ? fmtTgl(r.launchedAt) : '-'} · {r.weeksFilled}/4 minggu</div></div>
            <div className="shrink-0 text-right"><div className="font-bold">{r.pct == null ? '-' : `${r.pct}%`}</div><Pill color={V[r.verdict][1]}>{V[r.verdict][0]}</Pill></div>
          </button>
        )) : <Empty emoji="🚀">Belum ada menu yang launch.</Empty>}
      </div>
    </Section>
  )
}
