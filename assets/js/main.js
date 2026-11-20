/* =========================================================
   ProjectMatch — интерактив лендинга
   Без зависимостей: только ванильный JS.
   ========================================================= */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Тексты берём из словаря i18n.js, чтобы aria-label менялся вместе с языком
  function t(key, fallback) {
    var value = window.PM_t ? window.PM_t(key) : '';
    return value || fallback;
  }

  /* ---------- 1. Тень у хедера при скролле ---------- */
  var header = document.getElementById('header');
  function onScroll() {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- 2. Мобильное меню ---------- */
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');

  function closeMenu() {
    if (!nav || !burger) return;
    nav.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', t('a11y.menuOpen', 'Открыть меню'));
  }

  if (burger && nav) {
    burger.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(isOpen));
      burger.setAttribute('aria-label', isOpen ? t('a11y.menuClose', 'Закрыть меню') : t('a11y.menuOpen', 'Открыть меню'));
    });

    // Закрываем меню после клика по любой ссылке внутри
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) closeMenu();
    });

    // Закрытие по Esc и по клику вне меню
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeMenu();
    });
    document.addEventListener('click', function (event) {
      if (!nav.classList.contains('is-open')) return;
      if (nav.contains(event.target) || burger.contains(event.target)) return;
      closeMenu();
    });
  }

  /* ---------- 3. Появление блоков при скролле ---------- */
  var reveals = document.querySelectorAll('.reveal');

  if (!('IntersectionObserver' in window) || reduceMotion) {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -40px 0px' });

    reveals.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ---------- 4. Анимация кольца совпадения ---------- */
  var rings = document.querySelectorAll('.ring[data-p]');

  function animateRing(ring) {
    var value = Number(ring.getAttribute('data-p')) || 0;
    // Небольшая задержка, чтобы переход стартовал уже после появления карточки
    window.setTimeout(function () {
      ring.style.setProperty('--p', String(value));
    }, 180);
  }

  if (!('IntersectionObserver' in window) || reduceMotion) {
    rings.forEach(function (ring) {
      ring.style.setProperty('--p', ring.getAttribute('data-p'));
    });
  } else {
    var ringObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        animateRing(entry.target);
        ringObserver.unobserve(entry.target);
      });
    }, { threshold: 0.5 });

    rings.forEach(function (ring) { ringObserver.observe(ring); });
  }

  /* ---------- 5. Счётчик участников ---------- */
  var counters = document.querySelectorAll('[data-count]');

  function runCounter(el) {
    var target = Number(el.getAttribute('data-count')) || 0;
    var duration = 1400;
    var start = null;

    function frame(now) {
      if (start === null) start = now;
      var progress = Math.min((now - start) / duration, 1);
      // easeOutCubic — быстро стартует, мягко замедляется
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(target * eased);
      el.textContent = current.toLocaleString('ru-RU');
      if (progress < 1) window.requestAnimationFrame(frame);
    }

    window.requestAnimationFrame(frame);
  }

  if (reduceMotion || !('IntersectionObserver' in window)) {
    counters.forEach(function (el) {
      el.textContent = Number(el.getAttribute('data-count')).toLocaleString('ru-RU');
    });
  } else {
    var counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        runCounter(entry.target);
        counterObserver.unobserve(entry.target);
      });
    }, { threshold: 0.8 });

    counters.forEach(function (el) { counterObserver.observe(el); });
  }

  /* ---------- 6. Подсветка активного пункта меню ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__link'));
  var sections = navLinks
    .map(function (link) {
      var id = link.getAttribute('href');
      return id && id.charAt(0) === '#' ? document.querySelector(id) : null;
    })
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (link) {
          var isActive = link.getAttribute('href') === '#' + entry.target.id;
          link.style.color = isActive ? 'var(--ink)' : '';
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach(function (section) { sectionObserver.observe(section); });
  }

  /* ---------- 7. Мелочи ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  // Демо-кнопки «Пригласить в проект» пока не ведут на бэкенд —
  // даём мягкий отклик, чтобы прототип ощущался живым.
  document.addEventListener('click', function (event) {
    var button = event.target.closest('.person__foot .btn--primary');
    if (!button || button.disabled) return;

    button.textContent = t('common.invited', 'Приглашение отправлено');
    button.disabled = true;
    button.style.opacity = '0.75';

    window.setTimeout(function () {
      button.disabled = false;
      button.style.opacity = '';
      var key = button.getAttribute('data-i18n');
      button.textContent = key ? t(key, button.textContent) : button.textContent;
    }, 1800);
  });

  // Если язык переключили, пока кнопка показывает «отправлено», — обновляем текст
  document.addEventListener('pm:lang', function () {
    document.querySelectorAll('.person__foot .btn--primary[disabled]').forEach(function (button) {
      button.textContent = t('common.invited', 'Приглашение отправлено');
    });
  });
})();
