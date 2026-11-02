/* หน้าก้อนเมฆ (ผู้จัด) */
(async function () {
  'use strict';
  const $ = WC.$;
  const db = await WC.initDB();
  const sid = WC.qs('s');
  const back = () => { location.replace('index.html'); };
  if (!sid || !db.user || !db.user.isHost) return back();

  let sess = null;          // เอกสารกิจกรรม
  let settings = null;      // ตั้งค่า (สำเนาในหน้านี้)
  let answers = [];
  let frozen = null;        // สำเนาคำตอบเมื่อกด "หยุดแสดงชั่วคราว"
  let frozenAt = 0;
  let lastPlacements = [];
  let lastW = 760, lastH = 440;
  let exported = false;
  let lastPublic = '';
  let unlockedFields = false;                 // ปลดล็อกหัวข้อผู้ตอบแล้วหรือยัง
  const viewSel = {};                        // ตัวกรองในโหมดนำเสนอ {หัวข้อ: [ค่า]}
  let viewOpen = false, lockSig = '';
  let curViewLabel = '', curViewTotal = 0;     // ผลที่กำลังแสดง (ใช้ตอนส่งออกภาพ)
  const dirty = {};         // คีย์ที่กำลังแก้ในหน้านี้ กันค่าที่ส่งกลับมาทับ
  const markDirty = (keys) => { keys.forEach((k) => { dirty[k] = Date.now(); }); };
  const isDirty = (k) => dirty[k] && Date.now() - dirty[k] < 3000;

  const els = {
    app: $('#app'), boot: $('#boot'), q: $('#q'), stage: $('#stage'),
    statTotal: $('#statTotal'), statUnique: $('#statUnique'),
    tagClosed: $('#tagClosed'), tagPaused: $('#tagPaused'), tagHidden: $('#tagHidden'), emptyHint: $('#emptyHint'),
    tones: $('#tones'), toneName: $('#toneName'), bgSeg: $('#bgSeg'), sizeSeg: $('#sizeSeg'), maxSeg: $('#maxSeg'),
    togCounts: $('#togCounts'), togHide: $('#togHide'), togClosed: $('#togClosed'), limitSeg: $('#limitSeg'),
    fieldsBox: $('#fieldsBox'), fieldNote: $('#fieldNote'),
    modChips: $('#modChips'), removedWrap: $('#removedWrap'), removedChips: $('#removedChips'), blocked: $('#blocked'),
    pendBadge: $('#pendBadge'), pendNote: $('#pendNote'),
    viewBar: $('#viewBar'), viewPanel: $('#viewPanel'),
    tagView: $('#tagView'), suppressNote: $('#suppressNote'), fieldLock: $('#fieldLock')
  };
  const err = (e) => { console.error(e); alert('บันทึกไม่สำเร็จ: ' + (e && e.message ? e.message : e)); };

  /* ---------- บันทึกตั้งค่า ---------- */
  const persist = WC.debounce(() => {
    const patch = {};
    Object.keys(pendingPatch).forEach((k) => { patch[k] = settings[k]; });
    pendingPatch = {};
    if (Object.keys(patch).length) db.updateSettings(sid, patch).catch(err);
  }, 500);
  let pendingPatch = {};
  function save(patch) {
    Object.assign(settings, patch);
    Object.keys(patch).forEach((k) => { pendingPatch[k] = true; });
    markDirty(Object.keys(patch));
    render();
    persist();
  }

  /* ---------- สร้างหน้าตั้งค่า (ทำครั้งเดียว) ---------- */
  WC.TONES.forEach((t, i) => {
    els.tones.appendChild(WC.el('button', {
      type: 'button', class: 'swatch', 'aria-label': 'โทน' + t.name, 'aria-pressed': 'false', 'data-i': i,
      style: 'background:linear-gradient(135deg,' + t.accent + ' 50%,' + t.mid + ' 50%)',
      onclick: () => save({ tone: i })
    }));
  });
  els.q.addEventListener('input', () => save({ question: els.q.value }));
  els.blocked.addEventListener('input', () => save({ blocked: els.blocked.value }));
  els.togCounts.addEventListener('click', () => save({ showCounts: !settings.showCounts }));
  els.togHide.addEventListener('click', () => save({ hideResults: !settings.hideResults }));
  els.togClosed.addEventListener('click', () => save({ closed: !settings.closed }));

  const fieldEd = WC.fieldEditor(els.fieldsBox, {
    get: () => settings.fields,
    set: (f) => save({ fields: f }),
    locked: () => fieldsLocked()
  });

  /* ---------- คำนวณ ---------- */
  function compute(list) {
    const items = WC.buildItems(list, settings);
    const ms = WC.mergeState(items, settings);
    return { items: items, ms: ms, total: ms.eff.reduce((a, e) => a + e.count, 0) };
  }

  /* ---------- วาด ---------- */
  function setIfIdle(el, value) { if (document.activeElement !== el && el.value !== value) el.value = value; }

  const fieldsLocked = () => answers.length > 0 && !unlockedFields;

  function renderPanel() {
    WC.applyAccent(settings.tone);
    setIfIdle(els.q, settings.question || '');
    autosize();
    setIfIdle(els.blocked, settings.blocked || '');
    WC.$$('.swatch', els.tones).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.i === settings.tone)));
    els.toneName.textContent = WC.TONES[settings.tone].name;
    WC.seg(els.bgSeg, ['สว่าง', 'มืด'], settings.dark ? 1 : 0, (i) => save({ dark: i === 1 }));
    WC.seg(els.sizeSeg, WC.SIZES.map((s) => s[0]), settings.sizeIdx, (i) => save({ sizeIdx: i }));
    WC.seg(els.maxSeg, WC.MAXES.map((s) => s[0]), settings.maxIdx, (i) => save({ maxIdx: i }));
    WC.seg(els.limitSeg, ['1', '2', '3', '5'], [1, 2, 3, 5].indexOf(settings.limit), (i) => save({ limit: [1, 2, 3, 5][i] }));
    WC.setToggle(els.togCounts, settings.showCounts);
    WC.setToggle(els.togHide, settings.hideResults);
    WC.setToggle(els.togClosed, settings.closed);
    fieldEd.sync();
    const hasAns = answers.length > 0;
    els.fieldLock.hidden = !hasAns;
    if (hasAns) {
      const lk = fieldsLocked();
      $('#fieldLockText').textContent = lk
        ? 'ล็อกหัวข้อแล้ว เพราะมีคำตอบเข้ามาแล้ว เพื่อให้ข้อมูลทุกคำตอบสม่ำเสมอ'
        : 'ปลดล็อกอยู่ คำตอบที่ส่งมาแล้วจะไม่มีข้อมูลของหัวข้อที่เพิ่มใหม่';
      $('#btnUnlock').textContent = lk ? 'ปลดล็อก…' : 'ล็อกกลับ';
    }
    const pubF = WC.publicFields(settings.fields);
    els.fieldNote.textContent = pubF.length === 0
      ? 'ตอนนี้ผู้ตอบจะเห็นแค่ช่องใส่คำ'
      : 'ผู้ตอบจะเห็น ' + pubF.length + ' หัวข้อ: ' + pubF.map((f) => f.label).join(', ');
    els.tagClosed.hidden = !settings.closed;
    els.tagHidden.hidden = !settings.hideResults;
  }

  function renderCloud() {
    const live = compute(answers);
    const present = document.body.classList.contains('present');
    const defs = WC.fieldDefs(settings);
    WC.selPrune(defs, viewSel);
    const src = frozen || answers;
    let filterFn = null, viewLabel = '';
    if (present) {
      filterFn = WC.selFilter(defs, viewSel);
      viewLabel = WC.selLabel(defs, viewSel);
    }
    const filtered = filterFn ? src.filter(filterFn) : src;
    const suppressed = !!filterFn && settings.minGroup > 0 && filtered.length < settings.minGroup;
    const frozenAll = frozen ? compute(frozen) : null;
    const view = suppressed
      ? { ms: { eff: [], pairs: [], merges: {}, resolve: (x) => x }, total: 0 }
      : (filterFn ? compute(filtered) : (frozen ? frozenAll : live));
    renderViewBar(defs, present, viewLabel);
    els.suppressNote.hidden = !suppressed;
    if (suppressed) els.suppressNote.querySelector('span').textContent = 'กลุ่มนี้มี ' + filtered.length + ' คำตอบ น้อยกว่าเกณฑ์ ' + settings.minGroup + ' จึงซ่อนผลไว้ เพื่อกันไม่ให้ระบุได้ว่าใครตอบ (ปรับเกณฑ์ได้ในหน้าวิเคราะห์)';
    els.tagView.hidden = !filterFn;
    els.tagView.textContent = 'กำลังดู: ' + viewLabel;
    els.tagView.style.whiteSpace = 'normal';
    curViewLabel = viewLabel;
    curViewTotal = view.total;
    const maxN = WC.MAXES[settings.maxIdx][1];
    const shown = view.ms.eff.slice(0, maxN);
    const words = shown.map((e) => ({
      key: e.word, count: e.count,
      label: settings.showCounts ? e.word + ' ' + e.count : e.word
    }));
    const dark = !!settings.dark;
    els.stage.classList.toggle('dark', dark);
    let W = Math.max(300, Math.min(1100, els.stage.clientWidth || 760));
    if (document.body.classList.contains('present')) {
      const top = els.stage.getBoundingClientRect().top + window.scrollY;
      W = Math.max(300, Math.min(W, Math.floor((window.innerHeight - top - 24) / 0.58)));
    }
    els.stage.style.maxWidth = W + 'px';
    const H = Math.round(W * 0.58);
    els.stage.style.height = H + 'px';
    lastW = W; lastH = H;
    lastPlacements = WC.renderCloud(els.stage, words, WC.palette(settings.tone, dark), { W: W, H: H, scale: WC.SIZES[settings.sizeIdx][1] });
    els.statTotal.textContent = view.total + ' คำตอบ';
    els.statUnique.textContent = view.ms.eff.length + ' คำไม่ซ้ำ';
    els.emptyHint.hidden = view.total > 0;
    if (frozen) {
      els.tagPaused.hidden = false;
      els.tagPaused.textContent = 'หยุดแสดงชั่วคราว · มีใหม่ ' + Math.max(0, live.total - frozenAll.total);
    } else els.tagPaused.hidden = true;

    const pending = live.ms.pairs.filter((p) => p.status === 'pending').length;
    els.pendBadge.hidden = pending === 0;
    els.pendBadge.textContent = pending;
    els.pendNote.textContent = pending > 0 ? 'มี ' + pending + ' คู่คำที่น่าจะรวมกัน รอตัดสิน' : 'ไม่มีคู่คำที่รอตัดสิน';

    // ปุ่มกลั่นกรอง
    els.modChips.replaceChildren();
    live.ms.eff.slice(0, 12).forEach((e) => {
      els.modChips.appendChild(WC.el('button', {
        type: 'button', class: 'chip', text: e.word + ' ✕', 'aria-label': 'ซ่อนคำ ' + e.word,
        onclick: () => save({ removed: (settings.removed || []).concat([e.word]) })
      }));
    });
    const rem = settings.removed || [];
    els.removedWrap.hidden = rem.length === 0;
    els.removedChips.replaceChildren();
    rem.forEach((w) => {
      els.removedChips.appendChild(WC.el('button', {
        type: 'button', class: 'chip dashed', text: w + ' · คืนคำ', 'aria-label': 'คืนคำ ' + w,
        onclick: () => save({ removed: rem.filter((x) => x !== w) })
      }));
    });
    pushPublic(live);
  }

  let lastBarSig = '';
  function renderViewBar(defs, present, label) {
    const show = present && defs.length > 0;
    els.viewBar.hidden = !show;
    if (!show) return;
    const n = WC.selCount(viewSel);
    $('#btnFilter').textContent = 'ตัวกรอง' + (n ? ' (' + n + ')' : '') + (viewOpen ? ' ▴' : ' ▾');
    $('#btnFilter').setAttribute('aria-expanded', String(viewOpen));
    $('#btnClearView').hidden = n === 0;
    els.viewPanel.hidden = !viewOpen;
    if (!viewOpen) { lastBarSig = ''; return; }
    const sig = JSON.stringify([defs.map((d) => [d.key, d.name, d.values]), viewSel]);
    if (sig === lastBarSig) return;
    lastBarSig = sig;
    WC.filterPanel(els.viewPanel, defs, viewSel, () => { renderCloud(); });
    els.viewPanel.appendChild(WC.el('button', {
      type: 'button', class: 'btn primary', style: 'align-self:flex-start', text: 'เสร็จ',
      onclick: () => { viewOpen = false; lastBarSig = ''; renderCloud(); }
    }));
  }

  function render() { renderPanel(); renderCloud(); }
  // จำกัดความถี่การจัดวางใหม่ เมื่อมีคำตอบเข้ามาถี่ๆ
  let lastDraw = 0, drawTimer = null;
  function renderCloudSoon() {
    const wait = 450 - (Date.now() - lastDraw);
    if (wait <= 0) { lastDraw = Date.now(); renderCloud(); return; }
    clearTimeout(drawTimer);
    drawTimer = setTimeout(() => { lastDraw = Date.now(); renderCloud(); }, wait);
  }
  function autosize() { els.q.style.height = 'auto'; els.q.style.height = (els.q.scrollHeight + 2) + 'px'; }

  /* ---------- ส่งสถานะให้ผู้เข้าร่วม ---------- */
  const doPush = WC.debounce((live) => {
    const words = live.ms.eff.slice(0, 60).map((e) => ({ t: e.word, n: e.count }));
    const doc = WC.publicDoc(settings, words, live.ms.merges, live.total);
    const sig = JSON.stringify([doc.question, doc.status, doc.hideResults, doc.limit, doc.fields, doc.tone, doc.words, doc.merges, doc.total]);
    if (sig === lastPublic) return;
    lastPublic = sig;
    db.setPublic(sid, doc).catch((e) => { lastPublic = ''; console.error(e); });
  }, 1500);
  function pushPublic(live) { doPush(live); }

  /* ---------- รหัส / QR ---------- */
  function renderJoin() {
    const url = WC.joinUrl(sess.code);
    $('#joinCode').textContent = sess.code;
    $('#joinUrl').textContent = url.replace(/^https?:\/\//, '').replace(/\?c=.*/, '') + '  รหัส ' + sess.code;
    const svg = WC.qrSvg(url);
    $('#qrThumb').innerHTML = svg;
    $('#qrBig').innerHTML = svg;
    $('#bigCode').textContent = sess.code;
    $('#bigUrl').textContent = url;
  }
  const qrDialog = $('#qrDialog');
  $('#qrThumb').addEventListener('click', () => qrDialog.showModal());
  $('#btnQrClose').addEventListener('click', () => qrDialog.close());
  qrDialog.addEventListener('click', (e) => { if (e.target === qrDialog) qrDialog.close(); });
  $('#btnCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(WC.joinUrl(sess.code)); $('#btnCopy').textContent = 'คัดลอกแล้ว'; setTimeout(() => { $('#btnCopy').textContent = 'คัดลอกลิงก์'; }, 1500); } catch (e) { /* ข้าม */ }
  });

  /* ---------- นำเสนอ / หยุด / ส่งออก ---------- */
  const btnPresent = $('#btnPresent');
  btnPresent.addEventListener('click', () => {
    const on = !document.body.classList.contains('present');
    document.body.classList.toggle('present', on);
    btnPresent.setAttribute('aria-pressed', String(on));
    btnPresent.textContent = on ? 'ออกจากโหมดนำเสนอ' : 'โหมดนำเสนอ';
    if (!on) { Object.keys(viewSel).forEach((k) => delete viewSel[k]); viewOpen = false; lastBarSig = ''; }
    setTimeout(() => { autosize(); renderCloud(); }, 60);
  });
  $('#btnFilter').addEventListener('click', () => { viewOpen = !viewOpen; lastBarSig = ''; renderCloud(); setTimeout(renderCloud, 80); });
  $('#btnClearView').addEventListener('click', () => { Object.keys(viewSel).forEach((k) => delete viewSel[k]); lastBarSig = ''; renderCloud(); });
  const btnPause = $('#btnPause');
  btnPause.addEventListener('click', () => {
    frozen = frozen ? null : answers.slice();
    btnPause.setAttribute('aria-pressed', String(!!frozen));
    btnPause.textContent = frozen ? 'แสดงต่อ' : 'หยุดแสดงชั่วคราว';
    renderCloud();
  });

  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  async function exportCsv() {
    WC.download('wordcloud-' + sess.code + '-' + stamp() + '.csv', WC.answersCsv(answers, settings, sess.code));
    exported = true;
    syncDelete();
  }
  async function exportPng() {
    const blob = await WC.cloudPng({
      question: (settings.question || '') + (curViewLabel ? ' (' + curViewLabel + ')' : ''),
      placements: lastPlacements, W: lastW, H: lastH, dark: !!settings.dark,
      pal: WC.palette(settings.tone, !!settings.dark), count: curViewTotal
    });
    WC.download('wordcloud-' + sess.code + '-' + stamp() + '.png', blob);
    exported = true;
    syncDelete();
  }
  $('#btnCsv').addEventListener('click', exportCsv);
  $('#btnPng').addEventListener('click', exportPng);
  $('#dlgCsv').addEventListener('click', exportCsv);
  $('#dlgPng').addEventListener('click', exportPng);

  const delDialog = $('#delDialog');
  const dlgSkip = $('#dlgSkip');
  function syncDelete() {
    const ok = exported || dlgSkip.checked;
    $('#dlgDelAns').disabled = !ok;
    $('#dlgDelAll').disabled = !ok;
    $('#dlgErr').textContent = ok ? '' : 'ส่งออกก่อน หรือติ๊ก "ลบโดยไม่ส่งออก"';
  }
  $('#btnDelete').addEventListener('click', () => { dlgSkip.checked = false; syncDelete(); delDialog.showModal(); });
  dlgSkip.addEventListener('change', syncDelete);
  $('#dlgCancel').addEventListener('click', () => delDialog.close());
  $('#dlgDelAns').addEventListener('click', async () => {
    try { await db.deleteAnswers(sid); frozen = null; delDialog.close(); } catch (e) { err(e); }
  });
  $('#dlgDelAll').addEventListener('click', async () => {
    try { await db.deleteSession(sid); location.replace('index.html'); } catch (e) { err(e); }
  });

  /* ---------- เริ่มทำงาน ---------- */
  let ro = null;
  const unsubSess = db.watchSession(sid, (s) => {
    if (!s) return back();
    sess = s;
    const remote = s.settings || {};
    if (!settings) settings = Object.assign(WC.defaultSettings(''), remote);
    else Object.keys(remote).forEach((k) => { if (!isDirty(k)) settings[k] = remote[k]; });
    settings.fields = WC.normFields(settings.fields);
    if (els.boot) { els.boot.remove(); els.boot = null; els.app.hidden = false; renderJoin(); }
    render();
  }, (e) => { console.error(e); els.boot && (els.boot.textContent = 'โหลดกิจกรรมไม่ได้: ' + e.message); });
  $('#btnUnlock').addEventListener('click', () => {
    if (!unlockedFields) {
      if (!confirm('ปลดล็อกหัวข้อ?\nคำตอบที่ส่งมาแล้วจะไม่มีข้อมูลของหัวข้อที่เพิ่มใหม่ และคนที่เปิดหน้ากรอกค้างไว้จะไม่เห็นหัวข้อใหม่')) return;
      unlockedFields = true;
    } else unlockedFields = false;
    renderPanel();
  });
  db.watchAnswers(sid, (list) => {
    answers = list;
    if (!settings) return;
    renderCloudSoon();
    const sig = answers.length > 0 ? (unlockedFields ? 'u' : 'l') : 'n';
    if (sig !== lockSig) { lockSig = sig; renderPanel(); }
  }, (e) => console.error(e));
  if ('ResizeObserver' in window) {
    let t = null;
    ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { if (settings) { autosize(); renderCloud(); } }, 120); });
    ro.observe(els.stage);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (settings) renderCloud(); });
  window.addEventListener('beforeunload', () => { persist.flush(); });
  void unsubSess;
})();
