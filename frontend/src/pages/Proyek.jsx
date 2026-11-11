import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { go } from '../App.jsx'
import { ProjectCard } from '../overview.jsx'
import { Empty, Field, Sheet, Title, useToast, fmtPeriod, STATUS, STAGE, CAT } from '../ui.jsx'

const FILTERS = [
  ['aktif', '🏃 Berjalan'], ['sla', '🐢 Telat'], ['keputusan', '🗳️ Tunggu keputusan'], ['blocked', '🛑 Tersendat'], ['done', '🎉 Sudah launch'], ['dropped', '✖️ Dihentikan'], ['semua', 'Semua'],
]

export function NewProjectSheet({ open, onClose, state, presetSlot, reload }) {
  const c = state.constants
  const toast = useToast()
  const [f, setF] = useState({ category: 'varian_cimol', subType: [], slotId: '', targetLaunch: '', nama: '', objective: '', picId: state.me.id })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    const s = presetSlot && state.slots.find((x) => x.id === presetSlot)
    setF((o) => ({ ...o, category: s ? s.category : o.category, slotId: s ? s.id : '', nama: s ? s.label : o.nama, subType: [] }))
  }, [open, presetSlot])
  const freeSlots = state.slots.filter((s) => s.category === f.category && !s.flags.hasProject && !s.flags.past)
  const editors = state.members.filter((m) => m.active && ['pid_head', 'pid_supervisor'].includes(m.role))
  const submit = async () => {
    setBusy(true)
    try {
      const r = await api('/api/projects', { method: 'POST', body: { ...f, slotId: f.slotId || null, targetLaunch: f.slotId ? null : (f.targetLaunch || null) } })
      if (r.queued) { toast('Offline: proyek akan dibuat otomatis saat online'); onClose(); return }
      toast(`Proyek ${r.project.kode} dibuat. Cek jadwal stage hasil back-schedule.`)
      onClose(); await reload(); go(`#/proyek/${r.project.id}`)
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  const sub = c.categories[f.category].subTypes
  return (
    <Sheet open={open} onClose={onClose} title="✨ Proyek baru" footer={<button className="btn-p w-full" disabled={busy || f.nama.length < 2} onClick={submit}>{busy ? 'Menyimpan…' : 'Buat proyek'}</button>}>
      <Field label="Kategori">
        <div className="grid grid-cols-2 gap-2">
          {c.categoryOrder.map((k) => (
            <button key={k} type="button" onClick={() => setF({ ...f, category: k, slotId: '', subType: [] })}
              className={`min-h-[52px] rounded-lg border px-2 text-left text-sm font-semibold ${f.category === k ? 'border-bata bg-bata text-cream' : 'border-line bg-white/60'}`}>
              <span className="mr-1">{CAT[k].emoji}</span>{c.categories[k].label}<div className={`text-[10.5px] font-normal ${f.category === k ? 'text-cream/80' : 'text-char/60'}`}>{c.categories[k].cadence}</div>
            </button>
          ))}
        </div>
      </Field>
      {sub.length > 0 && (
        <Field label="Jenis varian cimol (boleh lebih dari 1)">
          <div className="flex flex-wrap gap-2">
            {sub.map((s) => {
              const on = f.subType.includes(s)
              return <button key={s} type="button" onClick={() => setF({ ...f, subType: on ? f.subType.filter((x) => x !== s) : [...f.subType, s] })}
                className={`min-h-[40px] rounded-full border px-4 text-sm font-semibold ${on ? 'border-bata bg-bata text-cream' : 'border-bata text-bata'}`}>{s}</button>
            })}
          </div>
        </Field>
      )}
      <Field label="Rencana launch" hint="Jadwal tiap langkah otomatis dihitung mundur dari tanggal launch">
        <select className="inp" value={f.slotId} onChange={(e) => setF({ ...f, slotId: e.target.value })}>
          <option value="">Pilih tanggal sendiri / belum tahu</option>
          {freeSlots.map((s) => <option key={s.id} value={s.id}>{s.label}{s.flags.slotTerlambat ? ' (harusnya sudah mulai)' : ''}</option>)}
        </select>
      </Field>
      {!f.slotId && <Field label="Target launch"><input type="date" className="inp" value={f.targetLaunch} onChange={(e) => setF({ ...f, targetLaunch: e.target.value })} /></Field>}
      <Field label="Nama proyek"><input className="inp" value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} placeholder="mis. Varian Cimol Jun 2027" /></Field>
      <Field label="Tujuan"><textarea className="inp" rows={2} value={f.objective} onChange={(e) => setF({ ...f, objective: e.target.value })} placeholder="Mau bikin menu apa dan kenapa? (1–2 kalimat)" /></Field>
      <Field label="Penanggung jawab">
        <select className="inp" value={f.picId} onChange={(e) => setF({ ...f, picId: e.target.value })}>
          {editors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
    </Sheet>
  )
}

export default function Proyek({ state, reload }) {
  const c = state.constants
  const editor = ['pid_head', 'pid_supervisor'].includes(state.me.role) || state.me.isAdmin
  const [filter, setFilter] = useState(() => { try { const f = sessionStorage.getItem('pid_filter'); sessionStorage.removeItem('pid_filter'); return f || 'aktif' } catch { return 'aktif' } })
  const [cat, setCat] = useState('')
  const [stage, setStage] = useState(0)
  const [q, setQ] = useState('')
  const [presetSlot, setPresetSlot] = useState(null)
  const [openNew, setOpenNew] = useState(false)
  useEffect(() => {
    try { const s = sessionStorage.getItem('pid_new_slot'); if (s) { sessionStorage.removeItem('pid_new_slot'); setPresetSlot(s); setOpenNew(true) } } catch {}
  }, [])
  const list = useMemo(() => state.projects.filter((p) => {
    const st = p.flags.effectiveStatus
    if (cat && p.category !== cat) return false
    if (stage && p.currentStage !== stage) return false
    if (q && !`${p.nama} ${p.kode} ${(p.kandidatNames || []).join(' ')}`.toLowerCase().includes(q.toLowerCase())) return false
    switch (filter) {
      case 'aktif': return !['done', 'dropped'].includes(p.status)
      case 'sla': return p.flags.lewatSla
      case 'keputusan': return p.waitingDecision
      case 'blocked': return st === 'blocked'
      case 'done': return p.status === 'done'
      case 'dropped': return p.status === 'dropped'
      default: return true
    }
  }), [state.projects, filter, cat, q, stage])

  return (
    <div>
      <Title sub={`${list.length} proyek`} right={editor && <button className="btn-p hidden sm:inline-flex" onClick={() => { setPresetSlot(null); setOpenNew(true) }}>+ Proyek</button>} emoji="🧭">Semua Proyek</Title>
      <input className="inp mb-2" placeholder="🔎 Cari nama menu, kode, atau ide…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="no-scrollbar -mx-4 mb-2 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={`min-h-[36px] shrink-0 rounded-full border px-3 text-xs font-semibold ${filter === k ? 'border-bata bg-bata text-cream' : 'border-bata text-bata'}`}>{l}</button>)}
      </div>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {[['', 'Semua kategori'], ...c.categoryOrder.map((k) => [k, `${CAT[k].emoji} ${c.categories[k].label}`])].map(([k, l]) =>
          <button key={k} onClick={() => setCat(k)} className={`min-h-[34px] shrink-0 rounded-full px-3 text-xs font-semibold ${cat === k ? 'bg-char text-cream' : 'bg-tint2 text-char/80'}`}>{l}</button>)}
      </div>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4">
        <button onClick={() => setStage(0)} className={`min-h-[34px] shrink-0 rounded-full px-3 text-xs font-semibold ${!stage ? 'bg-char text-white' : 'bg-black/5 text-char/70'}`}>Semua langkah</button>
        {c.stages.map((s) => <button key={s.n} onClick={() => setStage(s.n)} title={s.nama}
          className={`min-h-[34px] shrink-0 rounded-full px-3 text-xs font-bold ${stage === s.n ? 'bg-char text-white' : 'bg-black/5 text-char/70'}`}>{STAGE[s.n - 1].emoji} {STAGE[s.n - 1].santai}</button>)}
      </div>
      {stage > 0 && <div className="-mt-2 mb-3 text-xs text-char/65">{STAGE[stage - 1].arti}</div>}
      {list.length ? <div className="grid gap-2.5 md:grid-cols-2">{list.map((p) => <ProjectCard key={p.id} p={p} stages={c.stages} categories={c.categories} onClick={() => go(`#/proyek/${p.id}`)} />)}</div>
        : <Empty emoji="🔍">Tidak ada proyek untuk pilihan ini.</Empty>}
      {editor && <button onClick={() => { setPresetSlot(null); setOpenNew(true) }} className="fixed bottom-[80px] right-4 z-30 flex h-14 items-center gap-1 rounded-full bg-bata px-5 text-sm font-bold text-cream shadow-lg sm:hidden">+ Proyek</button>}
      <NewProjectSheet open={openNew} onClose={() => setOpenNew(false)} state={state} presetSlot={presetSlot} reload={reload} />
    </div>
  )
}
