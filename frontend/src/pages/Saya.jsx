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
      <ReportLink token={state.settings.shareToken} />
      <Profile me={me} />
      {head && <Admin state={state} reload={reload} />}
      <button className="btn-o mb-10 w-full" onClick={onLogout}>Logout</button>
    </div>
  )
}

function ReportLink({ token }) {
  const toast = useToast()
  const link = `${window.location.origin}/laporan?t=${token}`
  return (
    <Section title="Link Reporting" sub="Read-only untuk Direksi & All Divisi, tanpa login">
      <div className="card grid grid-cols-2 gap-2 p-3">
        <a className="btn-p text-xs" href={link} target="_blank" rel="noreferrer">Buka Reporting</a>
        <button className="btn-o text-xs" onClick={() => navigator.clipboard.writeText(link).then(() => toast('Link tersalin')).catch(() => toast('Copy gagal', 'err'))}>Copy link</button>
      </div>
    </Section>
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

      <Section title="Member" sub="Role, status aktif, reset PIN · PID Head & PID Supervisor masing-masing 1 orang">
        {state.members.map((m) => (
          <div key={m.id} className="card mb-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0"><div className="truncate font-bold">{m.name} {m.isAdmin && <Pill>Admin</Pill>}</div><div className="truncate text-xs text-char/60">{m.email || '-'} · {m.phone || '-'}</div></div>
              {!m.active && <Pill color="#8A8378">Nonaktif</Pill>}
            </div>
            {me.isAdmin && <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
              <select className="inp py-2" value={m.role} onChange={(e) => api(`/api/members/${m.id}`, { method: 'PUT', body: { role: e.target.value } }).then(reload).catch((er) => toast(er.message, 'err'))}>
                {Object.entries(ROLES).map(([k, v]) => {
                  const holder = ['pid_head', 'pid_supervisor'].includes(k) && state.members.find((x) => x.active && x.role === k && x.id !== m.id)
                  return <option key={k} value={k} disabled={!!holder}>{v}{holder ? ` — sudah: ${holder.name}` : ''}</option>
                })}</select>
              <button className="btn-g border border-line px-3 text-xs" onClick={() => { setPinFor(m); setPin('') }}>Reset PIN</button>
              {m.id !== me.id && <button className="btn-g border border-line px-3 text-xs" onClick={() => api(`/api/members/${m.id}`, { method: 'PUT', body: { active: !m.active } }).then(reload).catch((er) => toast(er.message, 'err'))}>{m.active ? 'Nonaktifkan' : 'Aktifkan'}</button>}
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

      <WhatsApp members={state.members} me={me} />
      <LaunchBoardSettings />
      {me.isAdmin && <AdminPin />}
      {me.isAdmin && <ResetData reload={reload} />}

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

function WhatsApp({ members, me }) {
  const toast = useToast()
  const [w, setW] = useState(null)
  const [token, setToken] = useState('')
  const [group, setGroup] = useState('')
  const [testTo, setTestTo] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => api('/api/wa').then((r) => { setW(r); setGroup(r.group || '') }).catch(() => {})
  useEffect(() => { load() }, [])
  if (!w) return null
  const save = async (patch, msg = 'Pengaturan WhatsApp tersimpan') => {
    try { await api('/api/settings', { method: 'PUT', body: patch }); toast(msg); setToken(''); load() } catch (e) { toast(e.message, 'err') }
  }
  const test = async () => {
    setBusy(true)
    try { await api('/api/wa/test', { method: 'POST', body: testTo ? { target: testTo } : {} }); toast('Pesan tes terkirim'); load() }
    catch (e) { toast(e.message, 'err'); load() } finally { setBusy(false) }
  }
  const noPhone = members.filter((m) => m.active && m.role !== 'viewer' && !m.phone)
  return (
    <Section title="Notifikasi WhatsApp" sub="Via Fonnte · token dari menu Device di fonnte.com">
      <div className="card p-3">
        <label className="mb-3 flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-line px-3">
          <span className="text-sm font-semibold">Aktifkan notifikasi WhatsApp</span>
          <input type="checkbox" className="h-6 w-6 accent-bata" checked={!!w.enabled} disabled={!w.hasToken}
            onChange={(e) => save({ waEnabled: e.target.checked }, e.target.checked ? 'WhatsApp aktif' : 'WhatsApp dimatikan')} />
        </label>
        {!w.hasToken && <div className="mb-3 rounded-lg bg-[#F5E6CC] p-2 text-xs">Isi token Fonnte terlebih dahulu.</div>}
        <Field label="Token Fonnte" hint={w.hasToken ? 'Token tersimpan (tidak ditampilkan). Isi lagi hanya untuk mengganti.' : 'Salin dari fonnte.com → Device → token'}>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input className="inp" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={w.hasToken ? '••••••••' : 'Token device'} />
            <button className="btn-p px-3" disabled={!token.trim()} onClick={() => save({ waToken: token.trim() }, 'Token tersimpan')}>Simpan</button>
          </div>
        </Field>
        <Field label="ID grup WhatsApp untuk Weekly Update" hint="Format 1203xxxxxxxx@g.us (lihat daftar grup di dashboard Fonnte). Kosongkan bila tidak dipakai.">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input className="inp" value={group} onChange={(e) => setGroup(e.target.value.trim())} placeholder="120363xxxxxxxx@g.us" />
            <button className="btn-o px-3" onClick={() => save({ waGroup: group })}>Simpan</button>
          </div>
        </Field>
        <div className="lbl">Kirim notifikasi untuk</div>
        {Object.entries(w.eventLabels).map(([k, lab]) => (
          <label key={k} className="mb-1 flex min-h-[40px] items-center justify-between gap-3 border-b border-line text-[13px]">
            <span>{lab}</span>
            <input type="checkbox" className="h-5 w-5 accent-bata" checked={!!w.events[k]} onChange={(e) => save({ waEvents: { ...w.events, [k]: e.target.checked } })} />
          </label>
        ))}
        {noPhone.length > 0 && <div className="mt-3 rounded-lg bg-[#F5E6CC] p-2 text-xs">Belum ada nomor WhatsApp: {noPhone.map((m) => m.name).join(', ')}. Minta mereka mengisi di halaman Saya → Profil.</div>}
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <input className="inp" inputMode="numeric" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={me.phone ? `Tes ke ${me.phone}` : 'Nomor tujuan tes (08…)'} />
          <button className="btn-o px-3" disabled={!w.hasToken || busy} onClick={test}>{busy ? 'Mengirim…' : 'Kirim tes'}</button>
        </div>
        {w.log.length > 0 && <>
          <div className="mb-1 mt-4 text-[12px] font-bold">Log pengiriman terakhir</div>
          {w.log.slice(0, 8).map((l, i) => (
            <div key={i} className="mb-1 flex items-start justify-between gap-2 border-b border-line py-1.5 text-[11.5px]">
              <div className="min-w-0"><b>{w.eventLabels[l.event]?.split(' →')[0] || l.event}</b> · {fmtWhen(l.at)}
                <div className="truncate text-char/60">{l.ok ? `ke ${l.targets.length} tujuan` : l.reason}</div></div>
              <span className={`shrink-0 font-bold ${l.ok ? 'text-hijau' : 'text-amber'}`}>{l.ok ? 'Terkirim' : 'Gagal'}</span>
            </div>
          ))}
        </>}
      </div>
    </Section>
  )
}

function LaunchBoardSettings() {
  const toast = useToast()
  const [c, setC] = useState(null)
  const [url, setUrl] = useState('')
  const load = () => api('/api/launchboard').then((r) => { setC(r); setUrl(r.webhookUrl || '') }).catch(() => {})
  useEffect(() => { load() }, [])
  if (!c) return null
  const save = (patch, msg = 'Tersimpan') => api('/api/settings', { method: 'PUT', body: patch }).then(() => { toast(msg); load() }).catch((e) => toast(e.message, 'err'))
  const copyScript = async () => {
    try { const t = await api('/api/launchboard/script'); await navigator.clipboard.writeText(t); toast('Kode Apps Script tersalin') } catch (e) { toast(e.message || 'Copy gagal', 'err') }
  }
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${c.sheetId}/edit`
  const Step = ({ n, children }) => <div className="mb-2 flex gap-2 text-[13px]"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bata text-[11px] font-bold text-cream">{n}</span><div className="flex-1">{children}</div></div>
  return (
    <Section title="Product Launch Board" sub="Sinkron hand-off stage VII ke Google Sheet">
      <div className="card p-3">
        <div className={`mb-3 rounded-lg p-2 text-xs ${c.configured ? 'bg-[#DCEADF]' : 'bg-[#F5E6CC]'}`}>{c.configured ? `Terhubung (${c.mode === 'appsscript' ? 'Apps Script' : 'service account'})` : 'Belum terhubung. Cukup akun Google, tanpa Google Cloud.'}</div>
        <Step n={1}><button className="font-semibold text-bata underline" onClick={copyScript}>Copy kode Apps Script</button></Step>
        <Step n={2}><a className="font-semibold text-bata underline" href={sheetUrl} target="_blank" rel="noreferrer">Buka Sheet</a> → Extensions → Apps Script → hapus isi → tempel → Save.</Step>
        <Step n={3}>Deploy → New deployment → Web app. Execute as: <b>Me</b>. Who has access: <b>Anyone</b>. Deploy → izinkan akses → copy URL.</Step>
        <Step n={4}>
          <div className="grid grid-cols-[1fr_auto] gap-2"><input className="inp" value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://script.google.com/macros/s/.../exec" />
            <button className="btn-p px-3" onClick={() => save({ launchWebhookUrl: url }, 'URL tersimpan')}>Simpan</button></div>
        </Step>
        <Step n={5}><button className="font-semibold text-bata underline" disabled={!c.configured} onClick={() => api('/api/launchboard/test', { method: 'POST' }).then(() => toast('Terhubung ke Sheet, header tab Tasks sesuai')).catch((e) => toast(e.message, 'err'))}>Tes koneksi</button></Step>
        <label className="mt-2 flex min-h-[40px] items-center justify-between gap-3 border-t border-line pt-2 text-[13px]">
          <span>Sinkron otomatis</span>
          <input type="checkbox" className="h-5 w-5 accent-bata" checked={!!c.auto} onChange={(e) => save({ launchBoardAuto: e.target.checked })} />
        </label>
      </div>
    </Section>
  )
}

function ResetData({ reload }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ scope: 'proyek', confirm: '', pin: '' })
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const r = await api('/api/admin/reset', { method: 'POST', body: f })
      toast(`Data direset. Backup tersimpan: ${r.backup}`); setOpen(false); setF({ scope: 'proyek', confirm: '', pin: '' }); reload(); go('#/beranda')
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  return (
    <Section title="Reset Data" sub="Hapus data uji coba sebelum dipakai resmi">
      <div className="card border-bata p-3">
        <div className="mb-3 text-xs text-char/75">Member, PIN, dan Settings (SLA, cadence, WhatsApp, Launch Board) tidak ikut terhapus. Backup otomatis dibuat sebelum reset.</div>
        <button className="btn-o w-full" onClick={() => setOpen(true)}>Reset data…</button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Reset data"
        footer={<button className="btn-p w-full" disabled={busy || f.confirm.trim().toUpperCase() !== 'RESET' || !/^\d{4,6}$/.test(f.pin)} onClick={run}>{busy ? 'Mereset…' : 'Hapus permanen'}</button>}>
        <div className="mb-3 grid gap-2">
          {[['proyek', 'Proyek saja', 'Hapus semua proyek, kandidat, BOM, survey, komentar, lampiran proyek. Vendor & daftar harga tetap.'],
            ['semua', 'Proyek + vendor', 'Seperti di atas, ditambah semua vendor, riwayat harga, lampiran vendor, dan log WhatsApp.']].map(([k, l, d]) => (
            <button key={k} onClick={() => setF({ ...f, scope: k })} className={`rounded-lg border-2 p-3 text-left ${f.scope === k ? 'border-bata bg-tint2' : 'border-line'}`}>
              <div className="text-sm font-bold">{l}</div><div className="text-xs text-char/70">{d}</div>
            </button>
          ))}
        </div>
        <div className="mb-3 rounded-lg bg-[#F5E6CC] p-2 text-xs">Tindakan ini tidak bisa dibatalkan dari dashboard. Data hanya bisa dikembalikan dari file backup.</div>
        <Field label="Ketik RESET"><input className="inp" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoCapitalize="characters" /></Field>
        <Field label="PIN Anda"><input className="inp tracking-[6px]" type="password" inputMode="numeric" maxLength={6} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} /></Field>
      </Sheet>
    </Section>
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
