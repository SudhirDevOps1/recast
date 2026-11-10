/**
 * Recast website — release data from the public GitHub API.
 *
 * Two unauthenticated requests per page load (release list + repo stars),
 * plus one more only if the visitor opts into nightly builds. Every request
 * has an 8 s timeout, and every failure degrades to a plain GitHub link —
 * the page never sits on "Loading assets…" forever.
 *
 * No cookies, no analytics, no third-party scripts.
 */
(function () {
  'use strict';

  var REPO = 'SudhirDevOps1/recast';
  var API = 'https://api.github.com/repos/' + REPO;
  var RELEASES_URL = 'https://github.com/' + REPO + '/releases';
  var LATEST_URL = RELEASES_URL + '/latest';
  var TIMEOUT_MS = 8000;

  var OS_NAME = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

  var FILTERS = {
    windows: /\.(exe|msi)$/i,
    macos: /\.dmg$/i,
    linux: /\.(AppImage|deb|rpm|tar\.gz)$/i
  };

  var RECOMMENDED = {
    windows: /^Recast-Setup-(?!.*arm64).*\.exe$/i,
    macos: /arm64\.dmg$/i,
    linux: /\.AppImage$/i
  };

  var ORDER = {
    windows: [/^Recast-Setup-(?!.*arm64).*\.exe$/i, /^Recast-Portable-(?!.*arm64).*\.exe$/i, /arm64\.exe$/i, /\.msi$/i],
    macos: [/arm64\.dmg$/i, /x64\.dmg$/i, /\.pkg$/i],
    linux: [/\.AppImage$/i, /\.deb$/i, /\.rpm$/i, /\.tar\.gz$/i]
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function getJSON(url, timeout) {
    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = 0;

    if (controller) {
      timer = window.setTimeout(function () { controller.abort(); }, timeout || TIMEOUT_MS);
    }

    return fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller ? controller.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      if (timer) window.clearTimeout(timer);
      return data;
    }, function (err) {
      if (timer) window.clearTimeout(timer);
      throw err;
    });
  }

  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    var mb = bytes / (1024 * 1024);
    return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  /* The tag is often "nightly"; the real version lives in the asset names. */
  function buildVersion(release) {
    if (!release) return '';
    var assets = release.assets || [];
    for (var i = 0; i < assets.length; i++) {
      var m = /^Recast[-_](\d+\.\d+\.\d+)/i.exec(assets[i].name || '');
      if (m) return m[1];
    }
    var tag = String(release.tag_name || '').replace(/^v/i, '');
    return /^\d+\.\d+\.\d+$/.test(tag) ? tag : '';
  }

  function detectPlatform() {
    var ua = navigator.userAgent || '';
    var touchPoints = navigator.maxTouchPoints || 0;

    // iPadOS 13+ reports a desktop "Macintosh" user agent, but is still touch
    // first and cannot run a .dmg.
    var mobile = /Android|iPhone|iPad|iPod|IEMobile|Windows Phone|Mobile/i.test(ua) ||
      (touchPoints > 1 && /Macintosh/i.test(ua));

    if (mobile) {
      return { mobile: true, os: null, arch: 'arm64' };
    }

    if (/Mac|iPhone|iPad|iPod/i.test(ua)) return { mobile: false, os: 'macos', arch: 'arm64' };
    if (/Linux|X11|CrOS/i.test(ua)) return { mobile: false, os: 'linux', arch: null };
    if (/Windows|Win32|Win64/i.test(ua)) return { mobile: false, os: 'windows', arch: null };

    return { mobile: false, os: 'windows', arch: null };
  }

  function assetsFor(os, assets) {
    var filter = FILTERS[os];
    var list = (assets || []).filter(function (a) {
      return filter.test(a.name) && !/\.blockmap$/i.test(a.name);
    });

    var order = ORDER[os];
    list.sort(function (a, b) {
      function rank(name) {
        for (var i = 0; i < order.length; i++) if (order[i].test(name)) return i;
        return order.length;
      }
      return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
    });
    return list;
  }

  function recommendedFor(os, assets, arch) {
    var list = assetsFor(os, assets);
    var test = RECOMMENDED[os];

    if (os === 'macos') {
      test = arch === 'x64' ? /x64\.dmg$/i : /arm64\.dmg$/i;
    }

    for (var i = 0; i < list.length; i++) if (test.test(list[i].name)) return list[i];
    return list[0] || null;
  }

  /* -------------------------------------------------------------- state */

  var platform = detectPlatform();

  var state = {
    mobile: platform.mobile,
    os: platform.mobile ? 'windows' : (platform.os || 'windows'),
    arch: platform.arch === 'x64' ? 'x64' : 'arm64',
    release: null,
    assets: [],
    failed: false
  };

  /* ------------------------------------------------------------ rendering */

  function renderList(os, assets) {
    var ul = $('[data-list="' + os + '"]');
    if (!ul) return;

    var list = assetsFor(os, assets);
    var pick = recommendedFor(os, assets, state.arch);
    ul.textContent = '';

    if (!list.length) {
      var none = document.createElement('li');
      none.className = 'dl-loading';
      none.textContent = 'No ' + os + ' assets in this build yet.';
      ul.appendChild(none);
      return;
    }

    list.forEach(function (asset) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = asset.browser_download_url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute('data-name', asset.name);
      a.setAttribute('data-size', fmtSize(asset.size));

      var nameWrap = document.createElement('span');
      nameWrap.className = 'asset-name';

      var name = document.createElement('span');
      name.textContent = asset.name;
      nameWrap.appendChild(name);

      if (pick && asset.name === pick.name) {
        var tag = document.createElement('span');
        tag.className = 'asset-primary';
        tag.textContent = 'recommended';
        nameWrap.appendChild(tag);
      }

      var size = document.createElement('span');
      size.className = 'asset-size';
      size.textContent = fmtSize(asset.size);

      a.appendChild(nameWrap);
      a.appendChild(size);
      li.appendChild(a);
      ul.appendChild(li);
    });
  }

  function applyPrimaryCTA() {
    var label = $('#hero-download-label');
    var hero = $('#hero-download');
    var cta = $('#cta-download');

    if (state.mobile) {
      if (label) label.textContent = 'Choose your desktop download';
      if (hero) hero.href = '#download';
      if (cta) cta.href = '#download';
      return;
    }

    var os = state.os;
    var pick = recommendedFor(os, state.assets, state.arch);
    var url = pick ? pick.browser_download_url : (state.release ? state.release.html_url : LATEST_URL);

    if (label) label.textContent = 'Download for ' + OS_NAME[os];
    if (hero) { hero.href = url; hero.target = '_blank'; hero.rel = 'noopener'; }
    if (cta) { cta.href = url; cta.target = '_blank'; cta.rel = 'noopener'; }
  }

  function renderRelease(release) {
    if (!release) return;

    state.release = release;
    state.assets = release.assets || [];

    ['windows', 'macos', 'linux'].forEach(function (os) {
      renderList(os, state.assets);

      var primary = $('[data-primary]', $('#panel-' + os) || document);
      var pick = recommendedFor(os, state.assets, state.arch);
      if (primary) {
        primary.href = pick ? pick.browser_download_url : release.html_url;
        primary.target = '_blank';
        primary.rel = 'noopener';
        if (pick) {
          primary.setAttribute('data-name', pick.name);
          primary.setAttribute('data-size', fmtSize(pick.size));
        }
      }
    });

    var meta = $('#dl-meta');
    if (meta) {
      var build = buildVersion(release);
      var tagNumber = String(release.tag_name || '').replace(/^v/i, '');
      var bits = [release.tag_name, fmtDate(release.published_at)];
      if (build && build !== tagNumber) bits.push('build ' + build);
      bits.push(release.prerelease ? 'prerelease' : 'stable');
      meta.textContent = bits.join(' · ');
    }

    var ver = $('#hero-version');
    if (ver && release.tag_name) ver.textContent = release.tag_name;

    var sums = $('#sums-link');
    if (sums) {
      var sumAsset = null;
      for (var i = 0; i < state.assets.length; i++) {
        if (/^SHA256SUMS$/i.test(state.assets[i].name)) { sumAsset = state.assets[i]; break; }
      }
      sums.href = sumAsset ? sumAsset.browser_download_url : release.html_url;
      sums.target = '_blank';
      sums.rel = 'noopener';
    }

    updateMacNote();
    applyPrimaryCTA();
  }

  /* ------------------------------------------------------ release list */

  function renderReleases(list) {
    var ol = $('#rel-list');
    if (!ol || !list || !list.length) return;

    var seenLatest = false;
    ol.textContent = '';

    list.slice(0, 4).forEach(function (rel) {
      var isNightly = rel.prerelease || /nightly/i.test(rel.tag_name);
      var isLatest = !isNightly && !seenLatest;
      if (isLatest) seenLatest = true;

      var li = document.createElement('li');
      var a = document.createElement('a');
      a.className = 'rel-item';
      a.href = rel.html_url;
      a.target = '_blank';
      a.rel = 'noopener';

      var tag = document.createElement('span');
      tag.className = 'rel-tag';
      tag.textContent = rel.tag_name;

      var main = document.createElement('span');
      main.className = 'rel-main';

      var name = document.createElement('span');
      name.className = 'rel-name';
      name.textContent = rel.name || rel.tag_name;

      var sub = document.createElement('span');
      sub.className = 'rel-sub';
      var build = buildVersion(rel);
      var tagNumber = String(rel.tag_name || '').replace(/^v/i, '');
      var subBits = [fmtDate(rel.published_at)];
      if (isNightly && build && build !== tagNumber) subBits.push('build ' + build);
      subBits.push((rel.assets || []).length + ' files');
      sub.textContent = subBits.join(' · ');

      main.appendChild(name);
      main.appendChild(sub);

      var side = document.createElement('span');
      side.className = 'rel-side';

      var badge = document.createElement('span');
      badge.className = 'rel-badge' + (isNightly ? ' is-nightly' : isLatest ? ' is-latest' : '');
      badge.textContent = isNightly ? 'nightly' : isLatest ? 'latest' : 'stable';
      side.appendChild(badge);

      var arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      arrow.setAttribute('class', 'rel-arrow');
      arrow.setAttribute('viewBox', '0 0 16 16');
      arrow.setAttribute('width', '13');
      arrow.setAttribute('height', '13');
      arrow.setAttribute('fill', 'none');
      arrow.setAttribute('stroke', 'currentColor');
      arrow.setAttribute('stroke-width', '1.7');
      arrow.setAttribute('stroke-linecap', 'round');
      arrow.setAttribute('stroke-linejoin', 'round');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = '<path d="M4 12 12 4"/><path d="M5 4h7v7"/>';
      side.appendChild(arrow);

      a.appendChild(tag);
      a.appendChild(main);
      a.appendChild(side);
      li.appendChild(a);
      ol.appendChild(li);
    });
  }

  function releaseListFallback() {
    var ol = $('#rel-list');
    if (!ol) return;
    ol.textContent = '';
    var li = document.createElement('li');
    li.className = 'rel-empty';
    li.innerHTML = 'Live data unavailable right now — <a href="' + RELEASES_URL + '" target="_blank" rel="noopener">browse releases on GitHub</a>.';
    ol.appendChild(li);
  }

  function showFallback() {
    state.failed = true;

    ['windows', 'macos', 'linux'].forEach(function (os) {
      var ul = $('[data-list="' + os + '"]');
      if (!ul) return;
      ul.textContent = '';
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = RELEASES_URL;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Open releases on GitHub';
      li.appendChild(a);
      ul.appendChild(li);
    });

    var meta = $('#dl-meta');
    if (meta) meta.textContent = 'Live release data unavailable';

    var fallback = $('#dl-fallback');
    if (fallback) fallback.hidden = false;

    var label = $('#hero-download-label');
    if (label && !state.mobile) label.textContent = 'Download for ' + OS_NAME[state.os];
  }

  /* ---------------------------------------------------------- mac chip */

  function updateMacNote() {
    var note = $('#mac-arch-note');
    if (note) note.textContent = state.arch === 'x64' ? 'Picking the Intel build' : 'Picking the arm64 build';

    $$('.arch-chip').forEach(function (chip) {
      var on = chip.getAttribute('data-arch') === state.arch;
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    if (state.release) {
      var primary = $('[data-primary]', $('#panel-macos'));
      var pick = recommendedFor('macos', state.assets, state.arch);
      if (primary) {
        primary.href = pick ? pick.browser_download_url : state.release.html_url;
        if (pick) {
          primary.setAttribute('data-name', pick.name);
          primary.setAttribute('data-size', fmtSize(pick.size));
        }
      }
    }
  }

  /* ------------------------------------------------------------- toast */

  var toast = $('#dl-toast');
  var toastText = $('#dl-toast-text');
  var toastLink = $('#dl-toast-link');
  var toastClose = $('#dl-toast-close');
  var toastTimer = 0;

  function hideToast() {
    if (!toast) return;
    toast.hidden = true;
    if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = 0; }
  }

  function showToast(message, href) {
    if (!toast) return;
    if (toastText) toastText.textContent = message;
    if (toastLink) {
      if (href) {
        toastLink.href = href;
        toastLink.hidden = false;
      } else {
        toastLink.hidden = true;
      }
    }
    toast.hidden = false;
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, 10000);
  }

  if (toastClose) toastClose.addEventListener('click', hideToast);

  /* Every real file link confirms itself: a 277 MB download has no other
     feedback for the first few seconds. */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;

    var href = a.getAttribute('href') || '';
    if (!/\/releases\/download\//.test(href)) return;

    var name = a.getAttribute('data-name') || '';
    var size = a.getAttribute('data-size') || '';
    var message = 'Download starting' + (name ? ' · ' + name : '') + (size ? ' · ' + size : '') +
      '. If nothing happens, use the direct link.';
    showToast(message, href);
  });

  /* ------------------------------------------------------------- tabs */

  var radios = $$('.os-radio');

  radios.forEach(function (radio) {
    radio.addEventListener('change', function () {
      if (!radio.checked) return;
      state.os = radio.value;
      applyPrimaryCTA();
    });
  });

  $$('.arch-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      state.arch = chip.getAttribute('data-arch') === 'x64' ? 'x64' : 'arm64';
      if (state.assets.length) renderList('macos', state.assets);
      updateMacNote();
    });
  });

  /* Copy the page URL — the mobile note offers it, and the desktop page can
     hand a link to another machine. */
  $$('[data-copy-url]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var url = window.location.href;
      var original = btn.textContent;

      function done() {
        btn.textContent = 'Copied';
        window.setTimeout(function () { btn.textContent = original; }, 1600);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, fallback);
      } else {
        fallback();
      }

      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* nothing */ }
        document.body.removeChild(ta);
      }
    });
  });

  /* --------------------------------------------------------- first paint */

  if (state.mobile) {
    var mobileNote = $('#dl-mobile');
    if (mobileNote) mobileNote.hidden = false;
  } else if (platform.os) {
    var initial = document.getElementById('os-' + platform.os);
    if (initial) initial.checked = true;
    state.os = platform.os;
  }

  updateMacNote();
  applyPrimaryCTA();

  /* ------------------------------------------------------------ releases */

  var latest = null;

  getJSON(API + '/releases?per_page=6')
    .then(function (list) {
      var stable = null;
      for (var i = 0; i < list.length; i++) {
        var rel = list[i];
        if (!rel.prerelease && !/nightly/i.test(rel.tag_name)) { stable = rel; break; }
      }

      if (!stable) stable = list[0] || null;

      if (stable) {
        latest = stable;
        renderRelease(stable);
      } else {
        showFallback();
      }

      renderReleases(list);
    })
    .catch(function () {
      showFallback();
      releaseListFallback();
      var label = $('#hero-download-label');
      if (label && !state.mobile) label.textContent = 'Download';
    });

  var nightlyToggle = $('#nightly-toggle');

  if (nightlyToggle) {
    nightlyToggle.addEventListener('change', function () {
      if (!nightlyToggle.checked) {
        if (latest) renderRelease(latest);
        return;
      }

      var meta = $('#dl-meta');
      if (meta) meta.textContent = 'Looking for a nightly build…';

      getJSON(API + '/releases?per_page=20')
        .then(function (list) {
          var nightly = null;
          for (var i = 0; i < list.length; i++) {
            if (list[i].prerelease && /nightly/i.test(list[i].tag_name)) { nightly = list[i]; break; }
          }
          if (!nightly) {
            if (meta) meta.textContent = 'No nightly published yet — showing the latest stable build.';
            if (latest) renderRelease(latest);
            return;
          }
          renderRelease(nightly);
        })
        .catch(function () {
          if (meta) meta.textContent = 'Could not load nightly builds.';
          if (latest) renderRelease(latest);
        });
    });
  }
})();
