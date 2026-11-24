/* =========================================================
   ProjectMatch — слой базы данных

   Статический прототип: профили из data.js кладутся в localStorage.
   Плюс пользовательские данные: проекты, приглашения и переписки.

   API (window.PM_DB):
     list() / get(id) / count()                 — профили
     favorites(), isFavorite(id), toggleFavorite(id)
     projects(), createProject(name)            — проекты пользователя
     inviteToProject(profileId, projectId, message)
     invites(), invitesForProject(id)           — отправленные приглашения
     isInvited(profileId, projectId?)
     threads()                                  — диалоги (проект + человек)
     messages(threadId), sendMessage(threadId, text, from)
     threadId(projectId, profileId)
     invite(id)                                 — старый вызов, для совместимости
     resetUser(), resetAll(), stats()

   Замена на Supabase/Sheets: меняются только внутренности
   этого файла, страница поиска обращается к API.
   ========================================================= */
(function () {
  'use strict';

  var KEY = 'pm-db-v1';
  var SEED = window.PM_DATA || { version: 1, profiles: [] };

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return value;
    }
  }

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function now() { return Date.now(); }

  function freshState() {
    return {
      version: SEED.version || 1,
      savedAt: new Date().toISOString(),
      profiles: clone(SEED.profiles || []),
      favorites: {},
      invites: {},        // старый формат: { profileId: timestamp }
      projects: [],       // { id, name, createdAt }
      inviteList: [],     // { id, profileId, projectId, message, createdAt }
      messages: []        // { id, thread, from, text, at, kind }
    };
  }

  function readStorage() {
    try {
      var raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  var storageOk = true;
  var stored = readStorage();
  var state = freshState();

  if (stored && typeof stored === 'object') {
    // Пользовательские данные переносим при любом обновлении сида.
    if (stored.favorites && typeof stored.favorites === 'object') state.favorites = stored.favorites;
    if (stored.invites && typeof stored.invites === 'object') state.invites = stored.invites;
    if (Array.isArray(stored.projects)) state.projects = stored.projects;
    if (Array.isArray(stored.inviteList)) state.inviteList = stored.inviteList;
    if (Array.isArray(stored.messages)) state.messages = stored.messages;

    // Профили берём из хранилища, только если версия сида совпадает.
    var sameVersion = Number(stored.version) === Number(state.version);
    var hasProfiles = Array.isArray(stored.profiles) && stored.profiles.length > 0;
    if (sameVersion && hasProfiles) state.profiles = stored.profiles;
  }

  // Старые приглашения («просто приглашён») превращаем в полноценные —
  // с проектом и диалогом, чтобы ничего не пропало после обновления.
  var legacy = Object.keys(state.invites);
  if (legacy.length) {
    var legacyProject = state.projects[0];
    if (!legacyProject) {
      legacyProject = { id: 'prj_my', name: 'Мой проект', createdAt: now() };
      state.projects.push(legacyProject);
    }
    for (var li = 0; li < legacy.length; li++) {
      var oldId = legacy[li];
      var already = state.inviteList.some(function (inv) { return inv.profileId === oldId; });
      if (!already) {
        state.inviteList.push({
          id: uid('inv'),
          profileId: oldId,
          projectId: legacyProject.id,
          message: '',
          createdAt: Number(state.invites[oldId]) || now()
        });
      }
    }
  }

  function writeStorage() {
    state.savedAt = new Date().toISOString();
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      storageOk = true;
    } catch (e) {
      // Приватный режим или запрет storage: работаем в памяти до перезагрузки.
      storageOk = false;
    }
  }

  writeStorage();

  function find(id) {
    for (var i = 0; i < state.profiles.length; i++) {
      if (state.profiles[i].id === id) return state.profiles[i];
    }
    return null;
  }

  function findProject(id) {
    for (var i = 0; i < state.projects.length; i++) {
      if (state.projects[i].id === id) return state.projects[i];
    }
    return null;
  }

  function threadId(projectId, profileId) {
    return 't|' + projectId + '|' + profileId;
  }

  function inviteFor(profileId, projectId) {
    for (var i = 0; i < state.inviteList.length; i++) {
      var inv = state.inviteList[i];
      if (inv.profileId === profileId && (!projectId || inv.projectId === projectId)) return inv;
    }
    return null;
  }

  function defaultProject() {
    if (!state.projects.length) {
      state.projects.push({ id: 'prj_my', name: 'Мой проект', createdAt: now() });
    }
    return state.projects[0];
  }

  function createProject(name) {
    var clean = String(name == null ? '' : name).trim().slice(0, 80);
    if (!clean) return null;
    for (var i = 0; i < state.projects.length; i++) {
      if (state.projects[i].name.toLowerCase() === clean.toLowerCase()) return state.projects[i];
    }
    var project = { id: uid('prj'), name: clean, createdAt: now() };
    state.projects.push(project);
    writeStorage();
    return project;
  }

  function inviteToProject(profileId, projectId, message) {
    var profile = find(profileId);
    var project = findProject(projectId);
    if (!profile || !project) return null;
    if (inviteFor(profileId, projectId)) return null;

    var invite = {
      id: uid('inv'),
      profileId: profileId,
      projectId: projectId,
      message: String(message == null ? '' : message).trim().slice(0, 500),
      createdAt: now()
    };
    state.inviteList.push(invite);
    state.invites[profileId] = now();

    state.messages.push({
      id: uid('msg'),
      thread: threadId(projectId, profileId),
      from: 'me',
      kind: 'invite',
      text: invite.message,
      at: now()
    });
    writeStorage();
    return clone(invite);
  }

  function messages(thread) {
    return state.messages.filter(function (msg) { return msg.thread === thread; })
      .sort(function (a, b) { return a.at - b.at; })
      .map(clone);
  }

  window.PM_DB = {
    version: state.version,

    list: function () { return state.profiles.slice(); },
    get: function (id) { return find(id); },
    count: function () { return state.profiles.length; },

    favorites: function () {
      return state.profiles.filter(function (p) { return !!state.favorites[p.id]; });
    },
    isFavorite: function (id) { return !!state.favorites[id]; },
    toggleFavorite: function (id) {
      if (!find(id)) return false;
      if (state.favorites[id]) delete state.favorites[id];
      else state.favorites[id] = now();
      writeStorage();
      return !!state.favorites[id];
    },

    projects: function () { return state.projects.slice().sort(function (a, b) { return a.createdAt - b.createdAt; }); },
    createProject: createProject,
    getProject: function (id) { return findProject(id); },

    inviteToProject: inviteToProject,
    invites: function () { return state.inviteList.map(clone); },
    invitesForProject: function (projectId) {
      return state.inviteList.filter(function (inv) { return inv.projectId === projectId; }).map(clone);
    },
    isInvited: function (profileId, projectId) {
      if (projectId) return !!inviteFor(profileId, projectId);
      return !!state.invites[profileId] || !!inviteFor(profileId);
    },
    invitedCount: function () { return state.inviteList.length; },

    // Старый API: приглашаем в «Мой проект», если вызывают из старого кода.
    invite: function (id) {
      return !!inviteToProject(id, defaultProject().id, '');
    },

    threadId: threadId,

    threads: function () {
      var list = state.inviteList.map(function (inv) {
        var thread = threadId(inv.projectId, inv.profileId);
        var all = messages(thread);
        var last = all.length ? all[all.length - 1] : null;
        return {
          id: thread,
          invite: clone(inv),
          project: findProject(inv.projectId),
          profile: find(inv.profileId),
          last: last,
          count: all.length
        };
      }).filter(function (item) { return item.project && item.profile; });

      return list.sort(function (a, b) {
        var ta = a.last ? a.last.at : a.invite.createdAt;
        var tb = b.last ? b.last.at : b.invite.createdAt;
        return tb - ta;
      });
    },

    messages: messages,

    sendMessage: function (thread, text, from) {
      var clean = String(text == null ? '' : text).trim().slice(0, 1000);
      if (!clean) return null;
      var parts = String(thread).split('|');
      if (parts.length !== 3 || parts[0] !== 't' || !inviteFor(parts[2], parts[1])) return null;
      var msg = {
        id: uid('msg'),
        thread: thread,
        from: from === 'them' ? 'them' : 'me',
        kind: 'text',
        text: clean,
        at: now()
      };
      state.messages.push(msg);
      writeStorage();
      return clone(msg);
    },

    resetUser: function () {
      state.favorites = {};
      state.invites = {};
      state.projects = [];
      state.inviteList = [];
      state.messages = [];
      writeStorage();
    },

    resetAll: function () {
      state = freshState();
      writeStorage();
    },

    stats: function () {
      return {
        version: state.version,
        total: state.profiles.length,
        favorites: Object.keys(state.favorites).length,
        invites: state.inviteList.length,
        projects: state.projects.length,
        messages: state.messages.length,
        storage: storageOk ? 'localStorage' : 'memory'
      };
    }
  };
})();
