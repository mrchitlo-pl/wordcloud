/* หน้าวิเคราะห์ + รวมคำ */
(async function () {
  'use strict';
  const $ = WC.$;
  const db = await WC.initDB();
  const sid = WC.qs('s');
  const back = () => { location.replace('index.html'); };
  if (!sid || !db.user || !db.user.isHost) return back();
  $('#navCloud').href = 'host.html?s=' + encodeURIComponent(sid);

  let sess = null, settings = null, answers = [];
  let fieldIdx = 0, valueIdx = 0, query = '';
  const dirty = {};
  const isDirty = (k) => dirty[k] && Date.now() - dirty[k] < 3000;
  const err = (e) => { console.error(e); alert('บันทึกไม่สำเร็จ: ' + (e && e.message ? e.message : e)); };

  const pendingPatch = {};
  const persist = WC.debounce(() => {
    const patch = {};
    Object.keys(pendingPatch).forEach((k) => { patch[k] = settings[k]; delete pendingPatch[k]; });
    if (Object.keys(patch).length) db.updateSettings(sid, patch).catch(err);
  }, 400);
  function save(patch) {
    Object.assign(settings, patch);
    Object.keys(patch).forEach((k) => { pendingPatch[k] = true; dirty[k] = Date.now(); });
    render();
    persist();
  }

  const MODES = [['off', 'ปิด'], ['auto', 'อัตโนมัติ'], ['confirm', 'ให้ยืนยัน']];
  const NOTES = {
    off: 'ไม่เสนอและไม่รวมคำ ก้อนเมฆแสดงตามที่พิมพ์',
    auto: 'รวมให้เองเฉพาะคำสะกดใกล้เคียงที่พบน้อยมาก (ไม่เกิน 2 ครั้ง) คู่อื่นทั้งหมดรอให้ยืนยัน และเลิกรวมได้',
    confirm: 'เสนอทุกคู่ที่ดูใกล้เคียง ไม่รวมจนกว่าจะกดยืนยัน'
  };

  function groupDefs() {
    const defs = [{ key: null, name: 'ไม่แยก', values: ['ทั้งหมด'] }];
    (settings.fields || []).filter((f) => f.on).forEach((f) => {
      defs.push({ key: f.key, name: WC.fieldLabel(f), values: WC.parseList(f.options, 12, 20).concat(['ไม่ได้ตอบ']) });
    });
    return defs;
  }

  const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '—');
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  function render() {
    WC.applyAccent(settings.tone);
    $('#qText').textContent = settings.question || '(ยังไม่ได้ตั้งคำถาม)';

    // ตัวกรอง
    const defs = groupDefs();
    if (fieldIdx >= defs.length) { fieldIdx = 0; valueIdx = 0; }
    const def = defs[fieldIdx];
    if (valueIdx >= def.values.length) valueIdx = 0;
    WC.seg($('#fieldSeg'), defs.map((d) => d.name), fieldIdx, (i) => { fieldIdx = i; valueIdx = 0; render(); });
    $('#valueRow').hidden = fieldIdx === 0;
    $('#minRow').hidden = fieldIdx === 0;
    if (fieldIdx > 0) {
      WC.seg($('#valueSeg'), def.values, valueIdx, (i) => { valueIdx = i; render(); });
      WC.seg($('#minSeg'), ['ไม่ซ่อน', '3', '5', '10'], [0, 3, 5, 10].indexOf(settings.minGroup), (i) => save({ minGroup: [0, 3, 5, 10][i] }));
    }
    let filterFn = null;
    if (fieldIdx > 0) {
      const val = def.values[valueIdx];
      filterFn = (a) => {
        const v = a.fields && a.fields[def.key];
        return val === 'ไม่ได้ตอบ' ? !v : v === val;
      };
    }
    const groupAnswers = filterFn ? answers.filter(filterFn) : answers;
    const suppressed = fieldIdx > 0 && settings.minGroup > 0 && groupAnswers.length < settings.minGroup;
    $('#suppressed').hidden = !suppressed;
    if (suppressed) $('#suppressedText').textContent = 'กลุ่มนี้มี ' + groupAnswers.length + ' คำตอบ น้อยกว่าเกณฑ์ ' + settings.minGroup + ' จึงซ่อนผลไว้ เพื่อกันไม่ให้ระบุได้ว่าใครตอบ';

    const items = suppressed ? [] : WC.buildItems(groupAnswers, settings);
    const ms = WC.mergeState(items, settings);
    const n = items.reduce((a, x) => a + x[1], 0);
    const changed = items.reduce((a, x) => a + (ms.resolve(x[0]) === x[0] ? 0 : x[1]), 0);

    $('#kAnswers').textContent = fmt(n);
    $('#kRaw').textContent = fmt(items.length);
    $('#kMerged').textContent = fmt(ms.eff.length);
    $('#kShare').textContent = n ? Math.round(changed / n * 100) + '%' : '0%';

    // พรีวิวก้อนเมฆ
    const pv = $('#pv');
    const W = Math.max(300, Math.min(700, pv.clientWidth || 600));
    const H = Math.round(W * 0.6);
    pv.style.height = H + 'px';
    WC.renderCloud(pv, ms.eff.slice(0, 80).map((e) => ({ key: e.word, label: e.word, count: e.count })), WC.palette(settings.tone, false), { W: W, H: H, scale: 40, minSize: 11 });

    // แท่ง
    const bars = $('#bars');
    bars.replaceChildren();
    const maxC = ms.eff.length ? ms.eff[0].count : 1;
    ms.eff.slice(0, 8).forEach((e) => {
      const fill = WC.el('div', { class: 'bar-fill' });
      fill.style.width = Math.max(2, Math.round(e.count / maxC * 100)) + '%';
      bars.appendChild(WC.el('div', { class: 'bar-row' }, [
        WC.el('div', {}, [WC.el('span', { text: e.word, style: 'font-weight:500' }), e.variants.length ? WC.el('small', { text: 'รวมจาก ' + e.variants.join(' · ') }) : '']),
        WC.el('div', { class: 'bar-track' }, [fill]),
        WC.el('span', { class: 'n', text: fmt(e.count) })
      ].filter((x) => x !== '')));
    });

    // ตาราง
    const rows = $('#rows');
    rows.replaceChildren();
    const q = query.trim();
    ms.eff.filter((e) => !q || e.word.indexOf(q) >= 0 || e.variants.join(' ').indexOf(q) >= 0).forEach((e) => {
      rows.appendChild(WC.el('tr', {}, [
        WC.el('td', { text: e.word, style: 'font-weight:500' }),
        WC.el('td', { class: 'num', text: fmt(e.count) }),
        WC.el('td', { class: 'num', text: pct(e.count, n) }),
        WC.el('td', { text: e.variants.length ? e.variants.join(' · ') : '—', style: 'color:var(--muted)' })
      ]));
    });

    // แผงรวมคำ
    WC.seg($('#modeSeg'), MODES.map((m) => m[1]), MODES.findIndex((m) => m[0] === settings.mode), (i) => save({ mode: MODES[i][0] }));
    $('#modeSeg').querySelectorAll('.seg-btn').forEach((b) => { b.style.flex = '1'; });
    $('#modeNote').textContent = NOTES[settings.mode] || '';
    const setIdle = (el, v) => { if (document.activeElement !== el && el.value !== v) el.value = v; };
    setIdle($('#syn'), settings.syn || '');
    setIdle($('#prot'), settings.protectedText || '');

    const pending = ms.pairs.filter((p) => p.status === 'pending');
    $('#pendCount').textContent = pending.length + ' คู่';
    const pl = $('#pending');
    pl.replaceChildren();
    const decide = (key, v) => save({ decisions: Object.assign({}, settings.decisions, { [key]: v }) });
    pending.forEach((p) => {
      pl.appendChild(WC.el('div', { class: 'pair' }, [
        WC.el('div', { class: 'row wrap-r', style: 'align-items:baseline; gap:4px 8px' }, [
          WC.el('span', { text: p.from + ' → ' + p.to, style: 'font-weight:500' }),
          WC.el('span', { class: 'note', text: p.fromN + ' + ' + p.toN + ' ครั้ง', style: 'font-size:13px' })
        ]),
        WC.el('div', { class: 'note', text: p.reason, style: 'font-size:13px; font-weight:500' }),
        WC.el('div', { class: 'row' }, [
          WC.el('button', { type: 'button', class: 'btn accent', style: 'flex:1', text: 'รวม', 'aria-label': 'รวม ' + p.from + ' เข้ากับ ' + p.to, onclick: () => decide(p.key, 'merge') }),
          WC.el('button', { type: 'button', class: 'btn', style: 'flex:1', text: 'ไม่รวม', 'aria-label': 'ไม่รวม ' + p.from + ' กับ ' + p.to, onclick: () => decide(p.key, 'skip') })
        ])
      ]));
    });
    $('#noPending').hidden = pending.length > 0;
    $('#mergeAll').hidden = pending.length === 0;
    $('#mergeAll').onclick = () => {
      const d = Object.assign({}, settings.decisions);
      pending.forEach((p) => { d[p.key] = 'merge'; });
      save({ decisions: d });
    };

    const done = ms.pairs.filter((p) => p.status === 'merge' || p.status === 'auto');
    const dl = $('#done');
    dl.replaceChildren();
    done.forEach((p) => {
      dl.appendChild(WC.el('div', { class: 'row', style: 'font-size:15px' }, [
        WC.el('div', { class: 'stack', style: 'gap:0; padding-block:6px' }, [
          WC.el('span', { text: p.from + ' → ' + p.to }),
          WC.el('span', { class: 'note', style: 'font-size:12px', text: p.status === 'auto' ? 'รวมอัตโนมัติ' : 'ยืนยันโดยผู้จัด' })
        ]),
        WC.el('button', {
          type: 'button', class: 'btn ghost', style: 'color:var(--ink); text-decoration:underline; min-height:44px; padding:0 8px', text: 'เลิกรวม', 'aria-label': 'เลิกรวม ' + p.from,
          onclick: () => {
            const d = Object.assign({}, settings.decisions);
            if (p.status === 'auto') d[p.key] = 'skip'; else delete d[p.key];
            save({ decisions: d });
          }
        })
      ]));
    });
    $('#noDone').hidden = done.length > 0;
  }

  $('#syn').addEventListener('input', (e) => save({ syn: e.target.value }));
  $('#prot').addEventListener('input', (e) => save({ protectedText: e.target.value }));
  $('#s').addEventListener('input', (e) => { query = e.target.value; render(); });
  $('#btnCsv').addEventListener('click', () => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    WC.download('wordcloud-' + sess.code + '-' + stamp + '.csv', WC.answersCsv(answers, settings, sess.code));
  });

  db.watchSession(sid, (s) => {
    if (!s) return back();
    sess = s;
    const remote = s.settings || {};
    if (!settings) settings = Object.assign(WC.defaultSettings(''), remote);
    else Object.keys(remote).forEach((k) => { if (!dirty[k] || Date.now() - dirty[k] > 3000) settings[k] = remote[k]; });
    $('#boot') && $('#boot').remove();
    $('#app').hidden = false;
    render();
  }, (e) => { console.error(e); });
  db.watchAnswers(sid, (list) => { answers = list; if (settings) render(); }, (e) => console.error(e));
  if ('ResizeObserver' in window) {
    let t = null;
    new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { if (settings) render(); }, 150); }).observe($('#pv').parentElement);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (settings) render(); });
  window.addEventListener('beforeunload', () => persist.flush());
  void isDirty;
})();
