(function () {
  const { esc } = App;
  const $ = id => document.getElementById(id);
  const STATE_LABEL = { open: '報名中', waitlist: '正取已滿，可登記候補', full: '已額滿', closed: '已截止' };
  let data = null;

  async function load() {
    if (!App.hasApi) { $('setup-note').classList.remove('hidden'); $('cores').innerHTML = ''; return; }
    try {
      data = await App.get({ action: 'config' });
      if (!data.ok) throw new Error(data.error);
    } catch (e) {
      $('cores').innerHTML = '<p class="msg err">' + esc(e.message || '場次資訊載入失敗') + '，請重新整理頁面。</p>';
      return;
    }
    renderSite(data.site);
    renderCores(data.sessions);
    renderAgenda(data.sessions, data.agenda);
    renderSpeakers(data.speakers);
    renderForm(data);
    renderFaq(data.faq);
  }

  function renderSite(s) {
    const m = (s.title || '').match(/^(\d+年度)(.+)$/);
    $('hero-year').textContent = m ? m[1] : '';
    $('hero-title').textContent = m ? m[2] : s.title;
    document.title = s.title + '｜線上報名';
    $('brand').textContent = s.host || $('brand').textContent;
    $('hosts').innerHTML = (s.host ? '<dt>主辦機關</dt><dd>' + esc(s.host) + '</dd>' : '') +
      (s.coHost ? '<dt>協辦單位</dt><dd>' + esc(s.coHost) + '</dd>' : '');
    $('hero-fee').textContent = s.fee || '';
    $('purpose').innerHTML = String(s.purpose || '').split(/\n+/).map(p => '<p>' + esc(p) + '</p>').join('');
    $('privacy').textContent = s.privacy || '';
    $('foot').innerHTML =
      '<div><h3>報名諮詢</h3><p>' + esc(s.contactName) + '</p>' +
      (s.contactPhone ? '<p>電話 <a href="tel:' + esc(s.contactPhone.replace(/[^\d+#]/g, '')) + '">' + esc(s.contactPhone) + '</a></p>' : '') +
      (s.contactEmail ? '<p>信箱 <a href="mailto:' + esc(s.contactEmail) + '">' + esc(s.contactEmail) + '</a></p>' : '') +
      (s.serviceHours ? '<p>服務時間 ' + esc(s.serviceHours) + '</p>' : '') + '</div>' +
      '<div><h3>主辦</h3><p>' + esc(s.host) + '</p>' + (s.coHost ? '<p>協辦：' + esc(s.coHost) + '</p>' : '') + '</div>' +
      '<div><h3>已經報名了？</h3><p><a href="lookup.html">查詢報名資料</a></p></div>';
  }

  function renderCores(sessions) {
    $('cores').innerHTML = sessions.map(s => {
      const used = s.capacity ? (s.capacity - s.remaining) / s.capacity : 0;
      let seats = '';
      if (s.state === 'open') seats = '剩餘 <b>' + s.remaining + '</b> 席';
      else if (s.state === 'waitlist') seats = '候補剩 <b>' + s.waitRemaining + '</b> 位';
      return '<article class="core" data-state="' + esc(s.state) + '">' +
        '<div><div class="city">' + esc(s.name.replace(/場$/, '')) + '</div>' +
        '<div class="when">' + esc(s.dateText.replace(/^\d+年/, '')) + (s.time ? '<br>' + esc(s.time) : '') + '</div>' +
        '<div class="where">' + esc(s.venue) + '</div>' +
        (seats ? '<div class="seats">' + seats + '</div>' : '') +
        '<span class="state">' + STATE_LABEL[s.state] + '</span></div>' +
        '<div class="tube" role="img" aria-label="已報名 ' + (s.capacity - s.remaining) + ' 人，名額 ' + s.capacity + ' 人">' +
        '<div class="fill" data-h="' + Math.min(100, Math.round(used * 100)) + '"></div></div></article>';
    }).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelectorAll('.tube .fill').forEach(f => { f.style.height = f.dataset.h + '%'; });
    }));
  }

  function renderAgenda(sessions, agenda) {
    const withAgenda = sessions.filter(s => (agenda[s.code] || []).length);
    if (!withAgenda.length) { $('agenda').classList.add('hidden'); return; }
    $('agenda-tabs').innerHTML = withAgenda.map((s, i) =>
      '<button type="button" role="tab" aria-selected="' + (i === 0) + '" data-code="' + esc(s.code) + '">' +
      esc(s.name) + '　' + esc(s.dateText) + '</button>').join('');
    const show = code => {
      document.querySelectorAll('#agenda-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.code === code)));
      $('agenda-list').innerHTML = (agenda[code] || []).map(a =>
        '<li class="' + (a.time ? '' : 'notime') + '">' + (a.time ? '<span class="t">' + esc(a.time) + '</span>' : '') +
        '<div>' + esc(a.topic) + (a.speaker ? '<div class="s">' + esc(a.speaker) + '</div>' : '') + '</div></li>').join('');
    };
    $('agenda-tabs').onclick = e => { const b = e.target.closest('button'); if (b) show(b.dataset.code); };
    show(withAgenda[0].code);
  }

  function renderSpeakers(list) {
    if (!list.length) return;
    $('speakers-sec').classList.remove('hidden');
    $('nav-speakers').classList.remove('hidden');
    $('speakers').innerHTML = list.map(p => '<div><h3>' + esc(p.name) + '</h3><p class="muted">' + esc(p.title) + '</p><p>' + esc(p.bio) + '</p></div>').join('');
  }

  function renderForm(d) {
    // 重新整理名額時保留使用者已選的項目
    const prev = { session: val('session'), orgType: val('orgType'), meal: val('meal') };
    $('session-choices').innerHTML = d.sessions.map(s => {
      const disabled = s.state === 'full' || s.state === 'closed';
      const extra = s.state === 'open' ? '剩餘 ' + s.remaining + ' 席' : STATE_LABEL[s.state];
      return '<label class="choice"><input type="radio" name="session" value="' + esc(s.code) + '"' + (disabled ? ' disabled' : '') + '>' +
        '<span><strong>' + esc(s.name) + '</strong>　' + esc(s.dateText) + (s.time ? ' ' + esc(s.time) : '') +
        '<span class="sub">' + esc(s.venue) + (s.address ? '（' + esc(s.address) + '）' : '') + '</span>' +
        '<span class="sub">' + esc(extra) + (s.deadlineText && !disabled ? '，報名截止 ' + esc(s.deadlineText) : '') + '</span></span></label>';
    }).join('');
    const radios = (id, name, items) => {
      $(id).innerHTML = items.map(v => '<label class="choice"><input type="radio" name="' + name + '" value="' + esc(v) + '"><span>' + esc(v) + '</span></label>').join('');
    };
    radios('org-choices', 'orgType', d.site.orgTypes);
    radios('meal-choices', 'meal', d.site.meals);
    Object.keys(prev).forEach(name => {
      if (!prev[name]) return;
      const el = document.querySelector('[name="' + name + '"][value="' + CSS.escape(prev[name]) + '"]');
      if (el && !el.disabled) el.checked = true;
    });
    if (d.sessions.every(s => s.state === 'full' || s.state === 'closed')) {
      App.msg($('form-msg'), '目前所有場次皆已截止或額滿。', 'warn');
      $('submit-btn').disabled = true;
    }
  }

  function renderFaq(list) {
    $('faq-list').innerHTML = list.map(f => '<details class="faq"><summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p></details>').join('');
  }

  const val = name => { const el = document.querySelector('[name="' + name + '"]:checked'); return el ? el.value : ''; };

  $('reg-form').addEventListener('submit', async e => {
    e.preventDefault();
    const box = $('form-msg');
    box.classList.add('hidden');
    const p = {
      action: 'register',
      session: val('session'), orgType: val('orgType'), meal: val('meal'),
      unit: $('unit').value, name: $('name').value, title: $('title').value,
      email: $('email').value.trim(), phone: $('phone').value.trim(), note: $('note').value,
      website: $('website').value, consent: $('consent').checked
    };
    const missing = [];
    if (!p.session) missing.push('報名場次');
    if (!p.orgType) missing.push('機關類別');
    if (!p.unit.trim()) missing.push('單位名稱');
    if (!p.name.trim()) missing.push('姓名');
    if (!p.title.trim()) missing.push('職稱');
    if (!p.email) missing.push('Email');
    if (!p.phone) missing.push('聯絡電話');
    if (!p.meal) missing.push('餐飲需求');
    if (missing.length) return App.msg(box, '請填寫：' + missing.join('、') + '。');
    if (!p.consent) return App.msg(box, '請先閱讀並勾選同意個人資料蒐集告知事項。');

    const btn = $('submit-btn');
    btn.disabled = true; btn.textContent = '送出中…';
    try {
      const r = await App.post(p);
      if (!r.ok) {
        App.msg(box, r.error || '報名未完成，請再試一次。', r.code === 'DUPLICATE' ? 'warn' : 'err');
        if (r.code === 'DUPLICATE') box.insertAdjacentHTML('beforeend', ' <a href="lookup.html">前往查詢</a>');
        if (r.code === 'FULL' || r.code === 'CLOSED') load();
        return;
      }
      showResult(r, p.email);
      load();
    } catch (err) {
      App.msg(box, err.message);
    } finally {
      btn.disabled = false; btn.textContent = '送出報名';
    }
  });

  function showResult(r, email) {
    const ok = r.status === '正取';
    const info = '<dl><dt>場次</dt><dd>' + esc(r.sessionName) + '</dd><dt>日期</dt><dd>' + esc(r.dateText) + '</dd><dt>地點</dt><dd>' + esc(r.venue) + '</dd></dl>';
    $('result').innerHTML = ok
      ? '<div class="msg ok">報名成功！確認信已寄至 ' + esc(email) + '（如未收到，請檢查垃圾郵件匣）。</div>' +
        '<div class="ticket waiting"><div><span class="muted">報名序號</span>' +
        '<div class="serial">' + esc(r.serial) + '</div>' + info + '</div></div>' +
        '<p class="hint">活動當天請至報到處，於簽到表上簽名報到。之後可以到「查詢報名資料」頁面確認報名狀態。</p>'
      : '<div class="msg warn">正取名額已滿，您已登記為候補。有名額釋出時，系統會依序自動遞補並寄信通知您。</div>' +
        '<div class="ticket waiting"><div><span class="muted">候補序號</span><div class="serial">' + esc(r.serial) + '</div>' + info + '</div></div>';
    $('result').insertAdjacentHTML('beforeend', '<p><button type="button" class="btn ghost" id="again">再報名一位</button></p>');
    $('reg-form').classList.add('hidden');
    $('result').classList.remove('hidden');
    $('result').focus();
    $('again').onclick = () => {
      // 同單位的同事接著報名：保留機關類別與單位名稱
      const keep = { org: val('orgType'), unit: $('unit').value };
      $('reg-form').reset();
      $('unit').value = keep.unit;
      const org = document.querySelector('[name="orgType"][value="' + CSS.escape(keep.org) + '"]');
      if (org) org.checked = true;
      $('result').classList.add('hidden');
      $('reg-form').classList.remove('hidden');
      $('register').scrollIntoView();
    };
  }

  load();
})();
