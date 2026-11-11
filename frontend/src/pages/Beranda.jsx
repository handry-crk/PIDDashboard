import React from 'react'
import { go } from '../App.jsx'
import { Takeaway, Tiles, LaunchCalendar, PipelineByCategory, Funnel, SlaCompliance, LaunchScorecard } from '../overview.jsx'
import { Section, useToast, greeting, STAGE, CAT } from '../ui.jsx'
import { api } from '../api.js'
import { monthOf, monthSummary } from '../timeline.jsx'

/** Up to 5 things that need someone's attention today, in plain words. */
function todayItems(state) {
  const me = state.me
  const head = me.role === 'pid_head' || me.isAdmin
  const t = state.serverToday
  const items = []
  const active = state.projects.filter((p) => !['done', 'dropped'].includes(p.status))
  for (const p of active) {
    const st = STAGE[p.currentStage - 1]
    if (p.waitingDecision) items.push({ p, tone: 'amber', emoji: '', text: head ? `Kamu perlu memutuskan: lanjut, revisi, atau stop` : 'Menunggu keputusan PID Head', sub: `${st.santai}`, rank: 0 })
    if (p.flags.effectiveStatus === 'blocked') items.push({ p, tone: 'red', emoji: '', text: `Tersendat: ${p.statusNote || 'butuh bantuan'}`, sub: `${st.santai}`, rank: 1 })
    if (p.flags.lewatSla) items.push({ p, tone: 'red', emoji: '', text: `Telat ${-p.flags.slaSisa} hari di langkah ${st.santai}`, sub: 'Selesaikan atau ubah jadwalnya', rank: 2 })
    else {
      const end = p.stages[p.currentStage - 1].plannedEnd
      if (end) {
        const d = Math.round((new Date(end) - new Date(t)) / 864e5)
        if (d >= 0 && d <= 3) items.push({ p, tone: 'blue', emoji: '', text: d === 0 ? `Langkah ${st.santai} harus selesai hari ini` : `Langkah ${st.santai} selesai ${d} hari lagi`, sub: 'Jangan sampai telat', rank: 3 })
      }
    }
  }
  for (const s of state.slots) {
    if (s.flags.slotTerlambat && !s.flags.past && s.flags.slotKosong) items.push({ slot: s, tone: 'purple', text: `${s.label} belum punya proyek`, sub: 'Seharusnya sudah mulai — buat proyeknya', rank: 4 })
  }
  items.sort((a, b) => a.rank - b.rank)
  return items.slice(0, 5)
}

const BAR = { amber: '#B8741A', red: '#B42F27', blue: '#2C6E8F', purple: '#7A4FA0' }

export default function Beranda({ state, reload }) {
  const toast = useToast()
  const head = state.me.role === 'pid_head' || state.me.isAdmin
  const c = state.constants
  const editor = ['pid_head', 'pid_supervisor'].includes(state.me.role) || state.me.isAdmin
  const items = todayItems(state)
  const firstName = state.me.name.split(' ')[0]
  const onTile = (k, id) => {
    if (k === 'keputusan') go('#/keputusan')
    else if (k === 'next') go(`#/proyek/${id}`)
    else { try { sessionStorage.setItem('pid_filter', k) } catch {} go('#/proyek') }
  }
  const onSlot = (s) => {
    if (s.project) return go(`#/proyek/${s.project.id}`)
    if (!editor) return
    try { sessionStorage.setItem('pid_new_slot', s.id) } catch {}
    go('#/proyek')
  }
  return (
    <div>
      <div className="mb-4">
        <div className="text-[13px] text-char/55">{greeting()},</div>
        <h1 className="text-[26px] font-extrabold leading-tight">{firstName} </h1>
      </div>
      <Takeaway text={state.summary.takeaway} />

      <Section title="Perlu diperhatikan" sub={items.length ? 'Ketuk untuk membuka' : undefined}>
        {items.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {items.map((it, i) => (
              <button key={i} onClick={() => it.p ? go(`#/proyek/${it.p.id}`) : onSlot(it.slot)}
                style={{ animationDelay: `${i * 70}ms` }}
                className={`anim-in relative flex items-center gap-3 overflow-hidden rounded-2xl bg-card p-3.5 pl-5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:shadow-md active:scale-[.98]`}>
                <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: BAR[it.tone] }} />
                <div className="min-w-0 flex-1">
                  {it.p && <div className="truncate text-[12px] font-bold text-char/60">{it.p.nama}</div>}
                  <div className="text-[14px] font-bold leading-snug">{it.text}</div>
                  <div className="text-[11.5px] text-char/60">{it.sub}</div>
                </div>
                <span className="text-char/40">›</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="anim-in rounded-2xl bg-[#DCEFE3] p-4 text-center"><div className="font-bold">Semua aman hari ini!</div><div className="text-[12px] text-char/60">Tidak ada yang telat atau menunggu keputusan.</div></div>
        )}
      </Section>

      <Tiles s={state.summary} onTile={onTile} />

      <button onClick={() => go('#/timeline')} className="anim-in group mb-7 flex w-full items-center gap-3 rounded-2xl bg-char p-4 text-left text-white transition hover:-translate-y-0.5 active:scale-[.99]">
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-extrabold">Lihat jadwal bulan ini</div>
          <div className="text-[12px] text-white/70">{monthSummary(state.projects, monthOf(state.serverToday), state.serverToday)}</div>
        </div>
        <span className="text-xl transition-transform group-hover:translate-x-1">→</span>
      </button>

      <div className="lg:grid lg:grid-cols-[1.4fr_1fr] lg:gap-6">
        <div>
          <PipelineByCategory projects={state.projects} stages={c.stages} categories={c.categories} order={c.categoryOrder} onOpen={(p) => go(`#/proyek/${p.id}`)} />
          <LaunchCalendar slots={state.slots} categories={c.categories} order={c.categoryOrder} today={state.serverToday} onSlot={onSlot}
            onDelete={head ? (s) => confirm(`Hapus slot ${s.label}?`) && api(`/api/slots/${s.id}`, { method: 'DELETE' }).then(() => { toast('Slot dihapus'); reload() }).catch((e) => toast(e.message, 'err')) : null} />
        </div>
        <div>
          <Section fold defaultOpen={false} title="Statistik lengkap" sub="Corong ide, ketepatan waktu, hasil setelah launch">
            <Funnel rows={state.funnel} />
            <SlaCompliance rows={state.slaCompliance} byCat={state.slaComplianceByCat} categories={c.categories} order={c.categoryOrder} />
            <LaunchScorecard sc={state.scorecard} categories={c.categories} onOpen={(r) => go(`#/proyek/${r.id}`)} />
          </Section>
        </div>
      </div>
    </div>
  )
}
