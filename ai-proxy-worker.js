/* =========================================================
   ProjectMatch — Cloudflare Worker: прокси для Gemini

   Зачем: ключ Gemini лежит в секрете воркера (env/secret),
   а не в JS сайта. Посетители чата видят только адрес воркера.

   Как включить:
   1. Cloudflare Dashboard → Workers & Pages → Create Worker.
   2. Вставьте этот файл целиком в редактор воркера, Deploy.
   3. Settings → Variables → Add variable → Secret:
        name  = GEMINI_API_KEY
        value = ваш ключ Gemini
      (по желанию ALLOWED_ORIGIN = https://cyber-uali.github.io)
   4. Скопируйте адрес воркера вида https://xxx.workers.dev
      и вставьте его в поле «Адрес прокси (Worker)» в настройках
      чата на странице search.html.
   5. Либо задайте в assets/js/ai.js:
        window.PM_AI_CONFIG = { endpoint: 'https://xxx.workers.dev/chat' };
      — но тогда адрес окажется в открытом коде (это безопасно,
      ключ всё равно остаётся воркеру).

   Формат запроса и ответа описан в assets/js/ai.js.
   ========================================================= */

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers || {})
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Use POST' }, 405, cors);
    }
    if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) {
      return json({ error: 'Forbidden origin' }, 403, cors);
    }
    if (!env.GEMINI_API_KEY) {
      return json({ error: 'GEMINI_API_KEY not set' }, 500, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'Invalid JSON' }, 400, cors);
    }

    const model = typeof body.model === 'string' && /^[a-zA-Z0-9._-]+$/.test(body.model)
      ? body.model
      : 'gemini-3.6-flash';

    let upstream;
    try {
      upstream = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            systemInstruction: body.systemInstruction,
            contents: body.contents,
            generationConfig: body.generationConfig || { temperature: 0.9, maxOutputTokens: 180 }
          })
        }
      );
    } catch (e) {
      return json({ error: 'Upstream request failed' }, 502, cors);
    }

    let data;
    try {
      data = await upstream.json();
    } catch (e) {
      return json({ error: 'Invalid upstream response' }, 502, cors);
    }

    const parts = data && data.candidates && data.candidates[0]
      && data.candidates[0].content && data.candidates[0].content.parts;
    const text = parts ? parts.map(function (p) { return p.text || ''; }).join('') : '';

    if (!upstream.ok || !text) {
      return json({ error: (data && data.error && data.error.message) || 'No reply' }, 502, cors);
    }
    return json({ text: text }, 200, cors);
  }
};
