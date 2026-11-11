import React, { useEffect, useState } from 'react'
import { Takeaway, Tiles, LaunchCalendar, PipelineByCategory, LaunchScorecard } from '../overview.jsx'
import { TimelineMonth, monthOf } from '../timeline.jsx'
import { Empty, Logo, Section, Sheet, Stepper, StatusPill, StepBadge, fmtTgl, fmtWhen, useToast, ROMAN, STAGE } from '../ui.jsx'

export default function Laporan() {
  const toast = useToast()
  const t = new URLSearchParams(window.location.search).get('t') || ''
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(null)
  const [view, setView] = useState(new URLSearchParams(window.location.search).get('view') === 'timeline' ? 'timeline' : 'ringkasan')
  const [month, setMonth] = useState(null)
  useEffect(() => {
    const load = () => fetch(`/api/report?t=${encodeURIComponent(t)}`).then(async (x) => {
      if (!x.ok) throw new Error((await x.json()).detail || 'Link tidak valid'); return x.json()
    }).then((d) => { setR(d); setErr('') }).catch((e) => setErr(e.message))
    load()
    const id = setInterval(() => { if (!document.hidden) load() }, 8000)
    return () => clearInterval(id)
  }, [t])
  if (err && !r) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-bata">{err}</div>
  if (!r) return <div className="flex min-h-screen items-center justify-center text-sm text-char/60">Memuat laporan…</div>
  const c = r.constants
  return (
    <div className="min-h-screen">
      <header className="bg-bata px-4 pb-5 pt-4 text-cream">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between"><Logo light /><span className="text-[10px] opacity-80">Update {fmtWhen(r.generatedAt)}</span></div>
          <div className="mt-4 text-[28px] font-extrabold leading-none">Laporan PID </div>
          <div className="mt-2 flex items-center gap-2 text-xs font-semibold"><span className="h-px w-5 bg-cream" />Product Innovation Development · read-only</div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-4">
        <div className="mb-4 flex gap-2 print:hidden">
          {[['ringkasan', 'Ringkasan'], ['timeline', 'Jadwal bulanan']].map(([k, l]) =>
            <button key={k} onClick={() => setView(k)} className={`min-h-[40px] flex-1 rounded-full border text-sm font-semibold sm:flex-none sm:px-5 ${view === k ? 'border-bata bg-bata text-cream' : 'border-bata text-bata'}`}>{l}</button>)}
          {view === 'timeline' && <button className="btn-o hidden px-4 text-xs sm:inline-flex" onClick={() => window.print()}>Print / PDF</button>}
        </div>
        {view === 'timeline' ? (
          <div className="pb-8"><TimelineMonth projects={r.projects} categories={c.categories} today={r.serverToday} month={month || monthOf(r.serverToday)} setMonth={setMonth} /></div>
        ) : <>
        <Takeaway text={r.summary.takeaway} />
        <Tiles s={r.summary} />
        <div className="lg:grid lg:grid-cols-[1.4fr_1fr] lg:gap-6">
          <div>
            <LaunchCalendar slots={r.slots} categories={c.categories} order={c.categoryOrder} today={r.serverToday} />
            <PipelineByCategory projects={r.projects} stages={c.stages} categories={c.categories} order={c.categoryOrder} onOpen={setSel} />
          </div>
          <div>
            <Section title="Menu yang sudah launch" sub={`Tahun ${new Date().getFullYear()}`}>
              {r.launched.length ? r.launched.map((p) => (
                <div key={p.id} className="card mb-2 flex items-center justify-between p-3 text-sm">
                  <span><b>{p.nama}</b><span className="text-char/60"> · {c.categories[p.category].label}</span></span><span className="text-xs">{fmtTgl(p.launchedAt)}</span>
                </div>)) : <Empty>Belum ada produk launch tahun ini.</Empty>}
            </Section>
            <LaunchScorecard sc={r.scorecard} categories={c.categories} />
            <Section title="7 Langkah Bikin Menu Baru" sub="Alur pengembangan produk PID (SO-PID-010)">
              <div className="card p-3">
                {c.stages.map((s) => (
                  <div key={s.n} className="mb-2 flex gap-3 last:mb-0">
                    <StepBadge n={s.n} size={34} tone="idle" />
                    <div><div className="text-sm font-bold">{s.n}. {STAGE[s.n - 1].santai} <span className="font-normal text-char/50">· {s.nama}</span>{s.gate && <span className="ml-1 text-[10.5px] font-semibold text-amber">· ada keputusan</span>}</div><div className="text-xs text-char/60">{STAGE[s.n - 1].arti}</div></div>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Update mingguan" sub={r.weeklyAt ? `Dikirim ${fmtWhen(r.weeklyAt)}` : 'Draft otomatis'}>
              <pre className="card whitespace-pre-wrap p-3 text-[12px] leading-relaxed">{r.weeklyText}</pre>
              <button className="btn-o mt-2 w-full" onClick={() => navigator.clipboard.writeText(r.weeklyText).then(() => toast('Teks tersalin')).catch(() => toast('Copy gagal', 'err'))}>Copy teks</button>
            </Section>
          </div>
        </div>
        </>}
        <p className="pb-8 pt-2 text-center text-[11px] text-char/50">PT Citarasa Kuliner Indonesia · data internal, jangan disebarkan di luar CRK</p>
      </main>
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.nama}>
        {sel && <div className="text-sm">
          <div className="mb-2 flex items-center justify-between"><span className="text-xs text-char/60">{sel.kode} · {c.categories[sel.category].label}</span><StatusPill status={sel.flags.effectiveStatus} /></div>
          {sel.objective && <p className="mb-3 text-char/80">{sel.objective}</p>}
          <div className="mb-3"><Stepper stages={sel.stages} current={sel.currentStage} flags={sel.flags} status={sel.status} size="lg" /></div>
          {sel.stages.map((s, i) => (
            <div key={i} className="flex justify-between border-b border-line py-1.5 text-xs">
              <span><b>{STAGE[i].santai}</b> <span className="text-char/50">· {c.stages[i].nama}</span></span>
              <span className="text-right">{s.state === 'skipped' ? 'skipped' : s.plannedStart ? `${fmtTgl(s.plannedStart, true)} – ${fmtTgl(s.plannedEnd, true)}` : '-'}{s.state === 'done' ? ' ✓' : ''}</span>
            </div>
          ))}
          <div className="mt-3 text-xs">Target launch <b>{sel.targetLaunch ? fmtTgl(sel.targetLaunch) : 'TBD'}</b>{sel.foodCost ? ` · Food cost ${sel.foodCost}` : ''}</div>
          {sel.kandidatNames?.length > 0 && <div className="mt-1 text-xs">Kandidat: {sel.kandidatNames.join(', ')}</div>}
        </div>}
      </Sheet>
    </div>
  )
}
