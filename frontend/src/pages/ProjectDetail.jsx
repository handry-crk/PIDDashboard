import React, { useCallback, useEffect, useState } from 'react'
import { api, download } from '../api.js'
import { go } from '../App.jsx'
import { Attachments } from '../attachments.jsx'
import QRCode from 'qrcode'
import {
  STAGE, CAT, Section,
  Empty, Field, Pill, Sheet, StatusPill, Stepper, Title, useToast, fmtTgl, fmtRp, fmtPct, fmtWhen, fmtNum,
  KSTATUS, ROMAN, slaText, STATUS,
} from '../ui.jsx'

/* ---------- small autosave inputs ---------- */
// Indonesian number entry: "120.000" -> 120000, "4,5" -> 4.5
export const parseNum = (t) => {
  if (t === null || t === undefined || String(t).trim() === '') return null
  let x = String(t).replace(/Rp|\s/g, '')
  if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.')
  else if (/\.\d{3}$/.test(x)) x = x.replace(/\./g, '')
  const n = Number(x)
  return isNaN(n) ? NaN : n
}
const showNum = (n) => (n === null || n === undefined || n === '') ? '' : String(n).replace('.', ',')

function Auto({ value, onSave, type = 'text', placeholder, rows, disabled, inputMode, className = '' }) {
  const toText = (x) => type === 'number' ? showNum(x) : (x ?? '')
  const [v, setV] = useState(toText(value))
  const [bad, setBad] = useState(false)
  useEffect(() => { setV(toText(value)); setBad(false) }, [value])
  const commit = () => {
    if (type === 'number') {
      const nv = parseNum(v)
      if (Number.isNaN(nv)) { setBad(true); return }
      setBad(false)
      if (nv !== (value === '' || value === undefined ? null : parseNum(value))) onSave(nv)
      return
    }
    if ((v ?? '') !== (value ?? '')) onSave(v)
  }
  const props = { className: `inp ${className} ${bad ? 'border-bata ring-1 ring-bata' : ''}`, value: v, placeholder, disabled, onChange: (e) => setV(e.target.value), onBlur: commit }
  if (rows) return <textarea rows={rows} {...props} />
  return <input type={type === 'number' ? 'text' : type} inputMode={type === 'number' ? 'decimal' : inputMode} {...props}
    onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
}
function Sel({ value, onSave, options, disabled }) {
  return <select className="inp" value={value ?? ''} disabled={disabled} onChange={(e) => onSave(e.target.value)}>
    {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
  </select>
}
function Score({ value, onChange, disabled }) {
  return <div className="flex gap-1.5">{[1, 2, 3, 4, 5].map((n) =>
    <button key={n} type="button" disabled={disabled} onClick={() => onChange(n)}
      className={`h-11 flex-1 rounded-xl border-2 text-[15px] font-extrabold ${value === n ? 'border-bata bg-bata text-cream' : value && n < value ? 'border-tint bg-tint2 text-bata' : 'border-line bg-white/60 text-char/60'}`}>{n}</button>)}</div>
}
const Box = ({ title, children, right }) => (
  <div className="card mb-3 p-4">
    {title && <div className="mb-2.5 flex items-center justify-between gap-2"><div className="text-[14.5px] font-extrabold">{title}</div>{right}</div>}
    {children}
  </div>
)

/* ---------- main ---------- */
export default function ProjectDetail({ id, state, reload }) {
  const toast = useToast()
  const [d, setD] = useState(null)
  const [active, setActive] = useState(null)
  const [dlg, setDlg] = useState(null)
  const [note, setNote] = useState('')
  const me = state.me
  const head = me.role === 'pid_head' || me.isAdmin
  const editor = head || me.role === 'pid_supervisor'
  const staff = me.role === 'pid_staff'
  const c = state.constants
  const settings = state.settings
  const summaryP = state.projects.find((x) => x.id === id)

  const load = useCallback(async () => {
    try { const r = await api(`/api/projects/${id}`); setD(r); setActive((a) => a ?? r.project.currentStage) } catch (e) { toast(e.message, 'err') }
  }, [id])
  useEffect(() => { load() }, [load, summaryP?.updatedAt, summaryP?.lastActivityAt])

  const run = async (fn, okMsg) => {
    try {
      const r = await fn()
      if (r && r.queued) { toast('Offline: perubahan disimpan dan dikirim otomatis saat online'); return true }
      if (r && r.project) setD(r); else await load()
      reload(); if (okMsg) toast(okMsg); return true
    } catch (e) { toast(e.message, 'err'); return false }
  }
  if (!d) return <div className="py-10 text-center text-sm text-char/60">Memuat proyek…</div>
  const p = d.project
  const f = p.flags
  const cur = p.currentStage
  const st = p.stages[active - 1]
  const stMeta = c.stages[active - 1]
  const sla = settings.slaDays[p.category]
  const closed = ['done', 'dropped'].includes(p.status)
  const decisionStage = [4, 6, 7].includes(cur)
  const curSt = p.stages[cur - 1]
  const nextN = (() => { let i = cur + 1; while (i <= 7 && p.stages[i - 1].state === 'skipped') i++; return i })()
  const prevN = (() => { let i = cur - 1; while (i >= 1 && p.stages[i - 1].state === 'skipped') i--; return i })()
  const continuing = d.kandidat.filter((k) => ['lolos_screening', 'konsep', 'prototipe', 'lolos_uji', 'launch'].includes(k.status))
  const visibleK = active <= 2 ? d.kandidat : continuing

  const moveStage = (to, n = '') => run(() => api(`/api/projects/${id}/stage`, { method: 'POST', body: { to, note: n } }))
    .then((ok) => { if (ok) { setActive(to > 7 ? 7 : to); setDlg(null); setNote('') } })
  const saveStage = (n, body) => run(() => api(`/api/projects/${id}/stages/${n}`, { method: 'PUT', body }))
  const saveDet = (n, k) => (v) => saveStage(n, { details: { [k]: v } })
  const saveK = (kid, body) => run(() => api(`/api/kandidat/${kid}`, { method: 'PUT', body }))
  const canEditStage = (n) => editor || (staff && [5, 6].includes(n))

  const cat = CAT[p.category]
  const reqList = requirements(p, d, cur)
  const allOk = reqList.every((r) => r.ok)
  const decLabel = { go: 'Lanjut ✅', revisi: 'Revisi ✏️', drop: 'Stop ✋' }
  const pic = state.members.find((m) => m.id === p.picId)?.name || '-'

  return (
    <div>
      <button onClick={() => go('#/proyek')} className="mb-3 inline-flex items-center gap-1 rounded-full bg-black/5 px-3 py-1.5 text-[13px] font-semibold">← Semua proyek</button>

      {/* hero */}
      <div className="card mb-4 overflow-hidden">
        <div className="flex items-start gap-3 p-4" style={{ background: cat.soft }}>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-[30px]">{cat.emoji}</div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[21px] font-extrabold leading-tight">{p.nama}</h1>
            <div className="mt-0.5 text-[12.5px] text-char/65">{c.categories[p.category].label}{(p.subType || []).length ? ` · ${p.subType.join(', ')}` : ''} · {p.kode}</div>
            <div className="mt-2"><StatusPill status={f.effectiveStatus} big /></div>
          </div>
        </div>
        {p.objective && <p className="px-4 pt-3 text-[13.5px] text-char/80">🎯 {p.objective}</p>}
        <div className="grid grid-cols-3 gap-2 p-3 text-center">
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-[18px]">🚀</div><div className="text-[10.5px] text-char/55">Launch</div><div className="text-[12.5px] font-bold">{p.targetLaunch ? fmtTgl(p.targetLaunch, true) : 'belum ada'}</div></div>
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-[18px]">⏳</div><div className="text-[10.5px] text-char/55">Sisa waktu</div><div className={`text-[12.5px] font-bold ${f.risikoLaunch ? 'text-amber' : ''}`}>{f.daysToLaunch != null && !closed ? `${f.daysToLaunch} hari` : '-'}</div></div>
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-[18px]">👤</div><div className="text-[10.5px] text-char/55">Penanggung jawab</div><div className="truncate text-[12.5px] font-bold">{pic}</div></div>
        </div>
      </div>
      {(p.status === 'blocked' || p.status === 'at_risk') && p.statusNote && <div className="mb-3 rounded-2xl bg-[#F8DCD8] p-3 text-[13.5px]">{STATUS[p.status].emoji} <b>{STATUS[p.status].label}:</b> {p.statusNote}</div>}
      {f.risikoLaunch && !closed && <div className="mb-3 rounded-2xl bg-[#FBEBD2] p-3 text-[13px]">⚠️ Waktu tersisa ({f.daysToLaunch} hari) lebih pendek dari waktu yang dibutuhkan langkah-langkah berikutnya ({f.remainingSlaDays} hari). Launch bisa mundur: percepat, lewati langkah yang tidak perlu, atau geser tanggal launch.</div>}

      {/* journey */}
      <div className="card mb-4 p-4">
        <div className="mb-3 flex items-center justify-between"><div className="text-[15px] font-extrabold">🧭 Perjalanan menu</div><span className="text-[12px] font-bold text-char/55">{f.progress}% selesai</span></div>
        <Stepper stages={p.stages} current={cur} flags={f} status={p.status} size="lg" onTap={setActive} active={active} labels />
        <div className="mt-3 text-center text-[11px] text-char/50">Ketuk ikon untuk melihat isi tiap langkah</div>
      </div>

      {closed && (
        <div className={`mb-4 flex items-center justify-between rounded-2xl p-4 ${p.status === 'done' ? 'bg-[#DCEFE3]' : 'bg-black/5'}`}>
          <span className="text-[15px] font-bold">{p.status === 'done' ? `🎉 Sudah launch ${fmtTgl(p.launchedAt)}` : '✖️ Proyek dihentikan'}</span>
          {p.status === 'dropped' && head && <button className="btn-o min-h-[38px] px-3 text-xs" onClick={() => run(() => api(`/api/projects/${id}/reopen`, { method: 'POST', body: {} }), 'Proyek dibuka kembali')}>Buka lagi</button>}
        </div>
      )}

      {/* current step card */}
      {!closed && active === cur && (
        <div className="mb-4 overflow-hidden rounded-3xl border-2 border-bata/70 bg-card">
          <div className="flex items-center gap-3 p-4" style={{ background: STAGE[cur - 1].bg }}>
            <div className="text-[38px] leading-none">{STAGE[cur - 1].emoji}</div>
            <div className="min-w-0">
              <div className="text-[11.5px] font-bold uppercase tracking-wide text-char/55">Langkah sekarang · {cur} dari 7</div>
              <div className="text-[22px] font-extrabold leading-tight">{STAGE[cur - 1].santai}</div>
              <div className="text-[11.5px] text-char/55">{STAGE[cur - 1].resmi}</div>
            </div>
          </div>
          <div className="p-4">
            <p className="mb-1 text-[14px]">{STAGE[cur - 1].arti}</p>
            <p className="mb-3 text-[13px] text-char/65">👉 {STAGE[cur - 1].tugas}</p>
            {curSt.state === 'in_progress' && slaText(f) && <div className={`mb-3 inline-block rounded-full px-3 py-1 text-[12.5px] font-bold ${f.lewatSla ? 'bg-[#F8DCD8] text-bata' : 'bg-black/5'}`}>{slaText(f)}</div>}
            {reqList.length > 0 && curSt.state === 'in_progress' && (
              <div className="mb-3 rounded-2xl bg-black/[0.03] p-3">
                <div className="mb-1.5 text-[12px] font-bold text-char/60">Syarat sebelum lanjut</div>
                {reqList.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 py-0.5 text-[13.5px]">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${r.ok ? 'bg-hijau text-white' : 'border-2 border-line bg-white'}`}>{r.ok ? '✓' : ''}</span>
                    <span className={r.ok ? 'text-char/55 line-through' : 'font-semibold'}>{r.text}</span>
                  </div>
                ))}
              </div>
            )}
            {curSt.decision && <div className={`mb-3 rounded-2xl p-3 text-[13.5px] ${curSt.decision === 'go' ? 'bg-[#DCEFE3]' : curSt.decision === 'drop' ? 'bg-black/5' : 'bg-[#FBEBD2]'}`}>
              Keputusan PID Head: <b>{decLabel[curSt.decision]}</b>{curSt.decisionNote ? ` — “${curSt.decisionNote}”` : ''}<div className="text-[11px] text-char/55">{curSt.decidedBy} · {fmtWhen(curSt.decidedAt)}</div></div>}
            {curSt.decisionRequested && !curSt.decision && <div className="mb-3 rounded-2xl bg-[#FBEBD2] p-3 text-[13.5px]">⏳ Sedang menunggu keputusan PID Head.</div>}

            {(editor || staff) && (
              <div className="grid gap-2">
                {editor && curSt.state === 'not_started' && <button className="btn-p w-full text-[15px]" onClick={() => moveStage(cur)}>▶️ Mulai langkah ini</button>}
                {head && decisionStage && curSt.state === 'in_progress' && curSt.decision !== 'go' && <button className="btn-p w-full text-[15px]" onClick={() => setDlg('decision')}>🗳️ Beri keputusan</button>}
                {decisionStage && curSt.state === 'in_progress' && !curSt.decisionRequested && curSt.decision !== 'go' && !head &&
                  <button className="btn-p w-full text-[15px]" onClick={() => run(() => api(`/api/projects/${id}/request-decision`, { method: 'POST', body: {} }), 'Permintaan keputusan dikirim ke PID Head')}>🙋 Minta keputusan PID Head</button>}
                {editor && curSt.state === 'in_progress' && (!decisionStage || curSt.decision === 'go') &&
                  <button className={`${allOk ? 'btn-p' : 'btn-o'} w-full text-[15px]`} onClick={() => moveStage(nextN)}>
                    {nextN > 7 ? '🎉 Selesai — tandai sudah launch' : `Lanjut ke ${STAGE[nextN - 1].emoji} ${STAGE[nextN - 1].santai} →`}</button>}
                {editor && <button className="btn-g text-[13px]" onClick={() => setDlg('more')}>⋯ Pilihan lain (mundur, lewati, ubah status, edit)</button>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* stage panel */}
      <div className="mb-3">
        {(active !== cur || closed) && (
          <div className="mb-3 flex items-center gap-3 rounded-2xl p-3" style={{ background: STAGE[active - 1].bg }}>
            <div className="text-[30px] leading-none">{STAGE[active - 1].emoji}</div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-char/55">Langkah {active} dari 7</div>
              <div className="text-[19px] font-extrabold leading-tight">{STAGE[active - 1].santai}</div>
              <div className="text-[11px] text-char/55">{STAGE[active - 1].resmi} · {STAGE[active - 1].arti}</div>
            </div>
            <StageState st={st} />
          </div>
        )}
        <StageMeta p={p} st={st} n={active} sla={sla} f={f} cur={cur} editor={editor && !closed} saveStage={saveStage} />
        {st.state === 'skipped' && <div className="mb-3 rounded-2xl bg-black/5 p-3 text-sm">⏭️ Langkah ini dilewati: {st.skipReason}</div>}
        {active !== cur && st.decision && <div className={`mb-3 rounded-2xl p-3 text-sm ${st.decision === 'go' ? 'bg-[#DCEFE3]' : st.decision === 'drop' ? 'bg-black/5' : 'bg-[#FBEBD2]'}`}>
          Keputusan PID Head: <b>{decLabel[st.decision]}</b> · {st.decidedBy}{st.decisionNote ? ` — “${st.decisionNote}”` : ''}</div>}

        <div className="mb-2 mt-5 text-[15px] font-extrabold">📝 Isian langkah {STAGE[active - 1].santai}</div>
        {active === 1 && <Stage1 d={d} id={id} c={c} editor={editor && !closed} run={run} saveK={saveK} />}
        {active === 2 && <Stage2 d={d} settings={settings} editor={editor && !closed} run={run} saveK={saveK} />}
        {active === 3 && <Stage3 ks={visibleK} editor={editor && !closed} saveK={saveK} files={d.files} id={id} reload={load} />}
        {active === 4 && <Stage4 st={st} ks={visibleK} editor={editor && !closed} saveDet={saveDet} saveK={saveK} />}
        {active === 5 && <Stage5 d={d} id={id} ks={visibleK} state={state} p={p} can={canEditStage(5) && !closed} run={run} saveK={saveK} saveDet={saveDet} st={st} reload={load} />}
        {active === 6 && <Stage6 st={st} ks={visibleK} can={canEditStage(6) && !closed} saveDet={saveDet} saveK={saveK} d={d} id={id} reload={load} />}
        {active === 7 && <Stage7 st={st} p={p} d={d} editor={editor && !closed} postEditor={editor && p.status !== 'dropped'} saveDet={saveDet} run={run} id={id} targetFc={d.targetFoodCostPct} />}

        <Box title="🗒️ Catatan">
          <Auto rows={3} value={st.notes} disabled={!canEditStage(active) || closed} onSave={(v) => saveStage(active, { notes: v })} placeholder="Tulis catatan, kendala, atau link referensi…" />
        </Box>
        <Box title="📎 Lampiran" right={<span className="text-[11px] text-char/55">foto, PDF, Excel · maks 10 MB</span>}>
          <Attachments files={d.files.filter((f) => f.stage === active && !f.kandidatId)} params={{ projectId: id, stage: active, kind: 'attachment' }}
            can={(editor || staff) && !closed} onChange={load} label="Lampiran" />
        </Box>
      </div>

      <Section fold defaultOpen={false} emoji="🗓️" title="Jadwal & riwayat" sub="Rencana vs kenyataan tiap langkah, komentar, dan aktivitas">
        <Gantt p={p} c={c} today={state.serverToday} />
        <Timeline d={d} id={id} run={run} members={state.members} />
      </Section>

      {/* dialogs */}
      <Sheet open={dlg === 'more'} onClose={() => setDlg(null)} title="Pilihan lain">
        <div className="grid gap-2 pb-2">
          {prevN >= 1 && <button className="btn-o justify-start" onClick={() => setDlg('back')}>↩️ Mundur ke {STAGE[prevN - 1].emoji} {STAGE[prevN - 1].santai}</button>}
          {![1, 7].includes(cur) && curSt.state !== 'skipped' && <button className="btn-o justify-start" onClick={() => setDlg('skip')}>⏭️ Lewati langkah {STAGE[cur - 1].santai}</button>}
          <button className="btn-o justify-start" onClick={() => setDlg('status')}>🚦 Ubah status (aman / perlu perhatian / tersendat)</button>
          <button className="btn-o justify-start" onClick={() => setDlg('edit')}>✏️ Edit nama, slot, dan tanggal launch</button>
          {me.isAdmin && <button className="btn-g justify-start text-bata" onClick={async () => { if (confirm('Hapus proyek ini beserta semua isinya?')) { await run(() => api(`/api/projects/${id}`, { method: 'DELETE' }), 'Proyek dihapus'); go('#/proyek') } }}>🗑️ Hapus proyek</button>}
        </div>
      </Sheet>
      <NoteDialog open={dlg === 'back'} title={`Mundur ke ${STAGE[Math.max(prevN, 1) - 1].santai}`} label="Kenapa perlu mundur?" onClose={() => setDlg(null)} onOk={(n) => moveStage(prevN, n)} />
      <NoteDialog open={dlg === 'skip'} title={`Lewati ${STAGE[cur - 1].santai}`} label="Kenapa langkah ini dilewati? (wajib)" onClose={() => setDlg(null)}
        onOk={(n) => run(() => api(`/api/projects/${id}/skip`, { method: 'POST', body: { reason: n } }), 'Langkah dilewati').then((ok) => { if (ok) { setDlg(null); setActive(null) ; load() } })} />
      <StatusDialog open={dlg === 'status'} p={p} onClose={() => setDlg(null)} onOk={(status, n) => run(() => api(`/api/projects/${id}/status`, { method: 'POST', body: { status, note: n } }), 'Status diperbarui').then((ok) => ok && setDlg(null))} />
      <DecisionDialog open={dlg === 'decision'} p={p} d={d} c={c} onClose={() => setDlg(null)}
        onOk={(body) => run(() => api(`/api/projects/${id}/decision`, { method: 'POST', body }), 'Keputusan tersimpan').then((ok) => ok && setDlg(null))} />
      <EditDialog open={dlg === 'edit'} p={p} state={state} onClose={() => setDlg(null)}
        onOk={(body) => run(() => api(`/api/projects/${id}`, { method: 'PUT', body }), 'Proyek diperbarui').then((ok) => ok && setDlg(null))} />
    </div>
  )
}

/** Plain-language checklist of what the server requires before leaving stage n. */
function requirements(p, d, n) {
  const ks = d.kandidat
  const live = ks.filter((k) => k.status !== 'drop')
  const cont = ks.filter((k) => ['lolos_screening', 'konsep', 'prototipe', 'lolos_uji'].includes(k.status))
  const st = p.stages[n - 1]
  const det = st.details || {}
  const dec = { ok: st.decision === 'go', text: 'PID Head memutuskan “Lanjut”' }
  switch (n) {
    case 1: return [{ ok: ks.length >= 1, text: `Minimal 1 ide ditulis (sekarang ${ks.length})` }]
    case 2: return [
      { ok: live.length > 0 && live.filter((k) => ['ide', 'lolos_screening'].includes(k.status)).every((k) => k.screeningTotal != null), text: 'Semua ide sudah diberi nilai' },
      { ok: cont.length > 0, text: 'Minimal 1 ide lolos saring' }]
    case 4: case 6: {
      const out = []
      if (n === 6) {
        const tgt = Number(det.respondenTarget ?? 30), act = Number(det.respondenActual || 0)
        out.push({ ok: act >= tgt || !!st.decisionNote, text: `Responden terkumpul ${act} dari ${tgt}` })
      }
      return [...out, dec]
    }
    case 5: return [
      { ok: cont.length > 0 && cont.every((k) => (k.bom || []).length > 0), text: 'Tiap ide punya daftar bahan (resep)' },
      { ok: cont.length > 0 && cont.every((k) => (k.photos || []).length > 0), text: 'Tiap ide punya minimal 1 foto contoh' }]
    case 7: {
      const items = (p.handoff || []).filter((h) => !h.na)
      return [
        { ok: !!(det.launchDate && det.hargaFinal && det.hppFinal), text: 'Tanggal launch, harga jual & HPP final diisi' },
        { ok: items.every((h) => h.done), text: `Checklist serah terima beres (${items.filter((h) => h.done).length}/${items.length})` },
        dec]
    }
    default: return []
  }
}

function StageState({ st }) {
  const m = { not_started: ['Belum mulai', '#8A8378'], in_progress: ['Sedang jalan', '#2F6B4A'], done: ['✓ Selesai', '#212121'], skipped: ['Dilewati', '#8A8378'] }[st.state]
  return <Pill color={m[1]}>{m[0]}</Pill>
}

function StageMeta({ p, st, n, sla, f, cur, editor, saveStage }) {
  const [edit, setEdit] = useState(false)
  const [ps, setPs] = useState(st.plannedStart || ''); const [pe, setPe] = useState(st.plannedEnd || '')
  useEffect(() => { setPs(st.plannedStart || ''); setPe(st.plannedEnd || '') }, [st.plannedStart, st.plannedEnd])
  return (
    <div className="card mb-3 p-3 text-[12px]">
      <div className="grid grid-cols-2 gap-y-1.5">
        <div className="text-char/60">📅 Rencana</div>
        <div className="text-right font-semibold">{st.plannedStart ? `${fmtTgl(st.plannedStart, true)} – ${fmtTgl(st.plannedEnd)}` : '-'}
          {st.plannedOverride && st.slaPlannedStart && <div className="text-[10.5px] font-normal text-abu">standar: {fmtTgl(st.slaPlannedStart, true)} – {fmtTgl(st.slaPlannedEnd, true)}</div>}</div>
        <div className="text-char/60">✍️ Kenyataan</div>
        <div className="text-right font-semibold">{st.actualStart ? `${fmtTgl(st.actualStart, true)} – ${st.actualEnd ? fmtTgl(st.actualEnd) : 'sekarang'}` : '-'}</div>
        <div className="text-char/60">⏱️ Batas waktu</div>
        <div className="text-right font-semibold">{sla[n - 1]} hari</div>
      </div>
      {editor && st.state !== 'skipped' && (edit ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input type="date" className="inp" value={ps} onChange={(e) => setPs(e.target.value)} />
          <input type="date" className="inp" value={pe} onChange={(e) => setPe(e.target.value)} />
          <button className="btn-g border border-line" onClick={() => { saveStage(n, { resetPlanned: true }); setEdit(false) }}>Pakai jadwal standar</button>
          <button className="btn-p" onClick={() => { saveStage(n, { plannedStart: ps || null, plannedEnd: pe || null }); setEdit(false) }}>Simpan</button>
        </div>
      ) : <button className="mt-2 text-xs font-semibold text-bata underline" onClick={() => setEdit(true)}>Ubah jadwal</button>)}
    </div>
  )
}

/* ---------- Stage I ---------- */
function Stage1({ d, id, c, editor, run, saveK }) {
  const [f, setF] = useState({ nama: '', deskripsi: '', sumberIde: 'Expo/Event', sumberDetail: '' })
  const add = () => run(() => api('/api/kandidat', { method: 'POST', body: { ...f, projectId: id } }), 'Ide ditambahkan').then((ok) => ok && setF({ ...f, nama: '', deskripsi: '', sumberDetail: '' }))
  return (
    <>
      {d.kandidat.length < 3 && <div className="mb-3 rounded-lg bg-[#F5E6CC] p-2.5 text-xs">💡 Tips: kumpulkan minimal 3 ide supaya ada banyak pilihan (sekarang {d.kandidat.length}).</div>}
      {d.kandidat.map((k) => (
        <Box key={k.id} title={k.nama} right={<Pill color="#2F6B4A">{KSTATUS[k.status]}</Pill>}>
          <Field label="Deskripsi"><Auto rows={2} value={k.deskripsi} disabled={!editor} onSave={(v) => saveK(k.id, { deskripsi: v })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Sumber ide"><Sel value={k.sumberIde} disabled={!editor} onSave={(v) => saveK(k.id, { sumberIde: v })} options={c.sumberIde.map((s) => [s, s])} /></Field>
            <Field label="Detail sumber"><Auto value={k.sumberDetail} disabled={!editor} onSave={(v) => saveK(k.id, { sumberDetail: v })} /></Field>
          </div>
          <Field label="Referensi (link, pisahkan dengan koma)"><Auto value={(k.referensi || []).join(', ')} disabled={!editor} onSave={(v) => saveK(k.id, { referensi: v.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
          {editor && <button className="text-xs font-semibold text-bata underline" onClick={() => confirm(`Hapus ide ${k.nama}?`) && run(() => api(`/api/kandidat/${k.id}`, { method: 'DELETE' }), 'Kandidat dihapus')}>Hapus ide</button>}
        </Box>
      ))}
      {!d.kandidat.length && <div className="mb-3"><Empty>Belum ada ide. Tulis minimal 1 ide dulu ya.</Empty></div>}
      {editor && (
        <Box title="💡 Tambah ide baru">
          <Field label="Nama ide"><input className="inp" value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} placeholder="mis. Salted Egg" /></Field>
          <Field label="Deskripsi"><textarea className="inp" rows={2} value={f.deskripsi} onChange={(e) => setF({ ...f, deskripsi: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Sumber ide"><select className="inp" value={f.sumberIde} onChange={(e) => setF({ ...f, sumberIde: e.target.value })}>{c.sumberIde.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Detail"><input className="inp" value={f.sumberDetail} onChange={(e) => setF({ ...f, sumberDetail: e.target.value })} placeholder="mis. Expo Nov" /></Field>
          </div>
          <button className="btn-p w-full" disabled={f.nama.trim().length < 2} onClick={add}>+ Tambah ide</button>
        </Box>
      )}
    </>
  )
}

/* ---------- Stage II ---------- */
function Stage2({ d, settings, editor, run, saveK }) {
  const crit = settings.screeningCriteria
  return (
    <>
      <div className="mb-3 text-xs text-char/70">Beri nilai <b>1</b> (kurang) sampai <b>5</b> (sangat bagus). Ide dengan nilai rata-rata ≥ <b>{String(settings.screeningPassScore).replace('.', ',')}</b> otomatis lolos; statusnya tetap bisa diubah manual.</div>
      {!d.kandidat.length && <Empty>Tulis idenya dulu di langkah 💡 Cari Ide.</Empty>}
      {d.kandidat.map((k) => <ScoreCard key={k.id} k={k} crit={crit} pass={settings.screeningPassScore} editor={editor} run={run} saveK={saveK} />)}
    </>
  )
}
function ScoreCard({ k, crit, pass, editor, run, saveK }) {
  const [sc, setSc] = useState(k.screeningScores || {})
  useEffect(() => setSc(k.screeningScores || {}), [k.id, JSON.stringify(k.screeningScores)])
  const tw = crit.reduce((a, c) => a + c.weight, 0)
  const complete = crit.every((c) => sc[c.id])
  const total = complete ? crit.reduce((a, c) => a + sc[c.id] * c.weight, 0) / tw : null
  const set = (cid, v) => {
    const ns = { ...sc, [cid]: v }; setSc(ns)
    run(() => api(`/api/kandidat/${k.id}/scores`, { method: 'PUT', body: { scores: ns } }))
  }
  const [open, setOpen] = useState(!complete)
  const verdict = k.status === 'lolos_screening' || ['konsep', 'prototipe', 'lolos_uji', 'launch'].includes(k.status) ? ['✅ Lolos', 'bg-[#DCEFE3] text-hijau'] : k.status === 'gugur' ? ['❌ Tidak lolos', 'bg-[#F8DCD8] text-bata'] : ['Belum dinilai', 'bg-black/5 text-char/60']
  return (
    <div className="card mb-3 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold">{k.nama}</div>
          <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${verdict[1]}`}>{verdict[0]}</span>
        </div>
        <div className="text-right"><div className="text-[10.5px] text-char/50">Nilai</div>
          <div className={`text-[24px] font-extrabold leading-none ${total == null ? 'text-abu' : total >= pass ? 'text-hijau' : 'text-bata'}`}>{total == null ? '–' : total.toFixed(1).replace('.', ',')}</div></div>
        <span className={`text-lg text-char/40 transition ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open && <div className="px-4 pb-4">
      {crit.map((c) => (
        <div key={c.id} className="mb-2.5">
          <div className="mb-1 flex justify-between text-[12px]"><span className="font-semibold">{c.label}</span><span className="text-char/55">{c.weight}%</span></div>
          <Score value={sc[c.id]} disabled={!editor} onChange={(v) => set(c.id, v)} />
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Est. harga jual (Rp)"><Auto type="number" value={k.estHargaJual} disabled={!editor} onSave={(v) => saveK(k.id, { estHargaJual: v })} /></Field>
        <Field label="Est. HPP (Rp)"><Auto type="number" value={k.estHpp} disabled={!editor} onSave={(v) => saveK(k.id, { estHpp: v })} /></Field>
      </div>
      {k.estHargaJual && k.estHpp ? <div className="mb-2 text-xs text-char/70">Est. food cost {fmtPct((k.estHpp / k.estHargaJual) * 100)}</div> : null}
      <Field label="Hasil saring">
        <Sel value={k.status} disabled={!editor} onSave={(v) => saveK(k.id, { status: v })}
          options={[['ide', 'Belum diputuskan'], ['lolos_screening', '✅ Lolos'], ['gugur', '❌ Tidak lolos'], ...(!['ide', 'lolos_screening', 'gugur'].includes(k.status) ? [[k.status, KSTATUS[k.status]]] : [])]} />
      </Field>
      </div>}
    </div>
  )
}

/* ---------- Stage III ---------- */
const CHANNELS = ['Outlet Kiosk', 'Gerobak', 'Online Food', 'Frozen/Marketplace', 'Event']
function Stage3({ ks, editor, saveK, files, id, reload }) {
  if (!ks.length) return <div className="mb-3"><Empty>Belum ada ide yang lolos saring.</Empty></div>
  return ks.map((k) => {
    const cc = k.concept || {}
    const sv = (key) => (v) => saveK(k.id, { concept: { [key]: v } })
    return (
      <Box key={k.id} title={`✏️ Kartu konsep · ${k.nama}`}>
        <Field label="Nama produk"><Auto value={cc.namaProduk} disabled={!editor} onSave={sv('namaProduk')} placeholder={k.nama} /></Field>
        <Field label="One-line description"><Auto value={cc.deskripsi} disabled={!editor} onSave={sv('deskripsi')} /></Field>
        <Field label="Target customer"><Auto value={cc.targetCustomer} disabled={!editor} onSave={sv('targetCustomer')} /></Field>
        <Field label="Channel">
          <div className="flex flex-wrap gap-1.5">{CHANNELS.map((ch) => {
            const on = (cc.channel || []).includes(ch)
            return <button key={ch} disabled={!editor} onClick={() => sv('channel')(on ? cc.channel.filter((x) => x !== ch) : [...(cc.channel || []), ch])}
              className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold ${on ? 'border-bata bg-bata text-cream' : 'border-bata text-bata'}`}>{ch}</button>
          })}</div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Porsi"><Auto value={cc.porsi} disabled={!editor} onSave={sv('porsi')} placeholder="Kecil / Besar" /></Field>
          <Field label="Harga target (Rp)"><Auto type="number" value={cc.hargaTarget} disabled={!editor} onSave={sv('hargaTarget')} /></Field>
          <Field label="Estimasi HPP (Rp)"><Auto type="number" value={cc.estHpp} disabled={!editor} onSave={sv('estHpp')} /></Field>
          <Field label="Est. food cost"><div className="inp bg-transparent">{cc.hargaTarget && cc.estHpp ? fmtPct(cc.estHpp / cc.hargaTarget * 100) : '-'}</div></Field>
        </div>
        <Field label="Key message"><Auto rows={2} value={cc.keyMessage} disabled={!editor} onSave={sv('keyMessage')} /></Field>
        <div className="lbl">Mood photo / referensi visual</div>
        <Attachments files={files.filter((f) => f.kandidatId === k.id && f.kind === 'mood')} params={{ projectId: id, kandidatId: k.id, kind: 'mood', stage: 3 }}
          can={editor} onChange={reload} imagesOnly label="Mood" />
      </Box>
    )
  })
}

/* ---------- Stage IV ---------- */
function Stage4({ st, ks, editor, saveDet, saveK }) {
  const det = st.details || {}
  return (
    <>
      <Box title="🗳️ Sesi tes konsep">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tanggal"><Auto type="date" value={det.tanggal} disabled={!editor} onSave={saveDet(4, 'tanggal')} /></Field>
          <Field label="Panel"><Sel value={det.panel || ''} disabled={!editor} onSave={saveDet(4, 'panel')} options={[['', 'Pilih'], ['Direksi', 'Direksi'], ['Internal', 'Internal'], ['Customer', 'Customer']]} /></Field>
        </div>
        <Field label="Jumlah penilai"><Auto type="number" value={det.jumlahPenilai} disabled={!editor} onSave={saveDet(4, 'jumlahPenilai')} /></Field>
      </Box>
      {!ks.length && <div className="mb-3"><Empty>Belum ada ide yang lanjut.</Empty></div>}
      {ks.map((k) => {
        const r = (k.testResult || {}).konsep || {}
        const sv = (key) => (v) => saveK(k.id, { testResult: { konsep: { ...r, [key]: v } } })
        return (
          <Box key={k.id} title={k.nama} right={<Pill color={k.status === 'drop' ? '#8A8378' : '#2F6B4A'}>{KSTATUS[k.status]}</Pill>}>
            <div className="mb-1 text-[12.5px] font-semibold">Seberapa menarik? (1–5)</div>
            <div className="mb-2"><Score value={r.appeal} disabled={!editor} onChange={sv('appeal')} /></div>
            <Field label="Catatan panel"><Auto rows={2} value={r.catatan} disabled={!editor} onSave={sv('catatan')} /></Field>
          </Box>
        )
      })}
    </>
  )
}

/* ---------- Stage V ---------- */
function Stage5({ d, id, ks, state, p, can, run, saveK, saveDet, st, reload }) {
  const [vendors, setVendors] = useState([])
  useEffect(() => { api('/api/vendors').then(setVendors).catch(() => {}) }, [])
  const det = st.details || {}
  if (!ks.length) return <div className="mb-3"><Empty>Belum ada ide yang lanjut ke tahap contoh produk.</Empty></div>
  return (
    <>
      <Box title="🧪 Info contoh produk">
        <Field label="Template porsi untuk semua kandidat (pisahkan koma)"><Auto value={(det.porsi || []).join(', ')} disabled={!can} onSave={(v) => saveDet(5, 'porsi')(v.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="Kecil, Besar" /></Field>
      </Box>
      {ks.map((k) => <ProtoCard key={k.id} k={k} id={id} p={p} vendors={vendors} can={can} run={run} saveK={saveK} targetFc={d.targetFoodCostPct}
        files={d.files} reload={reload} template={det.porsi} />)}
    </>
  )
}
function PorsiTable({ k, r, can, saveK, targetFc, template }) {
  const rows = (r.porsi && r.porsi.length) ? r.porsi : null
  const [edit, setEdit] = useState(null)
  const start = () => setEdit((rows || (template?.length ? template.map((n, i) => ({ nama: n, multiplier: i === 0 ? 1 : '', hargaJual: '' }))
    : [{ nama: 'Standar', multiplier: 1, hargaJual: r.hargaJual ?? '' }])).map((x) => ({ ...x, multiplier: showNumP(x.multiplier), hargaJual: showNumP(x.hargaJual) })))
  const save = () => {
    const out = []
    for (const x of edit) {
      if (!x.nama.trim()) continue
      const m = parseNum(x.multiplier), h = parseNum(x.hargaJual)
      if (Number.isNaN(m) || Number.isNaN(h)) return alert('Multiplier / harga tidak valid. Contoh: 1,6 dan 18.000')
      out.push({ nama: x.nama.trim(), multiplier: m || 1, hargaJual: h })
    }
    saveK(k.id, { recipe: { porsi: out } }).then(() => setEdit(null))
  }
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between"><div className="text-[12px] font-bold">HPP & food cost per porsi</div>
        {can && !edit && <button className="text-xs font-semibold text-bata underline" onClick={start}>Atur porsi</button>}</div>
      {!edit ? (
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-[12px]">
            <thead className="bg-bata text-cream"><tr><th className="px-2 py-1.5 text-left">Porsi</th><th className="px-1 text-right">×</th><th className="px-1 text-right">HPP</th><th className="px-1 text-right">Harga</th><th className="px-2 text-right">FC</th></tr></thead>
            <tbody>{k.porsiHpp.map((x) => {
              const over = x.foodCostPct != null && x.foodCostPct > targetFc
              return <tr key={x.nama} className="border-t border-line">
                <td className="px-2 py-1.5 font-semibold">{x.nama}</td><td className="px-1 text-right">{showNumP(x.multiplier)}</td>
                <td className="px-1 text-right font-semibold text-bata">{fmtRp(x.hpp)}</td><td className="px-1 text-right">{fmtRp(x.hargaJual)}</td>
                <td className={`px-2 text-right font-bold ${x.foodCostPct == null ? '' : over ? 'text-amber' : 'text-hijau'}`}>{fmtPct(x.foodCostPct)}</td></tr>
            })}</tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-line p-2">
          <div className="mb-1 grid grid-cols-[1fr_64px_1fr_28px] gap-1.5 text-[10.5px] font-semibold text-char/60"><span>Nama porsi</span><span>Multiplier</span><span>Harga jual (Rp)</span><span /></div>
          {edit.map((x, i) => (
            <div key={i} className="mb-1.5 grid grid-cols-[1fr_64px_1fr_28px] gap-1.5">
              <input className="inp px-2" value={x.nama} onChange={(e) => setEdit(edit.map((y, j) => j === i ? { ...y, nama: e.target.value } : y))} placeholder="Kecil" />
              <input className="inp px-2" inputMode="decimal" value={x.multiplier} onChange={(e) => setEdit(edit.map((y, j) => j === i ? { ...y, multiplier: e.target.value } : y))} placeholder="1" />
              <input className="inp px-2" inputMode="decimal" value={x.hargaJual} onChange={(e) => setEdit(edit.map((y, j) => j === i ? { ...y, hargaJual: e.target.value } : y))} placeholder="15.000" />
              <button className="text-lg text-bata" onClick={() => setEdit(edit.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <div className="mb-2 text-[10.5px] text-char/60">BOM diisi untuk porsi multiplier 1. Porsi lain dihitung otomatis (mis. Besar 1,6 = 1,6× bahan).</div>
          <div className="grid grid-cols-3 gap-2">
            <button className="btn-g border border-line text-xs" onClick={() => setEdit([...edit, { nama: '', multiplier: '', hargaJual: '' }])}>+ Porsi</button>
            <button className="btn-g border border-line text-xs" onClick={() => setEdit(null)}>Batal</button>
            <button className="btn-p text-xs" onClick={save}>Simpan</button>
          </div>
        </div>
      )}
    </div>
  )
}
function HppTrend({ hist }) {
  const [open, setOpen] = useState(false)
  const pts = hist.slice(-12)
  const max = Math.max(...pts.map((h) => h.hpp)), min = Math.min(...pts.map((h) => h.hpp))
  const span = Math.max(1, max - min)
  const W = 260, Hh = 44
  const xy = pts.map((h, i) => [pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * W, Hh - 6 - ((h.hpp - min) / span) * (Hh - 12)])
  const last = pts[pts.length - 1], first = pts[0]
  const delta = last.hpp - first.hpp
  return (
    <div className="mb-3 rounded-lg border border-line bg-white/50 p-2">
      <div className="flex items-center justify-between text-[11.5px]"><b>Tren HPP porsi dasar</b>
        <span className={delta > 0 ? 'font-bold text-bata' : delta < 0 ? 'font-bold text-hijau' : ''}>{delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {fmtRp(Math.abs(delta))}</span></div>
      <svg viewBox={`0 0 ${W} ${Hh}`} className="mt-1 h-11 w-full" preserveAspectRatio="none">
        <polyline fill="none" stroke="#B42F27" strokeWidth="2" points={xy.map((p) => p.join(',')).join(' ')} />
        {xy.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="#B42F27" />)}
      </svg>
      <button className="text-[11px] font-semibold text-bata underline" onClick={() => setOpen(!open)}>{open ? 'Tutup riwayat' : 'Lihat riwayat'}</button>
      {open && [...hist].reverse().map((h, i) => <div key={i} className="border-t border-line py-1 text-[11px]"><b>{fmtRp(h.hpp)}</b> · {fmtTgl(h.date)} · {h.versi}<div className="text-char/60">{h.reason}</div></div>)}
    </div>
  )
}

const showNumP = (n) => (n === null || n === undefined || n === '') ? '' : String(n).replace('.', ',')

function ProtoCard({ k, id, p, vendors, can, run, saveK, targetFc, files, reload, template }) {
  const r = k.recipe || {}
  const sv = (key) => (v) => saveK(k.id, { recipe: { [key]: v } })
  const [line, setLine] = useState({ bahan: '', qty: '', unit: 'g', hargaPerUnit: '', vendorId: '', inhouse: false, versi: r.versi || 'v1' })
  const addLine = () => {
    const qty = parseNum(line.qty), harga = parseNum(line.hargaPerUnit)
    if (Number.isNaN(qty) || Number.isNaN(harga)) return run(() => Promise.reject(new Error('Qty / harga tidak valid. Contoh: 4,5 atau 120.000')))
    return run(() => api(`/api/kandidat/${k.id}/bom`, { method: 'POST', body: { ...line, versi: r.versi || line.versi, qty, hargaPerUnit: harga ?? 0, vendorId: line.vendorId || null } }), 'Bahan ditambahkan')
      .then((ok) => ok && setLine({ ...line, bahan: '', qty: '', hargaPerUnit: '', vendorId: '', inhouse: false }))
  }
  const fcOver = k.maxFoodCostPct != null && k.maxFoodCostPct > targetFc
  const selectable = vendors.filter((v) => v.statusVendor !== 'blacklist')
  const vendorPrices = (vendors.find((v) => v.id === line.vendorId)?.prices) || []
  const photos = files.filter((f) => f.kandidatId === k.id && f.kind === 'photo')
  return (
    <Box title={`🧪 Contoh produk · ${k.nama}`}>
      <div className="mb-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-tint2 p-2"><div className="text-[10.5px] text-char/60">HPP porsi dasar ({r.versi || 'v1'})</div><div className="text-[16px] font-extrabold text-bata">{fmtRp(k.hpp)}</div></div>
        <div className={`rounded-lg p-2 ${k.maxFoodCostPct == null ? 'bg-tint2' : fcOver ? 'bg-[#F5E6CC]' : 'bg-[#DCEADF]'}`}><div className="text-[10.5px] text-char/60">Food cost tertinggi</div>
          <div className={`text-[16px] font-extrabold ${k.maxFoodCostPct == null ? '' : fcOver ? 'text-amber' : 'text-hijau'}`}>{fmtPct(k.maxFoodCostPct)}</div></div>
      </div>
      {fcOver && <div className="mb-2 text-xs font-semibold text-amber">Ada porsi dengan food cost di atas target {targetFc}%.</div>}
      {k.halalWarnings?.length > 0 && <div className="mb-2 rounded-lg bg-[#F5E6CC] p-2 text-xs">Sertifikat halal vendor akan habis &lt; 30 hari: {k.halalWarnings.join(', ')}</div>}
      {(k.hppHistory || []).length > 1 && <HppTrend hist={k.hppHistory} />}
      <PorsiTable k={k} r={r} can={can} saveK={saveK} targetFc={targetFc} template={template} />
      <Field label="Versi resep aktif"><Auto value={r.versi || 'v1'} disabled={!can} onSave={sv('versi')} /></Field>
      {Object.keys(k.hppByVersi || {}).length > 1 && <div className="mb-2 text-[11px] text-char/65">HPP per versi: {Object.entries(k.hppByVersi).map(([v, h]) => `${v} ${fmtRp(h)}`).join(' · ')}</div>}

      <div className="mb-1 mt-1 text-[12px] font-bold">🧾 Bahan per porsi (resep)</div>
      <div className="mb-2 overflow-hidden rounded-lg border border-line">
        <table className="w-full text-[12px]">
          <thead className="bg-bata text-cream"><tr><th className="px-2 py-1.5 text-left">Bahan</th><th className="px-1 text-right">Qty</th><th className="px-2 text-right">Biaya</th><th className="w-7" /></tr></thead>
          <tbody>
            {k.bom.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-2 py-1.5"><div className="font-semibold">{l.bahan} <span className="text-[10px] font-normal text-abu">{l.versi}</span></div>
                  <div className="text-[10.5px] text-char/55">{l.vendorNama || (l.inhouse ? 'In-house' : '-')} · {fmtRp(l.hargaPerUnit)}/{l.unit === 'pcs' ? 'pcs' : l.unit === 'ml' ? 'liter' : 'kg'}</div>
                  {l.vendorId && <button disabled={!can} onClick={() => run(() => api(`/api/bom/${l.id}`, { method: 'PUT', body: { autoPrice: !l.autoPrice } }))}
                    className={`mt-0.5 rounded-full border px-1.5 text-[9.5px] font-semibold ${l.autoPrice ? 'border-hijau text-hijau' : 'border-abu text-abu'}`}>{l.autoPrice ? 'Ikut harga vendor' : 'Harga manual'}</button>}</td>
                <td className="px-1 text-right">{showNumP(l.qty)} {l.unit}</td>
                <td className="px-2 text-right font-semibold">{fmtRp(l.biayaPerPorsi)}</td>
                <td>{can && <button className="h-8 w-7 text-bata" onClick={() => run(() => api(`/api/bom/${l.id}`, { method: 'DELETE' }))}>×</button>}</td>
              </tr>
            ))}
            {!k.bom.length && <tr><td colSpan={4} className="px-2 py-3 text-center text-char/55">Belum ada bahan</td></tr>}
          </tbody>
        </table>
      </div>
      {can && (
        <div className="mb-3 rounded-lg border border-dashed border-line p-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="inp col-span-2" placeholder="Nama bahan" value={line.bahan} onChange={(e) => setLine({ ...line, bahan: e.target.value })} />
            <input className="inp" inputMode="decimal" placeholder="Qty/porsi" value={line.qty} onChange={(e) => setLine({ ...line, qty: e.target.value })} />
            <select className="inp" value={line.unit} onChange={(e) => setLine({ ...line, unit: e.target.value })}><option value="g">gram</option><option value="ml">ml</option><option value="pcs">pcs</option></select>
            <select className="inp col-span-2" value={line.inhouse ? '__inhouse' : line.vendorId} onChange={(e) => setLine({ ...line, inhouse: e.target.value === '__inhouse', vendorId: e.target.value === '__inhouse' ? '' : e.target.value })}>
              <option value="">{p.category === 'online_food' ? 'Pilih vendor (wajib)' : 'Vendor (opsional)'}</option>
              <option value="__inhouse">In-house</option>
              {selectable.map((v) => <option key={v.id} value={v.id}>{v.nama}{v.statusVendor !== 'approved' ? ` (${v.statusVendor})` : ''}{v.halalWarning ? ' ⚠ halal' : ''}</option>)}
            </select>
            {vendorPrices.length > 0 && (
              <select className="inp col-span-2" value="" onChange={(e) => { const pr = vendorPrices.find((x) => x.id === e.target.value); if (pr) setLine({ ...line, bahan: pr.bahan, unit: { kg: 'g', liter: 'ml', pcs: 'pcs' }[pr.unit], hargaPerUnit: '' }) }}>
                <option value="">Pilih dari daftar harga vendor…</option>
                {vendorPrices.map((x) => <option key={x.id} value={x.id}>{x.bahan} · {fmtRp(x.harga)}/{x.unit}</option>)}
              </select>
            )}
            <input className="inp col-span-2" inputMode="decimal" placeholder={line.vendorId && vendorPrices.some((x) => x.bahan.toLowerCase() === line.bahan.trim().toLowerCase()) ? 'Kosongkan = pakai harga vendor terbaru' : `Harga per ${line.unit === 'pcs' ? 'pcs' : line.unit === 'ml' ? 'liter' : 'kg'} (Rp)`} value={line.hargaPerUnit} onChange={(e) => setLine({ ...line, hargaPerUnit: e.target.value })} />
          </div>
          <button className="btn-o mt-2 w-full" disabled={!line.bahan || !line.qty} onClick={addLine}>+ Tambah bahan</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Holding time / shelf life"><Auto value={r.holdingTime} disabled={!can} onSave={sv('holdingTime')} /></Field>
        <Field label="Packaging"><Auto value={r.packaging} disabled={!can} onSave={sv('packaging')} /></Field>
      </div>
      <Field label="SOP draft"><Auto rows={3} value={r.sop} disabled={!can} onSave={sv('sop')} placeholder="Langkah penyajian di outlet" /></Field>
      <div className="mb-1 text-[12px] font-bold">Foto prototipe <span className="font-normal text-char/55">(wajib minimal 1)</span></div>
      <Attachments files={photos} params={{ projectId: id, kandidatId: k.id, kind: 'photo', stage: 5 }} can={can} onChange={reload} imagesOnly label="Foto" />
    </Box>
  )
}

/* ---------- Stage VI ---------- */
function SurveyCard({ id, d, can, reload }) {
  const toast = useToast()
  const sv = d.survey
  const [qr, setQr] = useState(null)
  const [rows, setRows] = useState(null)
  const url = sv ? `${window.location.origin}${sv.url}` : ''
  useEffect(() => { if (url) QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: '#212121', light: '#ffffff' } }).then(setQr).catch(() => {}) }, [url])
  const act = async (action, extra = {}) => {
    try { await api(`/api/projects/${id}/survey`, { method: 'POST', body: { action, ...extra } }); reload() } catch (e) { toast(e.message, 'err') }
  }
  const loadRows = async () => { try { setRows((await api(`/api/projects/${id}/survey`)).rows) } catch (e) { toast(e.message, 'err') } }
  if (!sv) return (
    <Box title="📱 Survey responden (QR)">
      <div className="mb-2 text-xs text-char/70">Responden mengisi penilaian dari HP lewat QR di outlet. Hasil rata-rata, niat beli, dan jumlah responden terisi otomatis.</div>
      {can ? <button className="btn-p w-full" onClick={() => act('open')}>Buat & buka survey</button> : <div className="text-xs text-char/55">Survey belum dibuat.</div>}
    </Box>
  )
  return (
    <Box title="📱 Survey responden (QR)" right={<Pill color={sv.open ? '#2F6B4A' : '#8A8378'}>{sv.open ? 'Dibuka' : 'Ditutup'}</Pill>}>
      <div className="mb-2 h-2.5 rounded-full bg-tint2"><div className="h-2.5 rounded-full bg-hijau" style={{ width: `${Math.min(100, (sv.count / (sv.target || 1)) * 100)}%` }} /></div>
      <div className="mb-3 flex justify-between text-[12px]"><span><b>{sv.count}</b> dari {sv.target} responden</span>{sv.reason && <span className="text-char/60">{sv.reason}</span>}</div>
      {qr && <div className="mb-2 flex flex-col items-center"><img src={qr} alt="QR survey" className="h-48 w-48 rounded-lg border border-line bg-white p-1" />
        <a href={qr} download="qr-survey.png" className="mt-1 text-xs font-semibold text-bata underline">Download QR (untuk dicetak)</a></div>}
      <div className="mb-2 break-all rounded-lg bg-cream p-2 text-[11px]">{url}</div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-o text-xs" onClick={() => navigator.clipboard.writeText(url).then(() => toast('Link survey tersalin')).catch(() => toast('Copy gagal', 'err'))}>Copy link</button>
        <a className="btn-o text-xs" href={url} target="_blank" rel="noreferrer">Buka form</a>
        {can && (sv.manualOpen ? <button className="btn-g border border-line text-xs" onClick={() => act('close')}>Tutup survey</button>
          : <button className="btn-p text-xs" onClick={() => act('open')}>Buka survey</button>)}
        {can && <button className="btn-g border border-line text-xs" onClick={() => confirm('Ganti link? QR lama tidak berlaku lagi.') && act('regenerate')}>Ganti link</button>}
      </div>
      {can && <label className="mt-2 flex min-h-[40px] items-center gap-2 text-xs"><input type="checkbox" className="h-5 w-5 accent-bata" checked={sv.allowOverTarget} onChange={(e) => act('', { allowOverTarget: e.target.checked })} />Tetap terima responden setelah target tercapai</label>}
      <div className="mt-2 flex gap-3 text-xs">
        <button className="font-semibold text-bata underline" onClick={rows ? () => setRows(null) : loadRows}>{rows ? 'Sembunyikan respons' : 'Lihat respons'}</button>
        {can && <button className="font-semibold text-bata underline" onClick={() => download(`/api/projects/${id}/survey.csv`, 'survey-responden.csv').catch((e) => toast(e.message, 'err'))}>Export CSV</button>}
      </div>
      {rows && <div className="mt-2 max-h-72 overflow-y-auto">
        {rows.length ? rows.map((r) => (
          <div key={r.id} className="mb-1.5 rounded-lg border border-line bg-white/50 p-2 text-[11.5px]">
            <div className="flex justify-between"><b>{r.nama || 'Anonim'}</b><span className="text-char/55">{fmtWhen(r.at)}</span></div>
            {r.answers.map((a, i) => <div key={i}>{d.kandidat.find((k) => k.id === a.kandidatId)?.nama || '-'}{a.porsi ? ` (${a.porsi})` : ''}: rasa {a.rasa}{a.intent ? ` · ${a.intent}` : ''}{a.comment ? ` · “${a.comment}”` : ''}</div>)}
            {can && <button className="mt-1 text-[11px] text-bata underline" onClick={async () => { if (confirm('Delete respons ini?')) { await api(`/api/responses/${r.id}`, { method: 'DELETE' }); loadRows(); reload() } }}>Delete (spam/duplikat)</button>}
          </div>)) : <div className="text-xs text-char/55">Belum ada respons.</div>}
      </div>}
    </Box>
  )
}

function Stage6({ st, ks, can, saveDet, saveK, d, id, reload }) {
  const det = st.details || {}
  const tgt = det.respondenTarget ?? 30
  const auto = det.respondenSource === 'survey'
  return (
    <>
      <Box title="👅 Sesi tes rasa">
        <Field label="Lokasi"><Auto value={det.lokasi} disabled={!can} onSave={saveDet(6, 'lokasi')} placeholder="mis. Outlet Braga" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Mulai"><Auto type="date" value={det.tanggalMulai} disabled={!can} onSave={saveDet(6, 'tanggalMulai')} /></Field>
          <Field label="Selesai"><Auto type="date" value={det.tanggalSelesai} disabled={!can} onSave={saveDet(6, 'tanggalSelesai')} /></Field>
          <Field label="Target responden"><Auto type="number" value={tgt} disabled={!can} onSave={saveDet(6, 'respondenTarget')} /></Field>
          <Field label={auto ? 'Actual (dari survey)' : 'Actual responden'}><Auto type="number" value={det.respondenActual} disabled={!can || auto} onSave={saveDet(6, 'respondenActual')} /></Field>
        </div>
      </Box>
      <SurveyCard id={id} d={d} can={can} reload={reload} />
      {ks.map((k) => {
        const r = (k.testResult || {}).prototipe || {}
        const fromSurvey = r.source === 'survey'
        const sv = (key) => (v) => saveK(k.id, { testResult: { prototipe: { ...r, [key]: v } } })
        const dis = !can || fromSurvey
        return (
          <Box key={k.id} title={`👅 Hasil tes rasa · ${k.nama}`} right={fromSurvey ? <Pill color="#2F6B4A">Survey · {r.n} jawaban</Pill> : <Pill color={k.status === 'drop' ? '#8A8378' : '#2F6B4A'}>{KSTATUS[k.status]}</Pill>}>
            <div className="grid grid-cols-2 gap-2">
              {[['rasa', 'Rasa'], ['tekstur', 'Tekstur'], ['porsi', 'Porsi'], ['harga', 'Harga']].map(([key, lab]) => (
                <Field key={key} label={`${lab} (rata-rata 1–5)`}><Auto type="number" value={r[key]} disabled={dis} onSave={sv(key)} placeholder="mis. 4,2" /></Field>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Pasti beli %"><Auto type="number" value={r.intentPasti} disabled={dis} onSave={sv('intentPasti')} /></Field>
              <Field label="Mungkin %"><Auto type="number" value={r.intentMungkin} disabled={dis} onSave={sv('intentMungkin')} /></Field>
              <Field label="Tidak %"><Auto type="number" value={r.intentTidak} disabled={dis} onSave={sv('intentTidak')} /></Field>
            </div>
            <Field label="Price acceptance di harga target (%)"><Auto type="number" value={r.priceAcceptance} disabled={dis} onSave={sv('priceAcceptance')} /></Field>
            {r.byPorsi && Object.keys(r.byPorsi).length > 0 && (
              <div className="mb-3 overflow-hidden rounded-lg border border-line text-[12px]">
                <table className="w-full"><thead className="bg-bata text-cream"><tr><th className="px-2 py-1 text-left">Porsi</th><th className="px-1 text-right">n</th><th className="px-1 text-right">Rasa</th><th className="px-1 text-right">Skor porsi</th><th className="px-2 text-right">Pasti beli</th></tr></thead>
                  <tbody>{Object.entries(r.byPorsi).map(([n, x]) => <tr key={n} className="border-t border-line"><td className="px-2 py-1 font-semibold">{n}</td><td className="px-1 text-right">{x.n}</td><td className="px-1 text-right">{showNumP(x.rasa)}</td><td className="px-1 text-right">{showNumP(x.porsi)}</td><td className="px-2 text-right">{x.intentPasti ?? '-'}%</td></tr>)}</tbody></table>
              </div>
            )}
            <Field label={fromSurvey ? 'Feedback terbaru' : 'Top 3 feedback'}><Auto rows={3} value={r.feedback} disabled={dis} onSave={sv('feedback')} /></Field>
          </Box>
        )
      })}
    </>
  )
}

/* ---------- Stage VII ---------- */
function LaunchBoardCard({ p, id, editor, run }) {
  const [cfg, setCfg] = useState(null)
  useEffect(() => { api('/api/launchboard').then(setCfg).catch(() => {}) }, [])
  const s = p.launchBoardSync
  const sheetUrl = cfg ? `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/edit` : null
  return (
    <Box title="📋 Product Launch Board" right={s ? <Pill color={s.ok ? '#2F6B4A' : '#B8741A'}>{s.ok ? 'Tersinkron' : 'Gagal'}</Pill> : null}>
      <div className="mb-2 text-xs text-char/70">Checklist hand-off dikirim ke tab Tasks di Google Sheet Product Launch Board (8 divisi), lengkap dengan fase, PIC, tanggal, dan status.</div>
      {s && <div className="mb-2 text-xs">{s.ok ? `${s.rows} baris (${s.appended || 0} baru, ${s.updated || 0} diperbarui)` : s.reason} · {fmtWhen(s.at)}</div>}
      {cfg && !cfg.configured && <div className="mb-2 rounded-lg bg-[#F5E6CC] p-2 text-xs">Belum terhubung. Admin perlu memasang Apps Script di Sheet (Saya → Panel Admin → Product Launch Board).</div>}
      <div className="grid grid-cols-2 gap-2">
        {editor && <button className="btn-p text-xs" disabled={cfg && !cfg.configured} onClick={() => run(() => api(`/api/projects/${id}/launchboard/sync`, { method: 'POST' }), 'Tersinkron ke Launch Board')}>Sinkron sekarang</button>}
        {sheetUrl && <a className="btn-o text-xs" href={sheetUrl} target="_blank" rel="noreferrer">Buka Sheet ↗</a>}
      </div>
    </Box>
  )
}

function Scorecard({ sc, det, can, saveDet }) {
  const weeks = det.salesWeeks || ['', '', '', '']
  const verdict = { hit: ['🎯 Laris', '#2F6B4A'], miss: ['📉 Di bawah target', '#B42F27'], berjalan: ['⏳ Berjalan', '#B8741A'], 'belum ada data': ['Belum ada data', '#8A8378'] }[sc?.verdict || 'belum ada data']
  return (
    <Box title="🏆 Hasil setelah launch" right={<Pill color={verdict[1]}>{verdict[0]}</Pill>}>
      <Field label="Target penjualan per minggu (porsi)"><Auto type="number" value={det.targetPorsiMinggu} disabled={!can} onSave={saveDet(7, 'targetPorsiMinggu')} placeholder="mis. 1.000" /></Field>
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <Field label={`Minggu ${i + 1}`}><Auto type="number" value={weeks[i]} disabled={!can} onSave={(v) => { const n = [0, 1, 2, 3].map((j) => weeks[j] ?? null); n[i] = v; saveDet(7, 'salesWeeks')(n) }} placeholder="porsi" /></Field>
            {sc?.weeklyPct?.[i] != null && <div className={`-mt-2 mb-2 text-center text-[11px] font-bold ${sc.weeklyPct[i] >= 100 ? 'text-hijau' : 'text-bata'}`}>{sc.weeklyPct[i]}%</div>}
          </div>
        ))}
      </div>
      {sc?.pct != null && <div className="mb-3 rounded-lg bg-tint2 p-2 text-sm">Achievement <b className={sc.pct >= 100 ? 'text-hijau' : 'text-bata'}>{sc.pct}%</b> · {fmtNum(sc.actual)} dari target {fmtNum(sc.targetTotal)} porsi ({sc.weeksFilled}/4 minggu)</div>}
      <Field label="Feedback setelah launch"><Auto rows={2} value={det.postFeedback} disabled={!can} onSave={saveDet(7, 'postFeedback')} /></Field>
      <Field label="Keputusan"><Sel value={det.postDecision || ''} disabled={!can} onSave={saveDet(7, 'postDecision')} options={[['', 'Belum'], ['lanjut', 'Lanjut'], ['evaluasi', 'Evaluasi'], ['stop', 'Stop']]} /></Field>
      <div className="text-[10.5px] text-char/55">🎯 Laris = penjualan 4 minggu mencapai minimal 100% target.</div>
    </Box>
  )
}

function Stage7({ st, p, d, editor, postEditor, saveDet, run, id, targetFc }) {
  const det = st.details || {}
  const fc = det.foodCostPct
  const items = p.handoff || []
  const upd = (i, patch) => { const n = items.map((x, j) => j === i ? { ...x, ...patch } : x); run(() => api(`/api/projects/${id}/handoff`, { method: 'PUT', body: { items: n } })) }
  return (
    <>
      <Box title="🏷️ Data final untuk launch">
        <Field label="Nama menu final"><Auto value={det.namaMenu} disabled={!editor} onSave={saveDet(7, 'namaMenu')} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="SKU code"><Auto value={det.sku} disabled={!editor} onSave={saveDet(7, 'sku')} /></Field>
          <Field label="Launch date"><Auto type="date" value={det.launchDate} disabled={!editor} onSave={saveDet(7, 'launchDate')} /></Field>
          <Field label="Harga jual final (Rp)"><Auto type="number" value={det.hargaFinal} disabled={!editor} onSave={saveDet(7, 'hargaFinal')} /></Field>
          <Field label="HPP final (Rp)"><Auto type="number" value={det.hppFinal} disabled={!editor} onSave={saveDet(7, 'hppFinal')} /></Field>
        </div>
        <div className={`mb-3 rounded-lg p-2 text-sm ${fc == null ? 'bg-tint2' : fc > targetFc ? 'bg-[#F5E6CC]' : 'bg-[#DCEADF]'}`}>Food cost final: <b>{fmtPct(fc)}</b> (target ≤ {targetFc}%)</div>
        <Field label="Harga per channel"><Auto rows={2} value={det.hargaChannel} disabled={!editor} onSave={saveDet(7, 'hargaChannel')} placeholder="Outlet Rp…, GoFood Rp…" /></Field>
        <Field label="Channel launch"><Auto value={det.channel} disabled={!editor} onSave={saveDet(7, 'channel')} placeholder="Outlet Kiosk, Gerobak, GoFood" /></Field>
      </Box>
      <Box title="🤝 Serah terima ke divisi lain" right={<span className="text-xs text-char/60">{items.filter((x) => x.done || x.na).length}/{items.length}</span>}>
        {items.map((h, i) => (
          <div key={h.key} className="mb-2 rounded-lg border border-line p-2">
            <div className="flex items-start gap-2">
              <button disabled={!editor} onClick={() => upd(i, { done: !h.done, na: false })}
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold ${h.done ? 'border-hijau bg-hijau text-white' : 'border-line'}`}>{h.done ? '✓' : ''}</button>
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-semibold ${h.na ? 'text-abu line-through' : ''}`}>{h.label}</div>
                <div className="text-[11px] text-char/60">{h.divisi}</div>
              </div>
              {editor && <button onClick={() => upd(i, { na: !h.na, done: false })} className={`min-h-[30px] rounded-full border px-2 text-[10.5px] font-semibold ${h.na ? 'border-char bg-char text-cream' : 'border-line text-char/60'}`}>N/A</button>}
            </div>
            <div className="mt-1.5"><Auto value={h.pic} disabled={!editor} onSave={(v) => upd(i, { pic: v })} placeholder="PIC divisi" className="min-h-0 py-1.5 text-sm" /></div>
          </div>
        ))}
      </Box>
      <LaunchBoardCard p={p} id={id} editor={postEditor} run={run} />
      <Scorecard sc={d.scorecard} det={det} can={postEditor} saveDet={saveDet} />
    </>
  )
}

/* ---------- Gantt ---------- */
function Gantt({ p, c, today }) {
  const dates = p.stages.flatMap((s) => [s.plannedStart, s.plannedEnd, s.actualStart, s.actualEnd]).filter(Boolean).concat([today])
  if (dates.length < 2) return null
  const min = new Date(dates.reduce((a, b) => a < b ? a : b)), max = new Date(dates.reduce((a, b) => a > b ? a : b))
  const span = Math.max(1, (max - min) / 864e5)
  const x = (s) => ((new Date(s) - min) / 864e5) / span * 100
  return (
    <div className="mb-6">
      <div className="mb-2 text-[15px] font-extrabold">📊 Rencana vs kenyataan</div>
      <div className="card p-3">
        {p.stages.map((s, i) => {
          const aEnd = s.actualEnd || (s.actualStart ? today : null)
          const late = s.plannedEnd && aEnd && aEnd > s.plannedEnd
          return (
            <div key={i} className="mb-2 grid grid-cols-[30px_1fr] items-center gap-2 last:mb-0">
              <span className="text-[14px]" title={STAGE[i].santai}>{STAGE[i].emoji}</span>
              <div className="relative h-6 rounded bg-cream/60">
                {s.state === 'skipped' && <span className="absolute inset-0 flex items-center text-[10px] italic text-abu">skipped</span>}
                {s.plannedStart && s.plannedEnd && <div className="absolute top-0.5 h-2.5 rounded bg-tint" style={{ left: `${x(s.plannedStart)}%`, width: `${Math.max(1.5, x(s.plannedEnd) - x(s.plannedStart))}%` }} />}
                {s.actualStart && <div className={`absolute bottom-0.5 h-2.5 rounded ${late ? 'bg-bata' : 'bg-hijau'}`} style={{ left: `${x(s.actualStart)}%`, width: `${Math.max(1.5, x(aEnd) - x(s.actualStart))}%` }} />}
              </div>
            </div>
          )
        })}
        <div className="relative ml-[38px] mt-1 h-4 text-[10px] text-char/55">
          <span className="absolute left-0">{fmtTgl(min.toISOString(), true)}</span>
          <span className="absolute font-bold text-bata" style={{ left: `${Math.min(85, x(today))}%` }}>hari ini</span>
          <span className="absolute right-0">{fmtTgl(max.toISOString(), true)}</span>
        </div>
      </div>
    </div>
  )
}

/* ---------- Timeline ---------- */
const ACT = { create: 'membuat proyek', stage_advance: 'memindahkan stage', stage_back: 'kembali ke stage', stage_start: 'memulai stage', skip: 'skip stage',
  decision: 'memberi keputusan', decision_request: 'meminta keputusan', status_change: 'mengubah status', edit: 'update data', import: 'import',
  kandidat_add: 'menambah kandidat', kandidat_edit: 'update kandidat', kandidat_delete: 'menghapus kandidat', score: 'scoring', bom: 'update BOM', launch: 'launch', reopen: 'reopen' }
function Timeline({ d, id, run, members }) {
  const [text, setText] = useState('')
  const [all, setAll] = useState(false)
  const rows = all ? d.timeline : d.timeline.filter((r) => r.type === 'comment' || !['edit', 'kandidat_edit', 'score', 'bom'].includes(r.action)).slice(0, 15)
  const fmtStage = (v) => typeof v === 'number' ? STAGE[v - 1].santai : v
  return (
    <div className="mb-8">
      <div className="mb-2 text-[15px] font-extrabold">💬 Komentar & riwayat</div>
      <div className="card mb-3 p-3">
        <textarea className="inp mb-2" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis komentar… ketik @nama untuk memanggil seseorang" />
        <button className="btn-p w-full" disabled={!text.trim()} onClick={() => run(() => api(`/api/projects/${id}/comments`, { method: 'POST', body: { text } })).then((ok) => ok && setText(''))}>Kirim komentar</button>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="mb-2 border-l-2 border-line pl-3">
          <div className="text-[11px] text-char/55">{fmtWhen(r.at)}</div>
          {r.type === 'comment'
            ? <div className="text-sm"><b>{r.byName}</b>: {r.text}</div>
            : <div className="text-sm"><b>{r.byName}</b> {ACT[r.action] || r.action}{r.from != null && r.to != null ? ` ${fmtStage(r.from)} → ${fmtStage(r.to)}` : r.to ? ` ${fmtStage(r.to)}` : ''}{r.note ? <span className="text-char/70"> — {r.note}</span> : ''}</div>}
        </div>
      ))}
      <button className="mt-1 text-xs font-semibold text-bata underline" onClick={() => setAll(!all)}>{all ? 'Ringkas' : 'Tampilkan semua aktivitas'}</button>
    </div>
  )
}

/* ---------- dialogs ---------- */
function NoteDialog({ open, title, label, onClose, onOk }) {
  const [n, setN] = useState('')
  useEffect(() => { if (open) setN('') }, [open])
  return <Sheet open={open} onClose={onClose} title={title} footer={<button className="btn-p w-full" disabled={!n.trim()} onClick={() => onOk(n)}>Simpan</button>}>
    <Field label={label}><textarea className="inp" rows={3} value={n} onChange={(e) => setN(e.target.value)} autoFocus /></Field>
  </Sheet>
}
function StatusDialog({ open, p, onClose, onOk }) {
  const [s, setS] = useState(p.status); const [n, setN] = useState(p.statusNote || '')
  useEffect(() => { if (open) { setS(['on_track', 'at_risk', 'blocked'].includes(p.status) ? p.status : 'on_track'); setN(p.statusNote || '') } }, [open])
  return <Sheet open={open} onClose={onClose} title="Ubah status" footer={<button className="btn-p w-full" onClick={() => onOk(s, n)}>Simpan</button>}>
    <div className="mb-3 grid grid-cols-3 gap-2">{['on_track', 'at_risk', 'blocked'].map((k) =>
      <button key={k} onClick={() => setS(k)} className="min-h-[44px] rounded-lg border-2 text-sm font-bold" style={{ borderColor: STATUS[k].color, background: s === k ? STATUS[k].color : 'transparent', color: s === k ? '#fff' : STATUS[k].color }}>{STATUS[k].emoji} {STATUS[k].label}</button>)}</div>
    <Field label={s === 'on_track' ? 'Catatan (opsional)' : 'Apa penyebabnya? (wajib)'}><textarea className="inp" rows={3} value={n} onChange={(e) => setN(e.target.value)} /></Field>
    <div className="text-[11px] text-char/60">Proyek yang telat jadwal otomatis tampil “Perlu perhatian”.</div>
  </Sheet>
}
function DecisionDialog({ open, p, d, c, onClose, onOk }) {
  const [dec, setDec] = useState('go'); const [n, setN] = useState(''); const [kd, setKd] = useState({})
  useEffect(() => { if (open) { setDec('go'); setN(''); setKd({}) } }, [open])
  const ks = d.kandidat.filter((k) => ['lolos_screening', 'konsep', 'prototipe', 'lolos_uji'].includes(k.status))
  const cols = { go: '#2F6B4A', revisi: '#B8741A', drop: '#B42F27' }
  return <Sheet open={open} onClose={onClose} title={`🗳️ Keputusan · ${STAGE[p.currentStage - 1].santai}`}
    footer={<button className="btn-p w-full" onClick={() => onOk({ decision: dec, note: n, kandidat: kd })}>Simpan keputusan</button>}>
    <div className="mb-3 grid grid-cols-3 gap-2">{['go', 'revisi', 'drop'].map((k) =>
      <button key={k} onClick={() => setDec(k)} className="min-h-[64px] rounded-2xl border-2 text-[14px] font-extrabold" style={{ borderColor: cols[k], background: dec === k ? cols[k] : 'transparent', color: dec === k ? '#fff' : cols[k] }}>
        <div className="text-[20px]">{{ go: '✅', revisi: '✏️', drop: '✋' }[k]}</div>{{ go: 'Lanjut', revisi: 'Revisi', drop: 'Stop' }[k]}</button>)}</div>
    {dec === 'drop' && <div className="mb-3 rounded-lg bg-tint2 p-2 text-xs">Stop = proyek dihentikan dan jadwal launch-nya dikosongkan.</div>}
    {dec !== 'drop' && ks.length > 0 && <>
      <div className="lbl">Hentikan ide tertentu saja (opsional)</div>
      {ks.map((k) => <label key={k.id} className="mb-1.5 flex min-h-[40px] items-center justify-between rounded-lg border border-line px-3 text-sm">
        <span>{k.nama}</span><input type="checkbox" className="h-5 w-5 accent-bata" checked={kd[k.id] === 'drop'} onChange={(e) => setKd({ ...kd, [k.id]: e.target.checked ? 'drop' : undefined })} /></label>)}
    </>}
    <Field label="Catatan keputusan"><textarea className="inp" rows={3} value={n} onChange={(e) => setN(e.target.value)} /></Field>
  </Sheet>
}
function EditDialog({ open, p, state, onClose, onOk }) {
  const [f, setF] = useState({})
  useEffect(() => { if (open) setF({ nama: p.nama, objective: p.objective, picId: p.picId, slotId: p.slotId || '', targetLaunch: p.targetLaunch || '', resetPlanned: false }) }, [open])
  const slots = state.slots.filter((s) => s.category === p.category && (!s.flags.hasProject || s.id === p.slotId) && !s.flags.past)
  const editors = state.members.filter((m) => m.active && ['pid_head', 'pid_supervisor'].includes(m.role))
  const submit = () => {
    const body = { nama: f.nama, objective: f.objective, picId: f.picId }
    if ((f.slotId || null) !== (p.slotId || null)) body.slotId = f.slotId || null
    if (!f.slotId && (f.targetLaunch || null) !== (p.targetLaunch || null)) body.targetLaunch = f.targetLaunch || null
    if (body.slotId || body.targetLaunch !== undefined) body.resetPlanned = f.resetPlanned
    onOk(body)
  }
  return <Sheet open={open} onClose={onClose} title="Edit proyek" footer={<button className="btn-p w-full" onClick={submit}>Simpan</button>}>
    <Field label="Nama proyek"><input className="inp" value={f.nama || ''} onChange={(e) => setF({ ...f, nama: e.target.value })} /></Field>
    <Field label="Objective"><textarea className="inp" rows={2} value={f.objective || ''} onChange={(e) => setF({ ...f, objective: e.target.value })} /></Field>
    <Field label="PIC"><select className="inp" value={f.picId || ''} onChange={(e) => setF({ ...f, picId: e.target.value })}>{editors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
    <Field label="Slot launch"><select className="inp" value={f.slotId || ''} onChange={(e) => setF({ ...f, slotId: e.target.value })}>
      <option value="">Tanpa slot / tanggal custom</option>{slots.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
    {!f.slotId && <Field label="Target launch"><input type="date" className="inp" value={f.targetLaunch || ''} onChange={(e) => setF({ ...f, targetLaunch: e.target.value })} /></Field>}
    <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-bata" checked={!!f.resetPlanned} onChange={(e) => setF({ ...f, resetPlanned: e.target.checked })} />Reset semua planned date ke SLA</label>
  </Sheet>
}
