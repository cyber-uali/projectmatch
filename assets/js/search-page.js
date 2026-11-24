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
  var AI = window.PM_AI;
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
    toasts: el('toasts'),

    chatOpen: el('chat-open'),
    chatFab: el('chat-fab'),
    chatBadge: el('chat-badge'),
    chatBadgeFab: el('chat-badge-fab'),
    chatModal: el('chat-modal'),
    chatClose: el('chat-close'),
    chatList: el('chat-list'),
    chatHead: el('chat-head'),
    chatMessages: el('chat-messages'),
    chatForm: el('chat-form'),
    chatInput: el('chat-input'),
    chatMode: el('chat-mode'),
    chatEndpoint: el('chat-endpoint'),
    chatKey: el('chat-key'),
    chatSave: el('chat-save'),
    chatClearKey: el('chat-clear-key'),

    inviteModal: el('invite-modal'),
    inviteForm: el('invite-form'),
    inviteClose: el('invite-close'),
    inviteCancel: el('invite-cancel'),
    inviteWho: el('invite-who'),
    inviteProject: el('invite-project'),
    inviteNewWrap: el('invite-new-wrap'),
    inviteNew: el('invite-new-project'),
    inviteMessage: el('invite-message'),
    inviteError: el('invite-error')
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
  var inviteProfileId = null;
  var activeThread = null;
  var aiBusy = false;

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
      +     '>' + esc(invited ? t('card.invite.again') : t('search.card.invite')) + '</button>'
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
      +     '>' + esc(invited ? t('card.invite.again') : t('search.card.invite')) + '</button>'
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

  /* ---------------- диалоги ---------------- */

  function showDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function hideDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  /* ---------------- приглашение в проект ---------------- */

  function openInvite(id) {
    var profile = DB.get(id);
    if (!profile || !els.inviteModal) return;
    if (els.modal && els.modal.open) closeProfile();

    inviteProfileId = id;
    var projects = DB.projects();
    var options = projects.map(function (project) {
      return '<option value="' + esc(project.id) + '">' + esc(project.name) + '</option>';
    }).join('');
    options += '<option value="__new">' + esc(t('invite.project.new')) + '</option>';

    els.inviteProject.innerHTML = options;
    els.inviteNewWrap.hidden = projects.length > 0;
    els.inviteNew.value = '';
    els.inviteMessage.value = '';
    els.inviteWho.textContent = profile.name;
    els.inviteError.hidden = true;
    showDialog(els.inviteModal);

    window.setTimeout(function () {
      (projects.length ? els.inviteProject : els.inviteNew).focus();
    }, 60);
  }

  function inviteError(message) {
    if (!els.inviteError) return;
    els.inviteError.textContent = message;
    els.inviteError.hidden = false;
  }

  function submitInvite(event) {
    event.preventDefault();
    var profile = DB.get(inviteProfileId);
    if (!profile) return;

    var selected = els.inviteProject.value;
    var project;
    if (selected === '__new') {
      project = DB.createProject(els.inviteNew.value);
      if (!project) {
        inviteError(t('invite.project.name'));
        els.inviteNew.focus();
        return;
      }
    } else {
      project = DB.getProject(selected);
    }
    if (!project) {
      inviteError(t('invite.project.name'));
      return;
    }

    var invite = DB.inviteToProject(profile.id, project.id, els.inviteMessage.value);
    if (!invite) {
      inviteError(t('invite.duplicate'));
      return;
    }

    hideDialog(els.inviteModal);
    toast(t('invite.sent').replace('{project}', project.name));
    renderResults();
    refreshModal();
    updateBadges();
    openChat(DB.threadId(project.id, profile.id));
  }

  /* ---------------- чат ---------------- */

  function findThread() {
    if (!activeThread) return null;
    var list = DB.threads();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === activeThread) return list[i];
    }
    return null;
  }

  function updateBadges() {
    var count = DB.threads().length;
    [els.chatBadge, els.chatBadgeFab].forEach(function (badge) {
      if (!badge) return;
      badge.textContent = String(count);
      badge.hidden = count === 0;
    });
  }

  function lastMessageText(thread) {
    if (!thread.last) return t('chat.messages');
    if (thread.last.kind === 'invite' && !thread.last.text) {
      return t('chat.invited').replace('{project}', thread.project.name);
    }
    return thread.last.text || t('chat.messages');
  }

  function renderChatThreads() {
    if (!els.chatList) return;
    var threads = DB.threads();
    if (!threads.length) {
      els.chatList.innerHTML = '<div class="chat__empty">'
        + '<h3>' + esc(t('chat.empty.title')) + '</h3>'
        + '<p>' + esc(t('chat.empty.text')) + '</p>'
        + '<button class="btn btn--primary btn--sm" type="button" data-act="chat-find">'
        + esc(t('chat.empty.action')) + '</button></div>';
      return;
    }

    els.chatList.innerHTML = threads.map(function (thread) {
      return '<button class="thread' + (thread.id === activeThread ? ' is-active' : '') + '"'
        + ' type="button" data-thread="' + esc(thread.id) + '">'
        + '<span class="avatar" data-tone="' + esc(thread.profile.tone) + '">' + esc(thread.profile.initials) + '</span>'
        + '<span class="thread__body">'
        +   '<span class="thread__name">' + esc(thread.profile.name) + '</span>'
        +   '<span class="thread__project">' + esc(thread.project.name) + '</span>'
        +   '<span class="thread__last">' + esc(lastMessageText(thread)) + '</span>'
        + '</span></button>';
    }).join('');
  }

  function renderChatHead() {
    if (!els.chatHead) return;
    var thread = findThread();
    if (!thread) {
      els.chatHead.innerHTML = '<div class="chat__head-main"><p class="chat__head-name">'
        + esc(t('chat.title')) + '</p></div>';
      return;
    }
    els.chatHead.innerHTML = '<span class="avatar" data-tone="' + esc(thread.profile.tone) + '">'
      + esc(thread.profile.initials) + '</span>'
      + '<div class="chat__head-main">'
      +   '<p class="chat__head-name">' + esc(thread.profile.name) + '</p>'
      +   '<p class="chat__head-meta">' + esc(t('chat.project')) + ': ' + esc(thread.project.name) + '</p>'
      + '</div>'
      + '<button class="btn btn--outline btn--sm chat__profile-btn" type="button"'
      + ' data-act="chat-profile" data-id="' + esc(thread.profile.id) + '">'
      + esc(t('chat.profile')) + '</button>';
  }

  function timeLabel(at) {
    try {
      return new Date(at).toLocaleTimeString(lang === 'kk' ? 'kk-KZ' : 'ru-RU', {
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return '';
    }
  }

  function bubbleHTML(msg) {
    var time = '<span class="bubble__time">' + esc(timeLabel(msg.at)) + '</span>';
    return '<div class="bubble bubble--' + (msg.from === 'them' ? 'them' : 'me') + '">'
      + esc(msg.text) + time + '</div>';
  }

  function renderMessages() {
    if (!els.chatMessages) return;
    var thread = findThread();
    if (!thread) {
      els.chatMessages.innerHTML = '<div class="chat__placeholder">'
        + '<h3>' + esc(t('chat.empty.title')) + '</h3>'
        + '<p>' + esc(t('chat.empty.text')) + '</p></div>';
      return;
    }

    var list = DB.messages(activeThread);
    if (!list.length) {
      els.chatMessages.innerHTML = '<div class="chat__placeholder">'
        + '<p>' + esc(t('chat.empty.text')) + '</p></div>';
      return;
    }

    els.chatMessages.innerHTML = list.map(function (msg) {
      if (msg.kind === 'invite') {
        var caption = '<div class="bubble bubble--invite">'
          + esc(t('chat.invited').replace('{project}', thread.project.name)) + '</div>';
        return msg.text ? caption + bubbleHTML(msg) : caption;
      }
      return bubbleHTML(msg);
    }).join('');

    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }

  function syncAISettings() {
    if (!AI || !els.chatMode) return;
    var cfg = AI.config();
    var mode = AI.mode();
    els.chatMode.textContent = t('chat.ai.' + mode) + (cfg.model ? ' · ' + cfg.model : '');
    if (els.chatEndpoint) els.chatEndpoint.value = cfg.endpoint;
    // Ключ не показываем полностью — только факт, что он сохранён.
    if (els.chatKey) els.chatKey.placeholder = cfg.key ? '••••••••' : t('chat.key.placeholder');
  }

  function openChat(thread) {
    if (!els.chatModal) return;
    var list = DB.threads();
    if (thread) activeThread = thread;
    if (!activeThread || !list.some(function (item) { return item.id === activeThread; })) {
      activeThread = list.length ? list[0].id : null;
    }

    renderChatThreads();
    renderChatHead();
    renderMessages();
    syncAISettings();
    showDialog(els.chatModal);

    window.setTimeout(function () {
      if (activeThread && els.chatInput) els.chatInput.focus();
    }, 60);
  }

  function sendChat(event) {
    event.preventDefault();
    if (aiBusy || !els.chatInput) return;
    var thread = findThread();
    var text = els.chatInput.value.trim();
    if (!thread || !text) return;

    DB.sendMessage(activeThread, text, 'me');
    els.chatInput.value = '';
    renderMessages();
    renderChatThreads();

    aiBusy = true;
    var typing = document.createElement('div');
    typing.className = 'typing';
    typing.textContent = t('chat.typing');
    if (els.chatMessages) {
      els.chatMessages.appendChild(typing);
      els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }

    var history = DB.messages(activeThread).filter(function (msg) {
      return msg.kind !== 'invite';
    }).map(function (msg) {
      return { from: msg.from, text: msg.text };
    });

    var answer = AI && AI.reply ? AI.reply({
      profile: thread.profile,
      roleLabel: roleLabel(thread.profile.role),
      bio: bioOf(thread.profile),
      project: thread.project,
      lang: lang,
      history: history,
      message: text
    }) : Promise.resolve({ text: t('chat.ai.error'), source: 'demo' });

    answer.then(function (result) {
      if (typing.parentNode) typing.remove();
      DB.sendMessage(activeThread, result.text, 'them');
      renderMessages();
      renderChatThreads();
      if (result.source === 'demo' && result.error) toast(t('chat.ai.error'));
    }).catch(function () {
      if (typing.parentNode) typing.remove();
    }).then(function () {
      aiBusy = false;
    });
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
      if (action === 'invite') openInvite(id);
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
      if (action === 'invite') openInvite(id);
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

  /* ---------------- события приглашений и чата ---------------- */

  if (els.inviteProject) {
    els.inviteProject.addEventListener('change', function () {
      if (!els.inviteNewWrap) return;
      els.inviteNewWrap.hidden = els.inviteProject.value !== '__new';
      if (!els.inviteNewWrap.hidden) els.inviteNew.focus();
    });
  }
  if (els.inviteForm) els.inviteForm.addEventListener('submit', submitInvite);
  if (els.inviteClose) els.inviteClose.addEventListener('click', function () { hideDialog(els.inviteModal); });
  if (els.inviteCancel) els.inviteCancel.addEventListener('click', function () { hideDialog(els.inviteModal); });
  if (els.inviteModal) {
    els.inviteModal.addEventListener('click', function (event) {
      if (event.target === els.inviteModal) hideDialog(els.inviteModal);
    });
  }

  [els.chatOpen, els.chatFab].forEach(function (button) {
    if (button) button.addEventListener('click', function () { openChat(null); });
  });
  if (els.chatClose) els.chatClose.addEventListener('click', function () { hideDialog(els.chatModal); });
  if (els.chatModal) {
    els.chatModal.addEventListener('click', function (event) {
      if (event.target === els.chatModal) hideDialog(els.chatModal);
    });
  }

  if (els.chatList) {
    els.chatList.addEventListener('click', function (event) {
      var find = event.target.closest('[data-act="chat-find"]');
      if (find) {
        hideDialog(els.chatModal);
        if (els.q) {
          els.q.scrollIntoView({ behavior: 'smooth', block: 'center' });
          els.q.focus();
        }
        return;
      }
      var thread = event.target.closest('[data-thread]');
      if (!thread) return;
      activeThread = thread.getAttribute('data-thread');
      renderChatThreads();
      renderChatHead();
      renderMessages();
      if (els.chatInput) els.chatInput.focus();
    });
  }

  if (els.chatHead) {
    els.chatHead.addEventListener('click', function (event) {
      var button = event.target.closest('[data-act="chat-profile"]');
      if (!button) return;
      var id = button.getAttribute('data-id');
      hideDialog(els.chatModal);
      openProfile(id);
    });
  }

  if (els.chatForm) els.chatForm.addEventListener('submit', sendChat);

  if (els.chatSave) {
    els.chatSave.addEventListener('click', function () {
      if (!AI) return;
      AI.setEndpoint(els.chatEndpoint ? els.chatEndpoint.value.trim() : '');
      var key = els.chatKey ? els.chatKey.value.trim() : '';
      if (key) AI.setKey(key);
      if (els.chatKey) els.chatKey.value = '';
      syncAISettings();
      toast(t('chat.key.save'));
    });
  }

  if (els.chatClearKey) {
    els.chatClearKey.addEventListener('click', function () {
      if (AI) AI.setKey('');
      if (els.chatKey) els.chatKey.value = '';
      syncAISettings();
      toast(t('chat.key.clear'));
    });
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
    if (els.inviteModal && els.inviteModal.open && inviteProfileId) {
      var profile = DB.get(inviteProfileId);
      if (profile) els.inviteWho.textContent = profile.name;
    }
    if (els.chatModal && els.chatModal.open) {
      renderChatThreads();
      renderChatHead();
      renderMessages();
      syncAISettings();
    }
  });

  /* ---------------- старт ---------------- */

  readUrl();
  els.q.value = state.q;
  updateClearButton();
  buildFilters();
  syncFilters();
  renderResults();
  updateBadges();
  syncAISettings();
})();
