/* Recast website — interaction layer. No dependencies, no tracking. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------ utilities */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  /* --------------------------------------------------------------- nav */

  var nav = $('#nav');
  var progress = $('.scroll-progress');
  var progressBar = progress ? $('i', progress) : null;
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY || window.pageYOffset;
      if (nav) nav.classList.toggle('is-scrolled', y > 24);

      if (progress && progressBar) {
        var doc = document.documentElement;
        var max = doc.scrollHeight - window.innerHeight;
        var p = max > 0 ? clamp(y / max, 0, 1) : 0;
        progressBar.style.transform = 'scaleX(' + p + ')';
        progress.classList.toggle('is-on', p > 0.005);
      }
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------------------- mobile menu */

  var toggle = $('#menu-toggle');
  var menu = $('#mobile-menu');
  var lastFocus = null;
  var openRaf = 0;

  function openMenu() {
    if (!menu || !toggle) return;
    lastFocus = document.activeElement;
    menu.hidden = false;
    document.body.style.overflow = 'hidden';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    if (openRaf) cancelAnimationFrame(openRaf);
    openRaf = requestAnimationFrame(function () {
      openRaf = 0;
      menu.classList.add('is-open');
    });
    var first = $('a', menu);
    if (first) first.focus({ preventScroll: true });
  }

  function closeMenu(restoreFocus) {
    if (!menu || !toggle) return;
    if (openRaf) { cancelAnimationFrame(openRaf); openRaf = 0; }
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    document.body.style.overflow = '';
    window.setTimeout(function () {
      if (!menu.classList.contains('is-open')) menu.hidden = true;
    }, 420);
    if (restoreFocus && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      if (toggle.getAttribute('aria-expanded') === 'true') closeMenu(true);
      else openMenu();
    });

    $$('a', menu).forEach(function (a) {
      a.addEventListener('click', function () { closeMenu(false); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        closeMenu(true);
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 1080 && toggle.getAttribute('aria-expanded') === 'true') closeMenu(false);
    });
  }

  /* --------------------------------------------------------- scroll reveal */

  var revealables = $$('[data-reveal]');

  if (!reduceMotion && 'IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });

    revealables.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ------------------------------------------------------ card spotlight */

  $$('[data-spotlight]').forEach(function (card) {
    var raf = 0;
    var mx = 0;
    var my = 0;

    function apply() {
      card.style.setProperty('--mx', mx + 'px');
      card.style.setProperty('--my', my + 'px');
      raf = 0;
    }

    card.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var r = card.getBoundingClientRect();
      mx = Math.round(e.clientX - r.left);
      my = Math.round(e.clientY - r.top);
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });

    card.addEventListener('pointerleave', function () {
      card.style.removeProperty('--mx');
      card.style.removeProperty('--my');
    });
  });

  /* ----------------------------------------------------- before / after */

  var ba = $('#ba');
  var baRange = $('#ba-range');

  function setCompare(v) {
    if (!ba) return;
    ba.style.setProperty('--pos', clamp(v, 0, 100) + '%');
  }

  if (baRange) {
    setCompare(parseFloat(baRange.value));
    baRange.addEventListener('input', function () { setCompare(parseFloat(baRange.value)); });
  }

  /* ---------------------------------------------------------- accordion */

  var triggers = $$('.acc-trigger');

  function panelOf(btn) {
    return document.getElementById(btn.getAttribute('aria-controls'));
  }

  /* The panel animates on max-height, so it needs an exact pixel target —
     measured from the content itself, with a generous fallback in CSS. */
  function openPanel(btn) {
    var panel = panelOf(btn);
    if (!panel) return;

    panel.style.removeProperty('max-height');
    panel.style.setProperty('--acc-max', panel.scrollHeight + 'px');
    panel.classList.add('is-open');

    /* Safety net: a height transition that never runs (background tab,
       throttled compositor, reduced-motion engine) must not be able to hide
       the answer. If the panel is still collapsed after the transition
       window, drop the cap and let it take its natural height. */
    window.setTimeout(function () {
      if (!panel.classList.contains('is-open')) return;
      if (panel.getBoundingClientRect().height < 4) panel.style.maxHeight = 'none';
    }, 700);
  }

  function closePanel(btn) {
    var panel = panelOf(btn);
    if (!panel) return;
    panel.classList.remove('is-open');
    panel.style.removeProperty('max-height');
  }

  triggers.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var isOpen = btn.getAttribute('aria-expanded') === 'true';

      triggers.forEach(function (other) {
        if (other === btn) return;
        other.setAttribute('aria-expanded', 'false');
        closePanel(other);
      });

      btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      if (isOpen) closePanel(btn);
      else openPanel(btn);
    });
  });

  /* -------------------------------------------------------- how steps */

  var howSteps = $$('.how-step');
  var howPanels = $$('.how-panel');

  function setStep(index) {
    howSteps.forEach(function (s, i) { s.classList.toggle('is-active', i === index); });
    howPanels.forEach(function (p, i) { p.classList.toggle('is-active', i === index); });
  }

  if (howSteps.length && 'IntersectionObserver' in window) {
    var stepObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          setStep(parseInt(entry.target.getAttribute('data-step'), 10) || 0);
        }
      });
    }, { rootMargin: '-42% 0px -42% 0px', threshold: 0 });

    howSteps.forEach(function (s) { stepObserver.observe(s); });
  }

  /* -------------------------------------------------------------- year */

  var year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* --------------------------------------------------------- hero demo */

  var demo = $('[data-demo]');

  if (demo) {
    var canvas = $('[data-demo-canvas]', demo);
    var zoomEl = $('[data-demo-zoom]', demo);
    var cursorEl = $('[data-demo-cursor]', demo);
    var rippleEl = $('[data-demo-ripple]', demo);
    var captionEl = $('[data-demo-caption]', demo);
    var playheadEl = $('[data-demo-playhead]', demo);
    var timeEl = $('.demo-time', demo);
    var zoomChip = $('[data-demo-zoomchip]', demo);
    var timeline = $('.window-timeline', demo);

    var DURATION = 14000;
    var laneWidth = 300;
    var started = performance.now();
    var raf = 0;
    var running = false;
    var lastZoomLabel = '';

    var POINTS = {
      a: { x: 150, y: 520 },
      b: { x: 505, y: 402 },
      c: { x: 300, y: 220 },
      d: { x: 770, y: 470 }
    };

    function measure() {
      if (!timeline) return;
      laneWidth = Math.max(40, timeline.clientWidth - 58);
    }

    function segment(t, from, to, p0, p1, ease) {
      if (t < from) return null;
      if (t > to) return null;
      var k = ease((t - from) / (to - from));
      return { x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k };
    }

    function cursorAt(t) {
      var p;
      p = segment(t, 0, 2800, POINTS.a, POINTS.b, easeInOut); if (p) return p;
      p = segment(t, 2800, 3400, POINTS.b, POINTS.b, easeInOut); if (p) return p;
      p = segment(t, 3400, 8000, POINTS.b, POINTS.b, easeInOut); if (p) return p;
      p = segment(t, 8000, 10200, POINTS.b, POINTS.c, easeInOut); if (p) return p;
      p = segment(t, 10200, 10800, POINTS.c, POINTS.c, easeInOut); if (p) return p;
      p = segment(t, 10800, 12600, POINTS.c, POINTS.d, easeInOut); if (p) return p;
      p = segment(t, 12600, 14000, POINTS.d, POINTS.a, easeInOut); if (p) return p;
      return POINTS.a;
    }

    function zoomAt(t) {
      if (t < 3200) return 1;
      if (t < 4200) return 1 + 0.42 * easeOutCubic((t - 3200) / 1000);
      if (t < 7400) return 1.42;
      if (t < 8400) return 1.42 - 0.42 * easeInOut((t - 7400) / 1000);
      return 1;
    }

    function rippleAt(t, start) {
      if (t < start || t > start + 700) return null;
      var k = (t - start) / 700;
      return { r: 6 + 46 * easeOutCubic(k), o: 0.75 * (1 - k) };
    }

    function render(now) {
      raf = 0;
      if (!running) return;

      var t = ((now - started) % DURATION + DURATION) % DURATION;

      var pos = cursorAt(t);
      if (cursorEl) {
        cursorEl.setAttribute('transform', 'translate(' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) + ')');
      }

      var z = zoomAt(t);
      if (zoomEl) zoomEl.style.transform = 'scale(' + z.toFixed(3) + ')';

      var label = z.toFixed(2) + '×';
      if (zoomChip && label !== lastZoomLabel) {
        zoomChip.textContent = label;
        lastZoomLabel = label;
      }

      var rip = rippleAt(t, 3200);
      if (!rip) rip = rippleAt(t, 10200);
      if (rippleEl) {
        if (rip) {
          rippleEl.setAttribute('r', rip.r.toFixed(1));
          rippleEl.setAttribute('cx', (rip === null ? 0 : pos.x).toFixed(1));
          rippleEl.setAttribute('cy', pos.y.toFixed(1));
          rippleEl.style.opacity = rip.o.toFixed(3);
        } else {
          rippleEl.style.opacity = '0';
        }
      }

      var capIn = t > 4300 && t < 7300;
      if (captionEl) {
        var capK = capIn ? clamp((t - 4300) / 380, 0, 1) : 0;
        if (t >= 7300 && t < 7700) capK = 1 - clamp((t - 7300) / 400, 0, 1);
        captionEl.style.opacity = String(capK);
        captionEl.style.transform = 'translate(-50%, ' + (8 * (1 - capK)).toFixed(1) + 'px)';
      }

      var p = t / DURATION;
      if (playheadEl) playheadEl.style.transform = 'translateX(' + (p * laneWidth).toFixed(1) + 'px)';

      if (timeEl) {
        var secs = Math.floor(t / 1000);
        var text = '00:' + (secs < 10 ? '0' : '') + secs;
        if (timeEl.textContent !== text) timeEl.textContent = text;
      }

      raf = requestAnimationFrame(render);
    }

    function start() {
      if (running) return;
      running = true;
      started = performance.now();
      raf = requestAnimationFrame(render);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    measure();
    if (timeline && 'ResizeObserver' in window) {
      new ResizeObserver(measure).observe(timeline);
    } else {
      window.addEventListener('resize', measure);
    }

    if (reduceMotion) {
      if (cursorEl) cursorEl.setAttribute('transform', 'translate(505 402)');
      if (captionEl) { captionEl.style.opacity = '1'; captionEl.style.transform = 'translate(-50%, 0)'; }
      if (playheadEl) playheadEl.style.transform = 'translateX(' + (laneWidth * 0.42).toFixed(1) + 'px)';
    } else if ('IntersectionObserver' in window) {
      var demoObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) start();
          else stop();
        });
      }, { threshold: 0.15 });
      demoObserver.observe(demo);

      document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop();
        else start();
      });
    } else {
      start();
    }
  }

  /* --------------------------------------------------- animated counters */

  var counters = $$('[data-count]');

  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    if (!target || reduceMotion) { el.textContent = String(target); return; }
    var start = performance.now();
    var dur = 900;

    function tick(now) {
      var k = clamp((now - start) / dur, 0, 1);
      var eased = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(target * eased));
      if (k < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  if (counters.length) {
    if ('IntersectionObserver' in window) {
      var countObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            countObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.6 });

      counters.forEach(function (el) { countObserver.observe(el); });
    } else {
      counters.forEach(animateCount);
    }
  }

  /* ------------------------------------------------------ pipeline steps */

  var pipeSteps = $$('.pipe-step');

  if (pipeSteps.length && 'IntersectionObserver' in window) {
    var pipeObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        pipeSteps.forEach(function (step) {
          step.classList.toggle('is-active', step === entry.target);
        });
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

    pipeSteps.forEach(function (step) { pipeObserver.observe(step); });
  }

  /* ------------------------------------------------------ copy to board */

  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = document.querySelector(btn.getAttribute('data-copy'));
      if (!target) return;
      var text = target.textContent.trim();
      var original = btn.textContent;

      function done() {
        btn.textContent = 'Copied';
        btn.classList.add('is-done');
        window.setTimeout(function () {
          btn.textContent = original;
          btn.classList.remove('is-done');
        }, 1600);
      }

      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); }
        catch (e) { btn.textContent = 'Press Ctrl+C'; }
        document.body.removeChild(ta);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else {
        fallback();
      }
    });
  });

  /* ---------------------------------------------------- magnetic buttons */

  if (!reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    $$('.btn-primary.btn-lg, #hero-download, #cta-download, #nav-download').forEach(function (btn) {
      var raf = 0;
      var tx = 0;
      var ty = 0;

      btn.classList.add('is-magnetic');

      function apply() {
        btn.style.setProperty('--bx', tx.toFixed(1) + 'px');
        btn.style.setProperty('--by', ty.toFixed(1) + 'px');
        raf = 0;
      }

      btn.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = btn.getBoundingClientRect();
        tx = clamp((e.clientX - (r.left + r.width / 2)) * 0.26, -7, 7);
        ty = clamp((e.clientY - (r.top + r.height / 2)) * 0.3, -6, 6);
        if (!raf) raf = requestAnimationFrame(apply);
      }, { passive: true });

      btn.addEventListener('pointerleave', function () {
        tx = 0;
        ty = 0;
        if (!raf) raf = requestAnimationFrame(apply);
      });
    });
  }

  /* ------------------------------------------------------ demo parallax */

  if (!reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    var stage = $('.window-stage');
    var windowEl = stage ? $('.window', stage) : null;

    if (stage && windowEl) {
      var tiltRaf = 0;
      var tx = 0;
      var ty = 0;

      function applyTilt() {
        windowEl.style.transform =
          'rotateX(' + (1.6 - ty * 2.4).toFixed(2) + 'deg) rotateY(' + (-2.4 + tx * 3.2).toFixed(2) + 'deg) scale(1.005)';
        tiltRaf = 0;
      }

      stage.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = stage.getBoundingClientRect();
        tx = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5);
        ty = clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5);
        if (!tiltRaf) tiltRaf = requestAnimationFrame(applyTilt);
      }, { passive: true });

      stage.addEventListener('pointerleave', function () {
        tx = 0; ty = 0;
        if (!tiltRaf) tiltRaf = requestAnimationFrame(applyTilt);
      });
    }
  }
})();
