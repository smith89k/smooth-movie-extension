// Runs in every page and frame. Passes the "smoother playback" switch to
// player-boost.js, and hides leftover ad boxes when ad blocking is on.
(() => {
  'use strict';

  const DEFAULTS = { enabled: true, adBlock: true, boost: true };

  // Only well-known ad box shapes, so normal page parts are never hidden.
  const AD_BOXES = [
    'ins.adsbygoogle',
    'div[id^="div-gpt-ad"]',
    'iframe[id^="google_ads_iframe"]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="amazon-adsystem.com"]',
    'div[id^="taboola-"]',
    'div.OUTBRAIN',
    'div[id^="mgid_"]',
    'iframe[src*="adsterra"]',
    'iframe[src*="exoclick"]',
    'iframe[src*="juicyads"]',
  ];

  chrome.storage.local.get(DEFAULTS).then(({ enabled, adBlock, boost }) => {
    const html = document.documentElement;
    if (!html) return;

    if (!(enabled && boost)) html.dataset.smoothMovieBoost = 'off';

    if (enabled && adBlock) {
      const style = document.createElement('style');
      style.textContent = `${AD_BOXES.join(',\n')} { display: none !important; }`;
      (document.head || html).appendChild(style);
    }
  });
})();
