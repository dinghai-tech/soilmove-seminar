/* 回饋問卷頁：題目由後端提供（與 Google 表單相同）；邀請信連結帶 ?k= 時自動鎖定場次、每人限填一次 */
(function () {
  const $ = id => document.getElementById(id);
  const { esc } = App;
  const key = new URLSearchParams(location.search).get('k') || '';
  const preset = (new URLSearchParams(location.search).get('s') || '').toUpperCase();
  let form = null;

  async function load() {
    if (!App.hasApi) { $('setup-note').classList.remove('hidden'); return; }
    try {
      form = await App.get(key ? { action: 'feedbackForm', k: key } : { action: 'feedbackForm' });
      if (!form.ok) throw new Error(form.error);
    } catch (e) {
      return App.msg($('load-msg'), (e.message || '問卷載入失敗') + '，請重新整理頁面。');
    }
    $('fb-title').textContent = form.title;
    document.title = form.title;
    $('fb-intro').textContent = form.intro;

    if (form.submitted) return done('您已填寫過這份回饋問卷，感謝您的協助！');
    const fixed = form.fixedSession && form.sessions.find(s => s.code === form.fixedSession);
    const open = form.sessions.filter(s => s.open);
    if (fixed && !fixed.open) return App.msg($('load-msg'), fixed.name + '的回饋問卷只在活動當天（' + fixed.dateText + '）開放填寫，目前無法填寫。', 'warn');
    if (!fixed && !open.length) return App.msg($('load-msg'), '目前沒有開放填寫回饋問卷的場次。回饋問卷只在各場次活動當天開放填寫。', 'warn');
    if (form.keyError) App.msg($('load-msg'), form.keyError, 'warn');

    if (fixed) {
      $('fb-session-set').classList.add('hidden');
      $('fb-fixed').innerHTML = '場次：<b>' + esc(fixed.name) + '</b>　' + esc(fixed.dateText);
      $('fb-fixed').classList.remove('hidden');
    } else {
      $('fb-sessions').innerHTML = open.map(s =>
        '<label class="choice"><input type="radio" name="session" value="' + esc(s.code) + '"' +
        (open.length === 1 || s.code === preset ? ' checked' : '') + '>' +
        '<span><strong>' + esc(s.name) + '</strong>　' + esc(s.dateText) + '</span></label>').join('');
    }

    $('fb-questions').innerHTML = form.questions.map((q, i) => {
      const n = i + 1;
      if (q.type === 'text') {
        return '<div class="field fb-q"><label class="lbl req" for="' + esc(q.id) + '"><span class="fb-n">' + n + '</span>' + esc(q.text) + '</label>' +
          '<textarea id="' + esc(q.id) + '" name="' + esc(q.id) + '" maxlength="1000" required></textarea></div>';
      }
      return '<fieldset class="fb-q" id="set-' + esc(q.id) + '"><legend class="req"><span class="fb-n">' + n + '</span>' + esc(q.text) + '</legend>' +
        '<div class="scale">' + form.scale.map(v =>
          '<label class="choice"><input type="radio" name="' + esc(q.id) + '" value="' + esc(v) + '"><span>' + esc(v) + '</span></label>').join('') +
        '</div></fieldset>';
    }).join('');
    $('fb-form').classList.remove('hidden');
  }

  const val = name => { const el = document.querySelector('[name="' + name + '"]:checked'); return el ? el.value : ''; };

  $('fb-form').addEventListener('submit', async e => {
    e.preventDefault();
    const box = $('fb-msg');
    box.classList.add('hidden');
    document.querySelectorAll('.fb-q.missing').forEach(el => el.classList.remove('missing'));
    const answers = {}, missing = [];
    form.questions.forEach((q, i) => {
      answers[q.id] = q.type === 'text' ? $(q.id).value.trim() : val(q.id);
      if (!answers[q.id]) missing.push(i + 1);
    });
    const session = form.fixedSession || val('session');
    if (!session) return App.msg(box, '請選擇您參加的場次。');
    if (missing.length) {
      missing.forEach(n => { const q = form.questions[n - 1]; ($('set-' + q.id) || $(q.id).closest('.fb-q')).classList.add('missing'); });
      App.msg(box, '請回答第 ' + missing.join('、') + ' 題。');
      const first = form.questions[missing[0] - 1];
      ($('set-' + first.id) || $(first.id)).scrollIntoView({ block: 'center' });
      return;
    }
    const btn = $('fb-btn');
    btn.disabled = true; btn.textContent = '送出中…';
    try {
      const r = await App.post({ action: 'feedback', session, k: key, answers, website: $('website').value });
      if (!r.ok) {
        if (r.code === 'FB_DONE') return done(r.error);
        return App.msg(box, r.error);
      }
      done('已收到您對' + r.sessionName + '的回饋，感謝您撥冗填寫！您的意見將作為往後辦理講習會的參考。');
    } catch (err) {
      App.msg(box, err.message);
    } finally {
      btn.disabled = false; btn.textContent = '送出問卷';
    }
  });

  function done(text) {
    $('fb-form').classList.add('hidden');
    $('load-msg').classList.add('hidden');
    $('fb-done').innerHTML = '<div class="msg ok">' + esc(text) + '</div><p><a href="index.html">回活動首頁</a></p>';
    $('fb-done').classList.remove('hidden');
    $('fb-done').focus();
  }

  load();
})();
