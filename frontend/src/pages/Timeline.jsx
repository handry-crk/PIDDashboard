import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { go } from '../App.jsx'
import { TimelineMonth, monthOf } from '../timeline.jsx'
import { Field, Sheet, Title, useToast, fmtTgl, ROMAN, STAGE_NAMES, STAGE } from '../ui.jsx'

export default function Timeline({ state, reload, present }) {
  const toast = useToast()
  const editor = ['pid_head', 'pid_supervisor'].includes(state.me.role) || state.me.isAdmin
  const [month, setMonth] = useState(() => { try { return sessionStorage.getItem('pid_tl_month') || monthOf(state.serverToday) } catch { return monthOf(state.serverToday) } })
  useEffect(() => { try { sessionStorage.setItem('pid_tl_month', month) } catch {} }, [month])
  const [edit, setEdit] = useState(null)
  const open = (p, n) => {
    if (!editor) return go(`#/proyek/${p.id}`)
    const s = p.stages[n - 1]
    setEdit({ p, n, ps: s.plannedStart || '', pe: s.plannedEnd || '', notes: s.notes || '' })
  }
  const save = async () => {
    try {
      await api(`/api/projects/${edit.p.id}/stages/${edit.n}`, { method: 'PUT', body: { plannedStart: edit.ps || null, plannedEnd: edit.pe || null, notes: edit.notes } })
      toast('Jadwal stage tersimpan'); setEdit(null); reload()
    } catch (e) { toast(e.message, 'err') }
  }
  return (
    <div className={present ? 'mx-auto max-w-[1400px] px-2 pt-3' : ''}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Title sub={present ? 'Product Innovation Development · CRK Group' : 'Rencana vs kenyataan semua proyek'}>Jadwal Bulanan</Title>
        <div className="mb-3 flex gap-2 print:hidden">
          {present
            ? <button className="btn-o text-xs" onClick={() => go('#/timeline')}>Keluar presentasi</button>
            : <button className="btn-p text-xs" onClick={() => go('#/timeline?present=1')}>Mode presentasi</button>}
          <button className="btn-o text-xs" onClick={() => window.print()}>Print / PDF</button>
        </div>
      </div>
      <TimelineMonth projects={state.projects} categories={state.constants.categories} today={state.serverToday} month={month} setMonth={setMonth}
        onEdit={present ? null : open} present={present} />
      {!present && editor && <p className="mt-3 text-[11px] text-char/60 print:hidden">Ketuk nama langkah atau bar untuk mengisi / mengubah jadwal.</p>}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit ? `${edit.p.nama} · ${STAGE[edit.n - 1].santai}` : ''}
        footer={<div className="grid grid-cols-2 gap-2"><button className="btn-o" onClick={() => go(`#/proyek/${edit.p.id}`)}>Buka proyek</button><button className="btn-p" onClick={save}>Simpan</button></div>}>
        {edit && <>
          <div className="mb-3 text-xs text-char/65">Aktual: {edit.p.stages[edit.n - 1].actualStart ? `${fmtTgl(edit.p.stages[edit.n - 1].actualStart)} – ${edit.p.stages[edit.n - 1].actualEnd ? fmtTgl(edit.p.stages[edit.n - 1].actualEnd) : 'sekarang'}` : 'belum mulai'}</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Rencana mulai"><input type="date" className="inp" value={edit.ps} onChange={(e) => setEdit({ ...edit, ps: e.target.value })} /></Field>
            <Field label="Rencana selesai"><input type="date" className="inp" value={edit.pe} onChange={(e) => setEdit({ ...edit, pe: e.target.value })} /></Field>
          </div>
          <Field label="Keterangan (tampil di timeline)"><input className="inp" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="mis. Pengujian oleh Direksi" /></Field>
        </>}
      </Sheet>
    </div>
  )
}
