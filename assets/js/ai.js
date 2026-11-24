/* =========================================================
   ProjectMatch — AI-ответы тиммейтов в чате

   Три режима (выбираются автоматически):
     1. proxy — сайт шлёт запрос на Cloudflare Worker, ключ Gemini
        живёт в секрете воркера и нигде не виден посетителям;
     2. key  — ключ введён самим посетителем в настройках чата,
        запрос идёт прямо в Gemini из его браузера;
     3. demo — без ключа: короткие заготовленные реплики от лица
        профиля, чтобы чат работал офлайн и без расходов.

   Публичный API: window.PM_AI
     mode(), config(), setKey(v), setEndpoint(v)
     reply(context) → Promise<{ text, source, error }>
   ========================================================= */
(function () {
  'use strict';

  var KEY_STORAGE = 'pm-ai-key';
  var ENDPOINT_STORAGE = 'pm-ai-endpoint';
  var DEFAULT_MODEL = 'gemini-3.6-flash';
  var API = 'https://generativelanguage.googleapis.com/v1beta/models/';

  var outer = window.PM_AI_CONFIG || {};

  function stored(name) {
    try { return window.localStorage.getItem(name) || ''; } catch (e) { return ''; }
  }

  function save(name, value) {
    try {
      if (value) window.localStorage.setItem(name, value);
      else window.localStorage.removeItem(name);
    } catch (e) { /* приватный режим — просто работаем без сохранения */ }
  }

  function config() {
    return {
      endpoint: outer.endpoint || stored(ENDPOINT_STORAGE),
      key: outer.key || stored(KEY_STORAGE),
      model: outer.model || DEFAULT_MODEL
    };
  }

  function mode() {
    var cfg = config();
    if (cfg.endpoint) return 'proxy';
    if (cfg.key) return 'key';
    return 'demo';
  }

  function cute(text, limit) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, limit || 300);
  }

  function roleText(ctx) {
    return cute(ctx.roleLabel || (ctx.profile && ctx.profile.role) || 'тиммейт', 80);
  }

  function systemPrompt(ctx) {
    var profile = ctx.profile || {};
    var lang = ctx.lang === 'kk' ? 'казахском' : 'русском';
    var skills = (profile.skills || []).slice(0, 8).join(', ');
    var interests = (profile.interests || []).slice(0, 6).join(', ');
    var bio = cute(ctx.bio || '', 240);

    return [
      'Ты — не ассистент и не ИИ. Ты изображаешь обычного школьника/школьницу в чате учебного проекта.',
      'Отвечай ТОЛЬКО от первого лица, как живой человек, коротко и дружелюбно: 1–3 предложения, можно один вопрос в ответ.',
      'Язык ответа — ' + lang + '. Не используй канцелярит, не объясняй, что ты модель, не добавляй подписи и списки.',
      'Твой профиль: имя ' + cute(profile.name || 'друг', 60) + '; роль ' + roleText(ctx) + '; навыки ' + (skills || 'разные') + '; интересы ' + (interests || 'разные') + '.',
      bio ? 'О себе: ' + bio + '.' : '',
      'Проект: «' + cute(ctx.project && ctx.project.name || 'наш проект', 80) + '».',
      'Ты только что получил(а) приглашение в этот проект. Поддержи беседу естественно, как тиммейт, который заинтересован проектом.',
      'Если тебя спрашивают про навыки — опирайся на профиль. Не выдумывай факты про оценки, возраст и контакты.'
    ].filter(Boolean).join('\n');
  }

  function contents(ctx) {
    var history = Array.isArray(ctx.history) ? ctx.history.slice(-10) : [];
    var list = history.map(function (item) {
      return {
        role: item.from === 'them' ? 'model' : 'user',
        parts: [{ text: cute(item.text, 600) }]
      };
    });
    // Последнее сообщение пользователя уже есть в history — не дублируем его.
    var last = list[list.length - 1];
    if (!last || last.role !== 'user' || cute(last.parts[0].text, 600) !== cute(ctx.message, 600)) {
      list.push({ role: 'user', parts: [{ text: cute(ctx.message, 600) }] });
    }
    if (!list.length) list.push({ role: 'user', parts: [{ text: 'Привет!' }] });
    return list;
  }

  function payload(ctx) {
    return {
      model: config().model,
      systemInstruction: { parts: [{ text: systemPrompt(ctx) }] },
      contents: contents(ctx),
      generationConfig: { temperature: 0.9, maxOutputTokens: 180 }
    };
  }

  function extract(data) {
    var text = data && data.text;
    if (!text && data && data.candidates && data.candidates.length) {
      var parts = data.candidates[0].content && data.candidates[0].content.parts;
      if (parts && parts.length) text = parts.map(function (p) { return p.text || ''; }).join('');
    }
    return cute(text, 800);
  }

  function post(url, body, headers, timeout) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, timeout || 20000) : null;

    var options = {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    };
    if (controller) options.signal = controller.signal;

    return window.fetch(url, options).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (data) {
      if (timer) window.clearTimeout(timer);
      var text = extract(data);
      if (!text) throw new Error('empty response');
      return text;
    }).catch(function (err) {
      if (timer) window.clearTimeout(timer);
      throw err;
    });
  }

  /* ---------------- демо-режим без ключа ---------------- */

  function demoReply(ctx) {
    var text = cute(ctx.message, 200).toLowerCase();
    var name = String((ctx.profile && ctx.profile.name) || '').split(' ')[0];
    var kk = ctx.lang === 'kk';
    var variants = [];

    if (/привет|здрав|салем|сәлем|hi|hello/.test(text)) {
      variants = kk
        ? ['Сәлем! Шақыруыңды көрдім, рахмет 👋', 'Сәлем! Жоба туралы сөйлесейік.', 'Иә, салем! Қандай идея бар?']
        : ['Привет! Спасибо за приглашение 👋', 'Привет! Давай обсудим проект.', 'Йо! Рад знакомству, что за идея?'];
    } else if (/спасибо|рахмет|рақмет|thanks/.test(text)) {
      variants = kk ? ['Пожалуйста! Бірге жасаймыз 💪', 'Рақмет деп не? Кеттік!', 'Оқасы жоқ, бастайық.'] : ['Пожалуйста! Вместе получится 💪', 'Не за что, погнали!', 'Рад помочь — начинаем?'];
    } else if (/когда|срок|deadline|қашан|уақыт/.test(text)) {
      variants = kk ? ['Аптасына 2–4 сағат шыға аламын.', 'Кешкі уақыт ыңғайлы, кездесейік.', 'Дедлайнға дейін үлгереміз деп ойлаймын.'] : ['Могу уделять 2–4 часа в неделю.', 'Удобно вечером — давай созвонимся.', 'Думаю, до дедлайна успеем.'];
    } else if (/дизайн|figma|фигма|макет|ui|құрал/.test(text)) {
      variants = kk ? ['Макетті Figma-да жасай аламын.', 'Дизайн жағынан көмектесемін.', 'Керек болса референстар жинаймын.'] : ['Могу набросать макет в Figma.', 'Возьму дизайн на себя.', 'Могу собрать референсы и стиль.'];
    } else if (/код|python|пайтон|js|react|frontend|backend|program|жаз/.test(text)) {
      variants = kk ? ['Код жағын өзім ала аламын.', 'Python-мен жұмыс істеуге дайынмын.', 'Алғашқы прототипті тез жинаймыз.'] : ['Возьму часть кода на себя.', 'С Python всё ок, могу помочь.', 'Соберём первый прототип быстро.'];
    } else if (/план|идея|идеясы|жоспар|что делать|неден/.test(text)) {
      variants = kk ? ['Бөліп алайық: идея, макет, прототип.', 'Әуелі мақсатты анықтайық.', 'Қысқа жоспар құрайық, бастайық.'] : ['Давай разобьём: идея, макет, прототип.', 'Сначала определим цель проекта.', 'Набросаем план и начнём.'];
    } else {
      variants = kk
        ? ['Иә, қызық! Ары қарай айтшы 👀', 'Менде де осындай ой бар еді.', 'Жақсы, бірге жасайық.']
        : ['Да, звучит интересно! Расскажи подробнее 👀', 'О, у меня похожая идея была.', 'Ок, давай сделаем это вместе.'];
    }

    var index = Math.abs(cute(ctx.message, 200).length + (name ? name.length : 0)) % variants.length;
    return variants[index];
  }

  /* ---------------- публичный API ---------------- */

  window.PM_AI = {
    mode: mode,
    config: config,

    setKey: function (value) { save(KEY_STORAGE, cute(value, 200)); },
    setEndpoint: function (value) { save(ENDPOINT_STORAGE, cute(value, 300)); },

    reply: function (ctx) {
      ctx = ctx || {};
      var cfg = config();
      var body = payload(ctx);

      if (!cfg.endpoint && !cfg.key) {
        return Promise.resolve({ text: demoReply(ctx), source: 'demo' });
      }

      var request = cfg.endpoint
        ? post(cfg.endpoint, body, { 'Content-Type': 'application/json' }, 20000)
        : post(API + cfg.model + ':generateContent', body, {
            'Content-Type': 'application/json',
            'x-goog-api-key': cfg.key
          }, 20000);

      return request.then(function (text) {
        return { text: text, source: 'ai' };
      }).catch(function (err) {
        return {
          text: demoReply(ctx),
          source: 'demo',
          error: (err && err.message) ? err.message : 'AI unavailable'
        };
      });
    }
  };
})();
