/* ===== FLUX Lite — Common : télémétrie, détection TV, nav LRUD, grille =====
   Chargé par : lite.html, litemovie.html, litetv.html, litesearch.html
   Compatible Samsung UA32H4500 (2014) : ES5 strict, aucun ES6.
   La page définit : LITE_PAGE = 'all' | 'movie' | 'tv' | 'search' */

var items = [];
var cardEls = [];
var focusIdx = 0;
var lastShown = -1;
var isFullscreen = false;

/* ===== Télémétrie TV → /api/error-log (debug blocage H4500) ===== */
function tvReport(msg) {
  try {
    var x = new XMLHttpRequest();
    x.open('POST', '/api/error-log', true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.send(JSON.stringify({ src: 'lite', ua: (navigator.userAgent || '').slice(0, 160), msg: String(msg).slice(0, 300), t: Date.now() }));
  } catch (e) {}
}
try {
  window.__tvLastMsg = '';
  window.onerror = function(m, s, l, c, e) {
    try { if (window.__tvLastMsg !== m) { window.__tvLastMsg = m; tvReport('JSE: ' + m + ' @' + s + ':' + l); } } catch (err) {}
  };
} catch (e) {}

function msg(t) {
  var el = document.getElementById('msg');
  if (el) el.innerHTML = t || '';
}

/* ===== Détection appareil (Samsung 2014 pré-Tizen) ===== */
var DEV_MSE = false;
var DEV_HLS_NATIVE = false;
var DEV_HEVC = false;
var DEV_MP4 = false;
var DEV_AVC_BASE = false;
var DEV_AVC_MAIN = false;
var DEV_AVC_HIGH = false;
var TV_OLD_2014 = false;

function detectCapabilities() {
  try {
    var v = document.createElement('video');
    if (typeof Hls !== 'undefined' && Hls.isSupported()) DEV_MSE = true;
    if (v.canPlayType('application/vnd.apple.mpegurl') || v.canPlayType('application/x-mpegurl')) DEV_HLS_NATIVE = true;
    try { DEV_HEVC = !!v.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') || !!v.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"'); } catch (e) {}
    try { DEV_MP4 = !!v.canPlayType('video/mp4'); } catch (e) {}
    try {
      DEV_AVC_BASE = !!v.canPlayType('video/mp4; codecs="avc1.42E01E"') || !!v.canPlayType('video/mp4; codecs="avc1.42001E"');
      DEV_AVC_MAIN = !!v.canPlayType('video/mp4; codecs="avc1.4D401E"') || !!v.canPlayType('video/mp4; codecs="avc1.4D001E"');
      DEV_AVC_HIGH = !!v.canPlayType('video/mp4; codecs="avc1.64001F"') || !!v.canPlayType('video/mp4; codecs="avc1.64001E"');
    } catch (e) {}
    tvReport('CAP: mse=' + DEV_MSE + ' hlsN=' + DEV_HLS_NATIVE + ' mp4=' + DEV_MP4 +
             ' avcB=' + DEV_AVC_BASE + ' avcM=' + DEV_AVC_MAIN + ' avcH=' + DEV_AVC_HIGH);
  } catch (e) {}
  var ua = '';
  try { ua = (navigator.userAgent || '').toLowerCase(); } catch (e) {}
  var isSamTV = ua.indexOf('samsung') >= 0 && (ua.indexOf('smart-tv') >= 0 || ua.indexOf('smarttv') >= 0 || ua.indexOf('hinternet') >= 0 || /h\s?\d{4}/.test(ua));
  if (!isSamTV && ua.indexOf('smart-tv') >= 0 && ua.indexOf('linux') >= 0 && ua.indexOf('armv7l') >= 0) isSamTV = true;
  var isLGTv = ua.indexOf('mobile') < 0 && !/iphone|ipad|ipod/.test(ua)
             && ((ua.indexOf('webos') >= 0 && ua.indexOf('smarttv') >= 0)
                 || (ua.indexOf('lg') >= 0 && (ua.indexOf('smart-tv') >= 0 || ua.indexOf('smarttv') >= 0 || ua.indexOf('netcast') >= 0)));
  /* TV 2014 (pré-Tizen) : UNIQUEMENT si c'est une vraie TV ET pas de
     MSE/HLS.js. Les navigateurs mobiles déclarent aussi le HLS natif → PAS des TV ! */
  TV_OLD_2014 = (isSamTV || isLGTv) && !DEV_MSE;
  if (TV_OLD_2014) {
    try { document.body.className += ' tv'; } catch (e) {}
  }
  tvReport('DET: isSamTV=' + isSamTV + ' isLGTv=' + isLGTv + ' TV_OLD_2014=' + TV_OLD_2014 + ' ua=' + ua.slice(0, 120));
}

/* ===== Navigation télécommande ===== */
var nav = null;
var navReady = false;
var navEls = [];
var navIdx = 0;
var lastSelected = '';

var KEY_RETURN = 10009;
var KEY_BACK = 88;
var KEY_EXIT = 45;
var KEY_ENTER = 13;
var KEY_PLAY = 415;
var KEY_PAUSE = 19;
var KEY_STOP = 413;
var KEY_FF = 417;
var KEY_RW = 412;
var KEY_RED = 403;
var KEY_GREEN = 404;
var KEY_YELLOW = 405;
var KEY_BLUE = 406;

var lastKc = -1;
var lastEvt = 0;

var NAV_CODES = [37, 38, 39, 40, 4, 5, 19, 20, 21, 22, 203, 204, 205, 206, 211, 212, 213, 214, 215, 216, 217, 218, 29443, 29460, 29461];
var NAV_KEYCODES = {};
for (var _i = 0; _i < NAV_CODES.length; _i++) NAV_KEYCODES[NAV_CODES[_i]] = true;
var ENTER_CODES = { 13: 1, 32: 1, 195: 1, 29443: 1 };

function dbg(kc) {
  var d = document.getElementById('dbg');
  if (!d || kc === lastShown) return;
  lastShown = kc;
  d.innerHTML = 'KC:' + kc + (navReady ? ' LRUD' : ' -');
}

function buildNav() {
  navReady = false;
  if (!window.LRUD) return;
  try {
    nav = new window.LRUD.Lrud();
    nav.on('move', function(mv) {
      if (mv && mv.enter && mv.enter.id) focusId(mv.enter.id);
    });
    nav.on('select', function(node) {
      lastSelected = node ? node.id : '';
      if (!lastSelected) return;
      var el = document.getElementById(lastSelected);
      if (el && el.click) { try { el.click(); } catch (err) {} }
    });
    navReady = true;
  } catch (err) { navReady = false; }
}

function focusId(id) {
  var el = document.getElementById(id);
  if (el) { try { el.focus(); } catch (err) {} }
}

function currentFocusId() {
  if (navReady && nav && nav.currentFocusNode) return nav.currentFocusNode.id;
  if (navEls[navIdx]) return navEls[navIdx].id;
  return '';
}

function collectFallback() {
  navEls = [];
  var box = document.getElementById('topnav');
  if (box) {
    var btns = box.getElementsByTagName('button');
    for (var i = 0; i < btns.length; i++) navEls.push(btns[i]);
  }
  for (var j = 0; j < cardEls.length; j++) navEls.push(cardEls[j]);
  if (navEls.length) {
    if (navIdx >= navEls.length) navIdx = 0;
    focusId(navEls[navIdx].id);
  }
}

function fallbackMove(dir, vert) {
  var n = navEls.length;
  if (!n) return;
  if (vert) {
    var w = (document.getElementById('grid').clientWidth || 1200);
    var cols = 4;
    navIdx = (dir > 0) ? Math.min(n - 1, navIdx + cols) : Math.max(0, navIdx - cols);
  } else {
    navIdx = (navIdx + dir + n) % n;
  }
  focusId(navEls[navIdx].id);
}

function registerGridNav() {
  var keep = currentFocusId();
  buildNav();
  if (!navReady) { collectFallback(); return; }
  try {
    var w = (document.getElementById('grid').clientWidth || 1200);
    var cols = 4;
    nav.registerNode('root', { orientation: 'vertical', isWrapping: true, isIndexAlign: true });
    /* Hero : boutons du slide actif (window.__heroBox, fourni par la page d'accueil) */
    var heroBox = (typeof window !== 'undefined' && window.__heroBox) ? window.__heroBox : null;
    if (heroBox) {
      var hbtns = heroBox.getElementsByTagName('button');
      if (hbtns.length) {
        nav.registerNode('hero', { parent: 'root', orientation: 'horizontal', isWrapping: true });
        for (var hi = 0; hi < hbtns.length; hi++) {
          if (hbtns[hi].id) nav.registerNode(hbtns[hi].id, { parent: 'hero', isFocusable: true });
        }
      }
    }
    nav.registerNode('topnav', { parent: 'root', orientation: 'horizontal', isWrapping: true });
    var top = document.getElementById('topnav');
    if (top) {
      var tbs = top.getElementsByTagName('button');
      for (var ti = 0; ti < tbs.length; ti++) {
        if (tbs[ti].id) nav.registerNode(tbs[ti].id, { parent: 'topnav', isFocusable: true });
      }
    }
    /* Rangées : si la page fournit window.__ROW_BOXES (accueil YouTube),
       chaque rangée = un groupe horizontal autonome ; sinon comportement
       historique en blocs de `cols` cartes (pages Films/Séries/Recherche). */
    var ROW_BOXES = (typeof window !== 'undefined' && window.__ROW_BOXES) ? window.__ROW_BOXES : null;
    if (ROW_BOXES && ROW_BOXES.length) {
      for (var b = 0; b < ROW_BOXES.length; b++) {
        var rbox = document.getElementById(ROW_BOXES[b]);
        if (!rbox) continue;
        var kids = rbox.getElementsByClassName('card');
        if (!kids.length) continue;
        var gid = 'rbox' + b;
        nav.registerNode(gid, { parent: 'root', orientation: 'horizontal', isWrapping: true });
        for (var k = 0; k < kids.length; k++) {
          nav.registerNode(kids[k].id, { parent: gid, isFocusable: true });
        }
      }
    } else {
      var rows = {};
      for (var i = 0; i < cardEls.length; i++) {
        var rid = 'row' + Math.floor(i / cols);
        if (!rows[rid]) { nav.registerNode(rid, { parent: 'root', orientation: 'horizontal', isWrapping: true }); rows[rid] = 1; }
        nav.registerNode(cardEls[i].id, { parent: rid, isFocusable: true });
      }
    }
    var idx = Math.min(Math.max(0, focusIdx), cardEls.length - 1);
    var target = (keep && nav.getNode(keep)) ? keep : (cardEls[idx] ? cardEls[idx].id : '');
    if (target) { nav.assignFocus(target); focusId(target); }
  } catch (err) { navReady = false; collectFallback(); }
}

function handleRemote(e) {
  var kc = e.keyCode || e.which || 0;
  var now = (new Date()).getTime();
  if (kc === lastKc && now - lastEvt < 80) return;
  lastKc = kc;
  lastEvt = now;
  dbg(kc);

  /* Hooks optionnels posés par une page (ex. panneau saisons/épisodes) */
  if (window.__liteBack && (kc === KEY_RETURN || kc === KEY_BACK || kc === KEY_EXIT || kc === 8 || kc === 27)) {
    if (window.__liteBack()) { e.preventDefault ? e.preventDefault() : (e.returnValue = false); return; }
  }
  if (window.__liteNavHook && window.__liteNavHook(kc, e)) {
    e.preventDefault ? e.preventDefault() : (e.returnValue = false);
    return;
  }

  var tag = document.activeElement ? document.activeElement.tagName : '';
  if (tag === 'INPUT' || tag === 'SELECT') {
    if (kc === 13 || kc === 29443 || kc === 195) {
      e.preventDefault ? e.preventDefault() : (e.returnValue = false);
      try { doSearch(); } catch (err) {}
    }
    return;
  }

  if (kc === KEY_RETURN || kc === KEY_BACK || kc === KEY_EXIT || kc === 8 || kc === 27) {
    e.preventDefault ? e.preventDefault() : (e.returnValue = false);
    location.href = 'lite.html';
    return;
  }

  if (navReady) {
    if (ENTER_CODES[kc]) {
      e.preventDefault ? e.preventDefault() : (e.returnValue = false);
      lastSelected = '';
      nav.handleKeyEvent(e);
      return;
    }
    if (NAV_KEYCODES[kc]) {
      e.preventDefault ? e.preventDefault() : (e.returnValue = false);
      nav.handleKeyEvent(e);
      return;
    }
  }

  var dir = 0;
  var vert = false;
  if (kc === 37 || kc === 4 || kc === 21) dir = -1;
  else if (kc === 39 || kc === 5 || kc === 22) dir = 1;
  else if (kc === 38 || kc === 19 || kc === 203 || kc === 211 || kc === 215 || kc === 29460) { dir = -1; vert = true; }
  else if (kc === 40 || kc === 20 || kc === 204 || kc === 212 || kc === 216 || kc === 29461) { dir = 1; vert = true; }
  if (dir) {
    e.preventDefault ? e.preventDefault() : (e.returnValue = false);
    fallbackMove(dir, vert); return;
  }

  if (kc === 13 || kc === 32 || kc === 67 || kc === 195 || kc === 29443) {
    e.preventDefault ? e.preventDefault() : (e.returnValue = false);
    var a = document.activeElement;
    if (a && a.click) { try { a.click(); } catch (err) {} }
    else if (navEls[navIdx]) { try { navEls[navIdx].click(); } catch (err) {} }
    return;
  }
}
try { window.addEventListener('keydown', handleRemote, false); } catch (e) {}
try { document.addEventListener('keydown', handleRemote, false); } catch (e) {}
window.onkeydown = handleRemote;

/* ===== Grille ===== */
function renderGrid() {
  var grid = document.getElementById('grid');
  if (!grid) return;
  grid.innerHTML = '';
  cardEls = [];
  msg('');
  for (var i = 0; i < items.length; i++) {
    (function(it, i2) {
      var card = document.createElement('div');
      card.className = 'card';
      card.id = 'card' + i2;
      card.tabIndex = 0;
      var poster = document.createElement('div');
      poster.className = 'poster';
      var img = document.createElement('img');
      img.src = '/api/poster?path=' + encodeURIComponent(it.poster || '') + '&size=w500';
      img.alt = '';
      img.onerror = function() { this.style.visibility = 'hidden'; };
      poster.appendChild(img);
      card.appendChild(poster);
      if (it.rating && it.rating >= 6) {
        var badge = document.createElement('div');
        badge.className = 'badge';
        badge.innerHTML = '<i>&#9733;</i> ' + (Math.round(it.rating * 10) / 10).toFixed(1);
        poster.appendChild(badge);
      }
      var t = document.createElement('div');
      t.className = 't';
      t.innerHTML = it.title || '';
      card.appendChild(t);
      var m = document.createElement('div');
      m.className = 'm';
      var yr = it.year || '';
      var tp = (it.type === 'tv') ? 'S\u00e9rie' : 'Film';
      m.innerHTML = tp + (yr ? ' \u00b7 ' + yr : '');
      card.appendChild(m);
      card.onclick = function() { openItem(it); };
      grid.appendChild(card);
      cardEls.push(card);
    })(items[i], i);
  }
  var ma = document.getElementById('msg');
  if (ma) ma.style.display = 'none';
  focusIdx = 0;
  registerGridNav();
  /* L'animation cardIn en fill-mode:both verrouille le transform final et
     bloquerait le scale du focus : on la retire une fois terminée */
  setTimeout(function() {
    for (var j = 0; j < cardEls.length; j++) {
      try { cardEls[j].style.webkitAnimation = 'none'; cardEls[j].style.animation = 'none'; } catch (e) {}
    }
  }, 700);
}

function loadTrending(type) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/lite/trending?type=' + type, true);
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          items = data.items || [];
          renderGrid();
        } catch (err) { msg('Erreur de donn\u00e9es'); }
      } else { msg('Impossible de charger (' + xhr.status + ')'); }
    }
  };
  xhr.send();
}

function doSearch() {
  var q = document.getElementById('q');
  if (!q) return;
  var query = q.value;
  query = query.replace(/^\s+|\s+$/g, '');
  if (!query) return;
  msg('Recherche...');
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/search?q=' + encodeURIComponent(query), true);
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          items = (data.results || []).slice(0, 24);
          renderGrid();
        } catch (err) { msg('Erreur de donn\u00e9es'); }
      } else { msg('Recherche impossible (' + xhr.status + ')'); }
    }
  };
  xhr.send();
}

/* ===== Ouverture d'un titre → page lecture ===== */
function openItem(it) {
  var url = 'litewatch.html?type=' + (it.type || 'movie') + '&id=' + encodeURIComponent(it.id);
  if (it.title) url += '&title=' + encodeURIComponent(it.title);
  if (it.type === 'tv') {
    /* Reprendre si on vient de "Continuer à regarder", sinon S1E1 */
    url += '&season=' + (it.season || 1) + '&episode=' + (it.episode || 1);
  }
  if (it.sec && it.pct && it.pct > 2 && it.pct < 96) url += '&t=' + it.sec;
  location.href = url;
}

/* ===== Plein écran (bouton nav, toutes les pages FLUX) ===== */
function toggleFullscreen() {
  try {
    var d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement || d.msFullscreenElement) {
      if (d.exitFullscreen) d.exitFullscreen();
      else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
      else if (d.msExitFullscreen) d.msExitFullscreen();
      msg('');
      return;
    }
    var el = d.documentElement;
    if (el.requestFullscreen) { el.requestFullscreen(); return; }
    if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); return; }
    if (el.webkitRequestFullScreen) { el.webkitRequestFullScreen(); return; }
    if (el.msRequestFullscreen) { el.msRequestFullscreen(); return; }
    msg('Plein écran non supporté');
  } catch (e) {}
}

/* ===== Initialisation de la page grille ===== */
function initLite() {
  detectCapabilities();
  loadTrending(LITE_PAGE === 'search' ? 'all' : LITE_PAGE);
}