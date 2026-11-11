import React, { useEffect, useState } from 'react'
import { Logo } from '../ui.jsx'

const SCORE = [['rasa', 'Rasa'], ['tekstur', 'Tekstur'], ['porsiScore', 'Porsi'], ['harga', 'Harga sesuai']]
const INTENT = [['pasti', 'Pasti beli'], ['mungkin', 'Mungkin'], ['tidak', 'Tidak']]

function clientId() {
  try {
    let id = localStorage.getItem('pid_survey_client')
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('pid_survey_client', id) }
    return id
  } catch { return '' }
}

function Stars({ value, onChange }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className={`h-11 rounded-lg border text-base font-bold ${value === n ? 'border-bata bg-bata text-cream' : value && n < value ? 'border-tint bg-tint2 text-bata' : 'border-line bg-white text-char/60'}`}>{n}</button>
      ))}
    </div>
  )
}

export default function Survey() {
  const token = window.location.pathname.split('/')[2] || ''
  const [s, setS] = useState(null)
  const [err, setErr] = useState('')
  const [nama, setNama] = useState('')
  const [ans, setAns] = useState({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  useEffect(() => {
    fetch(`/api/survey/${encodeURIComponent(token)}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.detail); return j })
      .then(setS).catch((e) => setErr(e.message || 'Link survey tidak valid'))
  }, [token])
  const set = (kid, key, v) => setAns({ ...ans, [kid]: { ...(ans[kid] || {}), [key]: v } })
  const submit = async () => {
    const answers = Object.entries(ans).filter(([, a]) => a.rasa).map(([kandidatId, a]) => ({ kandidatId, ...a }))
    if (!answers.length) return setErr('Beri nilai rasa minimal untuk 1 menu')
    setBusy(true); setErr('')
    try {
      const r = await fetch(`/api/survey/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nama, clientId: clientId(), answers }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.detail)
      setDone(j.message); window.scrollTo(0, 0)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const Header = (
    <div className="bg-bata px-5 pb-6 pt-5 text-cream">
      <Logo light />
      <div className="mt-5 text-[26px] font-extrabold leading-tight">Cicip & Nilai</div>
      <div className="mt-1 text-sm">Bantu kami memilih menu baru {s?.judul ? `(${s.judul})` : ''}{s?.lokasi ? ` · ${s.lokasi}` : ''}</div>
    </div>
  )
  if (done) return <div className="min-h-screen">{Header}<div className="mx-auto max-w-md p-6 text-center"><div className="text-5xl"></div><div className="mt-3 text-lg font-bold text-bata">{done}</div><p className="mt-2 text-sm text-char/70">Penilaian Anda sudah kami terima.</p></div></div>
  if (!s) return <div className="min-h-screen">{Header}<div className="p-6 text-center text-sm text-char/70">{err || 'Memuat…'}</div></div>
  if (!s.open) return <div className="min-h-screen">{Header}<div className="mx-auto max-w-md p-6 text-center"><div className="text-lg font-bold text-bata">Survey sudah ditutup</div><p className="mt-2 text-sm text-char/70">{s.reason}</p></div></div>

  return (
    <div className="min-h-screen pb-10">
      {Header}
      <div className="mx-auto max-w-md px-4 pt-4">
        <p className="mb-4 text-sm text-char/75">Nilai menu yang Anda cicipi: 1 = kurang, 5 = sangat suka. Menu yang tidak dicicipi boleh dilewati.</p>
        {s.kandidat.map((k, i) => {
          const a = ans[k.id] || {}
          return (
            <div key={k.id} className="card mb-4 p-4">
              <div className="mb-3 flex items-center gap-3">
                {k.foto ? <img src={k.foto} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bata text-lg font-extrabold text-cream">{String.fromCharCode(65 + i)}</div>}
                <div className="text-[17px] font-bold leading-tight">{k.nama}</div>
              </div>
              {k.porsi.length > 1 && <div className="mb-3"><div className="lbl">Porsi yang dicicipi</div>
                <div className="flex flex-wrap gap-2">{k.porsi.map((p) => <button key={p} type="button" onClick={() => set(k.id, 'porsi', p)}
                  className={`min-h-[40px] rounded-full border px-4 text-sm font-semibold ${a.porsi === p ? 'border-bata bg-bata text-cream' : 'border-bata text-bata'}`}>{p}</button>)}</div></div>}
              {SCORE.map(([key, lab]) => <div key={key} className="mb-3"><div className="lbl">{lab}{key === 'rasa' && <span className="text-bata"> *</span>}</div><Stars value={a[key]} onChange={(v) => set(k.id, key, v)} /></div>)}
              <div className="mb-3"><div className="lbl">Apakah Anda akan membeli menu ini?</div>
                <div className="grid grid-cols-3 gap-2">{INTENT.map(([v, l]) => <button key={v} type="button" onClick={() => set(k.id, 'intent', v)}
                  className={`min-h-[44px] rounded-lg border text-sm font-semibold ${a.intent === v ? 'border-bata bg-bata text-cream' : 'border-line bg-white'}`}>{l}</button>)}</div></div>
              <div className="mb-3"><div className="lbl">Harganya terjangkau?</div>
                <div className="grid grid-cols-2 gap-2">{[[true, 'Ya'], [false, 'Terlalu mahal']].map(([v, l]) => <button key={l} type="button" onClick={() => set(k.id, 'priceOk', v)}
                  className={`min-h-[44px] rounded-lg border text-sm font-semibold ${a.priceOk === v ? 'border-bata bg-bata text-cream' : 'border-line bg-white'}`}>{l}</button>)}</div></div>
              <div className="lbl">Komentar (opsional)</div>
              <textarea className="inp" rows={2} maxLength={500} value={a.comment || ''} onChange={(e) => set(k.id, 'comment', e.target.value)} placeholder="Rasa, tekstur, saran…" />
            </div>
          )
        })}
        <div className="lbl">Nama panggilan (opsional)</div>
        <input className="inp mb-4" maxLength={60} value={nama} onChange={(e) => setNama(e.target.value)} />
        {err && <div className="mb-3 rounded-lg border border-bata bg-tint2 p-3 text-sm text-bata">{err}</div>}
        <button className="btn-p w-full" disabled={busy} onClick={submit}>{busy ? 'Mengirim…' : 'Kirim penilaian'}</button>
        <p className="mt-4 text-center text-[11px] text-char/50">Cimol Bojot AA · PT Citarasa Kuliner Indonesia</p>
      </div>
    </div>
  )
}
