// Runs inside the web page itself (and inside embedded video players),
// before the page's own code. It asks common video players to download
// further ahead, and un-sticks videos frozen at a small gap in the download.
//
// The "smoother playback" switch reaches this script through a mark on the
// page (data-smooth-movie-boost="off"), set by settings-bridge.js.
(() => {
  'use strict';

  const root = window;
  const doc = root.document;
  const MARK = Symbol.for('smoothMovie.boosted');

  const isOn = () => doc.documentElement?.dataset?.smoothMovieBoost !== 'off';

  // ---------- hls.js (used by many free movie sites) ----------

  // Raise these to at least this value.
  const HLS_AT_LEAST = {
    maxBufferLength: 120, // seconds of video to keep ready ahead (normally 30)
    maxMaxBufferLength: 600,
    maxBufferSize: 120 * 1000 * 1000, // bytes (normally 60 MB)
  };
  // Use these only if the site did not choose its own value.
  const HLS_IF_MISSING = {
    backBufferLength: 30, // forget video already watched, to save memory
    abrBandWidthFactor: 0.8, // pick a quality a bit below the measured speed
    abrBandWidthUpFactor: 0.6, // be slower to jump up to a sharper quality
    capLevelToPlayerSize: true, // don't fetch 1080p for a small player
    startFragPrefetch: true,
  };

  function boostHlsConfig(config) {
    const out = Object.assign({}, config);
    for (const [key, value] of Object.entries(HLS_AT_LEAST)) {
      out[key] = typeof out[key] === 'number' ? Math.max(out[key], value) : value;
    }
    for (const [key, value] of Object.entries(HLS_IF_MISSING)) {
      if (out[key] === undefined) out[key] = value;
    }
    return out;
  }

  function wrapHls(Original) {
    if (typeof Original !== 'function' || Object.hasOwn(Original, MARK)) return Original;
    try {
      class SmoothHls extends Original {
        constructor(config, ...rest) {
          super(isOn() ? boostHlsConfig(config) : config, ...rest);
        }
      }
      Object.defineProperty(SmoothHls, 'name', { value: Original.name });
      Object.defineProperty(SmoothHls, MARK, { value: true });
      return SmoothHls;
    } catch {
      return Original;
    }
  }

  // ---------- video.js ----------

  function raise(target, key, atLeast) {
    try {
      if (typeof target[key] === 'number' && target[key] < atLeast) target[key] = atLeast;
    } catch {
      // the player locked this setting; leave it
    }
  }

  function boostVideoJs(videojs) {
    if (!videojs || !isOn()) return videojs;
    const vhs = videojs.Vhs || videojs.Hls;
    if (vhs) {
      raise(vhs, 'GOAL_BUFFER_LENGTH', 60);
      raise(vhs, 'MAX_GOAL_BUFFER_LENGTH', 120);
    }
    return videojs;
  }

  // ---------- catch the players as the page loads them ----------

  function watchGlobal(name, transform) {
    const existing = Object.getOwnPropertyDescriptor(root, name);
    if (existing && !existing.configurable) return;
    let value = existing ? transform(root[name]) : undefined;
    try {
      Object.defineProperty(root, name, {
        configurable: true,
        enumerable: true,
        get: () => value,
        set: (next) => {
          value = transform(next);
        },
      });
    } catch {
      // the page locked this name; leave it
    }
  }

  watchGlobal('Hls', wrapHls);
  watchGlobal('videojs', boostVideoJs);

  // ---------- un-stick a video frozen at a small gap ----------

  const STUCK_WAIT_MS = 1500;
  const MAX_GAP_SECONDS = 3;

  function nextChunkAfterGap(video) {
    const ranges = video.buffered;
    const now = video.currentTime;
    for (let i = 0; i < ranges.length; i++) {
      const start = ranges.start(i);
      const end = ranges.end(i);
      if (start <= now && now < end - 0.1) return null; // video is there, just slow
      if (start > now && start - now <= MAX_GAP_SECONDS) return start;
    }
    return null;
  }

  doc.addEventListener(
    'waiting',
    (event) => {
      const video = event.target;
      if (!isOn() || !video || typeof video.buffered !== 'object') return;
      const stuckAt = video.currentTime;
      root.setTimeout(() => {
        if (video.paused || video.seeking || video.readyState >= 3) return;
        if (video.currentTime !== stuckAt) return;
        const start = nextChunkAfterGap(video);
        if (start !== null) video.currentTime = start + 0.1;
      }, STUCK_WAIT_MS);
    },
    true,
  );
})();
