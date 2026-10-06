/* 共用工具：API 呼叫、HTML 跳脫、訊息顯示 */
(function () {
  const cfg = window.APP_CONFIG || {};
  const API_URL = cfg.API_URL || '';

  async function call(method, payload) {
    if (!API_URL) throw new Error('網站尚未設定 API 網址（config.js）。');
    let res;
    try {
      if (method === 'GET') {
        res = await fetch(API_URL + (API_URL.includes('?') ? '&' : '?') + new URLSearchParams(payload), { method: 'GET' });
      } else {
        // 不設定 Content-Type，瀏覽器會以 text/plain 送出，避免 Apps Script 不支援的 CORS 預檢
        res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
      }
    } catch (e) {
      throw new Error('連線失敗，請檢查網路後再試一次。');
    }
    let data;
    try { data = await res.json(); } catch (e) { throw new Error('伺服器回應異常，請稍後再試。'); }
    return data;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function msg(el, text, kind) {
    el.className = 'msg ' + (kind || 'err');
    el.textContent = text;
    el.classList.remove('hidden');
  }

  window.App = { hasApi: !!API_URL, get: p => call('GET', p), post: p => call('POST', p), esc, msg };
})();
