// The user's choices, with the values used before they change anything.
export const DEFAULTS = Object.freeze({
  enabled: true, // the big on/off switch
  adBlock: true, // block ads on every site
  boost: true, // smoother playback on every site
  guardedSites: [], // sites where pop-up tabs get closed
});

export const getSettings = () => chrome.storage.local.get({ ...DEFAULTS });
export const saveSettings = (changes) => chrome.storage.local.set(changes);
