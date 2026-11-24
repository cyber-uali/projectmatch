/* =========================================================
   ProjectMatch — поисковый движок

   Ищет по имени, роли, навыкам, интересам, городу и био.
   Понимает синонимы («программист» → frontend/backend,
   «пайтон» → навык Python) и простую морфологию
   («дизайнеры», «дизайнера», «дизайнером»).

   API (window.PM_SEARCH):
     createIndex(profiles, roles, interests, synonyms) → index
     search(index, params) → [{ profile, score, percent }]
     highlight(text, query, index) → безопасный HTML с <mark>
     normalize(text), tokens(text) — утилиты

   params:
     text       — строка запроса
     roles      — массив ключей ролей (ИЛИ между собой)
     interests  — массив ключей интересов
     grades     — массив классов
     capacities — массив значений занятости
     onlyIds    — массив id (например, только избранное)
     sort       — 'relevance' | 'name' | 'grade'
   ========================================================= */
(function (root) {
  'use strict';

  var STOP = {
    'и': 1, 'в': 1, 'во': 1, 'на': 1, 'с': 1, 'со': 1, 'для': 1, 'по': 1, 'из': 1,
    'к': 1, 'ко': 1, 'у': 1, 'о': 1, 'об': 1, 'от': 1, 'до': 1, 'а': 1, 'но': 1,
    'или': 1, 'же': 1, 'не': 1, 'the': 1, 'a': 1, 'an': 1, 'in': 1, 'for': 1,
    'and': 1, 'to': 1, 'of': 1, 'мен': 1, 'және': 1, 'үшін': 1, 'бар': 1, 'жоқ': 1
  };

  // Окончания для очень простого стеммера. Порядок важен: длинные раньше коротких.
  var SUFFIXES = [
    'иями', 'ями', 'ами', 'ыми', 'ими', 'ией',
    'ов', 'ев', 'ий', 'ый', 'ой', 'ая', 'ое', 'ые', 'ие', 'ых', 'их',
    'ей', 'ом', 'ем', 'ах', 'ях', 'ам', 'ям', 'ию', 'ия', 'ью', 'ья',
    'ую', 'юю', 'ы', 'и', 'а', 'я', 'о', 'е', 'у', 'ю', 'ь', 'й', 's'
  ];

  var WORD_RE = /[0-9A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІіЁё]+/g;

  var EXTRA_CONCEPTS = [
    { words: ['программ', 'кодер', 'developer', 'разработ', 'бағдарлама'], concepts: ['frontend', 'backend', 'data'] },
    { words: ['айти', 'it', 'компьютер'], concepts: ['frontend', 'backend', 'data'] }
  ];

  /* ---------------- утилиты текста ---------------- */

  function normalize(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^0-9a-zа-яәғқңөұүһі#+.\-\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function words(value) {
    var parts = normalize(value).split(' ');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].length >= 2) out.push(parts[i]);
    }
    return out;
  }

  function stem(word) {
    var w = word;
    if (w.length <= 4) return w;
    for (var i = 0; i < SUFFIXES.length; i++) {
      var s = SUFFIXES[i];
      if (w.length - s.length >= 4 && w.slice(-s.length) === s) return w.slice(0, -s.length);
    }
    return w;
  }

  function tokens(value) {
    var list = words(value);
    for (var i = 0; i < list.length; i++) list[i] = stem(list[i]);
    return list;
  }

  if (root.PM_SEARCH && root.PM_SEARCH.tokens) {
    // Движок уже подключён.
    return;
  }

  /* ---------------- сравнение слов ---------------- */

  function commonPrefix(a, b) {
    var limit = Math.min(a.length, b.length);
    var i = 0;
    while (i < limit && a.charAt(i) === b.charAt(i)) i++;
    return i;
  }

  function levenshtein(a, b, limit) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > limit) return limit + 1;
    var prev = [], curr = [], i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      curr[0] = i;
      var rowMin = curr[0];
      for (j = 1; j <= lb; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        if (curr[j] < rowMin) rowMin = curr[j];
      }
      if (rowMin > limit) return limit + 1;
      var tmp = prev; prev = curr; curr = tmp;
    }
    return prev[lb];
  }

  // Насколько слово из данных похоже на слово из запроса: 0 … 1
  function wordFactor(candidate, term) {
    if (!candidate || !term) return 0;
    if (candidate === term) return 1;

    var min = Math.min(candidate.length, term.length);
    if (min >= 4 && (candidate.indexOf(term) === 0 || term.indexOf(candidate) === 0)) return 0.9;
    if (min >= 5 && commonPrefix(candidate, term) >= 5) return 0.75;
    if (min >= 6 && Math.abs(candidate.length - term.length) <= 2 && levenshtein(candidate, term, 1) <= 1) return 0.6;
    return 0;
  }

  function listFactor(list, term) {
    var best = 0;
    for (var i = 0; i < list.length; i++) {
      var value = wordFactor(list[i], term);
      if (value > best) best = value;
      if (best === 1) return 1;
    }
    return best;
  }

  /* ---------------- концепции (синонимы) ---------------- */

  function splitKeywords(value) {
    return tokens(value);
  }

  function buildConceptTable(roles, interests, synonyms) {
    var table = [];

    Object.keys(roles || {}).forEach(function (key) {
      var role = roles[key] || {};
      var stems = splitKeywords(
        [key, role.ru, role.kk].join(' ') + ' ' + (role.kw || []).join(' ')
      );
      table.push({ stems: stems, concepts: [key] });
    });

    Object.keys(interests || {}).forEach(function (key) {
      var item = interests[key] || {};
      var stems = splitKeywords(
        [key, item.ru, item.kk].join(' ') + ' ' + (item.kw || []).join(' ')
      );
      table.push({ stems: stems, concepts: ['i:' + key] });
    });

    EXTRA_CONCEPTS.forEach(function (rule) {
      table.push({ stems: splitKeywords(rule.words.join(' ')), concepts: rule.concepts.slice() });
    });

    (synonyms || []).forEach(function (rule) {
      if (!rule || !rule.concepts || !rule.concepts.length) return;
      var stems = splitKeywords((rule.words || []).join(' '));
      if (stems.length) table.push({ stems: stems, concepts: rule.concepts.slice() });
    });

    return table;
  }

  /* Синонимы технологий: «пайтон» → навык python.
     Отдельно от ролей, чтобы запрос не находил всю роль целиком. */
  function buildSkillAliases(synonyms) {
    var rules = [];
    (synonyms || []).forEach(function (rule) {
      if (!rule || !rule.skills || !rule.skills.length) return;
      var stems = splitKeywords((rule.words || []).join(' '));
      var skills = splitKeywords(rule.skills.join(' '));
      if (stems.length && skills.length) rules.push({ stems: stems, skills: skills });
    });
    return rules;
  }

  function conceptsForToken(term, table) {
    var found = [];
    for (var i = 0; i < table.length; i++) {
      if (!listFactor(table[i].stems, term)) continue;
      for (var j = 0; j < table[i].concepts.length; j++) {
        var concept = table[i].concepts[j];
        if (found.indexOf(concept) === -1) found.push(concept);
      }
    }
    return found;
  }

  /* ---------------- индекс ---------------- */

  function buildEntry(profile, roles, interests) {
    var role = roles[profile.role] || {};
    var interestLabels = [];
    var interestWords = [];
    var conceptMap = {};

    (profile.interests || []).forEach(function (key) {
      var item = interests[key] || {};
      interestLabels.push(item.ru || '', item.kk || '', key);
      interestWords = interestWords.concat(tokens(item.ru || ''), tokens(item.kk || ''));
      conceptMap['i:' + key] = 5;
    });

    conceptMap[profile.role] = 8;

    return {
      profile: profile,
      name: tokens(profile.name),
      role: tokens([role.ru, role.kk, profile.role].join(' ') + ' ' + (role.kw || []).join(' ')),
      skills: tokens((profile.skills || []).join(' ')),
      interests: tokens(interestLabels.join(' ')).concat(interestWords),
      city: tokens([profile.city, profile.cityKk].join(' ') + ' онлайн online'),
      bio: tokens(
        ((profile.bio && profile.bio.ru) || '') + ' ' + ((profile.bio && profile.bio.kk) || '')
      ),
      concepts: conceptMap
    };
  }

  function createIndex(profiles, roles, interests, synonyms) {
    var list = synonyms || (root.PM_DATA && root.PM_DATA.synonyms) || [];
    var conceptTable = buildConceptTable(roles, interests, list);
    var skillAliases = buildSkillAliases(list);
    var entries = (profiles || []).map(function (profile) {
      return buildEntry(profile, roles, interests);
    });
    return {
      entries: entries,
      conceptTable: conceptTable,
      skillAliases: skillAliases,
      roles: roles || {},
      interests: interests || {},
      size: entries.length
    };
  }

  /* ---------------- запрос ---------------- */

  var FIELDS = [
    ['name', 14],
    ['role', 8],
    ['skills', 6],
    ['interests', 5],
    ['city', 2.5],
    ['bio', 1.2]
  ];

  function prepareQuery(text, index) {
    var raw = words(text);
    var aliasRules = (index && index.skillAliases) || [];
    var conceptTable = (index && index.conceptTable) || [];
    var prepared = [];

    for (var i = 0; i < raw.length; i++) {
      if (STOP[raw[i]]) continue;
      var term = stem(raw[i]);
      if (!term || term.length < 2) continue;

      // «пайтон» → навык python, «фигма» → figma
      var aliases = [];
      for (var a = 0; a < aliasRules.length; a++) {
        if (listFactor(aliasRules[a].stems, term)) {
          aliases = aliases.concat(aliasRules[a].skills);
        }
      }

      prepared.push({
        raw: raw[i],
        stem: term,
        concepts: conceptsForToken(term, conceptTable),
        aliases: aliases
      });
    }
    return prepared;
  }

  function scoreEntry(entry, terms) {
    var total = 0;

    for (var i = 0; i < terms.length; i++) {
      var term = terms[i].stem;
      var best = 0;

      for (var f = 0; f < FIELDS.length; f++) {
        var factor = listFactor(entry[FIELDS[f][0]], term);
        if (!factor) continue;
        var value = factor * FIELDS[f][1];
        if (value > best) best = value;
      }

      var concepts = terms[i].concepts;
      for (var c = 0; c < concepts.length; c++) {
        var weight = entry.concepts[concepts[c]];
        if (weight && weight > best) best = weight;
      }

      var aliases = terms[i].aliases || [];
      for (var a = 0; a < aliases.length; a++) {
        var aliasValue = listFactor(entry.skills, aliases[a]) * 6;
        if (aliasValue > best) best = aliasValue;
      }

      // Все слова запроса обязательны: «дизайнер алматы» ищет дизайнеров из Алматы.
      if (!best) return 0;
      total += best;
    }

    return total;
  }

  function relevance(total, termsCount) {
    if (!termsCount) return null;
    var average = total / termsCount;
    var percent = Math.round((average / 8) * 99);
    return Math.max(50, Math.min(99, percent));
  }

  function search(index, params) {
    if (!index) return [];
    params = params || {};

    var roles = params.roles || [];
    var interests = params.interests || [];
    var grades = params.grades || [];
    var capacities = params.capacities || [];
    var onlyIds = params.onlyIds || null;
    var sort = params.sort || 'relevance';
    var terms = prepareQuery(params.text || '', index);
    var results = [];

    index.entries.forEach(function (entry) {
      var profile = entry.profile;

      if (roles.length && roles.indexOf(profile.role) === -1) return;
      if (interests.length) {
        var hasInterest = (profile.interests || []).some(function (key) {
          return interests.indexOf(key) !== -1;
        });
        if (!hasInterest) return;
      }
      if (grades.length && grades.indexOf(profile.grade) === -1) return;
      if (capacities.length && capacities.indexOf(profile.capacity) === -1) return;
      if (onlyIds && onlyIds.indexOf(profile.id) === -1) return;

      var score = 0;
      if (terms.length) {
        score = scoreEntry(entry, terms);
        if (!score) return;
      }

      results.push({
        profile: profile,
        score: score,
        percent: relevance(score, terms.length)
      });
    });

    results.sort(function (a, b) {
      if (sort === 'name') {
        return String(a.profile.name).localeCompare(String(b.profile.name), 'ru');
      }
      if (sort === 'grade') {
        if (a.profile.grade !== b.profile.grade) return a.profile.grade - b.profile.grade;
        return String(a.profile.name).localeCompare(String(b.profile.name), 'ru');
      }
      if (b.score !== a.score) return b.score - a.score;
      return String(a.profile.name).localeCompare(String(b.profile.name), 'ru');
    });

    return results;
  }

  /* ---------------- подсветка совпадений ---------------- */

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlight(text, query, index) {
    var source = String(text == null ? '' : text);
    var terms = [];
    var raw = words(query);
    for (var i = 0; i < raw.length; i++) {
      if (STOP[raw[i]]) continue;
      var s = stem(raw[i]);
      if (s.length >= 3) terms.push(s);
    }

    // «пайтон» подсвечивает навык Python, «фигма» — Figma
    if (index && index.skillAliases) {
      var prepared = prepareQuery(query, index);
      for (var p = 0; p < prepared.length; p++) {
        var aliases = prepared[p].aliases || [];
        for (var a = 0; a < aliases.length; a++) {
          if (aliases[a].length >= 2 && terms.indexOf(aliases[a]) === -1) {
            terms.push(aliases[a]);
          }
        }
      }
    }

    if (!terms.length) return escapeHtml(source);

    var out = [];
    var last = 0;
    var match;
    WORD_RE.lastIndex = 0;

    while ((match = WORD_RE.exec(source))) {
      var piece = match[0];
      var normalized = stem(normalize(piece));
      var hit = terms.some(function (term) {
        return wordFactor(normalized, term) > 0;
      });
      if (!hit) continue;
      out.push(escapeHtml(source.slice(last, match.index)));
      out.push('<mark>');
      out.push(escapeHtml(piece));
      out.push('</mark>');
      last = match.index + piece.length;
    }

    out.push(escapeHtml(source.slice(last)));
    return out.join('');
  }

  root.PM_SEARCH = {
    createIndex: createIndex,
    search: search,
    highlight: highlight,
    normalize: normalize,
    tokens: tokens,
    stem: stem,
    escapeHtml: escapeHtml
  };
})(typeof window !== 'undefined' ? window : globalThis);
