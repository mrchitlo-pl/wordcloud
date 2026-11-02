/* หน้าแรก: เข้าสู่ระบบผู้จัด สร้างและเลือกกิจกรรม */
(async function () {
  'use strict';
  const $ = WC.$;
  const views = ['vBoot', 'vSignin', 'vHome'];
  const show = (id) => views.forEach((v) => { $('#' + v).hidden = v !== id; });
  const db = await WC.initDB();

  async function enter() {
    const u = db.user;
    if (!u || !u.isHost) {
      show('vSignin');
      $('#btnOut').hidden = !u || u.anon;
      if (u && !u.anon && !u.isHost) $('#inErr').textContent = 'บัญชี ' + u.email + ' ไม่ใช่บัญชีผู้จัดที่ตั้งไว้ ลองออกจากระบบแล้วเข้าด้วยบัญชีอื่น';
      return;
    }
    show('vHome');
    $('#btnOut').hidden = db.mode === 'local';
    await loadList();
  }

  async function loadList() {
    let list = [];
    try { list = await db.listSessions(); } catch (e) { console.error(e); $('#newErr').textContent = 'โหลดรายการไม่สำเร็จ: ' + (e.code || e.message); return; }
    // ลบกิจกรรมที่หมดอายุ
    const limit = Date.now() - WC.EXPIRE_HOURS * 3600 * 1000;
    const old = list.filter((s) => s.createdAtMs && s.createdAtMs < limit);
    let deleted = 0;
    for (const s of old) {
      try { await db.deleteSession(s.sid); deleted++; } catch (e) { console.error(e); }
    }
    if (deleted) {
      list = list.filter((s) => !old.some((o) => o.sid === s.sid));
      $('#cleanNote').hidden = false;
      $('#cleanNote').textContent = 'ลบกิจกรรมที่เก่ากว่า ' + WC.EXPIRE_HOURS + ' ชั่วโมงแล้ว ' + deleted + ' รายการ';
    }
    $('#listWrap').hidden = list.length === 0;
    const box = $('#list');
    box.replaceChildren();
    list.forEach((s) => {
      const left = Math.max(0, Math.round(WC.EXPIRE_HOURS - (Date.now() - s.createdAtMs) / 3600000));
      box.appendChild(WC.el('div', { class: 'pair' }, [
        WC.el('div', { class: 'row wrap-r', style: 'align-items:baseline; gap:4px 12px' }, [
          WC.el('span', { text: s.question || '(ไม่มีคำถาม)', style: 'font-weight:500' }),
          WC.el('span', { class: 'note', text: 'รหัส ' + s.code + ' · ลบอัตโนมัติใน ~' + left + ' ชม.' })
        ]),
        WC.el('div', { class: 'row', style: 'justify-content:flex-start; flex-wrap:wrap; gap:8px' }, [
          WC.el('a', { class: 'btn accent', href: 'host.html?s=' + encodeURIComponent(s.sid), text: 'เปิดก้อนเมฆ' }),
          WC.el('a', { class: 'btn', href: 'analysis.html?s=' + encodeURIComponent(s.sid), text: 'วิเคราะห์' }),
          WC.el('button', {
            type: 'button', class: 'btn danger', text: 'ลบ', 'aria-label': 'ลบกิจกรรมรหัส ' + s.code,
            onclick: async () => {
              if (!confirm('ลบกิจกรรมรหัส ' + s.code + ' พร้อมคำตอบทั้งหมด? กู้คืนไม่ได้ (ควรส่งออกก่อน)')) return;
              try { await db.deleteSession(s.sid); await loadList(); } catch (e) { alert('ลบไม่สำเร็จ: ' + (e.code || e.message)); }
            }
          })
        ])
      ]));
    });
  }

  /* ---------- ตั้งค่าก่อนเริ่ม: คำต่อคน + หัวข้อข้อมูลผู้ตอบ ---------- */
  let newLimit = 3;
  let newFields = [];
  function renderLimit() {
    WC.seg($('#newLimit'), ['1', '2', '3', '5'], [1, 2, 3, 5].indexOf(newLimit), (i) => { newLimit = [1, 2, 3, 5][i]; renderLimit(); });
  }
  const editor = WC.fieldEditor($('#newFields'), {
    get: () => newFields,
    set: (f) => { newFields = f; editor.sync(); },
    locked: () => false
  });
  renderLimit();
  editor.sync();

  $('#newForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('#newQ').value.trim();
    $('#newErr').textContent = '';
    if (!q) { $('#newErr').textContent = 'พิมพ์คำถามก่อน'; return; }
    for (const f of newFields) {
      if (String(f.label).trim() === '') { $('#newErr').textContent = 'ใส่ชื่อหัวข้อให้ครบ หรือลบหัวข้อที่ไม่ใช้'; return; }
      if (WC.parseOpts(f.options).length === 0) { $('#newErr').textContent = 'หัวข้อ "' + f.label.trim() + '" ยังไม่มีตัวเลือก'; return; }
    }
    $('#btnNew').disabled = true;
    try {
      const settings = WC.defaultSettings(q);
      settings.limit = newLimit;
      settings.fields = newFields.map((f) => ({ key: f.key, label: f.label.trim(), options: f.options }));
      const r = await db.createSession(settings);
      location.href = 'host.html?s=' + encodeURIComponent(r.sid);
    } catch (err) {
      console.error(err);
      $('#newErr').textContent = 'สร้างไม่สำเร็จ: ' + (err.code || err.message);
      $('#btnNew').disabled = false;
    }
  });
  $('#btnIn').addEventListener('click', async () => {
    $('#inErr').textContent = '';
    try { await db.signInHost(); } catch (e) { $('#inErr').textContent = 'เข้าสู่ระบบไม่สำเร็จ: ' + (e.code || e.message); }
  });
  $('#btnOut').addEventListener('click', async () => { await db.signOut(); location.reload(); });
  db.onAuth(() => { if (db.mode === 'firebase') enter(); });

  await enter();
})();
