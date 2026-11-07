/**
 * Recast website — real release data from the GitHub API.
 * Two unauthenticated requests per page load (latest release + repo stars),
 * with graceful fallback to plain links when the API is rate-limited or
 * the visitor is offline.
 */
(function () {
  'use strict';

  var REPO = 'SudhirDevOps1/recast';
  var API = 'https://api.github.com/repos/' + REPO;

  var OS_FILTERS = {
    windows: /\.(exe|msi)$/i,
    macos: /\.(dmg|pkg)$/i,
    linux: /\.(AppImage|deb|rpm|tar\.gz)$/i
  };

  var PRIORITY = [
    { os: 'windows', test: /^Recast-Setup-.*\.exe$/i, label: 'recommended' },
    { os: 'macos', test: /^Recast-.*-arm64\.dmg$/i, label: 'recommended' },
    { os: 'linux', test: /^Recast-.*\.AppImage$/i, label: 'recommended' }
  ];

  function byId(id) { return document.getElementById(id); }

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

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  function assetName(a) { return a.name; }
  function isAssetFor(os, a) { return OS_FILTERS[os].test(a.name) && !/\.blockmap$/i.test(a.name); }

  function renderList(os, ul, assets) {
    var list = assets.filter(function (a) { return isAssetFor(os, a); });
    var primary = PRIORITY.find(function (p) { return p.os === os; });
    list.sort(function (a, b) {
      var pa = primary && primary.test.test(assetName(a)) ? 0 : 1;
      var pb = primary && primary.test.test(assetName(b)) ? 0 : 1;
      return pa - pb || assetName(a).localeCompare(assetName(b));
    });
    ul.textContent = '';
    if (!list.length) {
      var li0 = document.createElement('li');
      li0.className = 'dl-loading';
      li0.textContent = 'No assets in this release yet.';
      ul.appendChild(li0);
      return;
    }
    list.forEach(function (a) {
      var li = document.createElement('li');
      var link = document.createElement('a');
      link.href = a.browser_download_url;
      var name = document.createElement('span');
      name.textContent = a.name;
      if (primary && primary.test.test(a.name)) {
        var tag = document.createElement('span');
        tag.className = 'asset-primary';
        tag.textContent = primary.label;
        name.appendChild(tag);
      }
      var size = document.createElement('span');
      size.className = 'asset-size';
      size.textContent = fmtSize(a.size);
      link.appendChild(name);
      link.appendChild(size);
      li.appendChild(link);
      ul.appendChild(li);
    });
  }

  function renderRelease(rel) {
    var assets = rel.assets || [];
    ['windows', 'macos', 'linux'].forEach(function (os) {
      renderList(os, byId('dl-' + os), assets);
    });
    byId('dl-meta').textContent =
      rel.tag_name + ' · ' + fmtDate(rel.published_at) +
      (rel.prerelease ? ' · prerelease' : ' · stable');
  }

  function showFallback() {
    ['windows', 'macos', 'linux'].forEach(function (os) {
      var ul = byId('dl-' + os);
      ul.textContent = '';
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = 'https://github.com/' + REPO + '/releases';
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Get it from GitHub Releases';
      li.appendChild(a);
      ul.appendChild(li);
    });
    byId('dl-meta').textContent = '';
    byId('dl-fallback').hidden = false;
  }

  // Primary CTA: detect the visitor's platform for the hero button label.
  function detectOS() {
    var ua = navigator.userAgent;
    if (/Mac|iPhone|iPad/i.test(ua)) return 'macos';
    if (/Linux|X11|CrOS/i.test(ua) && !/Android/i.test(ua)) return 'linux';
    return 'windows';
  }

  function setHero(os) {
    var label = byId('hero-download-label');
    if (label) label.textContent = 'Download for ' + (os === 'macos' ? 'macOS' : os === 'linux' ? 'Linux' : 'Windows');
  }

  // Star count in the nav.
  getJSON(API).then(function (repo) {
    var s = byId('star-count');
    if (s && repo.stargazers_count > 0) {
      s.textContent = repo.stargazers_count.toLocaleString();
      s.hidden = false;
    }
  }).catch(function () { /* silent — cosmetic only */ });

  // Latest stable release.
  getJSON(API + '/releases/latest')
    .then(function (rel) {
      renderRelease(rel);
      var os = detectOS();
      setHero(os);
      var primaryAsset = (rel.assets || []).find(function (a) {
        var p = PRIORITY.find(function (x) { return x.os === os; });
        return p && p.test.test(a.name);
      });
      if (primaryAsset) byId('hero-download').href = primaryAsset.browser_download_url;
    })
    .catch(showFallback);

  // Nightly toggle: swap to the prerelease tagged "nightly".
  byId('nightly-toggle').addEventListener('change', function (e) {
    if (e.target.checked) {
      getJSON(API + '/releases')
        .then(function (rels) {
          var nightly = rels.find(function (r) { return r.prerelease && r.tag_name === 'nightly'; });
          if (!nightly) {
            byId('dl-meta').textContent = 'No nightly published yet — showing the latest stable release.';
            return getJSON(API + '/releases/latest');
          }
          return nightly;
        })
        .then(renderRelease)
        .catch(showFallback);
    } else {
      getJSON(API + '/releases/latest').then(renderRelease).catch(function () { /* keep current */ });
    }
  });
})();
