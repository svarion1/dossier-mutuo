(function () {
  'use strict';
  const KEY = 'dossier-mutuo-buretta-v1';
  const QUESTIONS = window.SEED.QUESTIONS;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------- Stato e salvataggio ----------
  // Con il server attivo i dati vivono in data/state.json; senza server restano in memoria.
  let state = migrate(clone(window.SEED.state));
  let mode = 'memory', rev = 0, dirty = false, saving = false, pending = false, conflict = false, saveTimer, retryTimer;
  let maxUploadMb = 200;

  function migrate(s) {
    (s.docs || []).forEach((d) => { if (!Array.isArray(d.files)) d.files = []; });
    (s.banks || []).forEach((b) => { if (!Array.isArray(b.files)) b.files = []; });
    return s;
  }
  function setStatus(msg, cls) {
    const el = document.getElementById('saveState');
    el.textContent = msg; el.className = 'save-state' + (cls ? ' ' + cls : '');
    document.getElementById('exportBtn').classList.toggle('btn-attn', mode === 'memory' && dirty);
  }
  function hhmm() { return new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); }
  function showBanner(html, kind) {
    const b = document.getElementById('modeBanner');
    if (!html) { b.hidden = true; return; }
    b.hidden = false; b.className = 'banner' + (kind ? ' banner-' + kind : ''); b.innerHTML = html;
  }
  function save() {
    dirty = true;
    if (mode === 'memory') { setStatus('Modifiche non ancora esportate', 'is-dirty'); return; }
    if (conflict) return;
    setStatus('Salvataggio…');
    clearTimeout(saveTimer); saveTimer = setTimeout(() => pushState(false), 600);
  }
  async function pushState(force) {
    if (saving) { pending = true; return; }
    saving = true; clearTimeout(retryTimer);
    try {
      const r = await fetch('api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rev, force: !!force, state }) });
      if (r.status === 409) {
        conflict = true; setStatus('Conflitto con un altro dispositivo', 'is-dirty');
        showBanner('I dati sono stati modificati da un altro dispositivo. <button class="btn btn-sm" data-act="reloadServer">Carica la versione del server</button> <button class="btn btn-ghost btn-sm" data-act="forceSave">Tieni questa versione</button>', 'warn');
      } else if (r.ok) {
        const j = await r.json(); rev = j.rev; dirty = false; conflict = false;
        setStatus('Salvato sul server · ' + hhmm());
      } else throw new Error(r.status);
    } catch (e) {
      setStatus('Server non raggiungibile, riprovo…', 'is-dirty');
      retryTimer = setTimeout(() => pushState(force), 5000);
    } finally {
      saving = false;
      if (pending) { pending = false; pushState(force); }
    }
  }
  async function loadFromServer() {
    const r = await fetch('api/state', { cache: 'no-store' });
    if (r.ok) { const s = await r.json(); rev = s.rev || 0; state = migrate(s); dirty = false; conflict = false; setStatus('Dati caricati dal server · ' + hhmm()); return true; }
    return false;
  }
  async function init() {
    try {
      const h = await fetch('api/health', { cache: 'no-store' });
      if (h.ok) { const j = await h.json(); if (j.mode === 'server') { mode = 'server'; maxUploadMb = j.maxUploadMb || maxUploadMb; } }
    } catch (e) { /* nessun server: modalità in memoria */ }
    if (mode === 'server') {
      showBanner('');
      if (!(await loadFromServer())) { await pushState(true); setStatus('Archivio creato sul server · ' + hhmm()); }
    } else {
      showBanner('Server non attivo: i dati restano solo in questa pagina e il caricamento dei documenti è disattivato. Usa “Esporta dati” per salvarli in un file.', 'warn');
      setStatus('Modalità senza server');
    }
    render();
  }
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- Documenti caricati ----------
  const fileUrl = (p, dl) => 'files/' + p.split('/').map(encodeURIComponent).join('/') + (dl ? '?download' : '');
  const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  function targetOf(kind, id) { return kind === 'doc' ? state.docs.find((d) => d.id === id) : state.banks.find((b) => b.id === id); }
  async function uploadFiles(files, kind, id) {
    if (mode !== 'server') return toast('Il caricamento funziona solo con il server attivo');
    const item = targetOf(kind, id); if (!item || !files.length) return;
    const folder = kind === 'doc' ? 'documenti/' + item.set : 'banche/' + item.name;
    let ok = 0;
    for (const f of files) {
      if (f.size > maxUploadMb * 1048576) { toast(`${f.name}: supera ${maxUploadMb} MB`); continue; }
      toast(`Caricamento ${f.name}…`);
      try {
        const r = await fetch(`api/files?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
        if (!r.ok) throw new Error(r.status);
        const meta = await r.json();
        item.files.push({ id: uid('f'), name: meta.name, path: meta.path, size: meta.size, uploadedAt: meta.uploadedAt });
        ok++;
      } catch (e) { toast(`Errore nel caricare ${f.name}`); }
    }
    if (ok && kind === 'doc' && ['mancante', 'richiesto'].includes(item.status)) item.status = 'pronto';
    if (ok) { save(); toast(ok === 1 ? 'File caricato' : `${ok} file caricati`); }
    if (kind === 'bank') renderDlg(); else render();
  }
  async function removeFile(kind, id, fid) {
    const item = targetOf(kind, id); if (!item) return;
    const f = item.files.find((x) => x.id === fid); if (!f) return;
    try { if (mode === 'server') await fetch('api/files?path=' + encodeURIComponent(f.path), { method: 'DELETE' }); } catch (e) { }
    item.files = item.files.filter((x) => x.id !== fid); save(); toast('File spostato nel cestino');
    if (kind === 'bank') renderDlg(); else render();
  }
  function filesBlock(kind, item) {
    const list = item.files.map((f) => `<span class="file-chip"><a href="${fileUrl(f.path)}" target="_blank" rel="noopener" title="${esc(f.path)}">${esc(f.name)}</a><span class="muted">${fmtSize(f.size || 0)}</span><button type="button" class="file-x" data-act="rmFile" data-kind="${kind}" data-id="${item.id}" data-fid="${f.id}" aria-label="Rimuovi ${esc(f.name)}">×</button></span>`).join('');
    const disabled = mode !== 'server';
    return `<div class="doc-files">${list}<label class="btn btn-ghost btn-sm upload-btn${disabled ? ' is-disabled' : ''}" title="${disabled ? 'Serve il server attivo' : 'Oppure trascina qui i file'}">Carica file<input type="file" multiple hidden data-upload="${kind}" data-id="${item.id}" ${disabled ? 'disabled' : ''}></label></div>`;
  }

  // ---------- Helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (n) => (isFinite(n) ? new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' €' : '—');
  const pct = (n) => (isFinite(n) ? n.toLocaleString('it-IT', { maximumFractionDigits: 1 }) + '%' : '—');
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
  const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9);
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
  const daysSince = (d) => Math.floor((Date.now() - new Date(d + 'T00:00:00').getTime()) / 86400000);

  function rata(P, tanPct, years) {
    const n = years * 12, i = tanPct / 100 / 12;
    if (!P || !n) return 0;
    if (!i) return P / n;
    return P * i / (1 - Math.pow(1 + i, -n));
  }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800);
  }

  const BANK_STATUS = [
    ['da_contattare', 'Da contattare'], ['inviata', 'Richiesta inviata'], ['risposta', 'Risposta ricevuta'],
    ['appuntamento', 'Appuntamento'], ['offerta', 'Offerta ricevuta'], ['scelta', 'Scelta'], ['scartata', 'Scartata']
  ];
  const DOC_STATUS = [['mancante', 'Mancante'], ['richiesto', 'Richiesto'], ['in_corso', 'In preparazione'], ['pronto', 'Pronto'], ['non_serve', 'Non serve']];
  const COVER = [['da_definire', 'Da definire'], ['mezzi_propri', 'Mezzi propri'], ['famiglia', 'Aiuto famiglia'], ['sal', 'Tranche SAL banca']];
  const LOG_TYPES = ['Email', 'Telefonata', 'Incontro', 'Risposta', 'Documenti inviati', 'Altro'];
  const label = (arr, k) => (arr.find((a) => a[0] === k) || [k, k])[1];
  const opts = (arr, sel) => arr.map(([k, l]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');

  // ---------- Computations ----------
  function calc() {
    const p = state.profile;
    const spent = state.spent.reduce((s, x) => s + num(x.amount), 0);
    const rMin = state.todo.reduce((s, x) => s + num(x.min), 0);
    const rMax = state.todo.reduce((s, x) => s + Math.max(num(x.max), num(x.min)), 0);
    const rMid = (rMin + rMax) / 2;
    const ltv = num(p.ltv) / 100;
    const scen = [['Basso', rMin], ['Medio', rMid], ['Alto', rMax]].map(([name, res]) => {
      const mA = res * ltv;
      const mB = Math.min(res, (spent + res) * ltv);
      return { name, res, mA, rA: rata(mA, num(p.tan), num(p.durata)), ownA: res - mA, mB, rB: rata(mB, num(p.tan), num(p.durata)), ownB: res - mB };
    });
    const limit = num(p.reddito) * num(p.soglia) / 100;
    return { spent, rMin, rMax, rMid, scen, limit };
  }
  function bankAnswered(b) { return QUESTIONS.filter((q) => (b.answers[q.k] || '').trim()).length; }
  function lastContact(b) { return b.log.map((l) => l.date).filter(Boolean).sort().pop() || ''; }

  // ---------- Views ----------
  let tab = 'overview';
  const views = {};

  views.overview = function () {
    const c = calc();
    const docs = state.docs.filter((d) => d.status !== 'non_serve');
    const ready = docs.filter((d) => d.status === 'pronto').length;
    const contacted = state.banks.filter((b) => b.status !== 'da_contattare').length;
    const offers = state.banks.filter((b) => ['offerta', 'scelta'].includes(b.status)).length;
    const done = state.tasks.filter((t) => t.done).length;
    const mid = c.scen[1];
    const counts = BANK_STATUS.map(([k, l]) => [l, state.banks.filter((b) => b.status === k).length]);

    const next = state.tasks.filter((t) => !t.done)
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 7);
    const follow = state.banks.filter((b) => b.status === 'inviata' && lastContact(b) && daysSince(lastContact(b)) >= 7);
    const uncovered = state.payments.filter((p) => p.cover === 'da_definire');
    const missingKey = state.docs.filter((d) => ['Preventivi e fornitori', 'Pagamenti e anticipi'].includes(d.set) && d.status !== 'pronto' && d.status !== 'non_serve').length;

    return `
    <div class="page-head"><div><h1>Panoramica dell’operazione</h1>
      <p class="lead">Demolizione e ricostruzione in legno a Rocca Canavese, località Buretta. Qui vedi a che punto sono documenti, banche e passi.</p></div></div>
    <div class="grid kpis">
      <div class="kpi"><div class="kpi-label">Documenti pronti</div><div class="kpi-value">${ready}/${docs.length}</div><div class="bar"><span style="width:${docs.length ? ready / docs.length * 100 : 0}%"></span></div></div>
      <div class="kpi"><div class="kpi-label">File caricati</div><div class="kpi-value">${state.docs.reduce((n, d) => n + d.files.length, 0) + state.banks.reduce((n, b) => n + b.files.length, 0)}</div><div class="kpi-sub">${mode === 'server' ? 'nella cartella del server' : 'server non attivo'}</div></div>
      <div class="kpi"><div class="kpi-label">Banche contattate</div><div class="kpi-value">${contacted}/${state.banks.length}</div><div class="kpi-sub">${offers} con offerta</div></div>
      <div class="kpi"><div class="kpi-label">Costo residuo</div><div class="kpi-value">${eur(c.rMin)}</div><div class="kpi-sub">fino a ${eur(c.rMax)}</div></div>
      <div class="kpi"><div class="kpi-label">Rata stimata (medio)</div><div class="kpi-value ${mid.rA > c.limit ? 'bad' : ''}">${eur(mid.rA)}</div><div class="kpi-sub">${pct(mid.rA / num(state.profile.reddito) * 100)} dello stipendio · ${state.profile.durata} anni al ${state.profile.tan}%</div></div>
      <div class="kpi"><div class="kpi-label">Passi completati</div><div class="kpi-value">${done}/${state.tasks.length}</div><div class="bar"><span style="width:${done / state.tasks.length * 100}%"></span></div></div>
    </div>
    <div class="card"><h2>Stato delle richieste</h2>
      <div class="pipeline">${counts.map(([l, n]) => `<div class="pipe"><b>${n}</b><span>${esc(l)}</span></div>`).join('')}</div>
    </div>
    <div class="grid two" style="margin-top:var(--space-5)">
      <div class="card"><h2>Prossimi passi</h2>
        ${next.length ? `<ul class="next-list">${next.map((t) => `<li><span class="tag">${esc(t.group)}</span><span>${esc(t.label)}${t.due ? ` <span class="muted small">· entro ${fmtDate(t.due)}</span>` : ''}</span></li>`).join('')}</ul>` : '<p class="muted">Tutti i passi sono completati.</p>'}
        <div class="btn-row" style="margin-top:var(--space-4)"><button class="btn btn-ghost btn-sm" data-go="tasks">Tutti i passi</button></div>
      </div>
      <div class="card"><h2>Da tenere d’occhio</h2>
        <ul class="next-list">
          ${follow.map((b) => `<li><span class="tag tag-wood">Sollecito</span><span>${esc(b.name)}: nessuna risposta da ${daysSince(lastContact(b))} giorni</span></li>`).join('')}
          ${uncovered.length ? `<li><span class="tag tag-wood">Pagamenti</span><span>${uncovered.length} scadenze del cantiere senza copertura definita</span></li>` : ''}
          ${missingKey ? `<li><span class="tag tag-wood">Documenti</span><span>${missingKey} tra preventivi e calendari pagamenti non ancora pronti: servono prima degli incontri</span></li>` : ''}
          ${mid.rA > c.limit ? `<li><span class="tag tag-wood">Rata</span><span>Lo scenario medio supera il ${state.profile.soglia}% dello stipendio</span></li>` : ''}
          ${!follow.length && !uncovered.length && !missingKey && mid.rA <= c.limit ? '<li class="muted">Nessun punto aperto.</li>' : ''}
        </ul>
        <p class="note">Il criterio chiave per scegliere la banca: chi riconosce l’investimento già fatto e quanto eroga prima dei primi anticipi.</p>
      </div>
    </div>`;
  };

  views.banks = function () {
    const f = views.banks.filter || { q: '', st: '' };
    const list = state.banks.filter((b) => (!f.st || b.status === f.st) && (!f.q || (b.name + b.address).toLowerCase().includes(f.q.toLowerCase())));
    return `
    <div class="page-head"><div><h1>Banche</h1><p class="lead">Contatti, stato della richiesta, risposte alle 12 domande e offerta di ogni banca. Apri una scheda per aggiornarla.</p></div>
      <button class="btn" data-act="addBank">Aggiungi banca</button></div>
    <div class="toolbar">
      <input type="text" id="bankQ" placeholder="Cerca banca o città" value="${esc(f.q)}" aria-label="Cerca banca">
      <select id="bankSt" aria-label="Filtra per stato"><option value="">Tutti gli stati</option>${opts(BANK_STATUS, f.st)}</select>
    </div>
    ${list.length ? `<div class="bank-list">${list.map(bankCard).join('')}</div>` : '<div class="empty">Nessuna banca con questi filtri.</div>'}`;
  };
  function bankCard(b) {
    const lc = lastContact(b);
    return `<article class="bank">
      <div class="bank-top"><div><div class="bank-name">${esc(b.name)}</div><span class="tag">${esc(b.group)}</span></div>
        <span class="chip s-${b.status}">${label(BANK_STATUS, b.status)}</span></div>
      <div class="bank-meta">
        ${b.address ? `<span>${esc(b.address)}</span>` : ''}
        ${b.phone ? `<span>Tel. <a href="tel:${esc(b.phone.replace(/\s/g, ''))}">${esc(b.phone)}</a></span>` : ''}
        ${b.email ? `<span><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></span>` : ''}
        ${b.referente ? `<span>Referente: ${esc(b.referente)}</span>` : ''}
      </div>
      ${b.why ? `<p class="bank-why">${esc(b.why)}</p>` : ''}
      <div class="bank-foot"><span class="progress-mini">${bankAnswered(b)}/${QUESTIONS.length} risposte${lc ? ' · ultimo contatto ' + fmtDate(lc) : ''}</span>
        <button class="btn btn-ghost btn-sm" data-act="openBank" data-id="${b.id}">Apri scheda</button></div>
    </article>`;
  }

  views.compare = function () {
    const c = calc();
    const banks = state.banks.filter((b) => b.status !== 'scartata' && (b.status !== 'da_contattare' || Object.values(b.offer).some((v) => String(v).trim())));
    if (!banks.length) return `<div class="page-head"><div><h1>Confronto offerte</h1><p class="lead">Quando una banca risponde o invia un’offerta, compila la scheda e la trovi confrontata qui.</p></div></div><div class="empty">Nessuna banca contattata ancora. Inizia dalla sezione Email o aggiorna lo stato in Banche.</div>`;
    const taegs = banks.map((b) => num(b.offer.taeg)).filter((x) => x > 0);
    const best = taegs.length ? Math.min(...taegs) : null;
    const rows = [
      ['Stato', (b) => `<span class="chip s-${b.status}">${label(BANK_STATUS, b.status)}</span>`],
      ['Importo offerto', (b) => b.offer.importo ? eur(num(b.offer.importo)) : '—'],
      ['Tipo tasso', (b) => esc(b.offer.tipo || '—')],
      ['TAN', (b) => b.offer.tan ? pct(num(b.offer.tan)) : '—'],
      ['TAEG', (b) => b.offer.taeg ? `<b class="${best !== null && num(b.offer.taeg) === best ? 'ok' : ''}">${pct(num(b.offer.taeg))}</b>` : '—'],
      ['Durata', (b) => b.offer.durata ? esc(b.offer.durata) + ' anni' : '—'],
      ['Rata calcolata', (b) => { const P = num(b.offer.importo), t = num(b.offer.tan), d = num(b.offer.durata); if (!P || !d) return '—'; const r = rata(P, t, d); return `<span class="${r > c.limit ? 'bad' : ''}">${eur(r)}</span>`; }],
      ['Quota finanziata', (b) => esc(b.offer.ltv || '—')],
      ['Istruttoria', (b) => b.offer.istruttoria ? eur(num(b.offer.istruttoria)) : '—'],
      ['Perizie SAL', (b) => esc(b.offer.perizia || '—')],
      ['Prima erogazione', (b) => esc(b.offer.primaErogazione || b.answers.prima || '—')],
      ['Riconosce il pregresso', (b) => esc(b.offer.pregresso || b.answers.pregresso || '—')],
      ['Preammortamento', (b) => esc(b.offer.preammortamento || b.answers.cantiere || '—')],
      ['Casa in legno', (b) => esc(b.answers.legno || '—')],
      ['Proprietà e usufrutto', (b) => esc(b.answers.proprieta || '—')],
      ['Note', (b) => esc(b.offer.note || '—')]
    ];
    return `<div class="page-head"><div><h1>Confronto offerte</h1><p class="lead">Le banche contattate fianco a fianco. Il TAEG più basso è evidenziato. La rata è calcolata su importo, TAN e durata dell’offerta; in rosso se supera il ${state.profile.soglia}% dello stipendio.</p></div></div>
    <div class="table-wrap"><table class="compare"><thead><tr><th>Voce</th>${banks.map((b) => `<th><button class="btn btn-ghost btn-sm" data-act="openBank" data-id="${b.id}">${esc(b.name)}</button></th>`).join('')}</tr></thead>
    <tbody>${rows.map(([l, fn]) => `<tr><td>${l}</td>${banks.map((b) => `<td>${fn(b)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="note">Confronta offerte omogenee: stesso importo, stessa durata, stesso calendario SAL. Il TAEG include i costi obbligatori; aggiungi a parte perizie intermedie e polizza specifica per la casa in legno.</p>`;
  };

  views.docs = function () {
    const sets = [...new Set(state.docs.map((d) => d.set))];
    const f = views.docs.filter || '';
    const all = state.docs.filter((d) => d.status !== 'non_serve');
    const ready = all.filter((d) => d.status === 'pronto').length;
    return `<div class="page-head"><div><h1>Portafoglio documenti</h1>
      <p class="lead">Carica i file con il pulsante o trascinandoli sulla riga: finiscono nella cartella <code>data/documenti/&lt;gruppo&gt;/</code> del server. Prima del primo giro servono soprattutto preventivi, calendario pagamenti e scheda sintetica.</p></div>
      <div class="btn-row"><button class="btn btn-ghost" data-act="printDocs">Stampa elenco</button><button class="btn" data-act="addDoc">Aggiungi documento</button></div></div>
    <div class="card" style="margin-bottom:var(--space-5)"><div style="display:flex;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap;align-items:center">
      <div><b class="num">${ready} di ${all.length}</b> <span class="muted">documenti pronti</span></div>
      <select id="docFilter" style="width:auto" aria-label="Filtra per stato"><option value="">Tutti gli stati</option>${opts(DOC_STATUS, f)}</select></div>
      <div class="bar"><span style="width:${all.length ? ready / all.length * 100 : 0}%"></span></div></div>
    ${sets.map((s) => {
      const items = state.docs.filter((d) => d.set === s && (!f || d.status === f));
      if (!items.length) return '';
      const g = state.docs.filter((d) => d.set === s && d.status !== 'non_serve');
      return `<div class="doc-group"><div class="doc-group-head"><h2>${esc(s)}</h2><span class="muted small num">${g.filter((d) => d.status === 'pronto').length}/${g.length} pronti</span></div>
      ${items.map((d) => `<div class="doc-row is-${d.status}" data-row="${d.id}" data-drop="doc" data-id="${d.id}">
        <div><div class="doc-name">${esc(d.name)}</div>${d.hint ? `<div class="doc-hint">${esc(d.hint)}</div>` : ''}</div>
        <select data-coll="docs" data-id="${d.id}" data-f="status" aria-label="Stato">${opts(DOC_STATUS, d.status)}</select>
        <input type="text" data-coll="docs" data-id="${d.id}" data-f="location" value="${esc(d.location)}" placeholder="Dove si trova / link / nota" aria-label="Posizione o nota">
        <button class="btn btn-danger btn-sm" data-act="del" data-coll="docs" data-id="${d.id}" aria-label="Elimina documento">Elimina</button>
        ${filesBlock('doc', d)}
      </div>`).join('')}</div>`;
    }).join('')}`;
  };

  views.costs = function () {
    const p = state.profile;
    return `<div class="page-head"><div><h1>Costi e pagamenti</h1>
      <p class="lead">Spese già sostenute, costi ancora da affrontare e il calendario dei pagamenti del cantiere. I calcoli sono indicativi: la banca decide su perizia e merito creditizio.</p></div></div>

    <div class="card"><h2>Parametri</h2>
      <div class="form-grid">
        ${pfield('reddito', 'Stipendio netto mensile (€)')}${pfield('aiutoFamiglia', 'Aiuto famiglia mensile (€)')}${pfield('mezziPropri', 'Liquidità disponibile (€)')}
        ${pfield('tan', 'TAN ipotizzato (%)', '0.05')}${pfield('durata', 'Durata (anni)')}${pfield('ltv', 'Quota finanziata (%)')}${pfield('soglia', 'Soglia rata/reddito (%)')}
      </div></div>

    <div class="card"><h2>Spese già sostenute</h2><p class="muted small" style="margin-top:-8px">Da far valutare come apporto proprio. Spunta “prova” se hai fattura e bonifico.</p>
      <div class="table-wrap"><table><thead><tr><th>Voce</th><th class="right">Importo (€)</th><th>Prova</th><th>Nota</th><th></th></tr></thead><tbody>
      ${state.spent.map((s) => `<tr><td><input type="text" data-coll="spent" data-id="${s.id}" data-f="label" value="${esc(s.label)}" aria-label="Voce"></td>
        <td class="right"><input type="number" min="0" step="100" data-coll="spent" data-id="${s.id}" data-f="amount" data-type="num" value="${s.amount || ''}" style="max-width:130px;text-align:right" aria-label="Importo"></td>
        <td><input type="checkbox" data-coll="spent" data-id="${s.id}" data-f="proof" ${s.proof ? 'checked' : ''} aria-label="Prova disponibile"></td>
        <td><input type="text" data-coll="spent" data-id="${s.id}" data-f="note" value="${esc(s.note)}" aria-label="Nota"></td>
        <td><button class="btn btn-danger btn-sm" data-act="del" data-coll="spent" data-id="${s.id}">Elimina</button></td></tr>`).join('')}
      </tbody><tfoot><tr><td>Totale</td><td class="right num" data-out="spent">—</td><td colspan="3"></td></tr></tfoot></table></div>
      <div class="btn-row" style="margin-top:var(--space-3)"><button class="btn btn-ghost btn-sm" data-act="addSpent">Aggiungi spesa</button></div></div>

    <div class="card"><h2>Costi ancora da sostenere</h2>
      <div class="table-wrap"><table><thead><tr><th>Voce</th><th class="right">Minimo (€)</th><th class="right">Massimo (€)</th><th>Tipo</th><th>Nota</th><th></th></tr></thead><tbody>
      ${state.todo.map((s) => `<tr><td><input type="text" data-coll="todo" data-id="${s.id}" data-f="label" value="${esc(s.label)}" aria-label="Voce"></td>
        <td class="right"><input type="number" min="0" step="500" data-coll="todo" data-id="${s.id}" data-f="min" data-type="num" value="${s.min || ''}" style="max-width:120px;text-align:right" aria-label="Minimo"></td>
        <td class="right"><input type="number" min="0" step="500" data-coll="todo" data-id="${s.id}" data-f="max" data-type="num" value="${s.max || ''}" style="max-width:120px;text-align:right" aria-label="Massimo"></td>
        <td><select data-coll="todo" data-id="${s.id}" data-f="kind" aria-label="Tipo">${opts([['stima', 'Stima'], ['preventivo', 'Preventivo'], ['contratto', 'Contratto']], s.kind)}</select></td>
        <td><input type="text" data-coll="todo" data-id="${s.id}" data-f="note" value="${esc(s.note)}" aria-label="Nota"></td>
        <td><button class="btn btn-danger btn-sm" data-act="del" data-coll="todo" data-id="${s.id}">Elimina</button></td></tr>`).join('')}
      </tbody><tfoot><tr><td>Totale</td><td class="right num" data-out="rMin">—</td><td class="right num" data-out="rMax">—</td><td colspan="3"></td></tr></tfoot></table></div>
      <div class="btn-row" style="margin-top:var(--space-3)"><button class="btn btn-ghost btn-sm" data-act="addTodo">Aggiungi voce</button></div></div>

    <div class="card"><h2>Mutuo e rata per scenario</h2>
      <p class="muted small" style="margin-top:-8px">A: la banca applica la quota solo ai lavori residui. B: la banca la applica all’investimento complessivo, riconoscendo le spese già sostenute (come fa ad esempio Banca Etica con il terreno).</p>
      <div class="table-wrap"><table><thead><tr><th>Scenario</th><th class="right">Costo residuo</th><th class="right">Mutuo A</th><th class="right">Rata A</th><th class="right">Da mettere A</th><th class="right">Mutuo B</th><th class="right">Rata B</th><th class="right">Da mettere B</th></tr></thead>
      <tbody data-out="scen"></tbody></table></div>
      <p class="note" data-out="limitNote"></p></div>

    <div class="card"><h2>Calcolatore rata</h2>
      <div class="form-grid"><div class="field"><label for="calcP">Importo del mutuo (€)</label><input type="number" id="calcP" min="0" step="1000" value="${Math.round(calc().scen[1].mA)}"></div>
      <div class="field"><label for="calcT">TAN (%)</label><input type="number" id="calcT" min="0" step="0.05" value="${p.tan}"></div></div>
      <div class="table-wrap" style="margin-top:var(--space-4)"><table><thead><tr><th>Durata</th><th class="right">Rata</th><th class="right">% stipendio</th><th class="right">Interessi totali</th><th class="right">Mesi risparmiati con aiuto famiglia</th></tr></thead><tbody data-out="calcRows"></tbody></table></div>
      <p class="note">L’ultima colonna stima di quanto si accorcia il mutuo versando ogni mese anche l’aiuto della famiglia come rimborso anticipato, senza penali (mutuo prima casa).</p></div>

    <div class="card"><h2>Calendario pagamenti del cantiere</h2>
      <p class="muted small" style="margin-top:-8px">Per ogni scadenza indica chi la copre. Le tranche SAL arrivano dopo il lavoro verificato: gli anticipi vanno di solito coperti con mezzi propri.</p>
      <div class="table-wrap"><table><thead><tr><th>Pagamento</th><th class="right">Importo (€)</th><th>Data prevista</th><th>Copertura</th><th></th></tr></thead><tbody>
      ${state.payments.map((s) => `<tr><td><input type="text" data-coll="payments" data-id="${s.id}" data-f="label" value="${esc(s.label)}" aria-label="Pagamento"></td>
        <td class="right"><input type="number" min="0" step="500" data-coll="payments" data-id="${s.id}" data-f="amount" data-type="num" value="${s.amount || ''}" style="max-width:120px;text-align:right" aria-label="Importo"></td>
        <td><input type="date" data-coll="payments" data-id="${s.id}" data-f="date" value="${esc(s.date)}" aria-label="Data"></td>
        <td><select data-coll="payments" data-id="${s.id}" data-f="cover" aria-label="Copertura">${opts(COVER, s.cover)}</select></td>
        <td><button class="btn btn-danger btn-sm" data-act="del" data-coll="payments" data-id="${s.id}">Elimina</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="btn-row" style="margin-top:var(--space-3)"><button class="btn btn-ghost btn-sm" data-act="addPayment">Aggiungi pagamento</button></div>
      <div class="calc-result" data-out="payKpis"></div></div>`;
  };
  function pfield(k, l, step) {
    return `<div class="field"><label for="p_${k}">${l}</label><input type="number" id="p_${k}" data-obj="profile" data-f="${k}" data-type="num" step="${step || 'any'}" value="${state.profile[k]}"></div>`;
  }
  function refreshCosts() {
    const c = calc(), p = state.profile, red = num(p.reddito);
    const set = (k, v) => { const el = $(`[data-out="${k}"]`); if (el) el.innerHTML = v; };
    set('spent', eur(c.spent)); set('rMin', eur(c.rMin)); set('rMax', eur(c.rMax));
    const cls = (r) => (r > c.limit ? 'bad' : r > c.limit * 0.85 ? 'warn' : 'ok');
    set('scen', c.scen.map((s) => `<tr><td>${s.name}</td><td class="right num">${eur(s.res)}</td><td class="right num">${eur(s.mA)}</td><td class="right num ${cls(s.rA)}">${eur(s.rA)}</td><td class="right num">${eur(s.ownA)}</td><td class="right num">${eur(s.mB)}</td><td class="right num ${cls(s.rB)}">${eur(s.rB)}</td><td class="right num">${eur(s.ownB)}</td></tr>`).join(''));
    set('limitNote', `Rata massima al ${p.soglia}% dello stipendio: <b>${eur(c.limit)}</b>. TAN ${p.tan}%, ${p.durata} anni, quota finanziata ${p.ltv}%. Liquidità indicata: ${eur(num(p.mezziPropri))}.`);
    const P = num(($('#calcP') || {}).value), T = num(($('#calcT') || {}).value), extra = num(p.aiutoFamiglia);
    set('calcRows', [10, 15, 20, 25, 30].map((y) => {
      const r = rata(P, T, y), tot = r * y * 12 - P;
      let saved = '—';
      if (P && extra > 0) { let bal = P, m = 0; const i = T / 100 / 12; while (bal > 0 && m < y * 12) { bal = bal * (1 + i) - r - extra; m++; } saved = (y * 12 - m) + ' mesi'; }
      return `<tr><td>${y} anni</td><td class="right num ${cls(r)}">${eur(r)}</td><td class="right num">${red ? pct(r / red * 100) : '—'}</td><td class="right num">${eur(tot)}</td><td class="right num">${saved}</td></tr>`;
    }).join(''));
    const by = (k) => state.payments.filter((x) => x.cover === k).reduce((s, x) => s + num(x.amount), 0);
    const own = by('mezzi_propri');
    set('payKpis', `
      <div class="kpi"><div class="kpi-label">Mezzi propri</div><div class="kpi-value ${own > num(p.mezziPropri) ? 'bad' : ''}">${eur(own)}</div><div class="kpi-sub">disponibili ${eur(num(p.mezziPropri))}</div></div>
      <div class="kpi"><div class="kpi-label">Aiuto famiglia</div><div class="kpi-value">${eur(by('famiglia'))}</div></div>
      <div class="kpi"><div class="kpi-label">Tranche SAL</div><div class="kpi-value">${eur(by('sal'))}</div></div>
      <div class="kpi"><div class="kpi-label">Senza copertura</div><div class="kpi-value ${by('da_definire') ? 'warn' : ''}">${eur(by('da_definire'))}</div><div class="kpi-sub">${state.payments.filter((x) => x.cover === 'da_definire').length} scadenze</div></div>`);
  }

  views.tasks = function () {
    const groups = [...new Set(state.tasks.map((t) => t.group))];
    const done = state.tasks.filter((t) => t.done).length;
    return `<div class="page-head"><div><h1>Passi dell’operazione</h1><p class="lead">Tutto quello che serve per arrivare in banca preparato e chiudere in fretta. Aggiungi una data per far comparire il passo in cima alla panoramica.</p></div>
      <button class="btn" data-act="addTask">Aggiungi passo</button></div>
    <div class="card" style="margin-bottom:var(--space-5)"><b class="num">${done} di ${state.tasks.length}</b> <span class="muted">completati</span><div class="bar"><span style="width:${done / state.tasks.length * 100}%"></span></div></div>
    ${groups.map((g) => `<div class="doc-group"><div class="doc-group-head"><h2>${esc(g)}</h2><span class="muted small num">${state.tasks.filter((t) => t.group === g && t.done).length}/${state.tasks.filter((t) => t.group === g).length}</span></div>
      ${state.tasks.filter((t) => t.group === g).map((t) => `<div class="task ${t.done ? 'done' : ''}" data-row="${t.id}">
        <input type="checkbox" data-coll="tasks" data-id="${t.id}" data-f="done" ${t.done ? 'checked' : ''} aria-label="Completato">
        <input type="text" class="task-label" data-coll="tasks" data-id="${t.id}" data-f="label" value="${esc(t.label)}" aria-label="Descrizione" style="border-color:transparent;background:transparent">
        <input type="date" data-coll="tasks" data-id="${t.id}" data-f="due" value="${esc(t.due)}" aria-label="Scadenza">
        <button class="btn btn-danger btn-sm" data-act="del" data-coll="tasks" data-id="${t.id}">Elimina</button></div>`).join('')}</div>`).join('')}`;
  };

  views.email = function () {
    const e = state.email, sel = views.email.bank || '';
    return `<div class="page-head"><div><h1>Email esplorativa</h1><p class="lead">Scegli la banca, completa i campi e copia il testo. Con “Segna come inviata” aggiorni lo stato e il registro contatti.</p></div></div>
    <div class="grid two">
      <div class="card"><h2>Dati</h2><div class="form-grid" style="grid-template-columns:1fr">
        <div class="field"><label for="emBank">Banca</label><select id="emBank"><option value="">Generica</option>${state.banks.map((b) => `<option value="${b.id}"${b.id === sel ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="em_intestatari">Situazione dei diritti</label><textarea id="em_intestatari" data-obj="email" data-f="intestatari">${esc(e.intestatari)}</textarea></div>
        <div class="field"><label for="em_costo">Costo residuo previsto</label><input type="text" id="em_costo" data-obj="email" data-f="costoResiduo" value="${esc(e.costoResiduo)}" placeholder="vuoto = calcolato dai costi"></div>
        <div class="field"><label for="em_importo">Finanziamento richiesto</label><input type="text" id="em_importo" data-obj="email" data-f="importo" value="${esc(e.importo)}" placeholder="es. circa 80.000 €"></div>
        <div class="field"><label for="em_nome">Nome e cognome</label><input type="text" id="em_nome" data-obj="email" data-f="nome" value="${esc(e.nome)}"></div>
        <div class="field"><label for="em_tel">Telefono</label><input type="text" id="em_tel" data-obj="email" data-f="telefono" value="${esc(e.telefono)}"></div>
        <label style="display:flex;gap:8px;align-items:center;font-size:var(--text-sm)"><input type="checkbox" data-obj="email" data-f="fornitoreScelto" ${e.fornitoreScelto ? 'checked' : ''}> Produttore della struttura già scelto</label>
      </div></div>
      <div class="card"><h2>Testo</h2>
        <div class="field"><label for="emSubject">Oggetto</label><input type="text" id="emSubject" readonly></div>
        <div class="field" style="margin-top:var(--space-3)"><label for="emBody">Messaggio</label><textarea id="emBody" class="email-out"></textarea></div>
        <div class="btn-row" style="margin-top:var(--space-3)">
          <button class="btn" data-act="copyEmail">Copia testo</button>
          <a class="btn btn-ghost" id="emMailto" href="#" target="_blank" rel="noopener">Apri nell’email</a>
          <button class="btn btn-ghost" data-act="markSent">Segna come inviata</button>
        </div>
        <p class="note">Prima di inviare documenti personali, verifica il destinatario e concorda il canale con la banca.</p></div>
    </div>`;
  };
  function emailText() {
    const e = state.email, c = calc();
    const b = state.banks.find((x) => x.id === views.email.bank);
    const costo = e.costoResiduo || (c.rMin === c.rMax ? eur(c.rMin) : `tra ${eur(c.rMin)} e ${eur(c.rMax)}`);
    const subject = 'Richiesta preliminare mutuo SAL – demolizione e ricostruzione abitazione in legno a Rocca Canavese';
    const body = `Buongiorno,

sono residente a Ciriè e sto raccogliendo informazioni per un mutuo destinato alla demolizione e ricostruzione di un’abitazione a Rocca Canavese, località Buretta, su immobile già di proprietà.

L’intervento prevede una casa prefabbricata in legno, con demolizione, platea e opere di completamento affidate separatamente. La fornitura della struttura ${e.fornitoreScelto ? 'sarà affidata' : 'potrebbe essere affidata'} a un produttore ungherese, comprensiva di trasporto e montaggio.

Il progetto è approvato, con permesso di costruire valido, ampliamenti approvati, oneri di urbanizzazione pagati, allacci di acqua e luce già realizzati e computo metrico disponibile. Sto completando la raccolta dei preventivi e il quadro economico complessivo.

Prima di fissare un incontro, vorrei sapere se il vostro istituto può valutare questa tipologia di operazione per clientela privata, con erogazioni a stato avanzamento lavori.

In particolare, chiederei un primo riscontro su:

1. Ammissibilità della demolizione e ricostruzione in legno e del fornitore estero; certificazioni richieste.
2. Possibilità di riconoscere l’acquisto e le spese già sostenute (lavori, progettazione, oneri e permessi) come apporto proprio, e quali voci sono ammesse.
3. Criterio per determinare l’importo finanziabile: costo dei lavori, investimento complessivo comprensivo del terreno e/o valore finale di perizia.
4. Disponibilità di una prima erogazione e gestione degli anticipi richiesti dal produttore prima del montaggio.
5. Documentazione minima necessaria per una valutazione preliminare.

La situazione dei diritti sull’immobile è la seguente: ${e.intestatari || '[indicare intestatari, quote ed eventuale usufrutto]'}. Chiederei di verificare anche la compatibilità di questa configurazione con il finanziamento e la garanzia ipotecaria.

Indicativamente, il costo residuo previsto è ${costo}${e.importo ? ', mentre il finanziamento richiesto sarebbe di ' + e.importo : ''}.

In questa fase desidero solo un confronto esplorativo, senza avviare una domanda formale né sostenere costi prima di averli concordati.

Potreste indicarmi un referente che segua mutui costruzione/SAL per privati e, se l’operazione è valutabile, proporre un appuntamento presso una filiale di Ciriè, dei comuni vicini o di Torino?

Posso trasmettere una scheda sintetica dell’intervento e mettere a disposizione la documentazione tecnica, patrimoniale e reddituale tramite il canale che mi indicherete.

Grazie per l’attenzione.

Cordiali saluti,
${e.nome || '[Nome e cognome]'}
${e.telefono || '[Telefono]'}`;
    return { subject, body, to: b ? b.email : '' };
  }
  function refreshEmail() {
    const t = emailText();
    $('#emSubject').value = t.subject; $('#emBody').value = t.body;
    $('#emMailto').href = `mailto:${encodeURIComponent(t.to)}?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(t.body)}`;
  }

  // ---------- Bank dialog ----------
  let dlgBank = null, dlgTab = 'scheda';
  function openBank(id, t) {
    dlgBank = id; dlgTab = t || dlgTab || 'scheda';
    renderDlg();
    const d = $('#dlg'); if (!d.open) d.showModal();
  }
  function renderDlg() {
    const b = state.banks.find((x) => x.id === dlgBank); if (!b) return;
    const bf = (f, l, type = 'text', sub) => `<div class="field"><label>${l}</label><input type="${type}" data-coll="banks" data-id="${b.id}" ${sub ? `data-sub="${sub}"` : ''} data-f="${f}" value="${esc(sub ? b[sub][f] : b[f])}"></div>`;
    let body = '';
    if (dlgTab === 'scheda') {
      body = `<div class="form-grid">${bf('name', 'Nome banca')}${bf('group', 'Gruppo')}
        <div class="field"><label>Stato</label><select data-coll="banks" data-id="${b.id}" data-f="status">${opts(BANK_STATUS, b.status)}</select></div></div>
        <div class="form-grid">${bf('address', 'Indirizzo filiale')}${bf('phone', 'Telefono')}${bf('email', 'Email', 'email')}${bf('referente', 'Referente')}</div>
        <div class="form-grid">${bf('web', 'Sito / foglio informativo', 'url')}</div>
        ${b.web ? `<a class="small" href="${esc(b.web)}" target="_blank" rel="noopener">Apri il sito della banca</a>` : ''}
        <div class="field"><label>Perché è in lista</label><textarea data-coll="banks" data-id="${b.id}" data-f="why">${esc(b.why)}</textarea></div>
        <div class="field"><label>Note</label><textarea data-coll="banks" data-id="${b.id}" data-f="notes">${esc(b.notes)}</textarea></div>`;
    } else if (dlgTab === 'domande') {
      body = QUESTIONS.map((q, i) => `<div class="qa"><label class="lbl" style="color:var(--text);font-weight:600">${i + 1}. ${esc(q.t)}</label><span class="q">${esc(q.q)}</span>
        <textarea data-coll="banks" data-id="${b.id}" data-sub="answers" data-f="${q.k}" placeholder="Risposta della banca">${esc(b.answers[q.k] || '')}</textarea></div>`).join('');
    } else if (dlgTab === 'registro') {
      body = `<div class="form-grid" style="align-items:end"><div class="field"><label for="logDate">Data</label><input type="date" id="logDate" value="${today()}"></div>
        <div class="field"><label for="logType">Tipo</label><select id="logType">${LOG_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></div>
        <div class="field" style="grid-column:span 2"><label for="logNote">Nota</label><input type="text" id="logNote" placeholder="Con chi hai parlato, cosa ti hanno detto"></div>
        <button type="button" class="btn" data-act="addLog">Aggiungi</button></div>
        <div>${b.log.length ? b.log.slice().sort((a, c) => (c.date || '').localeCompare(a.date || '')).map((l) => `<div class="log-item"><span class="num">${fmtDate(l.date)}</span><span class="tag">${esc(l.type)}</span><span>${esc(l.note)}</span><button type="button" class="btn btn-danger btn-sm" data-act="delLog" data-log="${l.id}">Elimina</button></div>`).join('') : '<div class="empty">Nessun contatto registrato.</div>'}</div>`;
    } else if (dlgTab === 'allegati') {
      body = `<p class="muted small" style="margin:0">Offerte, fogli informativi (PIES), simulazioni ed email ricevute. I file vanno in <code>data/banche/${esc(b.name)}/</code>.</p>
        <div class="drop-zone" data-drop="bank" data-id="${b.id}">${b.files.length ? '' : '<span class="muted small">Nessun allegato. Trascina qui i file o usa il pulsante.</span>'}${filesBlock('bank', b)}</div>`;
    } else {
      body = `<div class="form-grid">${bf('importo', 'Importo offerto (€)', 'number', 'offer')}
        <div class="field"><label>Tipo tasso</label><select data-coll="banks" data-id="${b.id}" data-sub="offer" data-f="tipo">${opts([['', '—'], ['Fisso', 'Fisso'], ['Variabile', 'Variabile'], ['Variabile con CAP', 'Variabile con CAP'], ['Misto', 'Misto']], b.offer.tipo)}</select></div>
        ${bf('tan', 'TAN (%)', 'number', 'offer')}${bf('taeg', 'TAEG (%)', 'number', 'offer')}${bf('durata', 'Durata (anni)', 'number', 'offer')}${bf('ltv', 'Quota finanziata e base', 'text', 'offer')}
        ${bf('istruttoria', 'Spese istruttoria (€)', 'number', 'offer')}${bf('perizia', 'Perizie SAL (n. e costo)', 'text', 'offer')}</div>
        <div class="form-grid">${bf('primaErogazione', 'Prima erogazione', 'text', 'offer')}${bf('pregresso', 'Riconosce spese già sostenute', 'text', 'offer')}${bf('preammortamento', 'Preammortamento', 'text', 'offer')}</div>
        <div class="field"><label>Note sull’offerta</label><textarea data-coll="banks" data-id="${b.id}" data-sub="offer" data-f="note">${esc(b.offer.note)}</textarea></div>
        <p class="note" data-out="offerRata"></p>`;
    }
    $('#dlgForm').innerHTML = `
      <div class="dlg-head"><div><h2 style="margin:0">${esc(b.name)}</h2><span class="chip s-${b.status}">${label(BANK_STATUS, b.status)}</span></div>
        <button type="button" class="btn btn-ghost btn-sm" data-act="closeDlg">Chiudi</button></div>
      <div class="tabs" role="tablist">${[['scheda', 'Scheda'], ['domande', `Domande (${bankAnswered(b)}/${QUESTIONS.length})`], ['registro', `Registro contatti (${b.log.length})`], ['offerta', 'Offerta'], ['allegati', `Allegati (${b.files.length})`]].map(([k, l]) => `<button type="button" role="tab" data-dtab="${k}" class="${k === dlgTab ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="dlg-body">${body}</div>
      <div class="dlg-foot"><button type="button" class="btn btn-danger btn-sm" data-act="del" data-coll="banks" data-id="${b.id}">Elimina banca</button>
        <button type="button" class="btn" data-act="closeDlg">Fatto</button></div>`;
    refreshOfferRata(b);
  }
  function refreshOfferRata(b) {
    const el = $('[data-out="offerRata"]'); if (!el) return;
    const P = num(b.offer.importo), t = num(b.offer.tan), d = num(b.offer.durata);
    el.textContent = P && d ? `Rata calcolata: ${eur(rata(P, t, d))} al mese, ${pct(rata(P, t, d) / num(state.profile.reddito) * 100)} dello stipendio.` : 'Inserisci importo, TAN e durata per calcolare la rata.';
  }

  // ---------- Render ----------
  function render() {
    $$('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('#view').innerHTML = views[tab]();
    if (tab === 'costs') refreshCosts();
    if (tab === 'email') refreshEmail();
  }
  function go(t) { tab = t; render(); window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); }

  // ---------- Events ----------
  document.addEventListener('click', (ev) => {
    const nav = ev.target.closest('[data-tab]'); if (nav) return go(nav.dataset.tab);
    const g = ev.target.closest('[data-go]'); if (g) return go(g.dataset.go);
    const dt = ev.target.closest('[data-dtab]'); if (dt) { dlgTab = dt.dataset.dtab; return renderDlg(); }
    const a = ev.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'openBank') return openBank(a.dataset.id, 'scheda');
    if (act === 'rmFile') {
      if (!a.dataset.armed) { a.dataset.armed = '1'; a.textContent = 'Rimuovi?'; a.classList.add('armed'); setTimeout(() => { if (a.isConnected) { delete a.dataset.armed; a.textContent = '×'; a.classList.remove('armed'); } }, 3000); return; }
      return removeFile(a.dataset.kind, a.dataset.id, a.dataset.fid);
    }
    if (act === 'reloadServer') { loadFromServer().then(() => { showBanner(''); render(); }); return; }
    if (act === 'forceSave') { conflict = false; showBanner(''); pushState(true); return; }
    if (act === 'closeDlg') { $('#dlg').close(); return; }
    if (act === 'del') {
      if (!a.dataset.armed) { a.dataset.armed = '1'; a.dataset.orig = a.textContent; a.textContent = 'Conferma'; setTimeout(() => { if (a.isConnected) { delete a.dataset.armed; a.textContent = a.dataset.orig; } }, 3000); return; }
      const coll = a.dataset.coll; state[coll] = state[coll].filter((x) => x.id !== a.dataset.id); save();
      if (coll === 'banks') $('#dlg').close();
      toast('Eliminato'); return render();
    }
    if (act === 'addBank') { const b = clone(window.SEED.state.banks[0]); Object.assign(b, { id: uid('b'), name: 'Nuova banca', group: 'Da valutare', address: '', phone: '', email: '', web: '', why: '', status: 'da_contattare', answers: {}, log: [] }); Object.keys(b.offer).forEach((k) => (b.offer[k] = '')); state.banks.push(b); save(); render(); return openBank(b.id, 'scheda'); }
    if (act === 'addDoc') { state.docs.push({ id: uid('d'), set: 'Altri documenti', name: 'Nuovo documento', hint: '', status: 'mancante', location: '', note: '' }); save(); render(); const last = $$('.doc-row').pop(); if (last) last.scrollIntoView({ block: 'center' }); return; }
    if (act === 'addSpent') { state.spent.push({ id: uid('s'), label: '', amount: 0, proof: false, note: '' }); save(); return render(); }
    if (act === 'addTodo') { state.todo.push({ id: uid('c'), label: '', min: 0, max: 0, kind: 'stima', note: '' }); save(); return render(); }
    if (act === 'addPayment') { state.payments.push({ id: uid('p'), label: '', amount: 0, date: '', cover: 'da_definire' }); save(); return render(); }
    if (act === 'addTask') { state.tasks.push({ id: uid('t'), group: 'Altro', label: 'Nuovo passo', done: false, due: '', note: '' }); save(); render(); const last = $$('.task').pop(); if (last) { last.scrollIntoView({ block: 'center' }); $('.task-label', last).select(); } return; }
    if (act === 'printDocs') return window.print();
    if (act === 'addLog') {
      const b = state.banks.find((x) => x.id === dlgBank); const note = $('#logNote').value.trim();
      b.log.push({ id: uid('l'), date: $('#logDate').value || today(), type: $('#logType').value, note });
      save(); renderDlg(); toast('Contatto registrato'); return;
    }
    if (act === 'delLog') { const b = state.banks.find((x) => x.id === dlgBank); b.log = b.log.filter((l) => l.id !== a.dataset.log); save(); return renderDlg(); }
    if (act === 'copyEmail') {
      const txt = 'Oggetto: ' + $('#emSubject').value + '\n\n' + $('#emBody').value;
      const done = () => toast('Testo copiato');
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
      function fallback() { const ta = $('#emBody'); ta.focus(); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Seleziona e copia il testo manualmente'); } }
      return;
    }
    if (act === 'markSent') {
      const b = state.banks.find((x) => x.id === views.email.bank);
      if (!b) return toast('Scegli prima una banca');
      if (b.status === 'da_contattare') b.status = 'inviata';
      b.log.push({ id: uid('l'), date: today(), type: 'Email', note: 'Email esplorativa inviata' }); save(); toast(`${b.name}: richiesta segnata come inviata`); return;
    }
  });

  function bindValue(el) {
    const isCb = el.type === 'checkbox';
    let v = isCb ? el.checked : el.value;
    if (el.dataset.type === 'num') v = el.value === '' ? 0 : num(el.value);
    if (el.dataset.obj) { state[el.dataset.obj][el.dataset.f] = v; return { kind: 'obj' }; }
    if (el.dataset.coll) {
      const item = state[el.dataset.coll].find((x) => x.id === el.dataset.id); if (!item) return null;
      if (el.dataset.sub) item[el.dataset.sub][el.dataset.f] = v; else item[el.dataset.f] = v;
      return { kind: 'coll', coll: el.dataset.coll, item };
    }
    return null;
  }
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.id === 'bankQ') { views.banks.filter = Object.assign(views.banks.filter || { st: '' }, { q: el.value }); const pos = el.selectionStart; render(); const n = $('#bankQ'); n.focus(); n.setSelectionRange(pos, pos); return; }
    if (el.id === 'calcP' || el.id === 'calcT') return refreshCosts();
    const r = bindValue(el); if (!r) return;
    save();
    if (tab === 'costs') refreshCosts();
    if (tab === 'email') refreshEmail();
    if (r.coll === 'banks') { refreshOfferRata(r.item); }
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.upload) { const files = Array.from(el.files || []); el.value = ''; return uploadFiles(files, el.dataset.upload, el.dataset.id); }
    if (el.id === 'bankSt') { views.banks.filter = Object.assign(views.banks.filter || { q: '' }, { st: el.value }); return render(); }
    if (el.id === 'docFilter') { views.docs.filter = el.value; return render(); }
    if (el.id === 'emBank') { views.email.bank = el.value; return refreshEmail(); }
    if (el.matches('select, input[type=checkbox]')) {
      const r = bindValue(el); if (!r) return; save();
      if (r.coll === 'docs' || r.coll === 'tasks') render();
      else if (r.coll === 'banks' && el.dataset.f === 'status') renderDlg();
      if (tab === 'costs') refreshCosts();
      if (tab === 'email') refreshEmail();
    }
  });
  $('#dlg').addEventListener('close', () => render());
  ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (ev) => {
    const z = ev.target.closest && ev.target.closest('[data-drop]');
    if (!z || mode !== 'server') return;
    ev.preventDefault(); z.classList.add('is-over');
  }));
  document.addEventListener('dragleave', (ev) => { const z = ev.target.closest && ev.target.closest('[data-drop]'); if (z && !z.contains(ev.relatedTarget)) z.classList.remove('is-over'); });
  document.addEventListener('drop', (ev) => {
    const z = ev.target.closest && ev.target.closest('[data-drop]');
    if (!z) return; ev.preventDefault(); z.classList.remove('is-over');
    uploadFiles(Array.from(ev.dataTransfer.files || []), z.dataset.drop, z.dataset.id);
  });

  // Export / import
  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `dossier-mutuo-buretta-${today()}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('File esportato');
    if (mode === 'memory') { dirty = false; setStatus('Esportato alle ' + hhmm()); }
  });
  $('#importFile').addEventListener('change', (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { const d = JSON.parse(r.result); if (!d.banks || !d.docs) throw 0; state = migrate(d); state.version = 1; render(); toast('Dati importati'); if (mode === 'server') { dirty = true; pushState(true); } else { dirty = false; setStatus('Dati importati da ' + f.name); } } catch (e) { toast('File non valido'); } };
    r.readAsText(f); ev.target.value = '';
  });

  init();
})();
