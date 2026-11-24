/* =========================================================
   ProjectMatch — страница поиска тиммейтов
   Читает базу через PM_DB, ищет через PM_SEARCH,
   рисует карточки, фильтры, профиль и приглашения.
   ========================================================= */
(function () {
  'use strict';

  var DB = window.PM_DB;
  var engine = window.PM_SEARCH;
  var DATA = window.PM_DATA;
  if (!DB || !engine || !DATA) return;

  var ROLES = DATA.roles;
  var INTERESTS = DATA.interests;

  var lang = window.PM_lang ? window.PM_lang() : 'ru';
  var esc = engine.escapeHtml;
  var index = engine.createIndex(DB.list(), ROLES, INTERESTS, DATA.synonyms);

  function t(key) {
    var value = window.PM_t ? window.PM_t(key) : '';
    return value || key;
  }

  function el(id) { return document.getElementById(id); }

  var els = {
    form: el('finder'),
    q: el('q'),
    clear: el('clear'),
    grid: el('grid'),
    count: el('count'),
    empty: el('empty'),
    emptyReset: el('empty-reset'),
    reset: el('reset'),
    roleChips: el('role-chips'),
    interestChips: el('interest-chips'),
    gradeChips: el('grade-chips'),
    capacityChips: el('capacity-chips'),
    favOnly: el('fav-only'),
    sort: el('sort'),
    filters: el('filters'),
    filtersToggle: el('filters-toggle'),
    modal: el('profile-modal'),
    modalBody: el('pmodal-body'),
    modalClose: el('pmodal-close'),
    toasts: el('toasts')
  };

  if (!els.grid || !els.q) return;

  var state = {
    q: '',
    roles: [],
    interests: [],
    grades: [],
    capacities: [],
    favOnly: false,
    sort: 'relevance'
  };

  var openProfileId = null;
  var searchTimer = null;

  /* ---------------- URL: состояние можно шарить ссылкой ---------------- */

  function readUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      state.q = params.get('q') || '';
      state.roles = splitParam(params.get('role'));
      state.interests = splitParam(params.get('int'));
      state.grades = splitParam(params.get('grade'));
      state.capacities = splitParam(params.get('cap'));
      state.favOnly = params.get('fav') === '1';
      var sort = params.get('sort');
      if (sort === 'name' || sort === 'grade') state.sort = sort;
    } catch (e) { /* старый браузер — работаем без параметров */ }
  }

  function splitParam(value) {
    return value ? value.split(',').filter(Boolean) : [];
  }

  function syncUrl() {
    try {
      var params = new URLSearchParams();
      if (state.q) params.set('q', state.q);
      if (state.roles.length) params.set('role', state.roles.join(','));
      if (state.interests.length) params.set('int', state.interests.join(','));
      if (state.grades.length) params.set('grade', state.grades.join(','));
      if (state.capacities.length) params.set('cap', state.capacities.join(','));
      if (state.favOnly) params.set('fav', '1');
      if (state.sort !== 'relevance') params.set('sort', state.sort);
      var qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
    } catch (e) { /* file:// и приватный режим — молча пропускаем */ }
  }

  /* ---------------- подписи ---------------- */

  function roleLabel(key) {
    var role = ROLES[key];
    return role ? (role[lang] || role.ru || key) : key;
  }

  function interestLabel(key) {
    var item = INTERESTS[key];
    return item ? (item[lang] || item.ru || key) : key;
  }

  function cityLabel(profile) {
    return lang === 'kk' ? (profile.cityKk || profile.city) : profile.city;
  }

  function gradeLabel(grade) {
    return t('grade.' + grade);
  }

  function bioOf(profile) {
    if (!profile.bio) return '';
    return profile.bio[lang] || profile.bio.ru || '';
  }

  function peopleCount(n) {
    if (lang === 'kk') return t('search.count.many').replace('{n}', String(n));
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return t('search.count.one').replace('{n}', String(n));
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return t('search.count.few').replace('{n}', String(n));
    }
    return t('search.count.many').replace('{n}', String(n));
  }

  /* ---------------- чипы фильтров ---------------- */

  function chipHTML(group, value, label, pressed, count) {
    return '<button class="chip' + (pressed ? ' is-active' : '') + '" type="button"'
      + ' data-group="' + group + '"'
      + ' data-value="' + esc(value) + '"'
      + ' aria-pressed="' + (pressed ? 'true' : 'false') + '">'
      + esc(label)
      + (count != null ? '<span class="chip__count">' + count + '</span>' : '')
      + '</button>';
  }

  function countBy(key, value) {
    return DB.list().filter(function (profile) { return profile[key] === value; }).length;
  }

  function countInterest(value) {
    return DB.list().filter(function (profile) {
      return (profile.interests || []).indexOf(value) !== -1;
    }).length;
  }

  function buildFilters() {
    var roleHTML = Object.keys(ROLES).map(function (key) {
      return chipHTML('roles', key, roleLabel(key), state.roles.indexOf(key) !== -1, countBy('role', key));
    }).join('');
    if (els.roleChips) els.roleChips.innerHTML = roleHTML;

    var interestHTML = Object.keys(INTERESTS).map(function (key) {
      return chipHTML('interests', key, interestLabel(key), state.interests.indexOf(key) !== -1, countInterest(key));
    }).join('');
    if (els.interestChips) els.interestChips.innerHTML = interestHTML;

    var gradeHTML = [8, 9, 10, 11].map(function (grade) {
      return chipHTML('grades', String(grade), gradeLabel(grade), state.grades.indexOf(String(grade)) !== -1, countBy('grade', grade));
    }).join('');
    if (els.gradeChips) els.gradeChips.innerHTML = gradeHTML;

    var capacityHTML = ['lt2', '2-4', '5-7', 'gt7'].map(function (key) {
      return chipHTML('capacities', key, t('capacity.' + key), state.capacities.indexOf(key) !== -1, countBy('capacity', key));
    }).join('');
    if (els.capacityChips) els.capacityChips.innerHTML = capacityHTML;
  }

  function syncFilters() {
    var chips = document.querySelectorAll('.filters .chip[data-group]');
    for (var i = 0; i < chips.length; i++) {
      var chip = chips[i];
      var group = chip.getAttribute('data-group');
      var value = chip.getAttribute('data-value');
      var active = state[group] && state[group].indexOf(value) !== -1;
      chip.classList.toggle('is-active', !!active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    if (els.favOnly) els.favOnly.checked = state.favOnly;
    if (els.sort) els.sort.value = state.sort;
  }

  /* ---------------- результаты ---------------- */

  function runSearch() {
    return engine.search(index, {
      text: state.q,
      roles: state.roles,
      interests: state.interests,
      grades: state.grades.map(Number),
      capacities: state.capacities,
      onlyIds: state.favOnly ? DB.favorites().map(function (p) { return p.id; }) : null,
      sort: state.sort
    });
  }

  function cardHTML(item) {
    var profile = item.profile;
    var invited = DB.isInvited(profile.id);
    var favorite = DB.isFavorite(profile.id);
    var score = '';

    if (item.percent != null) {
      score = '<span class="pcard__score" style="--p:' + item.percent + '" role="img"'
        + ' aria-label="' + esc(t('search.relevance')) + ' ' + item.percent + '%"'
        + ' title="' + esc(t('search.relevance')) + '">'
        + '<span>' + item.percent + '<small>%</small></span></span>';
    }

    var skills = (profile.skills || []).map(function (skill) {
      return '<span>' + engine.highlight(skill, state.q, index) + '</span>';
    }).join('');

    var interests = (profile.interests || []).map(function (key) {
      return '<span>' + esc(interestLabel(key)) + '</span>';
    }).join('');

    var looking = (profile.lookingFor || []).map(function (key) {
      return '<span>' + esc(roleLabel(key)) + '</span>';
    }).join('');

    return '<article class="pcard" data-id="' + esc(profile.id) + '">'
      + '<div class="pcard__head">'
      +   '<span class="avatar avatar--lg" data-tone="' + esc(profile.tone) + '">' + esc(profile.initials) + '</span>'
      +   '<div class="pcard__id">'
      +     '<h3 class="pcard__name">' + engine.highlight(profile.name, state.q, index) + '</h3>'
      +     '<p class="pcard__role">' + engine.highlight(roleLabel(profile.role), state.q, index) + '</p>'
      +     '<p class="pcard__meta">' + esc(gradeLabel(profile.grade)) + ' · ' + esc(cityLabel(profile)) + '</p>'
      +   '</div>'
      +   score
      + '</div>'
      + '<p class="pcard__bio">' + esc(bioOf(profile)) + '</p>'
      + '<div class="pcard__section">'
      +   '<p class="pcard__label">' + esc(t('common.skills')) + '</p>'
      +   '<div class="tags">' + skills + '</div>'
      + '</div>'
      + '<div class="pcard__section">'
      +   '<p class="pcard__label">' + esc(t('search.lookingFor')) + '</p>'
      +   '<div class="tags tags--match">' + looking + '</div>'
      + '</div>'
      + '<div class="pcard__foot">'
      +   '<button class="btn btn--primary btn--sm btn--block" type="button" data-act="invite" data-id="' + esc(profile.id) + '"'
      +     (invited ? ' disabled' : '') + '>' + esc(invited ? t('search.card.invited') : t('search.card.invite')) + '</button>'
      +   '<button class="btn btn--icon' + (favorite ? ' is-fav' : '') + '" type="button" data-act="fav" data-id="' + esc(profile.id) + '"'
      +     ' aria-pressed="' + (favorite ? 'true' : 'false') + '"'
      +     ' aria-label="' + esc(favorite ? t('search.card.unfav') : t('search.card.fav')) + '">'
      +     heartSVG() + '</button>'
      + '</div>'
      + '</article>';
  }

  function heartSVG() {
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">'
      + '<path d="M12 20s-7-4.35-7-9a3.9 3.9 0 0 1 7-2.4A3.9 3.9 0 0 1 19 11c0 4.65-7 9-7 9Z"'
      + ' fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" /></svg>';
  }

  function renderResults() {
    var results = runSearch();

    els.grid.innerHTML = results.map(cardHTML).join('');
    els.grid.hidden = results.length === 0;
    if (els.empty) els.empty.hidden = results.length !== 0;
    if (els.count) els.count.textContent = peopleCount(results.length);

    syncUrl();
  }

  /* ---------------- тосты ---------------- */

  function toast(message) {
    if (!els.toasts) return;
    var node = document.createElement('div');
    node.className = 'toast-msg';
    node.textContent = message;
    els.toasts.appendChild(node);

    window.setTimeout(function () {
      node.classList.add('is-out');
      window.setTimeout(function () { node.remove(); }, 320);
    }, 2800);
  }

  /* ---------------- профиль ---------------- */

  function modalHTML(profile) {
    var invited = DB.isInvited(profile.id);
    var favorite = DB.isFavorite(profile.id);

    function tags(list, className) {
      return '<div class="tags ' + (className || '') + '">' + list.map(function (label) {
        return '<span>' + esc(label) + '</span>';
      }).join('') + '</div>';
    }

    return '<div class="pmodal__hero">'
      +   '<span class="avatar avatar--xl" data-tone="' + esc(profile.tone) + '">' + esc(profile.initials) + '</span>'
      +   '<div>'
      +     '<h2 class="pmodal__name" id="pmodal-name">' + esc(profile.name) + '</h2>'
      +     '<p class="pmodal__role">' + esc(roleLabel(profile.role)) + '</p>'
      +     '<p class="pmodal__meta">' + esc(gradeLabel(profile.grade)) + ' · ' + esc(cityLabel(profile))
      +       ' · ' + esc(t('capacity.' + profile.capacity)) + '</p>'
      +   '</div>'
      + '</div>'
      + '<p class="pmodal__bio">' + esc(bioOf(profile)) + '</p>'
      + '<div class="pmodal__facts">'
      +   '<div class="pmodal__fact"><p class="pmodal__label">' + esc(t('common.skills')) + '</p>'
      +     tags(profile.skills || []) + '</div>'
      +   '<div class="pmodal__fact"><p class="pmodal__label">' + esc(t('search.interests')) + '</p>'
      +     tags((profile.interests || []).map(interestLabel), 'tags--match') + '</div>'
      +   '<div class="pmodal__fact"><p class="pmodal__label">' + esc(t('search.lookingFor')) + '</p>'
      +     tags((profile.lookingFor || []).map(roleLabel)) + '</div>'
      +   '<div class="pmodal__fact"><p class="pmodal__label">' + esc(t('search.projects')) + '</p>'
      +     '<p class="pmodal__num">' + Number(profile.projects || 0) + '</p></div>'
      + '</div>'
      + '<div class="pmodal__foot">'
      +   '<button class="btn btn--primary btn--block" type="button" data-act="invite" data-id="' + esc(profile.id) + '"'
      +     (invited ? ' disabled' : '') + '>' + esc(invited ? t('search.card.invited') : t('search.card.invite')) + '</button>'
      +   '<button class="btn btn--outline" type="button" data-act="fav" data-id="' + esc(profile.id) + '">'
      +     esc(favorite ? t('search.card.unfav') : t('search.card.fav')) + '</button>'
      + '</div>';
  }

  function openProfile(id) {
    var profile = DB.get(id);
    if (!profile || !els.modal || !els.modalBody) return;

    openProfileId = id;
    els.modalBody.innerHTML = modalHTML(profile);

    if (typeof els.modal.showModal === 'function') {
      if (!els.modal.open) els.modal.showModal();
    } else {
      els.modal.setAttribute('open', '');
    }
  }

  function refreshModal() {
    if (!openProfileId) return;
    if (els.modal && els.modal.open) {
      els.modalBody.innerHTML = modalHTML(DB.get(openProfileId));
    }
  }

  function closeProfile() {
    if (!els.modal) return;
    openProfileId = null;
    if (typeof els.modal.close === 'function' && els.modal.open) els.modal.close();
    else els.modal.removeAttribute('open');
  }

  /* ---------------- действия ---------------- */

  function invite(id) {
    var profile = DB.get(id);
    if (!profile) return;

    if (DB.isInvited(id)) {
      toast(t('search.toast.already'));
      return;
    }

    DB.invite(id);
    var firstName = String(profile.name).split(' ')[0];
    toast(t('search.toast.invited').replace('{name}', firstName));

    renderResults();
    refreshModal();
  }

  function toggleFavorite(id) {
    var nowFavorite = DB.toggleFavorite(id);
    toast(nowFavorite ? t('search.toast.saved') : t('search.toast.removed'));
    renderResults();
    refreshModal();
  }

  function resetFilters() {
    state.roles = [];
    state.interests = [];
    state.grades = [];
    state.capacities = [];
    state.favOnly = false;
    syncFilters();
    renderResults();
  }

  function resetAll() {
    resetFilters();
    state.q = '';
    els.q.value = '';
    updateClearButton();
    renderResults();
  }

  function updateClearButton() {
    if (els.clear) els.clear.hidden = !els.q.value;
  }

  /* ---------------- события ---------------- */

  els.form.addEventListener('submit', function (event) {
    event.preventDefault();
    state.q = els.q.value.trim();
    renderResults();
    var section = document.querySelector('.results-section');
    if (section && state.q) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  els.q.addEventListener('input', function () {
    state.q = els.q.value.trim();
    updateClearButton();
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(renderResults, 140);
  });

  els.q.addEventListener('search', function () {
    state.q = els.q.value.trim();
    updateClearButton();
    renderResults();
  });

  if (els.clear) {
    els.clear.addEventListener('click', function () {
      els.q.value = '';
      state.q = '';
      updateClearButton();
      renderResults();
      els.q.focus();
    });
  }

  document.querySelectorAll('[data-suggest]').forEach(function (button) {
    button.addEventListener('click', function () {
      var value = button.getAttribute('data-suggest') || '';
      els.q.value = value;
      state.q = value;
      updateClearButton();
      renderResults();
      els.q.focus();
    });
  });

  if (els.filters) {
    els.filters.addEventListener('click', function (event) {
      var chip = event.target.closest('.chip[data-group]');
      if (!chip) return;
      var group = chip.getAttribute('data-group');
      var value = chip.getAttribute('data-value');
      var list = state[group];
      if (!list) return;
      var position = list.indexOf(value);
      if (position === -1) list.push(value);
      else list.splice(position, 1);
      syncFilters();
      renderResults();
    });
  }

  if (els.reset) els.reset.addEventListener('click', resetFilters);
  if (els.emptyReset) els.emptyReset.addEventListener('click', resetAll);

  if (els.favOnly) {
    els.favOnly.addEventListener('change', function () {
      state.favOnly = els.favOnly.checked;
      renderResults();
    });
  }

  if (els.sort) {
    els.sort.addEventListener('change', function () {
      state.sort = els.sort.value;
      renderResults();
    });
  }

  if (els.filtersToggle) {
    els.filtersToggle.addEventListener('click', function () {
      var open = els.filters.classList.toggle('is-open');
      els.filtersToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  els.grid.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-act]');
    if (button) {
      var action = button.getAttribute('data-act');
      var id = button.getAttribute('data-id');
      if (action === 'invite') invite(id);
      else if (action === 'fav') toggleFavorite(id);
      return;
    }

    var card = event.target.closest('.pcard');
    if (card) openProfile(card.getAttribute('data-id'));
  });

  if (els.modalBody) {
    els.modalBody.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-act]');
      if (!button) return;
      var action = button.getAttribute('data-act');
      var id = button.getAttribute('data-id');
      if (action === 'invite') invite(id);
      else if (action === 'fav') toggleFavorite(id);
    });
  }

  if (els.modalClose) els.modalClose.addEventListener('click', closeProfile);

  if (els.modal) {
    els.modal.addEventListener('click', function (event) {
      if (event.target === els.modal) closeProfile();
    });
    els.modal.addEventListener('close', function () { openProfileId = null; });
  }

  // «/» фокусирует поиск, как в каталогах
  document.addEventListener('keydown', function (event) {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement.isContentEditable) return;
    event.preventDefault();
    els.q.focus();
  });

  document.addEventListener('pm:lang', function (event) {
    lang = (event.detail && event.detail.lang) || (window.PM_lang ? window.PM_lang() : 'ru');
    buildFilters();
    syncFilters();
    renderResults();
    refreshModal();
  });

  /* ---------------- старт ---------------- */

  readUrl();
  els.q.value = state.q;
  updateClearButton();
  buildFilters();
  syncFilters();
  renderResults();
})();
