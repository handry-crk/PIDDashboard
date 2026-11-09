import React, { useEffect, useState } from 'react'
import { api, download } from '../api.js'
import { go } from '../App.jsx'
import { Empty, Field, Pill, Section, Sheet, StatusPill, Title, useToast, fmtTgl, fmtWhen, ROMAN, slaText } from '../ui.jsx'

const ROLES = { pid_head: 'PID Head', pid_supervisor: 'PID Supervisor', pid_staff: 'PID Staff / R&D', viewer: 'Viewer' }
const HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

export default function Saya({ state, reload, onLogout }) {
  const me = state.me
  const head = me.role === 'pid_head' || me.isAdmin
  const c = state.constants
  const mine = state.projects.filter((p) => !['done', 'dropped'].includes(p.status) && (
    p.picId === me.id || (me.role === 'pid_staff' && [5, 6].includes(p.currentStage)) || (head && p.waitingDecision)))
    .map((p) => ({ p, due: p.stages[p.currentStage - 1].plannedEnd }))
    .sort((a, b) => (a.p.waitingDecision === b.p.waitingDecision ? 0 : a.p.waitingDecision ? -1 : 1) || (a.due || '9').localeCompare(b.due || '9'))
  return (
    <div>
      <Title sub={`${ROLES[me.role]}${me.isAdmin ? ' · Admin' : ''}`}>{`Halo ${me.name}`}</Title>
      <Section title="Tugas Saya" sub="Diurutkan berdasarkan due date stage">
        {mine.length ? mine.map(({ p, due }) => (
          <button key={p.id} onClick={() => go(`#/proyek/${p.id}`)} className="card mb-2 flex w-full items-center justify-between gap-2 p-3 text-left">
            <div className="min-w-0">
              <div className="truncate font-bold">{p.nama}</div>
              <div className="text-xs text-char/65"><b className="text-hijau">{ROMAN[p.currentStage - 1]}</b> {c.stages[p.currentStage - 1].nama} · due {fmtTgl(due)}</div>
              {p.waitingDecision && head && <div className="text-xs font-semibold text-amber">Menunggu keputusan Anda</div>}
              {slaText(p.flags) && <div className={`text-xs font-semibold ${p.flags.lewatSla ? 'text-bata' : 'text-char/60'}`}>{slaText(p.flags)}</div>}
            </div>
            <StatusPill status={p.flags.effectiveStatus} />
          </button>
        )) : <Empty>Tidak ada tugas aktif untuk Anda.</Empty>}
      </Section>
      <Profile me={me} />
      {head && <Admin state={state} reload={reload} />}
      <button className="btn-o mb-10 w-full" onClick={onLogout}>Logout</button>
    </div>
  )
}

function Profile({ me }) {
  const toast = useToast()
  const [f, setF] = useState({ email: me.email || '', phone: me.phone || '' })
  return (
    <Section title="Profil Saya" sub="Email dipakai untuk digest, nudge, dan mention">
      <div className="card p-3">
        <Field label="Email"><input className="inp" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="WhatsApp"><input className="inp" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <button className="btn-p w-full" onClick={() => api(`/api/members/${me.id}`, { method: 'PUT', body: f }).then(() => toast('Profil tersimpan')).catch((e) => toast(e.message, 'err'))}>Simpan</button>
      </div>
    </Section>
  )
}

function Admin({ state, reload }) {
  const toast = useToast()
  const me = state.me
  const c = state.constants
  const [s, setS] = useState(state.settings)
  const [pinFor, setPinFor] = useState(null)
  const [pin, setPin] = useState('')
  const [job, setJob] = useState(null)
  const [newSlot, setNewSlot] = useState({ category: 'new_brand', period: '' })
  useEffect(() => { setS(state.settings) }, [state.settings.shareToken])
  const link = `${window.location.origin}/laporan?t=${state.settings.shareToken}`
  const saveSettings = async (patch) => {
    try { const r = await api('/api/settings', { method: 'PUT', body: patch }); setS({ ...s, ...r }); toast('Settings tersimpan'); reload() } catch (e) { toast(e.message, 'err') }
  }
  const runJob = async (name) => { try { const r = await api(`/api/jobs/${name}/run`, { method: 'POST' }); setJob({ name, ...r }); reload() } catch (e) { toast(e.message, 'err') } }
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Link tersalin') } catch { toast('Copy gagal, salin manual', 'err') } }
  const empty = state.projects.length === 0

  return (
    <>
      <Section title="Panel Admin" sub="Khusus PID Head / Admin">
        {empty && me.isAdmin && (
          <div className="card mb-3 border-bata p-3">
            <div className="mb-2 text-sm">Database masih kosong. Import kondisi whiteboard SO-PID-010 (9 Nov 2026): Bumbu Cimol, Minuman, Produk Online, Brand Baru.</div>
            <button className="btn-p w-full" onClick={() => api('/api/seed/whiteboard', { method: 'POST' }).then(() => { toast('Data whiteboard diimport'); reload() }).catch((e) => toast(e.message, 'err'))}>Import data whiteboard</button>
          </div>
        )}
        <div className="card mb-3 p-3">
          <div className="mb-1 text-[13px] font-bold">Link Reporting (read-only, tanpa login)</div>
          <div className="mb-2 break-all rounded-lg bg-cream p-2 text-xs">{link}</div>
          <div className="grid grid-cols-3 gap-2">
            <button className="btn-p text-xs" onClick={() => copy(link)}>Copy link</button>
            <a className="btn-o text-xs" href={link} target="_blank" rel="noreferrer">Buka</a>
            <button className="btn-g border border-line text-xs" onClick={() => confirm('Regenerate token? Link lama tidak berlaku lagi.') && api('/api/settings/share-token', { method: 'POST' }).then(() => { reload(); toast('Token baru dibuat') })}>Regenerate</button>
          </div>
        </div>
        <div className="card mb-3 p-3">
          <div className="mb-2 text-[13px] font-bold">Jalankan sekarang</div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-o text-xs" onClick={() => runJob('weekly')}>Kirim Weekly Update</button>
            <button className="btn-o text-xs" onClick={() => runJob('digest')}>Kirim daily digest</button>
            <button className="btn-o text-xs" onClick={() => runJob('nudge')}>Kirim nudge</button>
            <button className="btn-o text-xs" onClick={() => runJob('backup')}>Backup sekarang</button>
          </div>
          <div className="mt-3 text-[13px] font-bold">Export CSV</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {['projects', 'kandidat', 'vendors'].map((n) => <button key={n} className="btn-g border border-line text-xs" onClick={() => download(`/api/export/${n}.csv`, `pid-${n}.csv`)}>{n}</button>)}
          </div>
        </div>
      </Section>

      <Section title="Member" sub="Role, status aktif, reset PIN">
        {state.members.map((m) => (
          <div key={m.id} className="card mb-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0"><div className="truncate font-bold">{m.name} {m.isAdmin && <Pill>Admin</Pill>}</div><div className="truncate text-xs text-char/60">{m.email || '-'} · {m.phone || '-'}</div></div>
              {!m.active && <Pill color="#8A8378">Nonaktif</Pill>}
            </div>
            {me.isAdmin && <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
              <select className="inp py-2" value={m.role} onChange={(e) => api(`/api/members/${m.id}`, { method: 'PUT', body: { role: e.target.value } }).then(reload)}>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <button className="btn-g border border-line px-3 text-xs" onClick={() => { setPinFor(m); setPin('') }}>Reset PIN</button>
              {m.id !== me.id && <button className="btn-g border border-line px-3 text-xs" onClick={() => api(`/api/members/${m.id}`, { method: 'PUT', body: { active: !m.active } }).then(reload)}>{m.active ? 'Nonaktifkan' : 'Aktifkan'}</button>}
            </div>}
          </div>
        ))}
      </Section>

      <Section title="Slot & Cadence" sub="Bulan launch per kategori (slot dibuat otomatis 15 bulan ke depan)">
        <div className="card p-3">
          {c.categoryOrder.map((cat) => (
            <div key={cat} className="mb-3">
              <div className="mb-1 text-[12px] font-bold">{c.categories[cat].label} <span className="font-normal text-char/55">· target {s.launchTargetPerYear[cat]}/tahun</span></div>
              <div className="grid grid-cols-6 gap-1">
                {['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'].map((b, i) => {
                  const on = (s.cadence[cat] || []).includes(i + 1)
                  return <button key={b} onClick={() => { const arr = on ? s.cadence[cat].filter((x) => x !== i + 1) : [...(s.cadence[cat] || []), i + 1].sort((a, b2) => a - b2); setS({ ...s, cadence: { ...s.cadence, [cat]: arr } }) }}
                    className={`h-9 rounded-md border text-[11px] font-semibold ${on ? 'border-bata bg-bata text-cream' : 'border-line'}`}>{b}</button>
                })}
              </div>
            </div>
          ))}
          <button className="btn-p w-full" onClick={() => saveSettings({ cadence: s.cadence })}>Simpan cadence</button>
          <div className="mt-4 text-[12px] font-bold">Tambah slot manual (mis. New Brand)</div>
          <div className="mt-1 grid grid-cols-[1fr_1fr_auto] gap-2">
            <select className="inp" value={newSlot.category} onChange={(e) => setNewSlot({ ...newSlot, category: e.target.value })}>{c.categoryOrder.map((k) => <option key={k} value={k}>{c.categories[k].label}</option>)}</select>
            <input type="month" className="inp" value={newSlot.period} onChange={(e) => setNewSlot({ ...newSlot, period: e.target.value })} />
            <button className="btn-o px-3" disabled={!newSlot.period} onClick={() => api('/api/slots', { method: 'POST', body: newSlot }).then(() => { toast('Slot ditambahkan'); reload() }).catch((e) => toast(e.message, 'err'))}>+</button>
          </div>
          <div className="mt-2 space-y-1">
            {state.slots.filter((x) => !x.auto && !x.flags.past).map((x) => (
              <div key={x.id} className="flex items-center justify-between text-xs"><span>{x.label}{x.project ? ` · ${x.project.kode}` : ''}</span>
                {!x.project && <button className="text-bata underline" onClick={() => api(`/api/slots/${x.id}`, { method: 'DELETE' }).then(reload)}>Delete</button>}</div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="SLA per Stage" sub="Hari per stage I–VII; planned date proyek aktif dihitung ulang">
        <div className="card overflow-x-auto p-3">
          <table className="w-full min-w-[420px] text-[12px]">
            <thead><tr className="bg-bata text-cream"><th className="px-2 py-1.5 text-left">Kategori</th>{ROMAN.map((r) => <th key={r} className="px-1">{r}</th>)}<th className="px-1">Total</th></tr></thead>
            <tbody>{c.categoryOrder.map((cat) => (
              <tr key={cat} className="border-b border-line">
                <td className="px-2 py-1.5 font-semibold">{c.categories[cat].label}</td>
                {s.slaDays[cat].map((v, i) => <td key={i} className="px-0.5"><input inputMode="numeric" className="w-full rounded border border-line bg-white/70 py-1.5 text-center text-[14px]" value={v}
                  onChange={(e) => { const arr = [...s.slaDays[cat]]; arr[i] = e.target.value.replace(/\D/g, ''); setS({ ...s, slaDays: { ...s.slaDays, [cat]: arr } }) }} /></td>)}
                <td className="px-1 text-center font-bold">{s.slaDays[cat].reduce((a, b) => a + Number(b || 0), 0)}</td>
              </tr>))}</tbody>
          </table>
          <button className="btn-p mt-3 w-full" onClick={() => saveSettings({ slaDays: s.slaDays })}>Simpan SLA</button>
        </div>
      </Section>

      <Section title="Screening & Food Cost" sub="Kriteria Penyaringan Ide dan target food cost">
        <div className="card p-3">
          {s.screeningCriteria.map((cr, i) => (
            <div key={cr.id} className="mb-2 grid grid-cols-[1fr_64px] gap-2">
              <input className="inp" value={cr.label} onChange={(e) => { const arr = [...s.screeningCriteria]; arr[i] = { ...cr, label: e.target.value }; setS({ ...s, screeningCriteria: arr }) }} />
              <input className="inp text-center" inputMode="numeric" value={cr.weight} onChange={(e) => { const arr = [...s.screeningCriteria]; arr[i] = { ...cr, weight: Number(e.target.value.replace(/\D/g, '')) }; setS({ ...s, screeningCriteria: arr }) }} />
            </div>
          ))}
          <div className="mb-3 text-right text-[11px] text-char/60">Total bobot {s.screeningCriteria.reduce((a, b) => a + Number(b.weight || 0), 0)}%</div>
          <Field label="Skor lolos minimum (1–5)"><input className="inp" inputMode="decimal" value={s.screeningPassScore} onChange={(e) => setS({ ...s, screeningPassScore: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">{c.categoryOrder.map((cat) => (
            <Field key={cat} label={`Target food cost ${c.categories[cat].label} (%)`}><input className="inp" inputMode="numeric" value={s.targetFoodCostPct[cat]} onChange={(e) => setS({ ...s, targetFoodCostPct: { ...s.targetFoodCostPct, [cat]: Number(e.target.value.replace(/\D/g, '')) } })} /></Field>))}
          </div>
          <button className="btn-p w-full" onClick={() => saveSettings({ screeningCriteria: s.screeningCriteria, screeningPassScore: Number(String(s.screeningPassScore).replace(',', '.')), targetFoodCostPct: s.targetFoodCostPct })}>Simpan</button>
        </div>
      </Section>

      <Section title="Reminder" sub="Jadwal email otomatis (WIB)">
        <div className="card p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nudge supervisor"><input type="time" className="inp" value={s.nudgeTime} onChange={(e) => setS({ ...s, nudgeTime: e.target.value })} /></Field>
            <Field label="Daily digest"><input type="time" className="inp" value={s.digestTime} onChange={(e) => setS({ ...s, digestTime: e.target.value })} /></Field>
            <Field label="Weekly update (hari)"><select className="inp" value={s.weeklyDay} onChange={(e) => setS({ ...s, weeklyDay: Number(e.target.value) })}>{HARI.slice(1).map((h, i) => <option key={h} value={i + 1}>{h}</option>)}</select></Field>
            <Field label="Weekly update (jam)"><input type="time" className="inp" value={s.weeklyTime} onChange={(e) => setS({ ...s, weeklyTime: e.target.value })} /></Field>
            <Field label="Stalled setelah (hari)"><input className="inp" inputMode="numeric" value={s.stalledDays} onChange={(e) => setS({ ...s, stalledDays: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
            <Field label="Admin email"><input className="inp" type="email" value={s.adminEmail || ''} onChange={(e) => setS({ ...s, adminEmail: e.target.value })} /></Field>
          </div>
          <button className="btn-p w-full" onClick={() => saveSettings({ nudgeTime: s.nudgeTime, digestTime: s.digestTime, weeklyDay: s.weeklyDay, weeklyTime: s.weeklyTime, stalledDays: s.stalledDays, adminEmail: s.adminEmail })}>Simpan reminder</button>
        </div>
      </Section>

      {me.isAdmin && <AdminPin />}

      <Sheet open={!!pinFor} onClose={() => setPinFor(null)} title={`Reset PIN · ${pinFor?.name}`} footer={<button className="btn-p w-full" disabled={!/^\d{4,6}$/.test(pin)}
        onClick={() => api(`/api/members/${pinFor.id}/reset-pin`, { method: 'POST', body: { pin } }).then(() => { toast('PIN direset & akun dibuka'); setPinFor(null) }).catch((e) => toast(e.message, 'err'))}>Reset PIN</button>}>
        <Field label="PIN baru (4–6 digit)"><input className="inp tracking-[6px]" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></Field>
      </Sheet>
      <Sheet open={!!job} onClose={() => setJob(null)} title={`Hasil job: ${job?.name}`} wide>
        {job && <>
          {job.email && <div className={`mb-2 rounded-lg p-2 text-xs ${job.email.sent ? 'bg-[#DCEADF]' : 'bg-[#F5E6CC]'}`}>{job.email.sent ? `Email terkirim ke ${job.email.to?.length} penerima` : `Email tidak terkirim: ${job.email.reason}`}</div>}
          {job.skipped && <div className="mb-2 text-sm">{job.skipped}</div>}
          {job.file && <div className="text-sm">Backup tersimpan: {job.file}</div>}
          {job.text && <><pre className="whitespace-pre-wrap rounded-lg bg-card p-3 text-xs">{job.text}</pre>
            <button className="btn-o mt-2 w-full" onClick={() => navigator.clipboard.writeText(job.text).then(() => toast('Teks tersalin'))}>Copy teks</button></>}
        </>}
      </Sheet>
    </>
  )
}

function AdminPin() {
  const toast = useToast()
  const [pin, setPin] = useState('')
  return (
    <Section title="Admin PIN" sub="Fallback login Admin (default 1234)">
      <div className="card grid grid-cols-[1fr_auto] gap-2 p-3">
        <input className="inp tracking-[6px]" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN baru" />
        <button className="btn-p" disabled={!/^\d{4,6}$/.test(pin)} onClick={() => api('/api/settings/admin-pin', { method: 'PUT', body: { pin } }).then(() => { toast('Admin PIN diubah'); setPin('') }).catch((e) => toast(e.message, 'err'))}>Simpan</button>
      </div>
    </Section>
  )
}
