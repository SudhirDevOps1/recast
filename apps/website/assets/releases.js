/**
 * Recast website — release data from the public GitHub API.
 *
 * Two unauthenticated requests per page load (release list + repo stars),
 * plus one more only if the visitor opts into nightly builds. Everything
 * degrades to a plain link when the API is rate-limited or the visitor is
 * offline. No cookies, no analytics, no third-party scripts.
 */
(function () {
  'use strict';

  var REPO = 'SudhirDevOps1/recast';
  var API = 'https://api.github.com/repos/' + REPO;
  var RELEASES_URL = 'https://github.com/' + REPO + '/releases';

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

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
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

  function detectOS() {
    var ua = navigator.userAgent || '';
    if (/Mac|iPhone|iPad|iPod/i.test(ua)) return 'macos';
    if (/Linux|X11|CrOS/i.test(ua) && !/Android/i.test(ua)) return 'linux';
    return 'windows';
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

  function recommendedFor(os, assets) {
    var list = assetsFor(os, assets);
    var test = RECOMMENDED[os];
    for (var i = 0; i < list.length; i++) if (test.test(list[i].name)) return list[i];
    return list[0] || null;
  }

  function renderList(os, assets) {
    var ul = $('[data-list="' + os + '"]');
    if (!ul) return;

    var list = assetsFor(os, assets);
    var pick = recommendedFor(os, assets);
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

  function renderRelease(release) {
    if (!release) return;
    var assets = release.assets || [];

    ['windows', 'macos', 'linux'].forEach(function (os) {
      renderList(os, assets);

      var primary = $('[data-primary]', $('#panel-' + os) || document);
      var pick = recommendedFor(os, assets);
      if (primary) primary.href = pick ? pick.browser_download_url : release.html_url;
    });

    var meta = $('#dl-meta');
    if (meta) {
      meta.textContent = release.tag_name + ' · ' + fmtDate(release.published_at) + ' · ' +
        (release.prerelease ? 'prerelease' : 'stable');
    }

    var ver = $('#hero-version');
    if (ver && release.tag_name) ver.textContent = release.tag_name;

    var os = detectOS();
    applyPrimaryCTA(os, assets, release);
  }

  function applyPrimaryCTA(os, assets, release) {
    var label = $('#hero-download-label');
    if (label) {
      label.textContent = 'Download for ' + (os === 'macos' ? 'macOS' : os === 'linux' ? 'Linux' : 'Windows');
    }

    var pick = recommendedFor(os, assets);
    var url = pick ? pick.browser_download_url : (release ? release.html_url : RELEASES_URL);

    var hero = $('#hero-download');
    if (hero) hero.href = url;

    var cta = $('#cta-download');
    if (cta) cta.href = url;
  }

  /* ---------------------------------------------------- release list */

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
      sub.textContent = fmtDate(rel.published_at) + ' · ' + (rel.assets || []).length + ' files';

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
    ['windows', 'macos', 'linux'].forEach(function (os) {
      var ul = $('[data-list="' + os + '"]');
      if (!ul) return;
      ul.textContent = '';
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = RELEASES_URL;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Get it from GitHub Releases';
      li.appendChild(a);
      ul.appendChild(li);
    });

    var meta = $('#dl-meta');
    if (meta) meta.textContent = 'Live release data unavailable';

    var fallback = $('#dl-fallback');
    if (fallback) fallback.hidden = false;
  }

  /* ------------------------------------------------------------ OS tabs */

  var tabs = $$('.os-tab');
  var panels = $$('.os-panel');

  function selectOS(os, focus) {
    tabs.forEach(function (tab) {
      var on = tab.getAttribute('data-os') === os;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus({ preventScroll: true });
    });

    panels.forEach(function (panel) {
      var on = panel.getAttribute('data-os') === os;
      panel.classList.toggle('is-active', on);
      panel.hidden = !on;
    });
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () {
      selectOS(tab.getAttribute('data-os'), false);
    });

    tab.addEventListener('keydown', function (e) {
      var next = null;
      if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next === null) return;
      e.preventDefault();
      selectOS(tabs[next].getAttribute('data-os'), true);
    });
  });

  var initialOS = detectOS();
  selectOS(initialOS, false);

  /* --------------------------------------------------------- star count */

  getJSON(API)
    .then(function (repo) {
      var el = $('#star-count');
      if (!el) return;
      if (repo.stargazers_count > 0) {
        el.textContent = repo.stargazers_count.toLocaleString();
        el.hidden = false;
      }
    })
    .catch(function () { /* cosmetic only */ });

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
      }

      renderReleases(list);
    })
    .catch(function () {
      showFallback();
      releaseListFallback();
      var label = $('#hero-download-label');
      if (label) label.textContent = 'Download';
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
