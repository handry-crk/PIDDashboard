import React, { useEffect, useState } from 'react'
import { api, setToken } from '../api.js'
import { Field, Logo } from '../ui.jsx'

const ROLES = { pid_head: 'PID Head', pid_supervisor: 'PID Supervisor', pid_staff: 'PID Staff / R&D', viewer: 'Viewer' }

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [members, setMembers] = useState([])
  const [f, setF] = useState({ memberId: '', pin: '', name: '', role: 'pid_supervisor', email: '', phone: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [avail, setAvail] = useState(null)
  const [regMode, setRegMode] = useState('approval')
  const [dom, setDom] = useState('citarasakuliner.com')
  const [sent, setSent] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    api('/api/auth/members').then((m) => { setMembers(m); if (!m.length) setMode('register') }).catch(() => {})
    api('/api/auth/roles').then((r) => {
      setAvail(r.roles); setRegMode(r.mode || 'approval'); setDom(r.emailDomain || '')
      setF((o) => (r.roles[o.role]?.available ? o : { ...o, role: Object.keys(r.roles).find((k) => r.roles[k].available) || 'viewer' }))
    }).catch(() => {})
  }, [])

  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (mode === 'register' && dom && !f.email.trim().toLowerCase().endsWith('@' + dom)) { setErr(`Wajib pakai email kantor @${dom}`); return }
    setBusy(true)
    try {
      let r
      if (mode === 'login') r = await api('/api/auth/login', { method: 'POST', body: { memberId: f.memberId, pin: f.pin } })
      else if (mode === 'admin') r = await api('/api/auth/admin-login', { method: 'POST', body: { pin: f.pin } })
      else r = await api('/api/auth/register', { method: 'POST', body: { name: f.name, role: f.role, email: f.email, phone: f.phone, pin: f.pin } })
      if (r.pending) { setSent(r.message); setMode('login'); setF((o) => ({ ...o, pin: '' })); return }
      setToken(r.token); onLogin()
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-bata px-6 pb-10 pt-8 text-cream">
        <Logo light />
        <div className="mt-4 text-[34px] font-extrabold leading-none">PID Dashboard</div>
        <div className="mt-2 text-[15px] text-cream/85">Pantau menu baru dari ide sampai launch</div>
      </div>
      <form onSubmit={submit} className="mx-auto -mt-5 w-full max-w-md flex-1 rounded-t-2xl bg-cream px-6 pt-6">
        <div className="mb-5 grid grid-cols-3 rounded-lg border border-line p-1 text-sm font-semibold">
          {[['login', 'Masuk'], ['register', 'Daftar'], ['admin', 'Admin']].map(([k, l]) => (
            <button type="button" key={k} onClick={() => { setMode(k); setErr('') }} className={`min-h-[40px] rounded-md ${mode === k ? 'bg-bata text-cream' : 'text-char/70'}`}>{l}</button>
          ))}
        </div>
        {mode === 'login' && (
          <Field label="Nama">
            <select className="inp" value={f.memberId} onChange={set('memberId')} required>
              <option value="">Pilih nama Anda</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name} · {ROLES[m.role]}</option>)}
            </select>
          </Field>
        )}
        {sent && mode === 'login' && <div className="anim-in mb-4 rounded-lg border border-line bg-white p-3 text-sm">{sent}</div>}
        {mode === 'register' && regMode === 'closed' && (
          <div className="mb-4 rounded-lg bg-tint2 p-3 text-sm">Pendaftaran sedang ditutup. Minta Admin PID menambahkan akun Anda.</div>
        )}
        {mode === 'register' && regMode !== 'closed' && (
          <>
            {regMode === 'approval' && <div className="mb-3 rounded-lg bg-tint2 p-3 text-xs">Akun baru perlu <b>disetujui Admin PID</b> sebelum bisa dipakai.</div>}
            {!members.length && <div className="mb-3 rounded-lg bg-tint2 p-3 text-xs">User pertama otomatis menjadi <b>Admin</b>. Disarankan PID Head mendaftar lebih dulu.</div>}
            <Field label="Nama"><input className="inp" value={f.name} onChange={set('name')} required minLength={2} /></Field>
            <Field label="Role">
              <select className="inp" value={f.role} onChange={set('role')}>{Object.entries(ROLES).map(([k, v]) => {
                const a = avail?.[k]
                const taken = a && !a.available
                return <option key={k} value={k} disabled={taken}>{v}{taken ? (a.holder ? ` — sudah: ${a.holder}` : ' — ditetapkan Admin') : ''}</option>
              })}</select>
            </Field>
            <Field label={dom ? `Email kantor (@${dom})` : 'Email'}><input className="inp" type="email" value={f.email} onChange={set('email')} placeholder={`nama@${dom || 'citarasakuliner.com'}`} required={!!dom} /></Field>
            <Field label="WhatsApp"><input className="inp" inputMode="numeric" value={f.phone} onChange={set('phone')} placeholder="08…" /></Field>
          </>
        )}
        {!(mode === 'register' && regMode === 'closed') && <>
        <Field label={mode === 'admin' ? 'Admin PIN' : 'PIN (4–6 digit)'}>
          <input className="inp tracking-[6px]" type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} value={f.pin} onChange={set('pin')} required />
        </Field>
        {err && <div className="mb-3 rounded-lg border border-bata bg-tint2 p-3 text-sm text-bata">{err}</div>}
        <button className="btn-p w-full" disabled={busy}>{busy ? 'Sebentar…' : mode === 'register' ? (regMode === 'open' ? 'Daftar & masuk' : 'Kirim pendaftaran') : 'Masuk'}</button>
        </>}
        <p className="mt-6 pb-8 text-center text-[11px] text-char/50">PT Citarasa Kuliner Indonesia · Cimol Bojot AA</p>
      </form>
    </div>
  )
}
