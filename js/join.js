/* หน้าผู้เข้าร่วม (มือถือ) */
(async function () {
  'use strict';
  const $ = WC.$;
  const SCREENS = ['sLoading', 'sCode', 'sError', 'sEdit', 'sClosed', 'sSent'];
  const show = (id) => SCREENS.forEach((s) => { $('#' + s).hidden = s !== id; });
  const fail = (title, text) => { $('#errTitle').textContent = title; $('#errText').textContent = text; show('sError'); };

  const rawCode = (WC.qs('c') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, WC.CODE_LEN);

  let db;
  try { db = await WC.initDB(); } catch (e) { return fail('เชื่อมต่อไม่ได้', 'โหลดระบบไม่สำเร็จ ลองรีเฟรชหน้านี้'); }

  if (!rawCode) {
    show('sCode');
    $('#codeForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const c = $('#codeIn').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (c.length !== WC.CODE_LEN) { $('#codeErr').textContent = 'ใส่รหัสให้ครบ ' + WC.CODE_LEN + ' ตัว'; return; }
      location.search = '?c=' + c;
    });
    return;
  }
  $('#codeTag').textContent = 'รหัส ' + rawCode;

  let uid, sid, state;
  try {
    uid = await db.ensureAnon();
    sid = await db.lookupCode(rawCode);
    if (!sid) return fail('ไม่พบรหัสนี้', 'ตรวจรหัสอีกครั้ง หรือกิจกรรมนี้อาจจบไปแล้ว');
    state = await db.getPublic(sid);
    if (!state) return fail('ไม่พบกิจกรรม', 'กิจกรรมนี้อาจจบไปแล้ว');
  } catch (e) {
    console.error(e);
    return fail('เชื่อมต่อไม่ได้', 'ตรวจอินเทอร์เน็ตแล้วลองใหม่ (' + (e && e.code ? e.code : e.message) + ')');
  }

  const storeKey = 'wc_mine_' + sid;
  let mine = [];
  try { mine = JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch (e) { mine = []; }
  let words = [];   // คำที่เพิ่มแล้วแต่ยังไม่ส่ง
  let sel = {};     // ข้อมูลเพิ่มเติมที่เลือก
  let editing = mine.length === 0;

  const remaining = () => Math.max(0, (state.limit || 3) - mine.length);

  /* ---------- หน้ากรอก ---------- */
  const input = $('#word');
  const btnAdd = $('#btnAdd');
  function renderEdit() {
    $('#qTitle').textContent = state.question || '(ยังไม่มีคำถาม)';
    $('#limitNote').textContent = 'ตอบได้อีก ' + remaining() + ' คำ ไม่ต้องใส่ชื่อ';
    const v = input.value.trim();
    btnAdd.disabled = v === '' || words.length >= remaining();
    $('#wordLen').textContent = input.value.length + ' / ' + WC.MAX_WORD_LEN;
    // ช่องแสดงจำนวน
    const slots = $('#slots');
    slots.replaceChildren();
    const total = state.limit || 3;
    for (let i = 0; i < total; i++) slots.appendChild(WC.el('div', { class: 'slot' + (i < mine.length + words.length ? ' on' : '') }));
    slots.appendChild(WC.el('span', { class: 'note', style: 'margin-left:4px', text: (mine.length + words.length) + ' / ' + total + ' คำ' }));
    // คำที่เพิ่ม
    const box = $('#myWords');
    box.replaceChildren();
    words.forEach((w, i) => {
      const x = WC.el('button', { type: 'button', 'aria-label': 'ลบคำ ' + w, onclick: () => { words.splice(i, 1); renderEdit(); } });
      x.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#065f46" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      box.appendChild(WC.el('div', { class: 'word-chip' }, [WC.el('span', { text: w }), x]));
    });
    $('#btnSend').disabled = words.length === 0;
    // ข้อมูลเพิ่มเติม
    const fields = state.fields || [];
    $('#fieldsWrap').hidden = fields.length === 0 || mine.length > 0;
    const fbox = $('#fields');
    fbox.replaceChildren();
    fields.forEach((f) => {
      let control;
      if ((f.options || []).length > 8) {
        // ตัวเลือกเยอะ: ใช้รายการเลื่อนเลือก อ่านง่ายกว่าบนมือถือ
        control = WC.el('select', { class: 'm-select', 'aria-label': f.label });
        control.appendChild(WC.el('option', { value: '', text: '— เลือก —' }));
        f.options.forEach((o) => control.appendChild(WC.el('option', { value: o, text: o })));
        control.value = sel[f.key] || '';
        control.addEventListener('change', () => { sel[f.key] = control.value || null; });
      } else {
        control = WC.el('div', { class: 'chips', style: 'gap:8px' });
        (f.options || []).forEach((o) => {
          control.appendChild(WC.el('button', {
            type: 'button', class: 'm-chip', text: o, 'aria-pressed': sel[f.key] === o ? 'true' : 'false',
            onclick: () => { sel[f.key] = sel[f.key] === o ? null : o; renderEdit(); }
          }));
        });
      }
      fbox.appendChild(WC.el('div', { class: 'stack', style: 'gap:10px' }, [WC.el('div', { text: f.label, style: 'font-weight:500' }), control]));
    });
  }

  function addWord() {
    const w = input.value.trim().slice(0, WC.MAX_WORD_LEN);
    const err = $('#wordErr');
    err.textContent = '';
    if (!w || words.length >= remaining()) return;
    const n = WC.normalize(w);
    if (words.concat(mine).some((x) => WC.normalize(x) === n)) { err.textContent = 'คุณเพิ่มคำนี้แล้ว'; return; }
    words.push(w);
    input.value = '';
    renderEdit();
    input.focus();
  }
  btnAdd.addEventListener('click', addWord);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addWord(); } });
  input.addEventListener('input', () => { $('#wordErr').textContent = ''; renderEdit(); });

  $('#btnSend').addEventListener('click', async () => {
    const btn = $('#btnSend');
    btn.disabled = true;
    $('#sendErr').textContent = '';
    try {
      // ต้องรวมคำที่พิมพ์ค้างไว้ในช่องด้วย ถ้ายังไม่ได้กดเพิ่ม
      if (input.value.trim() && words.length < remaining()) addWord();
      const fields = {};
      Object.keys(sel).forEach((k) => { if (sel[k]) fields[k] = sel[k]; });
      await db.submit(sid, uid, words.slice(), fields, mine.length);
      mine = mine.concat(words);
      try { localStorage.setItem(storeKey, JSON.stringify(mine)); } catch (e) { /* ข้าม */ }
      words = [];
      editing = false;
      await refresh();
      showSent();
    } catch (e) {
      console.error(e);
      const closed = /ปิดรับ|permission/i.test(String(e && (e.code || e.message)));
      $('#sendErr').textContent = closed
        ? 'ส่งไม่สำเร็จ: ผู้จัดอาจปิดรับคำตอบแล้ว หรือคุณเคยส่งครบแล้ว'
        : 'ส่งไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วกดส่งอีกครั้ง';
      btn.disabled = false;
    }
  });

  /* ---------- หน้าหลังส่ง ---------- */
  let timer = null, quick1 = null, quick2 = null;
  async function refresh() {
    try { const s = await db.getPublic(sid); if (s) state = s; } catch (e) { /* คงค่าเดิม */ }
  }
  function drawCloud() {
    const box = $('#mCloud');
    const W = Math.max(280, box.clientWidth || 340);
    const H = Math.max(300, Math.min(440, Math.round(window.innerHeight * 0.5)));
    box.style.height = H + 'px';
    const mineSet = new Set(mine.map((w) => {
      let n = WC.normalize(w);
      for (let k = 0; k < 6 && state.merges && state.merges[n]; k++) n = state.merges[n];
      return n;
    }));
    const list = (state.words || []).map((x) => ({ key: x.t, label: x.t, count: x.n, mine: mineSet.has(x.t) }));
    // คำของฉันที่ผู้จัดยังไม่ได้อัปเดตขึ้นก้อนเมฆ ให้เห็นทันที
    mineSet.forEach((w) => { if (!list.some((x) => x.key === w)) list.push({ key: w, label: w, count: 1, mine: true }); });
    // บนมือถือแสดงแค่คำเด่น 28 อันดับแรก (กับคำของฉันเสมอ) เพื่อให้อ่านออก
    list.sort((a, b) => b.count - a.count);
    const top = list.filter((x, i) => i < 28 || x.mine);
    WC.renderCloud(box, top, WC.palette(state.tone || 0, false), { W: W, H: H, scale: 52, minSize: 12 });
  }
  function showSentView() {
    if ($('#sSent').hidden) return;
    $('#qTitle2').textContent = state.question || '';
    const hidden = !!state.hideResults;
    $('#cloudBox').hidden = hidden;
    $('#hiddenBox').hidden = !hidden;
    $('#btnMore').hidden = !(remaining() > 0 && state.status === 'open');
    if (!hidden) drawCloud();
  }
  function showSent() {
    WC.applyAccent(state.tone || 0);
    if (state.status === 'closed' && mine.length === 0) { show('sClosed'); return; }
    show('sSent');
    $('#qTitle2').textContent = state.question || '';
    const hidden = !!state.hideResults;
    $('#cloudBox').hidden = hidden;
    $('#hiddenBox').hidden = !hidden;
    $('#btnMore').hidden = !(remaining() > 0 && state.status === 'open');
    if (!hidden) drawCloud();
    clearInterval(timer);
    const tick = async () => {
      if (document.hidden || editing) return;
      await refresh();
      showSentView();
    };
    // ช่วงแรกดึงถี่ขึ้นเล็กน้อย เพื่อให้เห็นผลเร็ว แล้วค่อยทุก 15 วินาที
    clearTimeout(quick1); clearTimeout(quick2);
    quick1 = setTimeout(tick, 2500);
    quick2 = setTimeout(tick, 6000);
    timer = setInterval(tick, 15000);
  }
  $('#btnMore').addEventListener('click', () => { editing = true; clearInterval(timer); show('sEdit'); renderEdit(); });

  /* ---------- เริ่ม ---------- */
  WC.applyAccent(state.tone || 0);
  if (mine.length > 0) showSent();
  else if (state.status === 'closed') show('sClosed');
  else { show('sEdit'); renderEdit(); input.focus({ preventScroll: true }); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!$('#sSent').hidden && !state.hideResults) drawCloud(); });
})();
