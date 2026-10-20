/* 報到頁（工作人員用）：通行碼登入 → 選場次 → 相機掃描 QR Code 或搜尋姓名報到 */
(function () {
  const $ = id => document.getElementById(id);
  const { esc } = App;
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* 無痕模式等情況：只是不記住 */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  if (!App.hasApi) $('setup-note').classList.remove('hidden');

  let pass = '';
  let session = '';

  async function api(p) {
    const r = await App.post(Object.assign({ passcode: pass, session }, p));
    if (!r.ok && (r.code === 'BAD_PASSCODE' || r.code === 'NO_PASSCODE')) logout(r.error);
    return r;
  }

  /* ---------- 登入 ---------- */
  async function login(p, silent) {
    const box = $('login-msg');
    box.classList.add('hidden');
    const btn = $('login-btn');
    btn.disabled = true; btn.textContent = '登入中…';
    try {
      const r = await App.post({ action: 'staffLogin', passcode: p });
      if (!r.ok) { if (!silent) App.msg(box, r.error); store.del('ck-pass'); return; }
      pass = p;
      store.set('ck-pass', p);
      $('event-title').textContent = r.title;
      const saved = store.get('ck-session');
      const today = r.sessions.find(s => s.date === r.today);
      $('session').innerHTML = r.sessions.map(s =>
        '<option value="' + esc(s.code) + '">' + esc(s.name + '　' + s.dateText) + '</option>').join('');
      session = (r.sessions.find(s => s.code === saved) || today || r.sessions[0] || {}).code || '';
      $('session').value = session;
      $('login').classList.add('hidden');
      $('desk').classList.remove('hidden');
      $('logout').classList.remove('hidden');
      refreshCount();
    } catch (err) {
      if (!silent) App.msg(box, err.message);
    } finally {
      btn.disabled = false; btn.textContent = '登入';
    }
  }
  $('login').addEventListener('submit', e => {
    e.preventDefault();
    const p = $('passcode').value.trim();
    if (!p) return App.msg($('login-msg'), '請輸入報到通行碼。');
    login(p);
  });
  function logout(reason) {
    stopCam();
    pass = '';
    store.del('ck-pass');
    $('desk').classList.add('hidden');
    $('logout').classList.add('hidden');
    $('login').classList.remove('hidden');
    $('passcode').value = '';
    if (reason) App.msg($('login-msg'), reason);
  }
  $('logout').onclick = () => logout();
  const remembered = store.get('ck-pass');
  if (remembered && App.hasApi) login(remembered, true);

  $('session').addEventListener('change', () => {
    session = $('session').value;
    store.set('ck-session', session);
    $('result').innerHTML = '';
    $('list').innerHTML = '';
    refreshCount();
  });

  function showCount(stats) {
    if (stats) $('count').innerHTML = esc(stats.checked) + ' <small>人已報到・正取 ' + esc(stats.ok) + ' 人</small>';
  }
  async function refreshCount() {
    try { const r = await api({ action: 'staffSearch', q: '__count_only__' }); if (r.ok) showCount(r.stats); } catch (e) { /* 只影響人數顯示 */ }
  }

  /* ---------- 分頁 ---------- */
  function tab(which) {
    $('tab-scan').setAttribute('aria-selected', which === 'scan');
    $('tab-find').setAttribute('aria-selected', which === 'find');
    $('pane-scan').classList.toggle('hidden', which !== 'scan');
    $('pane-find').classList.toggle('hidden', which !== 'find');
    if (which !== 'scan') stopCam();
    if (which === 'find') $('q').focus();
  }
  $('tab-scan').onclick = () => tab('scan');
  $('tab-find').onclick = () => tab('find');

  /* ---------- 結果顯示 ---------- */
  const TITLES = {
    ok: ['ok', '報到成功'],
    forced: ['ok', '報到成功（工作人員確認）'],
    already: ['warn', '已經報到過'],
    wrong_session: ['warn', '場次不符'],
    waitlist: ['warn', '此人目前為候補'],
    cancelled: ['err', '此筆報名已取消']
  };
  function showResult(r, via) {
    if (!r.ok) {
      $('result').innerHTML = '<div class="ck-result err"><h2>無法報到</h2><p style="margin:0">' + esc(r.error) + '</p></div>';
      buzz([80, 60, 80]);
      return;
    }
    showCount(r.stats);
    const p = r.person;
    const t = TITLES[r.result] || ['warn', r.result];
    let note = '';
    if (r.result === 'already') note = '報到時間 ' + esc(p.checkedInDate) + ' ' + esc(p.checkedInAt) + '，請確認是否為本人。';
    if (r.result === 'wrong_session') note = '此人報名的是「' + esc(p.sessionName) + '」，不是目前選擇的場次。';
    if (r.result === 'waitlist') note = '尚未遞補為正取。若現場有空位並經主辦單位同意，可按「仍要報到」。';
    if (r.result === 'cancelled') note = '此人已取消報名。若現場經主辦單位同意入場，可按「仍要報到」。';
    const veg = /素/.test(p.meal) ? '<span class="meal-veg">素食</span>' : '';
    const canForce = r.result === 'wrong_session' || r.result === 'waitlist' || r.result === 'cancelled';
    const canUndo = r.result === 'ok' || r.result === 'forced' || r.result === 'already';
    $('result').innerHTML = '<div class="ck-result ' + t[0] + '"><h2>' + t[1] + '</h2>' +
      '<div class="who">' + esc(p.name) + veg + '</div>' +
      '<div class="meta">' + esc([p.unit, p.title].filter(Boolean).join('・')) + '</div>' +
      '<div class="meta">報名序號 ' + esc(p.serial) + '・' + esc(p.sessionName) + '・餐飲 ' + esc(p.meal || '—') +
      (p.checkedInAt && r.result !== 'already' ? '・' + esc(p.checkedInAt) + ' 報到' : '') + '</div>' +
      (note ? '<p style="margin:8px 0 0">' + note + '</p>' : '') +
      '<div class="actions">' +
      (canForce ? '<button type="button" class="btn small" data-force="' + esc(p.serial) + '">仍要報到</button>' : '') +
      (canUndo ? '<button type="button" class="linkbtn" data-undo="' + esc(p.serial) + '">取消這筆報到（掃錯人時）</button>' : '') +
      '</div></div>';
    buzz(t[0] === 'ok' ? 120 : [80, 60, 80]);
    if (via === 'find') runFind(true);
  }
  $('result').addEventListener('click', async e => {
    const f = e.target.closest('[data-force]'), u = e.target.closest('[data-undo]');
    if (f) { f.disabled = true; showResult(await safe(() => api({ action: 'checkin', serial: f.dataset.force, force: true })), currentVia()); }
    if (u) {
      u.disabled = true;
      const r = await safe(() => api({ action: 'checkinUndo', serial: u.dataset.undo }));
      if (r.ok) {
        showCount(r.stats);
        $('result').innerHTML = '<div class="ck-result warn"><h2>已取消報到</h2><p style="margin:0">' + esc(r.person.name) + '（' + esc(r.person.serial) + '）的報到紀錄已清除。</p></div>';
        if (currentVia() === 'find') runFind(true);
      } else showResult(r);
    }
  });
  const currentVia = () => ($('pane-find').classList.contains('hidden') ? 'scan' : 'find');
  async function safe(fn) {
    try { return await fn(); } catch (err) { return { ok: false, error: err.message }; }
  }
  function buzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ } }

  /* ---------- 相機掃描 ---------- */
  let stream = null, raf = 0, busy = false, last = '', lastAt = 0;
  const video = $('video'), canvas = $('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });

  $('start-cam').onclick = startCam;
  async function startCam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('result').innerHTML = '<div class="ck-result err"><h2>無法使用相機</h2><p style="margin:0">此瀏覽器不支援相機，或網址不是 https。請改用「搜尋姓名／單位／序號」。</p></div>';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (err) {
      $('result').innerHTML = '<div class="ck-result err"><h2>相機未啟用</h2><p style="margin:0">請在瀏覽器允許相機權限後再試一次，或改用搜尋報到。</p></div>';
      return;
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    $('idle').classList.add('hidden');
    $('frame').classList.remove('hidden');
    raf = requestAnimationFrame(tick);
  }
  function stopCam() {
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    video.srcObject = null;
    $('idle').classList.remove('hidden');
    $('frame').classList.add('hidden');
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopCam(); });

  function tick() {
    if (!stream) return;
    if (video.readyState >= 2 && !busy) {
      const w = Math.min(640, video.videoWidth), h = Math.round(video.videoHeight * (w / video.videoWidth));
      if (w && h) {
        canvas.width = w; canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const code = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (code && code.data && (code.data !== last || Date.now() - lastAt > 4000)) {
          last = code.data; lastAt = Date.now();
          handleScan(code.data);
        }
      }
    }
    raf = requestAnimationFrame(tick);
  }
  async function handleScan(text) {
    busy = true;
    $('result').innerHTML = '<div class="ck-result"><h2>查詢中…</h2></div>';
    showResult(await safe(() => api({ action: 'checkin', qr: text })), 'scan');
    setTimeout(() => { busy = false; }, 1200); // 給工作人員看結果、報到者收手機的時間
  }

  /* ---------- 搜尋報到 ---------- */
  $('find').addEventListener('submit', e => { e.preventDefault(); runFind(); });
  async function runFind(keepResult) {
    const btn = $('find-btn');
    btn.disabled = true;
    if (!keepResult) $('result').innerHTML = '';
    const r = await safe(() => api({ action: 'staffSearch', q: $('q').value.trim() }));
    btn.disabled = false;
    if (!r.ok) { $('list').innerHTML = ''; return showResult(r); }
    showCount(r.stats);
    $('find-hint').textContent = r.total ? '找到 ' + r.total + ' 筆' + (r.total > 50 ? '，只顯示前 50 筆，請輸入更多字縮小範圍。' : '。') : '查無符合的報名者。現場報名者請另行登記。';
    $('list').innerHTML = r.items.map(p => {
      const tag = p.status === '正取' ? '' : '（' + esc(p.status) + '）';
      const right = p.checkedInAt
        ? '<span class="done">✓ ' + esc(p.checkedInAt) + ' 已報到</span>'
        : '<button type="button" class="btn small" data-checkin="' + esc(p.serial) + '">報到</button>';
      return '<li><div><div class="n">' + esc(p.name) + tag + (/素/.test(p.meal) ? '<span class="meal-veg">素食</span>' : '') + '</div>' +
        '<div class="s">' + esc([p.unit, p.title, p.serial].filter(Boolean).join('・')) + '</div></div>' + right + '</li>';
    }).join('');
  }
  $('list').addEventListener('click', async e => {
    const b = e.target.closest('[data-checkin]');
    if (!b) return;
    b.disabled = true;
    showResult(await safe(() => api({ action: 'checkin', serial: b.dataset.checkin })), 'find');
    $('result').scrollIntoView({ block: 'nearest' });
  });
})();
