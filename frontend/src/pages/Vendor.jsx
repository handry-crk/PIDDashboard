import React, { useEffect, useMemo, useState } from 'react'
import { api, download } from '../api.js'
import { go } from '../App.jsx'
import { Empty, Field, Pill, Sheet, Title, useToast, fmtTgl, VSTATUS } from '../ui.jsx'

const VCOL = { prospek: '#8A8378', sampling: '#B8741A', approved: '#2F6B4A', blacklist: '#B42F27' }
const BLANK = { nama: '', kategoriBahan: 'Protein', produkBahan: [], kontakNama: '', kontakHp: '', email: '', alamat: '', kota: '', moq: '', leadTimeHari: '',
  termin: 'cash', sertifikatHalal: false, halalNomor: '', halalExpiry: '', statusVendor: 'prospek', rating: 3, catatan: '' }

const wa = (hp) => `https://wa.me/${String(hp || '').replace(/^0/, '62').replace(/\D/g, '')}`

export default function Vendor({ state }) {
  const toast = useToast()
  const editor = ['pid_head', 'pid_supervisor'].includes(state.me.role) || state.me.isAdmin
  const head = state.me.role === 'pid_head' || state.me.isAdmin
  const c = state.constants
  const [list, setList] = useState(null)
  const [q, setQ] = useState(''); const [kat, setKat] = useState(''); const [stt, setStt] = useState(''); const [halal, setHalal] = useState(false)
  const [edit, setEdit] = useState(null)
  const [view, setView] = useState(null)
  const load = () => api('/api/vendors').then(setList).catch((e) => toast(e.message, 'err'))
  useEffect(() => { load() }, [])
  const rows = useMemo(() => (list || []).filter((v) =>
    (!kat || v.kategoriBahan === kat) && (!stt || v.statusVendor === stt) && (!halal || v.sertifikatHalal) &&
    (!q || `${v.nama} ${v.kota} ${(v.produkBahan || []).join(' ')}`.toLowerCase().includes(q.toLowerCase()))), [list, q, kat, stt, halal])

  const save = async () => {
    try {
      const body = { ...edit, produkBahan: (edit.produkBahan || []).map((x) => x.trim()).filter(Boolean), moq: edit.moq, leadTimeHari: edit.leadTimeHari === '' ? null : Number(edit.leadTimeHari), rating: Number(edit.rating) }
      if (edit.id) await api(`/api/vendors/${edit.id}`, { method: 'PUT', body }); else await api('/api/vendors', { method: 'POST', body })
      toast('Vendor tersimpan'); setEdit(null); load()
    } catch (e) { toast(e.message, 'err') }
  }
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <div>
      <Title sub="Master vendor bahan baku, utama untuk Online Food" right={<div className="flex gap-2">
        {head && <button className="btn-g border border-line px-3 text-xs" onClick={() => download('/api/export/vendors.csv', 'pid-vendors.csv')}>Export CSV</button>}
        {editor && <button className="btn-p hidden px-3 sm:inline-flex" onClick={() => setEdit({ ...BLANK })}>+ Vendor</button>}</div>}>Daftar Vendor</Title>
      <input className="inp mb-2" placeholder="Cari vendor, kota, bahan…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mb-4 grid grid-cols-2 gap-2">
        <select className="inp" value={kat} onChange={(e) => setKat(e.target.value)}><option value="">Semua kategori bahan</option>{c.kategoriBahan.map((k) => <option key={k}>{k}</option>)}</select>
        <select className="inp" value={stt} onChange={(e) => setStt(e.target.value)}><option value="">Semua status</option>{c.vendorStatuses.map((k) => <option key={k} value={k}>{VSTATUS[k]}</option>)}</select>
        <label className="col-span-2 flex min-h-[40px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-bata" checked={halal} onChange={(e) => setHalal(e.target.checked)} />Hanya yang bersertifikat halal</label>
      </div>
      {list === null ? <div className="text-sm text-char/60">Memuat…</div> : rows.length ? (
        <div className="grid gap-2.5 md:grid-cols-2">
          {rows.map((v) => (
            <button key={v.id} onClick={() => setView(v)} className="card p-3 text-left">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="truncate font-bold">{v.nama}</div><div className="text-xs text-char/60">{v.kategoriBahan || '-'} · {v.kota || '-'}</div></div>
                <Pill color={VCOL[v.statusVendor]}>{VSTATUS[v.statusVendor]}</Pill>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-char/75">
                <span>MOQ {v.moq || '-'}</span><span>Lead time {v.leadTimeHari ?? '-'} hr</span><span>Termin {v.termin || '-'}</span>
                <span className="text-amber">{'★'.repeat(v.rating || 0)}<span className="text-line">{'★'.repeat(5 - (v.rating || 0))}</span></span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {v.sertifikatHalal ? <Pill color={v.halalWarning ? '#B8741A' : '#2F6B4A'}>{v.halalWarning ? `⚠ Halal exp ${fmtTgl(v.halalExpiry)}` : 'Halal'}</Pill> : <Pill color="#8A8378">Belum halal</Pill>}
                {v.usedIn?.length > 0 && <Pill color="#212121">Dipakai {v.usedIn.length} proyek</Pill>}
              </div>
            </button>
          ))}
        </div>
      ) : <Empty>{list.length ? 'Tidak ada vendor untuk filter ini.' : 'Belum ada vendor. Tambahkan vendor bahan baku untuk dipakai di BOM prototipe.'}</Empty>}
      {editor && <button onClick={() => setEdit({ ...BLANK })} className="fixed bottom-[80px] right-4 z-30 h-14 rounded-full bg-bata px-5 text-sm font-bold text-cream shadow-lg sm:hidden">+ Vendor</button>}

      <Sheet open={!!view} onClose={() => setView(null)} title={view?.nama} footer={editor && <div className="flex gap-2">
        {head && <button className="btn-g text-bata" onClick={async () => { try { await api(`/api/vendors/${view.id}`, { method: 'DELETE' }); setView(null); load(); toast('Vendor dihapus') } catch (e) { toast(e.message, 'err') } }}>Delete</button>}
        <button className="btn-p flex-1" onClick={() => { setEdit({ ...BLANK, ...view, produkBahan: view.produkBahan || [] }); setView(null) }}>Edit vendor</button></div>}>
        {view && <div className="text-sm">
          <div className="mb-3 flex flex-wrap gap-1.5"><Pill color={VCOL[view.statusVendor]}>{VSTATUS[view.statusVendor]}</Pill><Pill>{view.kategoriBahan || '-'}</Pill></div>
          {[['Produk/bahan', (view.produkBahan || []).join(', ')], ['Kontak', view.kontakNama], ['HP', view.kontakHp], ['Email', view.email], ['Alamat', [view.alamat, view.kota].filter(Boolean).join(', ')],
            ['MOQ', view.moq], ['Lead time', view.leadTimeHari != null ? `${view.leadTimeHari} hari` : ''], ['Termin', view.termin],
            ['Halal', view.sertifikatHalal ? `${view.halalNomor || 'Ya'} · exp ${fmtTgl(view.halalExpiry)}` : 'Tidak'], ['Catatan', view.catatan]].map(([l, v]) =>
            <div key={l} className="flex justify-between gap-3 border-b border-line py-2"><span className="text-char/60">{l}</span><span className="text-right font-semibold">{v || '-'}</span></div>)}
          {view.kontakHp && <div className="mt-3 grid grid-cols-2 gap-2"><a className="btn-o" href={`tel:${view.kontakHp}`}>Telepon</a><a className="btn-o" href={wa(view.kontakHp)} target="_blank" rel="noreferrer">WhatsApp</a></div>}
          <div className="mt-4 text-[13px] font-bold">Dipakai di proyek</div>
          {view.usedIn?.length ? view.usedIn.map((p) => <button key={p.id} className="mt-1 block text-left text-bata underline" onClick={() => go(`#/proyek/${p.id}`)}>{p.kode} · {p.nama}</button>) : <div className="text-char/60">Belum dipakai</div>}
        </div>}
      </Sheet>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit vendor' : 'Vendor baru'} footer={<button className="btn-p w-full" disabled={!edit?.nama} onClick={save}>Simpan</button>}>
        {edit && <>
          <Field label="Nama vendor"><input className="inp" value={edit.nama} onChange={set('nama')} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Kategori bahan"><select className="inp" value={edit.kategoriBahan || ''} onChange={set('kategoriBahan')}>{c.kategoriBahan.map((k) => <option key={k}>{k}</option>)}</select></Field>
            <Field label="Status"><select className="inp" value={edit.statusVendor} onChange={set('statusVendor')}>{c.vendorStatuses.map((k) => <option key={k} value={k}>{VSTATUS[k]}</option>)}</select></Field>
          </div>
          <Field label="Produk/bahan (pisahkan koma)"><input className="inp" value={(edit.produkBahan || []).join(', ')} onChange={(e) => setEdit({ ...edit, produkBahan: e.target.value.split(',').map((x) => x.trimStart()) })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nama kontak"><input className="inp" value={edit.kontakNama || ''} onChange={set('kontakNama')} /></Field>
            <Field label="HP / WhatsApp"><input className="inp" inputMode="numeric" value={edit.kontakHp || ''} onChange={set('kontakHp')} placeholder="08…" /></Field>
          </div>
          <Field label="Email"><input className="inp" type="email" value={edit.email || ''} onChange={set('email')} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Alamat"><input className="inp" value={edit.alamat || ''} onChange={set('alamat')} /></Field>
            <Field label="Kota"><input className="inp" value={edit.kota || ''} onChange={set('kota')} /></Field>
            <Field label="MOQ"><input className="inp" value={edit.moq || ''} onChange={set('moq')} placeholder="mis. 10 kg" /></Field>
            <Field label="Lead time (hari)"><input className="inp" inputMode="numeric" value={edit.leadTimeHari ?? ''} onChange={set('leadTimeHari')} /></Field>
            <Field label="Termin"><select className="inp" value={edit.termin || 'cash'} onChange={set('termin')}>{['cash', '7 hari', '14 hari', '30 hari'].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Rating"><select className="inp" value={edit.rating || 3} onChange={set('rating')}>{[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>{r} ★</option>)}</select></Field>
          </div>
          <label className="mb-2 flex min-h-[40px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-bata" checked={!!edit.sertifikatHalal} onChange={set('sertifikatHalal')} />Bersertifikat halal</label>
          {edit.sertifikatHalal && <div className="grid grid-cols-2 gap-2">
            <Field label="Nomor sertifikat"><input className="inp" value={edit.halalNomor || ''} onChange={set('halalNomor')} /></Field>
            <Field label="Berlaku sampai"><input type="date" className="inp" value={edit.halalExpiry || ''} onChange={set('halalExpiry')} /></Field>
          </div>}
          <Field label="Catatan"><textarea className="inp" rows={2} value={edit.catatan || ''} onChange={set('catatan')} /></Field>
        </>}
      </Sheet>
    </div>
  )
}
