/* Word Cloud — ชั้นเก็บข้อมูล
   มี 2 แบบ ใช้อินเทอร์เฟซเดียวกัน:
   - firebase : ใช้เมื่อกรอก firebase ใน js/config.js
   - local    : โหมดทดลองในเครื่อง (localStorage) ไม่ต้องตั้ง Firebase */
(function () {
  'use strict';
  const WC = (window.WC = window.WC || {});

  // เอกสารสถานะสาธารณะ: สิ่งที่ผู้เข้าร่วมอ่านได้ (ไม่มีคำตอบดิบ)
  WC.publicDoc = function (settings, words, merges, total) {
    return {
      question: settings.question || '',
      status: settings.closed ? 'closed' : 'open',
      hideResults: !!settings.hideResults,
      limit: Math.min(WC.MAX_LIMIT, Math.max(1, settings.limit || 3)),
      fields: WC.publicFields(settings.fields),
      tone: settings.tone || 0,
      words: words || [],
      merges: merges || {},
      total: total || 0,
      updatedAtMs: Date.now()
    };
  };

  WC.initDB = async function () {
    const cfg = window.WC_CONFIG || {};
    if (cfg.firebase && cfg.firebase.apiKey && window.FB) WC.db = await makeFirebase(cfg);
    else WC.db = makeLocal();
    await WC.db.ready;
    if (WC.db.mode === 'local') {
      const b = document.createElement('div');
      b.className = 'banner';
      b.setAttribute('role', 'status');
      b.textContent = 'โหมดทดลองในเครื่อง: ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น มือถือเครื่องอื่นยังเข้าร่วมไม่ได้ (ตั้งค่า Firebase ใน js/config.js เพื่อใช้จริง)';
      document.body.prepend(b);
    }
    return WC.db;
  };

  /* ===================== Firebase ===================== */
  async function makeFirebase(cfg) {
    const F = window.FB;
    const app = F.initializeApp(cfg.firebase);
    const auth = F.getAuth(app);
    const fs = F.getFirestore(app);
    const hostEmail = String(cfg.hostEmail || '').toLowerCase();
    const db = { mode: 'firebase', user: null };
    const authSubs = [];

    const toUser = (u) => (u ? {
      uid: u.uid, anon: u.isAnonymous, email: u.email || '', name: u.displayName || '',
      isHost: !u.isAnonymous && (!hostEmail || String(u.email || '').toLowerCase() === hostEmail)
    } : null);
    db.ready = new Promise((resolve) => {
      let first = true;
      F.onAuthStateChanged(auth, (u) => {
        db.user = toUser(u);
        authSubs.forEach((f) => f(db.user));
        if (first) { first = false; resolve(db.user); }
      });
    });
    db.onAuth = (f) => authSubs.push(f);
    db.signInHost = async () => { await F.signInWithPopup(auth, new F.GoogleAuthProvider()); };
    db.signOut = () => F.signOut(auth);
    db.ensureAnon = async () => {
      if (!auth.currentUser) await F.signInAnonymously(auth);
      return auth.currentUser.uid;
    };

    const sessRef = (sid) => F.doc(fs, 'sessions', sid);
    const pubRef = (sid) => F.doc(fs, 'sessions', sid, 'public', 'state');
    const ansCol = (sid) => F.collection(fs, 'sessions', sid, 'answers');
    const mapAns = (d) => {
      const x = d.data();
      return { id: d.id, text: x.text, pid: x.pid, fields: x.fields || {}, tsMs: x.ts && x.ts.toMillis ? x.ts.toMillis() : Date.now() };
    };

    db.createSession = async (settings) => {
      const sid = F.doc(F.collection(fs, 'sessions')).id;
      for (let i = 0; i < 10; i++) {
        const code = WC.genCode();
        try {
          await F.runTransaction(fs, async (tx) => {
            const cref = F.doc(fs, 'codes', code);
            const snap = await tx.get(cref);
            if (snap.exists()) throw new Error('code-exists');
            tx.set(cref, { sid: sid, createdAt: F.serverTimestamp() });
            tx.set(sessRef(sid), { code: code, settings: settings, ownerUid: auth.currentUser.uid, createdAtMs: Date.now() });
            tx.set(pubRef(sid), WC.publicDoc(settings, [], {}, 0));
          });
          return { sid: sid, code: code };
        } catch (e) {
          if (!e || e.message !== 'code-exists') throw e;
        }
      }
      throw new Error('สร้างรหัสไม่สำเร็จ ลองใหม่อีกครั้ง');
    };
    db.listSessions = async () => {
      const snap = await F.getDocs(F.collection(fs, 'sessions'));
      return snap.docs.map((d) => {
        const x = d.data();
        return { sid: d.id, code: x.code, question: (x.settings && x.settings.question) || '', createdAtMs: x.createdAtMs || 0 };
      }).sort((a, b) => b.createdAtMs - a.createdAtMs);
    };
    db.getSession = async (sid) => {
      const s = await F.getDoc(sessRef(sid));
      return s.exists() ? Object.assign({ sid: sid }, s.data()) : null;
    };
    db.watchSession = (sid, cb, onErr) =>
      F.onSnapshot(sessRef(sid), (s) => cb(s.exists() ? Object.assign({ sid: sid }, s.data()) : null), onErr);
    db.updateSettings = async (sid, patch) => {
      const o = {};
      Object.keys(patch).forEach((k) => { o['settings.' + k] = patch[k]; });
      await F.updateDoc(sessRef(sid), o);
    };
    db.setPublic = (sid, data) => F.setDoc(pubRef(sid), data);
    db.getPublic = async (sid) => {
      const s = await F.getDoc(pubRef(sid));
      return s.exists() ? s.data() : null;
    };
    db.lookupCode = async (code) => {
      const s = await F.getDoc(F.doc(fs, 'codes', code));
      return s.exists() ? s.data().sid : null;
    };
    db.submit = async (sid, uid, texts, fields, startIdx) => {
      const batch = F.writeBatch(fs);
      texts.forEach((t, i) => {
        batch.set(F.doc(fs, 'sessions', sid, 'answers', uid + '_' + (startIdx + i)), {
          text: t, pid: uid, fields: fields || {}, ts: F.serverTimestamp()
        });
      });
      await batch.commit();
    };
    db.watchAnswers = (sid, cb, onErr) => F.onSnapshot(ansCol(sid), (snap) => cb(snap.docs.map(mapAns)), onErr);
    db.listAnswers = async (sid) => (await F.getDocs(ansCol(sid))).docs.map(mapAns);
    db.deleteAnswers = async (sid) => {
      const snap = await F.getDocs(ansCol(sid));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = F.writeBatch(fs);
        snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    };
    db.deleteSession = async (sid) => {
      let code = null;
      try { const s = await F.getDoc(sessRef(sid)); if (s.exists()) code = s.data().code; } catch (e) { /* ข้าม */ }
      if (code) await F.deleteDoc(F.doc(fs, 'codes', code));
      await db.deleteAnswers(sid);
      await F.deleteDoc(pubRef(sid));
      await F.deleteDoc(sessRef(sid));
    };
    return db;
  }

  /* ===================== โหมดทดลองในเครื่อง ===================== */
  function makeLocal() {
    const KEY = 'wc_local_v1';
    const bc = 'BroadcastChannel' in window ? new BroadcastChannel('wc-local') : null;
    const subs = new Set();
    const empty = () => ({ sessions: {}, codes: {}, pub: {}, answers: {} });
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || empty(); } catch (e) { return empty(); } };
    const notify = () => subs.forEach((f) => f());
    const save = (d) => { localStorage.setItem(KEY, JSON.stringify(d)); if (bc) bc.postMessage('x'); notify(); };
    if (bc) bc.onmessage = notify;
    window.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });

    let uid = sessionStorage.getItem('wc_local_uid');
    if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 12); sessionStorage.setItem('wc_local_uid', uid); }
    const db = { mode: 'local' };
    db.user = { uid: uid, anon: false, email: '(โหมดทดลอง)', name: 'ผู้จัด (ทดลอง)', isHost: true };
    db.ready = Promise.resolve(db.user);
    db.onAuth = () => {};
    db.signInHost = async () => {};
    db.signOut = async () => {};
    db.ensureAnon = async () => uid;

    db.createSession = async (settings) => {
      const d = load();
      let code;
      do { code = WC.genCode(); } while (d.codes[code]);
      const sid = 's' + Math.random().toString(36).slice(2, 12);
      d.codes[code] = sid;
      d.sessions[sid] = { sid: sid, code: code, settings: settings, ownerUid: uid, createdAtMs: Date.now() };
      d.pub[sid] = WC.publicDoc(settings, [], {}, 0);
      d.answers[sid] = {};
      save(d);
      return { sid: sid, code: code };
    };
    db.listSessions = async () =>
      Object.values(load().sessions).map((x) => ({ sid: x.sid, code: x.code, question: x.settings.question, createdAtMs: x.createdAtMs }))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
    db.getSession = async (sid) => load().sessions[sid] || null;
    db.watchSession = (sid, cb) => {
      const f = () => cb(load().sessions[sid] || null);
      subs.add(f);
      setTimeout(f, 0);
      return () => subs.delete(f);
    };
    db.updateSettings = async (sid, patch) => {
      const d = load();
      if (!d.sessions[sid]) return;
      Object.assign(d.sessions[sid].settings, JSON.parse(JSON.stringify(patch)));
      save(d);
    };
    db.setPublic = async (sid, data) => { const d = load(); d.pub[sid] = JSON.parse(JSON.stringify(data)); save(d); };
    db.getPublic = async (sid) => load().pub[sid] || null;
    db.lookupCode = async (code) => load().codes[code] || null;
    db.submit = async (sid, u, texts, fields, startIdx) => {
      const d = load();
      if (!d.pub[sid] || d.pub[sid].status !== 'open') throw new Error('ปิดรับคำตอบแล้ว');
      d.answers[sid] = d.answers[sid] || {};
      texts.forEach((t, i) => {
        const id = u + '_' + (startIdx + i);
        d.answers[sid][id] = { id: id, text: t, pid: u, fields: fields || {}, tsMs: Date.now() };
      });
      save(d);
    };
    db.watchAnswers = (sid, cb) => {
      const f = () => cb(Object.values(load().answers[sid] || {}));
      subs.add(f);
      setTimeout(f, 0);
      return () => subs.delete(f);
    };
    db.listAnswers = async (sid) => Object.values(load().answers[sid] || {});
    db.deleteAnswers = async (sid) => { const d = load(); d.answers[sid] = {}; save(d); };
    db.deleteSession = async (sid) => {
      const d = load();
      const s = d.sessions[sid];
      if (s) delete d.codes[s.code];
      delete d.sessions[sid]; delete d.pub[sid]; delete d.answers[sid];
      save(d);
    };
    return db;
  }
})();
