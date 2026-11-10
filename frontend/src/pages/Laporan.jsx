import React, { useEffect, useState } from 'react'
import { Takeaway, Tiles, LaunchCalendar, PipelineByCategory, LaunchScorecard } from '../overview.jsx'
import { Empty, Logo, Section, Sheet, Stepper, StatusPill, fmtTgl, fmtWhen, useToast, ROMAN } from '../ui.jsx'

export default function Laporan() {
  const toast = useToast()
  const t = new URLSearchParams(window.location.search).get('t') || ''
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(null)
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
          <div className="mt-4 text-[28px] leading-none"><b className="font-extrabold">PID</b> Reporting</div>
          <div className="mt-2 flex items-center gap-2 text-xs font-semibold"><span className="h-px w-5 bg-cream" />Product Innovation Development · read-only</div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-4">
        <Takeaway text={r.summary.takeaway} />
        <Tiles s={r.summary} />
        <div className="lg:grid lg:grid-cols-[1.4fr_1fr] lg:gap-6">
          <div>
            <LaunchCalendar slots={r.slots} categories={c.categories} order={c.categoryOrder} today={r.serverToday} />
            <PipelineByCategory projects={r.projects} stages={c.stages} categories={c.categories} order={c.categoryOrder} onOpen={setSel} />
          </div>
          <div>
            <Section title="Produk Launched" sub={`Tahun ${new Date().getFullYear()}`}>
              {r.launched.length ? r.launched.map((p) => (
                <div key={p.id} className="card mb-2 flex items-center justify-between p-3 text-sm">
                  <span><b>{p.nama}</b><span className="text-char/60"> · {c.categories[p.category].label}</span></span><span className="text-xs">{fmtTgl(p.launchedAt)}</span>
                </div>)) : <Empty>Belum ada produk launch tahun ini.</Empty>}
            </Section>
            <LaunchScorecard sc={r.scorecard} categories={c.categories} />
            <Section title="Flow PID" sub="7 stage pengembangan produk (SO-PID-010)">
              <div className="card p-3">
                {c.stages.map((s) => (
                  <div key={s.n} className="mb-2 flex gap-3 last:mb-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-hijau text-[11px] font-extrabold text-hijau">{s.roman}</div>
                    <div><div className="text-sm font-bold">{s.nama}{s.gate && <span className="ml-1 text-[10.5px] font-semibold text-amber">· keputusan PID Head</span>}</div><div className="text-xs text-char/60">{s.output}</div></div>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Weekly Update" sub={r.weeklyAt ? `Dikirim ${fmtWhen(r.weeklyAt)}` : 'Draft otomatis'}>
              <pre className="card whitespace-pre-wrap p-3 text-[12px] leading-relaxed">{r.weeklyText}</pre>
              <button className="btn-o mt-2 w-full" onClick={() => navigator.clipboard.writeText(r.weeklyText).then(() => toast('Teks tersalin')).catch(() => toast('Copy gagal', 'err'))}>Copy teks</button>
            </Section>
          </div>
        </div>
        <p className="pb-8 pt-2 text-center text-[11px] text-char/50">PT Citarasa Kuliner Indonesia · data internal, jangan disebarkan di luar CRK</p>
      </main>
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.nama}>
        {sel && <div className="text-sm">
          <div className="mb-2 flex items-center justify-between"><span className="text-xs text-char/60">{sel.kode} · {c.categories[sel.category].label}</span><StatusPill status={sel.flags.effectiveStatus} /></div>
          {sel.objective && <p className="mb-3 text-char/80">{sel.objective}</p>}
          <div className="mb-3"><Stepper stages={sel.stages} current={sel.currentStage} flags={sel.flags} status={sel.status} size="lg" /></div>
          {sel.stages.map((s, i) => (
            <div key={i} className="flex justify-between border-b border-line py-1.5 text-xs">
              <span><b className="text-hijau">{ROMAN[i]}</b> {c.stages[i].nama}</span>
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
