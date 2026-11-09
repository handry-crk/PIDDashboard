import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { go } from '../App.jsx'
import { Empty, Pill, Title, fmtPct, fmtRp, fmtWhen, ROMAN } from '../ui.jsx'

function Evidence({ id, stage }) {
  const [d, setD] = useState(null)
  useEffect(() => { api(`/api/projects/${id}`).then(setD).catch(() => {}) }, [id])
  if (!d) return <div className="text-xs text-char/50">Memuat ringkasan…</div>
  const ks = d.kandidat.filter((k) => !['gugur', 'drop'].includes(k.status))
  const det = d.project.stages[stage - 1].details || {}
  return (
    <div className="mt-2 space-y-1.5">
      {stage === 6 && <div className="text-xs">Responden <b>{det.respondenActual || 0}</b>/{det.respondenTarget || 30} · {det.lokasi || '-'}</div>}
      {stage === 7 && <div className="text-xs">Harga final <b>{fmtRp(det.hargaFinal)}</b> · HPP <b>{fmtRp(det.hppFinal)}</b> · Food cost <b>{fmtPct(det.foodCostPct)}</b> · Launch {det.launchDate || '-'}</div>}
      {ks.map((k) => {
        const kr = (k.testResult || {})[stage === 4 ? 'konsep' : 'prototipe'] || {}
        return (
          <div key={k.id} className="rounded-lg bg-cream/70 p-2 text-[12px]">
            <div className="font-bold">{k.nama}</div>
            <div className="text-char/75">
              Screening {k.screeningTotal != null ? String(k.screeningTotal).replace('.', ',') : '-'}
              {k.hpp ? ` · HPP ${fmtRp(k.hpp)} · FC ${fmtPct(k.foodCostPct)}` : ''}
              {stage === 4 && kr.appeal ? ` · Appeal ${kr.appeal}/5` : ''}
              {stage === 6 && kr.rasa ? ` · Rasa ${kr.rasa} · Pasti beli ${kr.intentPasti ?? '-'}%` : ''}
            </div>
            {kr.catatan || kr.feedback ? <div className="mt-0.5 italic text-char/60">“{kr.catatan || kr.feedback}”</div> : null}
          </div>
        )
      })}
    </div>
  )
}

export default function Keputusan({ state }) {
  const head = state.me.role === 'pid_head' || state.me.isAdmin
  const c = state.constants
  const waiting = state.projects.filter((p) => p.waitingDecision)
  const atGate = state.projects.filter((p) => !p.waitingDecision && !['done', 'dropped'].includes(p.status) && [4, 6, 7].includes(p.currentStage)
    && p.stages[p.currentStage - 1].state === 'in_progress' && p.stages[p.currentStage - 1].decision !== 'go')
  return (
    <div>
      <Title sub={head ? 'Go / Revisi / Drop di stage IV, VI, VII' : 'Hanya PID Head yang dapat memberi keputusan'}>Antrian Keputusan</Title>
      {waiting.length ? waiting.map((p) => (
        <div key={p.id} className="card mb-3 p-3">
          <div className="flex items-start justify-between gap-2">
            <div><div className="font-bold">{p.nama}</div><div className="text-xs text-char/60">{p.kode} · {c.categories[p.category].label}</div></div>
            <Pill color="#B8741A">{ROMAN[p.currentStage - 1]} {c.stages[p.currentStage - 1].nama}</Pill>
          </div>
          <Evidence id={p.id} stage={p.currentStage} />
          <button className="btn-p mt-3 w-full" onClick={() => go(`#/proyek/${p.id}`)}>{head ? 'Review & putuskan' : 'Lihat detail'}</button>
        </div>
      )) : <Empty>Tidak ada keputusan yang menunggu.</Empty>}
      {atGate.length > 0 && <>
        <div className="mb-2 mt-6 text-[13px] font-bold">Di stage keputusan, belum diajukan</div>
        {atGate.map((p) => (
          <button key={p.id} onClick={() => go(`#/proyek/${p.id}`)} className="card mb-2 flex w-full items-center justify-between p-3 text-left text-sm">
            <span><b>{p.nama}</b><span className="text-char/60"> · {ROMAN[p.currentStage - 1]} {c.stages[p.currentStage - 1].nama}</span></span>
            {p.stages[p.currentStage - 1].decision === 'revisi' && <Pill color="#B8741A">Revisi</Pill>}
          </button>
        ))}
      </>}
    </div>
  )
}
