import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const boostCode = readFileSync(new URL('../content/player-boost.js', import.meta.url), 'utf8');

// A tiny stand-in for a web page: just enough "window" and "document"
// for the player boost script to run the same way it does in Chrome.
function openPage({ boost = 'on' } = {}) {
  const listeners = {};
  const page = {
    document: {
      documentElement: { dataset: boost === 'off' ? { smoothMovieBoost: 'off' } : {} },
      addEventListener(type, fn) {
        (listeners[type] ??= []).push(fn);
      },
    },
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
  };
  page.window = page;
  vm.createContext(page);
  vm.runInContext(boostCode, page);
  const run = (code) => vm.runInContext(code, page);
  const fire = (type, event) => (listeners[type] ?? []).forEach((fn) => fn(event));
  return { page, run, fire };
}

const loadFakeHls = `
  window.Hls = class Hls {
    constructor(config) { this.config = config || {}; }
    static isSupported() { return true; }
  };
`;

test('hls.js players buffer two minutes ahead', () => {
  const { run } = openPage();
  run(loadFakeHls);
  assert.equal(run('new Hls({}).config.maxBufferLength'), 120);
});

test('hls.js players stop keeping old video they already played', () => {
  const { run } = openPage();
  run(loadFakeHls);
  assert.equal(run('new Hls().config.backBufferLength'), 30);
});

test('hls.js players pick a safer quality so they stall less', () => {
  const { run } = openPage();
  run(loadFakeHls);
  assert.equal(run('new Hls({}).config.abrBandWidthFactor'), 0.8);
});

test('a bigger buffer the site already asked for is kept', () => {
  const { run } = openPage();
  run(loadFakeHls);
  assert.equal(run('new Hls({ maxBufferLength: 300 }).config.maxBufferLength'), 300);
});

test('the site can still ask hls.js if it is supported', () => {
  const { run } = openPage();
  run(loadFakeHls);
  assert.equal(run('Hls.isSupported()'), true);
  assert.equal(run('new Hls({}) instanceof Hls'), true);
});

test('hls.js is left alone when smoother playback is off', () => {
  const { run } = openPage({ boost: 'off' });
  run(loadFakeHls);
  assert.equal(run('new Hls({}).config.maxBufferLength'), undefined);
});

test('video.js players get bigger buffer goals', () => {
  const { run } = openPage();
  run(`
    const vjs = function videojs() {};
    vjs.Vhs = { GOAL_BUFFER_LENGTH: 30, MAX_GOAL_BUFFER_LENGTH: 60 };
    window.videojs = vjs;
  `);
  assert.equal(run('videojs.Vhs.GOAL_BUFFER_LENGTH'), 60);
  assert.equal(run('videojs.Vhs.MAX_GOAL_BUFFER_LENGTH'), 120);
});

test('video.js is left alone when smoother playback is off', () => {
  const { run } = openPage({ boost: 'off' });
  run(`
    const vjs = function videojs() {};
    vjs.Vhs = { GOAL_BUFFER_LENGTH: 30, MAX_GOAL_BUFFER_LENGTH: 60 };
    window.videojs = vjs;
  `);
  assert.equal(run('videojs.Vhs.GOAL_BUFFER_LENGTH'), 30);
});

function stuckVideo({ at, nextChunkStart }) {
  return {
    currentTime: at,
    paused: false,
    readyState: 2,
    buffered: {
      length: nextChunkStart === undefined ? 0 : 1,
      start: () => nextChunkStart,
      end: () => nextChunkStart + 30,
    },
  };
}

test('a video stuck at a small hole in the download skips over it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { fire } = openPage();
  const video = stuckVideo({ at: 10, nextChunkStart: 10.5 });
  fire('waiting', { target: video });
  t.mock.timers.tick(2000);
  assert.ok(Math.abs(video.currentTime - 10.6) < 1e-9, `expected 10.6, got ${video.currentTime}`);
});

test('a video that is simply still downloading is not moved', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { fire } = openPage();
  const video = stuckVideo({ at: 10, nextChunkStart: undefined });
  fire('waiting', { target: video });
  t.mock.timers.tick(2000);
  assert.equal(video.currentTime, 10);
});

test('a video is not moved over a big hole', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { fire } = openPage();
  const video = stuckVideo({ at: 10, nextChunkStart: 25 });
  fire('waiting', { target: video });
  t.mock.timers.tick(2000);
  assert.equal(video.currentTime, 10);
});

test('a video that started playing again on its own is not moved', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { fire } = openPage();
  const video = stuckVideo({ at: 10, nextChunkStart: 10.5 });
  fire('waiting', { target: video });
  video.readyState = 4;
  t.mock.timers.tick(2000);
  assert.equal(video.currentTime, 10);
});

test('hole skipping is off when smoother playback is off', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { fire } = openPage({ boost: 'off' });
  const video = stuckVideo({ at: 10, nextChunkStart: 10.5 });
  fire('waiting', { target: video });
  t.mock.timers.tick(2000);
  assert.equal(video.currentTime, 10);
});
