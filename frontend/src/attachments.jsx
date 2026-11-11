import React, { useState } from 'react'
import { api } from './api.js'
import { useToast, fmtWhen } from './ui.jsx'

const isImg = (f) => (f.contentType || '').startsWith('image/')

/** Upload + list + delete files. `params` are sent with the upload (projectId, kandidatId, vendorId, stage, kind). */
export function Attachments({ files, params, can, onChange, label = 'Upload file', accept, imagesOnly }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const upload = async (e) => {
    const list = Array.from(e.target.files || [])
    if (!list.length) return
    setBusy(true)
    try {
      for (const file of list) {
        const fd = new FormData()
        fd.append('file', file)
        Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && fd.append(k, String(v)))
        await api('/api/files', { method: 'POST', form: fd })
      }
      toast(list.length > 1 ? `${list.length} file diupload` : 'File diupload')
      onChange && onChange()
    } catch (er) { toast(er.message, 'err') } finally { setBusy(false); e.target.value = '' }
  }
  const del = async (f) => {
    if (!confirm(`Delete ${f.name}?`)) return
    try { await api(`/api/files/${f.id}`, { method: 'DELETE' }); onChange && onChange() } catch (er) { toast(er.message, 'err') }
  }
  const imgs = files.filter(isImg), docs = files.filter((f) => !isImg(f))
  return (
    <div>
      {(imgs.length > 0 || (can && imagesOnly)) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {imgs.map((f) => (
            <div key={f.id} className="relative">
              <a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.name} className="h-20 w-20 rounded-lg border border-line object-cover" /></a>
              {can && <button onClick={() => del(f)} className="absolute -right-1.5 -top-1.5 h-6 w-6 rounded-full bg-char text-xs font-bold text-white" aria-label="Delete">×</button>}
            </div>
          ))}
          {can && imagesOnly && (
            <label className={`flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-bata text-center text-[11px] font-semibold text-bata ${busy ? 'opacity-50' : ''}`}>
              {busy ? 'Upload…' : <><span>{label}</span></>}
              <input type="file" accept="image/*" multiple className="hidden" onChange={upload} disabled={busy} />
            </label>
          )}
        </div>
      )}
      {docs.map((f) => (
        <div key={f.id} className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-line bg-white/50 px-2.5 py-2 text-sm">
          <a href={f.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
            <div className="truncate font-semibold text-bata underline">{f.name}</div>
            <div className="text-[10.5px] text-char/55">{f.byName || ''}{f.at ? ` · ${fmtWhen(f.at)}` : ''}</div>
          </a>
          {can && <button onClick={() => del(f)} className="h-8 w-8 shrink-0 text-lg text-bata" aria-label="Delete">×</button>}
        </div>
      ))}
      {!files.length && !can && <div className="text-xs text-char/55">Belum ada lampiran.</div>}
      {can && !imagesOnly && (
        <label className={`btn-o w-full cursor-pointer ${busy ? 'opacity-50' : ''}`}>
          {busy ? 'Mengupload…' : `+ ${label}`}
          <input type="file" accept={accept} multiple className="hidden" onChange={upload} disabled={busy} />
        </label>
      )}
    </div>
  )
}
