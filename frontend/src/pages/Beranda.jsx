import React from 'react'
import { go } from '../App.jsx'
import { Takeaway, Tiles, LaunchCalendar, PipelineByCategory, Funnel, SlaCompliance } from '../overview.jsx'
import { Title, useToast } from '../ui.jsx'
import { api } from '../api.js'

export default function Beranda({ state, reload }) {
  const toast = useToast()
  const head = state.me.role === 'pid_head' || state.me.isAdmin
  const c = state.constants
  const editor = ['pid_head', 'pid_supervisor'].includes(state.me.role) || state.me.isAdmin
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
      <Title sub={`Halo, ${state.me.name}`}>Strategic Overview</Title>
      <Takeaway text={state.summary.takeaway} />
      <Tiles s={state.summary} onTile={onTile} />
      <div className="lg:grid lg:grid-cols-[1.4fr_1fr] lg:gap-6">
        <div>
          <LaunchCalendar slots={state.slots} categories={c.categories} order={c.categoryOrder} today={state.serverToday} onSlot={onSlot}
            onDelete={head ? (s) => confirm(`Delete slot ${s.label}?`) && api(`/api/slots/${s.id}`, { method: 'DELETE' }).then(() => { toast('Slot dihapus'); reload() }).catch((e) => toast(e.message, 'err')) : null} />
          <PipelineByCategory projects={state.projects} stages={c.stages} categories={c.categories} order={c.categoryOrder} onOpen={(p) => go(`#/proyek/${p.id}`)} />
        </div>
        <div>
          <Funnel rows={state.funnel} />
          <SlaCompliance rows={state.slaCompliance} byCat={state.slaComplianceByCat} categories={c.categories} order={c.categoryOrder} />
        </div>
      </div>
    </div>
  )
}
