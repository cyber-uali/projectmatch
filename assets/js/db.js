/* =========================================================
   ProjectMatch — слой базы данных

   Реализация для статического прототипа: данные из data.js
   кладутся в localStorage и живут между перезагрузками.
   Избранное и отправленные приглашения тоже сохраняются.

   API (window.PM_DB):
     list()                 — все профили
     get(id)                — один профиль или null
     count()                — сколько профилей
     favorites()            — профили в избранном
     isFavorite(id)         — true/false
     toggleFavorite(id)     — переключить, вернуть новое состояние
     isInvited(id)          — приглашение уже отправлено?
     invite(id)             — отправить приглашение (true, если новое)
     invitedCount()         — сколько приглашений отправлено
     resetUser()            — очистить избранное и приглашения
     resetAll()             — вернуть базу к исходным данным
     stats()                — { version, total, favorites, invites, storage }

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

  function freshState() {
    return {
      version: SEED.version || 1,
      savedAt: new Date().toISOString(),
      profiles: clone(SEED.profiles || []),
      favorites: {},
      invites: {}
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

  function writeStorage(next) {
    state.savedAt = new Date().toISOString();
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      storageOk = true;
    } catch (e) {
      // Приватный режим или запрет storage: работаем в памяти до перезагрузки.
      storageOk = false;
    }
  }

  var storageOk = true;
  var stored = readStorage();
  var state = freshState();

  if (stored && typeof stored === 'object') {
    // Избранное и приглашения переносим всегда — они привязаны к id профиля.
    if (stored.favorites && typeof stored.favorites === 'object') state.favorites = stored.favorites;
    if (stored.invites && typeof stored.invites === 'object') state.invites = stored.invites;

    // Профили берём из хранилища, только если версия сида совпадает.
    var sameVersion = Number(stored.version) === Number(state.version);
    var hasProfiles = Array.isArray(stored.profiles) && stored.profiles.length > 0;
    if (sameVersion && hasProfiles) state.profiles = stored.profiles;
  }

  // Записываем сразу: так база появляется в localStorage при первом визите.
  writeStorage(state);

  function find(id) {
    for (var i = 0; i < state.profiles.length; i++) {
      if (state.profiles[i].id === id) return state.profiles[i];
    }
    return null;
  }

  function listByFlag(flag) {
    return state.profiles.filter(function (profile) {
      return !!state[flag][profile.id];
    });
  }

  window.PM_DB = {
    version: state.version,

    list: function () {
      return state.profiles.slice();
    },

    get: function (id) {
      return find(id);
    },

    count: function () {
      return state.profiles.length;
    },

    favorites: function () {
      return listByFlag('favorites');
    },

    isFavorite: function (id) {
      return !!state.favorites[id];
    },

    toggleFavorite: function (id) {
      if (!find(id)) return false;
      if (state.favorites[id]) {
        delete state.favorites[id];
      } else {
        state.favorites[id] = Date.now();
      }
      writeStorage(state);
      return !!state.favorites[id];
    },

    isInvited: function (id) {
      return !!state.invites[id];
    },

    invite: function (id) {
      if (!find(id) || state.invites[id]) return false;
      state.invites[id] = Date.now();
      writeStorage(state);
      return true;
    },

    invitedCount: function () {
      return Object.keys(state.invites).length;
    },

    resetUser: function () {
      state.favorites = {};
      state.invites = {};
      writeStorage(state);
    },

    resetAll: function () {
      state = freshState();
      writeStorage(state);
    },

    stats: function () {
      return {
        version: state.version,
        total: state.profiles.length,
        favorites: Object.keys(state.favorites).length,
        invites: Object.keys(state.invites).length,
        storage: storageOk ? 'localStorage' : 'memory'
      };
    }
  };
})();
