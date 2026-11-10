/**
 * CRK PID Dashboard → Product Launch Board (tab Tasks)
 * Tempel di: Google Sheet Product Launch Board → Extensions → Apps Script.
 * Ganti SECRET dengan kode dari PID Dashboard (Saya → Panel Admin → Product Launch Board).
 * Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone → Deploy → copy URL.
 */
const SECRET = 'TEMPEL_KODE_RAHASIA_DI_SINI';
const HEADER = ['ID', 'Fase', 'Divisi', 'Task', 'Deliverable', 'PIC', 'Mulai', 'Selesai', 'Status', 'Progres (%)', 'Catatan / Blocker'];

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'Body bukan JSON' }); }
  if (body.secret !== SECRET) return out({ ok: false, error: 'Kode rahasia tidak cocok' });
  const sh = SpreadsheetApp.getActive().getSheetByName('Tasks');
  if (!sh) return out({ ok: false, error: 'Tab Tasks tidak ditemukan' });
  const head = sh.getRange(1, 1, 1, 11).getValues()[0].map(String);
  if (head.join('|') !== HEADER.join('|')) return out({ ok: false, error: 'Header tab Tasks tidak sesuai: ' + head.join(', ') });
  if (body.action === 'test') return out({ ok: true, sheet: SpreadsheetApp.getActive().getName() });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const last = sh.getLastRow();
    const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
    let updated = 0;
    const add = [];
    (body.rows || []).forEach(function (row) {
      const i = ids.indexOf(String(row[0]));
      if (i >= 0) { sh.getRange(i + 2, 1, 1, 11).setValues([row]); updated++; }
      else add.push(row);
    });
    if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, 11).setValues(add);
    return out({ ok: true, updated: updated, appended: add.length });
  } finally {
    lock.releaseLock();
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
