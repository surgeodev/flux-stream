/* ===== FLUX Cast — récepteur TV (Samsung 2014 compris, ES5) =====
   Sonde /api/presence toutes les ~1,3 s :
     • signale la TV (uid stable) + son état (lecture / vol / zoom / sub / qual)
     → le serveur renvoie les commandes en queue (cast + télécommande).
   Le phone ne fait que pousser des commandes ; la TV les applique ici. */
(function () {
  function fnv1a(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h = (h ^ s.charCodeAt(i)) >>> 0;
      h = (h * 16777619) >>> 0;
    }
    var hex = (h >>> 0).toString(16);
    while (hex.length < 8) hex = '0' + hex;
    return hex;
  }

  var ua = (navigator.userAgent || '').toLowerCase();
  var castUid = 'tv-' + fnv1a(ua);

  var state = {
    castSid: '',
    timer: 0,
    alive: false,
    playing: false,
    lastCmd: 0
  };

  window.__castSid = window.__castSid || '';
  state.castSid = window.__castSid || '';

  function el(id) { return document.getElementById(id); }

  function videoEl() { var v = el('video'); return v || null; }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---- Construction de l'état à remonter au serveur (page override) ---- */
  function buildExtra() {
    /* Default minimal (page d'accueil) — surchargé par litewatch. */
    return {
      sid: state.castSid,
      playing: false,
      t: 0, dur: 0,
      vol: null, rate: null,
      sub: null, subList: [],
      zoom: 1, zoomPct: 100,
      qual: null, qualList: [],
      title: 'FLUX TV (accueil)'
    };
  }

  function applySubState() {
    var s = window.castTv;
    if (!s) return;
    var info = s.playerState();
    state.playing = !!info.play;
    state.castSid = (window.__castSid || '') || state.castSid;
  }

  function subList() {
    if (typeof window.subsMeta !== 'undefined' && window.subsMeta) {
      var out = [];
      for (var i = 0; i < window.subsMeta.length; i++) {
        out.push(window.subsMeta[i].lang || ('n' + (i + 1)));
      }
      return out;
    }
    return [];
  }
  function qualList() {
    if (typeof window.streams !== 'undefined' && window.streams) {
      var out = [];
      for (var i = 0; i < window.streams.length; i++) {
        var s = window.streams[i] || {};
        out.push(s.name || s.provider || s.quality || ('src' + (i + 1)));
      }
      return out;
    }
    return [];
  }

  function playerState() {
    var v = el('video');
    var play = false, t = 0, dur = 0, vol = null, rate = 1;
    if (v) {
      play = !(v.paused || v.ended);
      t = v.currentTime || 0;
      dur = v.duration || 0;
      vol = (typeof v.volume === 'number') ? v.volume : 1;
      rate = (typeof v.playbackRate === 'number') ? v.playbackRate : 1;
    }
    return { play: play, t: t, dur: dur, vol: vol, rate: rate };
  }

  function currentSub() {
    if (typeof window.subIdx === 'undefined') return null;
    if (window.subIdx < 0) return 'none';
    var sm = (typeof window.subsMeta !== 'undefined' && window.subsMeta) || [];
    return (sm[window.subIdx] && sm[window.subIdx].lang) || ('n' + (window.subIdx + 1));
  }
  function currentQual() {
    if (typeof window.streamIdx === 'undefined' || !window.streams) return null;
    var s = window.streams[window.streamIdx] || {};
    return s.name || s.provider || s.quality || null;
  }
  function currentZoom() {
    var z = (typeof window.tvZoom === 'number') ? window.tvZoom : 1;
    return { z: z, pct: Math.round((z || 1) * 100) };
  }

  /* ---- Télécharge la liste des sous-titres / sources sur la TV ---- */
  function playerState() {
    var v = el('video');
    var play = false, t = 0, dur = 0, vol = null, rate = 1;
    if (v) {
      play = !(v.paused || v.ended);
      t = v.currentTime || 0;
      dur = v.duration || 0;
      vol = (typeof v.volume === 'number') ? v.volume : 1;
      rate = (typeof v.playbackRate === 'number') ? v.playbackRate : 1;
    }
    return { play: play, t: t, dur: dur, vol: vol, rate: rate };
  }

  /* ---- Envoi de présence + réception de commandes ---- */
  function sendPresence() {
    try {
      var ex = buildExtra();
      var ps = playerState();
      ex.playing = !!ps.play;
      ex.t = (ps.t > 0) ? ps.t : 0;
      ex.dur = ps.dur || 0;
      ex.vol = ps.vol;
      ex.rate = ps.rate;
      if (typeof window.playing === 'object' && window.playing) ex.title = window.playing.title || ex.title;
      var ps = 'uid=' + encodeURIComponent(castUid) +
        '&label=' + encodeURIComponent('FLUX TV (téléviseur)') +
        '&kind=tv&path=' + encodeURIComponent(window.location.pathname || '/') +
        '&playing=' + (ps.play ? '1' : '0') +
        '&t=' + (ps.t || 0) +
        '&dur=' + (ps.dur || 0) +
        '&extra=' + encodeURIComponent(JSON.stringify(ex));
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/presence', true);
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=utf-8');
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
          try {
            var resp = JSON.parse(xhr.responseText || '{}');
            var cmds = resp.commands || [];
            if (cmds.length) state.lastCmd = Date.now();
            for (var i = 0; i < cmds.length; i++) dispatchCommand(cmds[i]);
            state.alive = true;
          } catch (e) {}
        }
      };
      xhr.send(ps);
    } catch (e) { state.alive = false; }
  }

  /* ---- Dispatch d'une commande ---- */
  function dispatchCommand(c) {
    if (!c) return;
    var action = c.action, p = c.payload || {};
    if (action === 'cast') {
      var pay = p;
      var newSid = pay.sid || '';
      if (newSid && newSid !== state.castSid) {
        state.castSid = newSid;
        window.__castSid = newSid;
        location.href = castUrl(p);
      }
      return;
    }
    if (action !== 'ctrl') return;
    var cmd = (p.cmd || '').toLowerCase();
    var val = p.val || {};
    if (p.sid && p.sid !== state.castSid) {
      if (cmd !== 'home' && cmd !== 'stopcast' && cmd !== 'exit') return;
    }
    dispatchCtrl(cmd, val);
  }

  function castUrl(p) {
    var url = '/litewatch.html?cast=' + encodeURIComponent(p.sid || '') +
      '&type=' + encodeURIComponent(p.type || 'movie') +
      '&id=' + encodeURIComponent(p.id || '') +
      '&title=' + encodeURIComponent(p.title || '');
    if (p.type === 'tv' || p.type === 'series') {
      url += '&season=' + encodeURIComponent(p.season || '1');
      url += '&episode=' + encodeURIComponent(p.episode || '1');
    }
    return url;
  }

  function dispatchCtrl(cmd, val) {
    if (!val) val = {};
    if (cmd === 'play') { var v = el('video'); if (v && v.paused) { if (typeof togglePlay === 'function') togglePlay(); } }
    else if (cmd === 'pause') { var v = el('video'); if (v) { try { v.pause(); } catch (e) {} } }
    else if (cmd === 'playpause') { if (typeof togglePlay === 'function') togglePlay(); }
    else if (cmd === 'seek') { var t = parseFloat(val.t); var v = el('video'); if (v && isFinite(t) && t >= 0) { try { v.currentTime = t; } catch (e) {} } }
    else if (cmd === 'skip' || cmd === 'seekrel') { var d = parseFloat(val.d); if (typeof skip === 'function' && isFinite(d)) skip(d); }
    else if (cmd === 'vol') { var v = el('video'); if (v && typeof v.volume === 'number') { v.volume = clamp(v.volume + parseFloat(val.d || 0.1), 0, 1); } }
    else if (cmd === 'volabs') { var v = el('video'); if (v && typeof v.volume === 'number') { v.volume = clamp(parseFloat(val.v || 1), 0, 1); } }
    else if (cmd === 'mute') { var v = el('video'); if (v) { v.muted = !!val.on; } }
    else if (cmd === 'sub') { var i = parseInt(val.i, 10); if (typeof pickSub === 'function' && !isNaN(i)) pickSub(i); }
    else if (cmd === 'suboff') { if (typeof pickSub === 'function') pickSub(-1); }
    else if (cmd === 'subnext') { stepSub(1); }
    else if (cmd === 'subprev') { stepSub(-1); }
    else if (cmd === 'qual' || cmd === 'source') { var i = parseInt(val.i, 10); if (typeof pickSetSrc === 'function' && !isNaN(i)) pickSetSrc(i); }
    else if (cmd === 'setqual') { var i = parseInt(val.i, 10); if (typeof setQuality === 'function' && !isNaN(l)) setQuality(l); }
    else if (cmd === 'zoom') { var d = parseFloat(val.d); if (typeof zoomBy === 'function' && isFinite(d)) zoomBy(d); }
    else if (cmd === 'zoomabs') { setZoomAbs(parseFloat(val.s)); }
    else if (cmd === 'speed') { setSpeedCmd(val.rate); }
    else if (cmd === 'audio') { var i = parseInt(val.i, 10); if (typeof setAudio === 'function' && !isNaN(i)) setAudio(i); }
    else if (cmd === 'home') { if (typeof goHome === 'function') goHome(); }
    else if (cmd === 'stopcast') { try { localStorage && localStorage.removeItem('flux-cast'); } catch (e) {} location.href = 'lite.html'; }
    else if (cmd === 'exit') { if (typeof goHome === 'function') goHome(); }
  }

  function stepSub(dir) {
    if (typeof window.subsMeta === 'undefined' || !window.subsMeta || !window.subsMeta.length) return;
    var n = window.subsMeta.length;
    var cur = (typeof window.subIdx === 'number') ? window.subIdx : -1;
    var next = cur + dir;
    if (next < -1) next = n - 1;
    if (next >= n) next = -1;
    if (typeof pickSub === 'function') pickSub(next);
  }

  function setSpeedCmd(rate) {
    var r = parseFloat(rate);
    if (!isFinite(r) || r <= 0) return;
    if (typeof window.TV_SPEEDS !== 'undefined' && window.TV_SPEEDS && window.TV_SPEEDS.indexOf) {
      for (var i = 0; i < window.TV_SPEEDS.length; i++) {
        if (Math.abs(parseFloat(window.TV_SPEEDS[i]) - r) < 1e-6) {
          if (typeof window.setSpeed === 'function') { window.setSpeed(parseFloat(window.TV_SPEEDS[i])); return; }
        }
      }
    }
    if (typeof window.setSpeed === 'function') window.setSpeed(r);
  }

  function setZoomAbs(s) {
    var f = parseFloat(s);
    if (!isFinite(f)) return;
    f = clamp(f, 1, 2.5);
    if (typeof window.tvZoom === 'number') {
      window.tvZoom = f;
      if (typeof applyZoom === 'function') applyZoom();
    }
  }

  /* ---- Construction d'état pour la TV (litewatch) ---- */
  function litewatchExtra() {
    var ps = playerState();
    var z = currentZoom();
    var ex = {
      sid: state.castSid,
      playing: !!ps.play,
      t: ps.t, dur: ps.dur,
      vol: ps.vol, rate: ps.rate,
      sub: currentSub(), subList: subList(),
      zoom: z.z, zoomPct: z.pct,
      qual: currentQual(), qualList: qualList(),
      title: (typeof window.playing === 'object' && window.playing && window.playing.title) || ''
    };
    return ex;
  }

  window.castTv = {
    uid: castUid,
    state: state,
    playerState: playerState,
    buildExtra: buildExtra,
    dispatchCtrl: dispatchCtrl
  };

  function poll() {
    buildExtra = window.castTv.buildExtra || buildExtra;
    sendPresence();
  }

  function startCastTv() {
    if (typeof window.castTv._started === 'boolean' && window.castTv._started) return;
    window.castTv._started = true;
    if (typeof window.playing === 'object' && window.playing && window.playing.title) {
      window.castTv.buildExtra = litewatchExtra;
    }
    sendPresence();
    state.timer = setInterval(poll, 1300);
  }
  function stopCastTv() {
    if (state.timer) { clearInterval(state.timer); state.timer = 0; }
    if (window.castTv) window.castTv._started = false;
  }
  window.startCastTv = startCastTv;
  window.stopCastTv = stopCastTv;
  window.castTvSend = sendPresence;
})();