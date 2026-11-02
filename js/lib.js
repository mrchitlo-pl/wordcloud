/* Word Cloud — ฟังก์ชันกลางที่ใช้ร่วมกันทุกหน้า */
(function () {
  'use strict';
  const WC = (window.WC = window.WC || {});

  /* ---------- ค่าคงที่ ---------- */
  WC.ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // ตัดตัวที่สับสนง่าย: 0 O 1 I L
  WC.CODE_LEN = 4;
  WC.EXPIRE_HOURS = 48;
  WC.MAX_WORD_LEN = 30;
  WC.MAX_LIMIT = 5;

  WC.genCode = function () {
    let s = '';
    for (let i = 0; i < WC.CODE_LEN; i++) s += WC.ALPHABET[Math.floor(Math.random() * WC.ALPHABET.length)];
    return s;
  };

  WC.TONES = [
    { name: 'เขียว-ดำ', accent: '#047857', mid: '#0A0F0D', low: '#4B5A55', d: ['#4ADE80', '#ECFDF5', '#9CB3A9'] },
    { name: 'คราม-ดำ', accent: '#4338CA', mid: '#111827', low: '#52586A', d: ['#A5B4FC', '#EEF2FF', '#A0A6C0'] },
    { name: 'ฟ้า-ดำ', accent: '#0369A1', mid: '#0F172A', low: '#4F5F70', d: ['#38BDF8', '#E0F2FE', '#9AA9B8'] },
    { name: 'ส้ม-ดำ', accent: '#C2410C', mid: '#1C1410', low: '#6B5A50', d: ['#FB923C', '#FFEDD5', '#B8A394'] },
    { name: 'ชมพู-ดำ', accent: '#BE185D', mid: '#1A0F14', low: '#6E5560', d: ['#F472B6', '#FCE7F3', '#BFA3AF'] },
    { name: 'ขาว-ดำ', accent: '#0A0F0D', mid: '#374151', low: '#5B6470', d: ['#FFFFFF', '#E5E7EB', '#9CA3AF'] }
  ];
  WC.SIZES = [['เล็ก', 44], ['กลาง', 60], ['ใหญ่', 74]];
  WC.MAXES = [['ทั้งหมด', 9999], ['30', 30], ['15', 15]];
  WC.palette = function (toneIdx, dark) {
    const t = WC.TONES[toneIdx] || WC.TONES[0];
    return dark ? { a: t.d[0], m: t.d[1], l: t.d[2] } : { a: t.accent, m: t.mid, l: t.low };
  };

  /* ---------- หัวข้อข้อมูลผู้ตอบ ---------- */
  WC.MAX_FIELDS = 5;      // หัวข้อสูงสุดต่อกิจกรรม
  WC.MAX_OPTIONS = 20;    // ตัวเลือกสูงสุดต่อหัวข้อ
  WC.MAX_OPT_LEN = 30;    // ความยาวตัวเลือก
  WC.MISSING = 'ไม่ได้ตอบ'; // ค่าแทนผู้ที่ไม่ได้เลือกหัวข้อนั้น

  // ชุดเริ่มต้น (แก้ไข เพิ่ม ลบ ได้ทั้งหมดหลังเลือก)
  WC.PRESETS = [
    { name: 'ห้องเรียน', fields: [
      { label: 'ระดับชั้น', options: 'ม.1, ม.2, ม.3, ม.4, ม.5, ม.6' },
      { label: 'ห้อง', options: 'ห้อง 1, ห้อง 2, ห้อง 3, ห้อง 4, ห้อง 5, ห้อง 6' },
      { label: 'เพศ', options: 'ชาย, หญิง, อื่นๆ' }] },
    { name: 'อบรม/สัมมนา', fields: [
      { label: 'หน่วยงาน', options: 'หน่วยงาน 1, หน่วยงาน 2, หน่วยงาน 3' },
      { label: 'ตำแหน่ง', options: 'ผู้บริหาร, ครู, เจ้าหน้าที่, อื่นๆ' },
      { label: 'ประสบการณ์', options: 'น้อยกว่า 5 ปี, 5-10 ปี, 11-20 ปี, มากกว่า 20 ปี' },
      { label: 'ครั้งที่เข้าร่วม', options: 'ครั้งแรก, เคยเข้าร่วมแล้ว' }] },
    { name: 'ก่อน-หลัง', fields: [
      { label: 'ช่วง', options: 'ก่อนเรียน, หลังเรียน' },
      { label: 'ห้อง', options: 'ห้อง 1, ห้อง 2, ห้อง 3, ห้อง 4' }] },
    { name: 'สะท้อนผู้สอน', fields: [
      { label: 'รอบ/วัน', options: 'รอบ 1, รอบ 2, รอบ 3' },
      { label: 'กลุ่ม', options: 'กลุ่ม A, กลุ่ม B, กลุ่ม C' }] },
    { name: 'ว่าง', fields: [] }
  ];
  WC.newKey = function (taken) {
    let k;
    do { k = 'f' + Math.random().toString(36).slice(2, 6); } while (taken && taken.indexOf(k) >= 0);
    return k;
  };
  WC.presetFields = function (preset) {
    const keys = [];
    return preset.fields.map((f) => { const k = WC.newKey(keys); keys.push(k); return { key: k, label: f.label, options: f.options }; });
  };

  WC.defaultSettings = function (question) {
    return {
      question: question || '',
      tone: 0, dark: false, sizeIdx: 1, maxIdx: 0, showCounts: false,
      hideResults: false, closed: false, limit: 3,
      fields: [],
      removed: [], blocked: '',
      mode: 'confirm', protectedText: '', syn: 'ไว้ใจ=เชื่อใจ', decisions: {}, minGroup: 0
    };
  };

  WC.fieldLabel = (f) => (String(f.label || '').trim() || (f.custom ? 'หัวข้อของคุณเอง' : 'หัวข้อ'));
  WC.parseList = function (text, maxItems, maxLen) {
    return String(text || '')
      .split(/[,，、\n]/)
      .map((x) => x.trim().slice(0, maxLen || 30))
      .filter((x, i, a) => x.length > 0 && a.indexOf(x) === i)
      .slice(0, maxItems || 12);
  };
  const parseOpts = (t) => WC.parseList(t, WC.MAX_OPTIONS, WC.MAX_OPT_LEN);
  WC.parseOpts = parseOpts;

  // รับรูปแบบเก่า (มี on/custom) หรือใหม่ -> [{key,label,options}] เฉพาะหัวข้อที่ใช้อยู่
  WC.normFields = function (fields) {
    return (fields || [])
      .filter((f) => f && (f.on === undefined || f.on === true))
      .map((f) => ({ key: f.key, label: f.on === undefined ? String(f.label || '') : WC.fieldLabel(f), options: String(f.options || '') }))
      .slice(0, WC.MAX_FIELDS);
  };
  // สำหรับส่งให้ผู้ตอบ (ตัดหัวข้อที่ไม่มีตัวเลือก)
  WC.publicFields = function (fields) {
    return WC.normFields(fields)
      .map((f) => ({ key: f.key, label: String(f.label || '').trim() || 'หัวข้อ', options: parseOpts(f.options) }))
      .filter((f) => f.options.length > 0);
  };

  /* ---------- ตัวกรองซ้อนหลายหัวข้อ ---------- */
  // defs: [{key,name,values[]}] ; sel: {key: [ค่าที่เลือก]} ภายในหัวข้อเดียว = "หรือ" ข้ามหัวข้อ = "และ"
  WC.fieldDefs = function (settings) {
    return WC.publicFields(settings.fields).map((f) => ({ key: f.key, name: f.label, values: f.options.concat([WC.MISSING]) }));
  };
  WC.selPrune = function (defs, sel) {
    Object.keys(sel).forEach((k) => {
      const d = defs.find((x) => x.key === k);
      if (!d) { delete sel[k]; return; }
      sel[k] = sel[k].filter((v) => d.values.indexOf(v) >= 0);
      if (!sel[k].length) delete sel[k];
    });
  };
  WC.selFilter = function (defs, sel) {
    const act = defs.filter((d) => sel[d.key] && sel[d.key].length);
    if (!act.length) return null;
    return (a) => act.every((d) => {
      const v = a.fields && a.fields[d.key];
      return sel[d.key].some((x) => (x === WC.MISSING ? !v : v === x));
    });
  };
  WC.selLabel = (defs, sel) => defs.filter((d) => sel[d.key] && sel[d.key].length).map((d) => d.name + ': ' + sel[d.key].join(' หรือ ')).join(' · ');
  WC.selCount = (sel) => Object.keys(sel).filter((k) => sel[k] && sel[k].length).length;
  WC.filterPanel = function (container, defs, sel, onChange) {
    container.replaceChildren();
    defs.forEach((d) => {
      const cur = sel[d.key] || [];
      const row = WC.el('div', { class: 'chips', style: 'gap:8px' });
      row.appendChild(WC.el('button', {
        type: 'button', class: 'fchip', text: 'ทั้งหมด', 'aria-pressed': cur.length === 0 ? 'true' : 'false',
        onclick: () => { delete sel[d.key]; onChange(); }
      }));
      d.values.forEach((v) => {
        row.appendChild(WC.el('button', {
          type: 'button', class: 'fchip', text: v, 'aria-pressed': cur.indexOf(v) >= 0 ? 'true' : 'false',
          onclick: () => {
            const c = (sel[d.key] || []).slice();
            const i = c.indexOf(v);
            if (i >= 0) c.splice(i, 1); else c.push(v);
            if (c.length) sel[d.key] = c; else delete sel[d.key];
            onChange();
          }
        }));
      });
      container.appendChild(WC.el('div', { class: 'stack', style: 'gap:8px' }, [WC.el('div', { class: 'label', text: d.name }), row]));
    });
  };

  /* ---------- ตัวแก้ "ข้อมูลที่อยากถามผู้ตอบ" (ใช้ทั้งหน้าสร้างกิจกรรมและหน้าก้อนเมฆ) ---------- */
  // api: { get(): fields[], set(fields[]), locked(): boolean }
  WC.fieldEditor = function (container, api) {
    let sig = null;
    let rows = [];
    let previewBox = null;
    let animKey = null;   // ข้อมูลที่เพิ่งเพิ่ม (ให้เคลื่อนไหวเฉพาะอันนี้)

    // ตัวอย่างสิ่งที่ผู้ตอบเห็น
    function renderPreview(fields) {
      if (!previewBox) return;
      previewBox.replaceChildren();
      const pf = WC.publicFields(fields);
      previewBox.hidden = pf.length === 0;
      if (!pf.length) return;
      previewBox.appendChild(WC.el('div', { class: 'label', text: 'ตัวอย่างที่ผู้ตอบเห็น' }));
      const phone = WC.el('div', { class: 'pv-phone' });
      phone.appendChild(WC.el('div', { class: 'pv-word', text: 'ช่องใส่คำของผู้ตอบ' }));
      pf.forEach((f) => {
        const box = WC.el('div', { class: 'pv-field' }, [WC.el('div', { class: 'pv-label', text: f.label })]);
        if (f.options.length > 8) {
          box.appendChild(WC.el('div', { class: 'pv-select', text: '— เลือก —  ▾  (' + f.options.length + ' ตัวเลือก)' }));
        } else {
          const chips = WC.el('div', { class: 'pv-chips' });
          f.options.forEach((o) => chips.appendChild(WC.el('span', { class: 'pv-chip', text: o })));
          box.appendChild(chips);
        }
        phone.appendChild(box);
      });
      previewBox.appendChild(phone);
    }

    function presetCards(hasFields) {
      const wrap = WC.el('div', { class: 'stack', style: 'gap:10px' });
      wrap.appendChild(WC.el('div', { class: 'label', text: hasFields ? 'เปลี่ยนไปใช้ชุดสำเร็จรูปอื่น' : 'เริ่มจากชุดสำเร็จรูป (เลือกแล้วแก้ต่อได้ทั้งหมด)' }));
      const grid = WC.el('div', { class: 'preset-grid' });
      WC.PRESETS.forEach((p) => {
        grid.appendChild(WC.el('button', {
          type: 'button', class: 'preset-card',
          onclick: () => {
            if (api.get().length && !confirm('แทนที่ข้อมูลที่ตั้งไว้ด้วยชุด "' + p.name + '"?')) return;
            api.set(WC.presetFields(p));
          }
        }, [
          WC.el('span', { class: 'pc-name', text: p.name }),
          WC.el('span', { class: 'pc-desc', text: p.fields.length ? p.fields.map((f) => f.label).join(' · ') : 'ไม่ถามอะไรเพิ่ม' })
        ]));
      });
      wrap.appendChild(grid);
      return wrap;
    }

    function fieldCard(f, i, locked) {
      const upd = (patch) => api.set(api.get().map((x, j) => (j === i ? Object.assign({}, x, patch) : x)));
      const name = WC.el('input', { type: 'text', class: 'input white', placeholder: 'เช่น ตำแหน่ง', 'aria-label': 'ข้อมูลที่ ' + (i + 1) + ' ถามว่า', maxlength: '30', value: f.label });
      name.addEventListener('input', () => upd({ label: name.value }));

      const chipsWrap = WC.el('span', { class: 'tags' });
      const input = WC.el('input', { type: 'text', class: 'taginput', placeholder: 'พิมพ์ตัวเลือก แล้วกด Enter', 'aria-label': 'เพิ่มตัวเลือกของข้อมูลที่ ' + (i + 1), autocomplete: 'off' });
      const over = WC.el('div', { class: 'over', role: 'status' });
      const box = WC.el('div', { class: 'tagbox' }, [chipsWrap, input]);
      box.addEventListener('click', () => input.focus());
      let lastOpts = null, overTimer = null;
      let shown = null;   // ตัวเลือกที่แสดงอยู่ (เพื่อให้เฉพาะป้ายใหม่เคลื่อนไหว)
      const cur = () => api.get()[i] ? parseOpts(api.get()[i].options) : [];
      function renderTags() {
        const opts = cur();
        lastOpts = api.get()[i] ? api.get()[i].options : '';
        chipsWrap.replaceChildren();
        opts.forEach((o, k) => {
          const chip = WC.el('span', { class: 'tag-chip' + (shown && shown.indexOf(o) < 0 ? ' tag-new' : '') }, [WC.el('span', { text: o })]);
          if (!locked) chip.appendChild(WC.el('button', {
            type: 'button', 'aria-label': 'ลบตัวเลือก ' + o, text: '×',
            onclick: (e) => { e.stopPropagation(); upd({ options: cur().filter((_, j) => j !== k).join(', ') }); }
          }));
          chipsWrap.appendChild(chip);
        });
        shown = opts.slice();
      }
      function addTokens(text) {
        const tokens = String(text).split(/[,，、\n]/).map((x) => x.trim().slice(0, WC.MAX_OPT_LEN)).filter(Boolean);
        if (!tokens.length) return;
        const list = cur();
        let overflow = 0;
        tokens.forEach((t) => {
          if (list.indexOf(t) >= 0) return;
          if (list.length >= WC.MAX_OPTIONS) { overflow++; return; }
          list.push(t);
        });
        upd({ options: list.join(', ') });
        if (overflow) {
          over.textContent = 'เกิน ' + WC.MAX_OPTIONS + ' ค่า ตัดทิ้ง ' + overflow + ' ค่า';
          clearTimeout(overTimer);
          overTimer = setTimeout(() => { over.textContent = ''; }, 4500);
        }
      }
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTokens(input.value); input.value = ''; }
        else if (e.key === 'Backspace' && input.value === '') { const l = cur(); if (l.length) upd({ options: l.slice(0, -1).join(', ') }); }
      });
      input.addEventListener('input', () => { if (/[,，、\n]/.test(input.value)) { addTokens(input.value); input.value = ''; } });
      input.addEventListener('blur', () => { if (input.value.trim()) { addTokens(input.value); input.value = ''; } });
      renderTags();
      if (locked) { name.disabled = true; input.disabled = true; input.placeholder = ''; }

      const head = WC.el('div', { class: 'row' }, [WC.el('strong', { text: 'ข้อมูลที่ ' + (i + 1) })]);
      if (!locked) head.appendChild(WC.el('button', {
        type: 'button', class: 'btn ghost', style: 'min-height:36px; padding:0 8px; color:var(--danger)', text: 'ลบ',
        'aria-label': 'ลบข้อมูลที่ ' + (i + 1),
        onclick: () => api.set(api.get().filter((x, j) => j !== i))
      }));
      const card = WC.el('div', { class: 'fieldbox' + (f.key === animKey ? ' field-in' : '') }, [
        head,
        WC.el('div', { class: 'stack', style: 'gap:4px' }, [WC.el('label', { class: 'label', text: 'ถามผู้ตอบว่า' }), name]),
        WC.el('div', { class: 'stack', style: 'gap:4px' }, [WC.el('label', { class: 'label', text: 'ตัวเลือกให้เลือก (พิมพ์แล้วกด Enter หรือจุลภาค วางรายการยาวๆ ได้)' }), box, over])
      ]);
      return { card: card, name: name, renderTags: renderTags, getLast: () => lastOpts, input: input };
    }

    function build(fields, locked) {
      container.replaceChildren();
      rows = [];
      if (!fields.length && !locked) {
        container.appendChild(WC.el('div', { class: 'empty-card' }, [
          WC.el('strong', { text: 'ตอนนี้ผู้ตอบจะเห็นแค่ช่องใส่คำ' }),
          WC.el('span', { class: 'note', text: 'ถ้าอยากรู้ว่าผู้ตอบมาจากกลุ่มไหน เช่น ระดับชั้น ตำแหน่ง หรือหน่วยงาน ให้เพิ่มข้อมูลที่อยากถาม แล้วดูผลแยกกลุ่มได้ในโหมดนำเสนอและหน้าวิเคราะห์ ผู้ตอบข้ามได้ ไม่เก็บชื่อ' })
        ]));
      }
      if (!locked && !fields.length) container.appendChild(presetCards(false));
      fields.forEach((f, i) => {
        const r = fieldCard(f, i, locked);
        rows.push(r);
        container.appendChild(r.card);
      });
      if (!locked) {
        const add = WC.el('button', {
          type: 'button', class: 'btn', style: 'align-self:flex-start',
          text: fields.length ? '+ เพิ่มข้อมูลที่อยากถาม' : '+ เพิ่มข้อมูลที่อยากถามเอง',
          onclick: () => {
            const cur = api.get();
            animKey = WC.newKey(cur.map((x) => x.key));
            api.set(cur.concat([{ key: animKey, label: '', options: '' }]));
          }
        });
        if (fields.length >= WC.MAX_FIELDS) { add.disabled = true; add.textContent = 'ครบ ' + WC.MAX_FIELDS + ' ข้อมูลแล้ว'; }
        container.appendChild(add);
        if (fields.length) container.appendChild(WC.el('details', { class: 'preset-more' }, [WC.el('summary', { text: 'เปลี่ยนไปใช้ชุดสำเร็จรูป' }), presetCards(true)]));
      }
      previewBox = WC.el('div', { class: 'pv-box', hidden: true });
      container.appendChild(previewBox);
    }

    return {
      sync: function () {
        const fields = api.get();
        const locked = api.locked();
        const s = fields.map((f) => f.key).join(',') + '|' + locked;
        if (s !== sig) { sig = s; build(fields, locked); }
        else rows.forEach((r, i) => {
          if (!fields[i]) return;
          if (document.activeElement !== r.name && r.name.value !== fields[i].label) r.name.value = fields[i].label;
          if (r.getLast() !== fields[i].options) r.renderTags();
        });
        renderPreview(fields);
      }
    };
  };

  /* ---------- ตัวเลขนับขึ้นนุ่มนวล ---------- */
  WC.countTo = function (el, to, fmt, suffix) {
    fmt = fmt || ((n) => String(n));
    suffix = suffix || '';
    const from = el._v == null ? to : el._v;
    el._v = to;
    if (from === to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to) + suffix; return; }
    const t0 = performance.now(), dur = 380;
    cancelAnimationFrame(el._raf);
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e)) + suffix;
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  };

  /* ---------- ทำความสะอาดคำ ---------- */
  WC.normalize = function (s) {
    s = String(s == null ? '' : s).normalize('NFC');
    s = s.replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    s = s.replace(/([ัิ-ฺ็-๎])\1+/g, '$1'); // สระ/วรรณยุกต์ซ้ำ
    s = s.replace(/([^\d\s])\1{2,}/gu, '$1'); // ตัวอักษรซ้ำเกิน 2 ตัวติดกัน
    return s;
  };

  WC.lev = function (a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 1) return 2;
    let prev = [];
    for (let j = 0; j <= n; j++) prev.push(j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
      }
      prev = cur;
    }
    return prev[n];
  };

  WC.parseSyn = function (text) {
    return String(text || '')
      .split(/[,，\n]/)
      .map((p) => p.split('=').map((x) => WC.normalize(x)))
      .filter((p) => p.length === 2 && p[0] && p[1] && p[0] !== p[1]);
  };

  /* ---------- นับคำ ---------- */
  // answers: [{text, fields, ...}] -> [[คำ, จำนวน]] (ยังไม่รวมคำ) ตัดคำที่ซ่อน/ห้อง
  WC.buildItems = function (answers, settings, filterFn) {
    const removed = new Set((settings.removed || []).map(WC.normalize));
    const blocked = WC.parseList(settings.blocked, 100, 30).map(WC.normalize);
    const map = new Map();
    answers.forEach((a) => {
      if (filterFn && !filterFn(a)) return;
      const w = WC.normalize(a.text);
      if (!w || removed.has(w)) return;
      if (blocked.some((b) => b && w.indexOf(b) >= 0)) return;
      map.set(w, (map.get(w) || 0) + 1);
    });
    return Array.from(map.entries());
  };

  // คู่คำที่น่าจะรวมกัน + สถานะ + แผนที่ from->to
  WC.mergeState = function (items, settings) {
    const mode = settings.mode || 'confirm';
    const decisions = settings.decisions || {};
    const prot = WC.parseList(settings.protectedText, 50, 30).map(WC.normalize);
    const syn = WC.parseSyn(settings.syn);
    const pairs = [];
    if (mode !== 'off') {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          if (prot.indexOf(a[0]) >= 0 || prot.indexOf(b[0]) >= 0) continue;
          const short = a[0].length <= b[0].length ? a : b;
          const long = short === a ? b : a;
          let code = null, reason = null;
          if (syn.some((p) => (p[0] === a[0] && p[1] === b[0]) || (p[0] === b[0] && p[1] === a[0]))) { code = 'syn'; reason = 'ความหมายเดียวกัน (จากรายการคำเหมือน)'; }
          else if (short[0].length >= 3 && long[0].indexOf(short[0]) >= 0) { code = 'phrase'; reason = 'เป็นส่วนหนึ่งของวลีที่ยาวกว่า'; }
          else if (long[0].length >= 4 && WC.lev(a[0], b[0]) <= 1) { code = 'typo'; reason = 'สะกดใกล้เคียง อาจพิมพ์ผิด'; }
          if (!code) continue;
          const toA = a[1] > b[1] || (a[1] === b[1] && a[0].length >= b[0].length);
          const to = toA ? a : b, from = toA ? b : a;
          const key = [a[0], b[0]].sort().join('|');
          const d = decisions[key];
          let status = 'pending';
          if (d === 'merge') status = 'merge';
          else if (d === 'skip') status = 'skip';
          else if (mode === 'auto' && code === 'typo' && from[1] <= 2) status = 'auto';
          pairs.push({ key: key, from: from[0], to: to[0], fromN: from[1], toN: to[1], reason: reason, code: code, status: status });
        }
      }
    }
    const merges = {};
    pairs.forEach((p) => { if (p.status === 'merge' || p.status === 'auto') merges[p.from] = p.to; });
    const resolve = (t) => { let c = t; for (let k = 0; k < 6 && merges[c]; k++) c = merges[c]; return c; };
    const agg = {}, vars = {};
    items.forEach((x) => {
      const t = resolve(x[0]);
      agg[t] = (agg[t] || 0) + x[1];
      if (t !== x[0]) (vars[t] = vars[t] || []).push(x[0]);
    });
    const eff = items
      .filter((x) => resolve(x[0]) === x[0])
      .map((x) => ({ word: x[0], count: agg[x[0]], variants: vars[x[0]] || [] }))
      .sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : 1));
    return { pairs: pairs, merges: merges, resolve: resolve, eff: eff };
  };

  /* ---------- จัดวางก้อนเมฆ ---------- */
  let _ctx = null;
  function measurer() {
    if (!_ctx) _ctx = document.createElement('canvas').getContext('2d');
    return _ctx;
  }
  // words: [{label, count}] ; คืน [{x,y,w,h,size}|null] ตามลำดับเดิม
  // ปรับขนาดอัตโนมัติ: ถ้าคำเยอะจนวางไม่หมด จะลดขนาดลงทีละขั้นจนพอดี
  const STEPS = [1, 0.85, 0.72, 0.61, 0.52, 0.44, 0.37];
  WC.layout = function (words, W, H, opts) {
    opts = opts || {};
    const scale = (opts.scale == null ? 60 : opts.scale) * (W / 760);
    const minSize = (opts.minSize || 14) * Math.max(0.75, W / 760);
    const floor = 11 * Math.max(0.8, W / 760);
    const ctx = measurer();
    const counts = words.map((w) => w.count);
    const max = Math.max.apply(null, counts.concat([1]));
    const cx = W / 2, cy = H / 2;
    const A = W / 2 - 14, B = H / 2 - 14;
    const ratio = A / B;
    const order = words.map((w, i) => i).sort((a, b) => counts[b] - counts[a]);

    function attempt(f) {
      const placed = [];
      const out = new Array(words.length).fill(null);
      let n = 0;
      order.forEach((idx) => {
        const size = Math.round(Math.max(floor, (minSize + scale * Math.sqrt(counts[idx] / max)) * f));
        const weight = counts[idx] / max > 0.4 ? 700 : 500;
        ctx.font = weight + ' ' + size + 'px "Noto Sans Thai", "Sarabun", sans-serif';
        const w = Math.ceil(ctx.measureText(words[idx].label).width) + 14;
        const h = Math.ceil(size * 1.35);
        let found = null;
        for (let t = 0; t < 140 && !found; t += 0.1) {
          const r = 2.4 * t;
          const x = cx + r * Math.cos(t) * ratio;
          const y = cy + r * Math.sin(t);
          const l = x - w / 2, tp = y - h / 2;
          const inside = [[l, tp], [l + w, tp], [l, tp + h], [l + w, tp + h]].every((c) => {
            const dx = (c[0] - cx) / A, dy = (c[1] - cy) / B;
            return dx * dx + dy * dy <= 1;
          });
          if (!inside) continue;
          const clash = placed.some((p) => !(l + w + 3 <= p.l || p.l + p.w + 3 <= l || tp + h + 1 <= p.t || p.t + p.h + 1 <= tp));
          if (!clash) found = { l: l, t: tp, w: w, h: h };
        }
        if (found) {
          placed.push(found);
          n++;
          out[idx] = { x: found.l, y: found.t, w: found.w, h: found.h, size: size, weight: weight, ratio: counts[idx] / max };
        }
      });
      return { out: out, n: n };
    }

    // เริ่มจากขั้นที่ใช้ได้ครั้งก่อน (ขยับขึ้น 1 ขั้นเพื่อให้ใหญ่ขึ้นได้เมื่อคำน้อยลง)
    let startIdx = 0;
    if (opts.hint != null) {
      const hi = STEPS.indexOf(opts.hint);
      startIdx = Math.max(0, (hi < 0 ? 0 : hi) - 1);
    }
    let res = null, used = STEPS[startIdx];
    for (let i = startIdx; i < STEPS.length; i++) {
      used = STEPS[i];
      res = attempt(used);
      if (res.n === words.length) break;
    }
    res.out.f = used;
    return res.out;
  };

  // วาดลง container (position:relative) ด้วย span ที่ใช้ซ้ำ เพื่อให้ขยับนุ่มนวล
  WC.renderCloud = function (container, words, pal, opts) {
    opts = opts || {};
    const W = opts.W || container.clientWidth || 760;
    const H = opts.H || container.clientHeight || 440;
    const pos = WC.layout(words, W, H, Object.assign({}, opts, { hint: container._f }));
    container._f = pos.f;
    if (!container._spans) container._spans = new Map();
    const spans = container._spans;
    const seen = new Set();
    words.forEach((w, i) => {
      const p = pos[i];
      let el = spans.get(w.key);
      let fresh = false;
      if (!el) {
        el = document.createElement('span');
        el.className = 'cw';
        container.appendChild(el);
        spans.set(w.key, el);
        fresh = true;
      }
      if (el._gone) { clearTimeout(el._rm); el._gone = false; }
      seen.add(w.key);
      if (el.textContent !== w.label) el.textContent = w.label;
      if (!p) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; return; }
      const color = p.ratio > 0.5 ? pal.a : p.ratio > 0.25 ? pal.m : pal.l;
      if (fresh) {
        // คำใหม่: วางที่ตำแหน่งจริงก่อน แล้วค่อยๆ โผล่ (ไม่พุ่งมาจากกลางจอ)
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.style.transform = 'scale(0.86)';
        el.style.left = Math.round(p.x) + 'px';
        el.style.top = Math.round(p.y) + 'px';
        el.style.width = p.w + 'px';
        el.style.fontSize = p.size + 'px';
        void el.offsetWidth;
        el.style.transition = '';
        el.style.transitionDelay = Math.min(i * 14, 500) + 'ms';
        setTimeout(() => { el.style.transitionDelay = ''; }, 1100);
      }
      el.style.left = Math.round(p.x) + 'px';
      el.style.top = Math.round(p.y) + 'px';
      el.style.width = p.w + 'px';
      el.style.fontSize = p.size + 'px';
      el.style.fontWeight = p.weight;
      el.style.color = w.mine ? pal.a : color;
      el.style.textDecoration = w.mine ? 'underline' : 'none';
      el.style.textDecorationThickness = '2px';
      el.style.textUnderlineOffset = '4px';
      el.style.opacity = '1';
      el.style.transform = 'scale(1)';
      el.style.pointerEvents = '';
    });
    spans.forEach((el, k) => {
      if (seen.has(k) || el._gone) return;
      el._gone = true;
      el.style.opacity = '0';
      el.style.transform = 'scale(0.86)';
      el.style.pointerEvents = 'none';
      el._rm = setTimeout(() => { el.remove(); if (spans.get(k) === el) spans.delete(k); }, 650);
    });
    return pos.map((p, i) => (p ? Object.assign({ label: words[i].label, mine: !!words[i].mine }, p) : null));
  };

  /* ---------- ส่งออก ---------- */
  WC.download = function (filename, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  WC.csvEscape = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // BOM ให้ Excel อ่านภาษาไทยถูก
  WC.toCsvBlob = function (header, rows) {
    const lines = [header].concat(rows).map((r) => r.map(WC.csvEscape).join(','));
    return new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  };
  WC.shortId = function (uid) {
    let h = 5381;
    for (let i = 0; i < uid.length; i++) h = ((h << 5) + h + uid.charCodeAt(i)) >>> 0;
    return h.toString(36).toUpperCase().padStart(6, '0').slice(-6);
  };
  WC.fmtTime = function (ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  };

  // answers + settings -> CSV (มีทั้งคำดิบและคำหลังรวม)
  WC.answersCsv = function (answers, settings, code) {
    const items = WC.buildItems(answers, settings);
    const ms = WC.mergeState(items, settings);
    const fields = WC.normFields(settings.fields);
    const header = ['เวลา', 'รหัสผู้ตอบ(นิรนาม)', 'คำที่พิมพ์', 'คำหลังล้างข้อความ', 'คำหลังรวม', 'ถูกซ่อน'].concat(fields.map((f) => String(f.label || '').trim() || 'หัวข้อ'));
    const removed = new Set((settings.removed || []).map(WC.normalize));
    const blocked = WC.parseList(settings.blocked, 100, 30).map(WC.normalize);
    const rows = answers
      .slice()
      .sort((a, b) => (a.tsMs || 0) - (b.tsMs || 0))
      .map((a) => {
        const n = WC.normalize(a.text);
        const hidden = !n || removed.has(n) || blocked.some((b) => b && n.indexOf(b) >= 0);
        return [WC.fmtTime(a.tsMs), WC.shortId(a.pid || a.id || ''), a.text, n, hidden ? '' : ms.resolve(n), hidden ? 'ใช่' : '']
          .concat(fields.map((f) => (a.fields && a.fields[f.key]) || ''));
      });
    return WC.toCsvBlob(header, rows);
  };

  // วาดภาพก้อนเมฆลง canvas แล้วคืน Blob PNG
  WC.cloudPng = function (opts) {
    // opts: {question, placements, W, H, dark, pal, count}
    const S = 2;
    const pad = 48, headH = 140;
    const cw = opts.W, ch = opts.H;
    const canvas = document.createElement('canvas');
    canvas.width = (cw + pad * 2) * S;
    canvas.height = (ch + headH + pad) * S;
    const ctx = canvas.getContext('2d');
    ctx.scale(S, S);
    ctx.fillStyle = opts.dark ? '#0A0F0D' : '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = 'middle';
    // คำถาม (ตัดบรรทัดอัตโนมัติ)
    ctx.fillStyle = opts.dark ? '#ECFDF5' : '#0A0F0D';
    ctx.font = '700 34px "Noto Sans Thai", sans-serif';
    const qWords = String(opts.question || '').split('');
    let line = '', y = 56;
    const maxW = cw;
    qWords.forEach((ch1) => {
      if (ctx.measureText(line + ch1).width > maxW) { ctx.fillText(line, pad, y); line = ch1; y += 44; } else line += ch1;
    });
    if (line) ctx.fillText(line, pad, y);
    ctx.fillStyle = opts.dark ? '#9CB3A9' : '#55666F';
    ctx.font = '400 18px "Noto Sans Thai", sans-serif';
    ctx.fillText((opts.count || 0) + ' คำตอบ', pad, headH - 22);
    // คำ
    (opts.placements || []).forEach((p) => {
      if (!p) return;
      const color = p.ratio > 0.5 ? opts.pal.a : p.ratio > 0.25 ? opts.pal.m : opts.pal.l;
      ctx.fillStyle = color;
      ctx.font = p.weight + ' ' + p.size + 'px "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.label, pad + p.x + p.w / 2, headH + p.y + p.h / 2);
    });
    return new Promise((res) => canvas.toBlob(res, 'image/png'));
  };

  /* ---------- QR ---------- */
  WC.qrSvg = function (text) {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  };
  WC.joinUrl = function (code) {
    const u = new URL('join.html', location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('c', code);
    return u.toString();
  };

  WC.qs = (k) => new URLSearchParams(location.search).get(k);
  WC.debounce = function (fn, ms) {
    let t = null, args = null;
    const d = function () { args = arguments; clearTimeout(t); t = setTimeout(() => { t = null; fn.apply(null, args); }, ms); };
    d.flush = function () { if (t) { clearTimeout(t); t = null; fn.apply(null, args); } };
    return d;
  };
  WC.$ = (sel, root) => (root || document).querySelector(sel);
  WC.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  WC.el = function (tag, attrs, children) {
    const e = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  };

  // สร้าง segmented control จากรายการ
  WC.seg = function (container, items, current, onPick) {
    container.replaceChildren();
    items.forEach((it, i) => {
      container.appendChild(WC.el('button', {
        type: 'button', class: 'seg-btn', 'aria-pressed': i === current ? 'true' : 'false', text: it,
        onclick: () => onPick(i)
      }));
    });
  };
  WC.setToggle = function (btn, on) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); };
  WC.applyAccent = function (toneIdx) {
    const t = WC.TONES[toneIdx] || WC.TONES[0];
    document.documentElement.style.setProperty('--accent', t.accent);
  };

  /* ---------- เปลี่ยนหน้าแบบนุ่มนวล: จางออกก่อนไปหน้าใหม่ ---------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.origin !== location.origin) return;
    if (a.pathname === location.pathname && a.search === location.search) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    document.body.classList.add('leaving');
    setTimeout(() => { location.href = a.href; }, 170);
  });
  window.addEventListener('pageshow', () => document.body.classList.remove('leaving'));
})();
