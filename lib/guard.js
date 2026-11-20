// Decides which new tabs are pop-ups that should be closed.
// Shared by the background worker and the toolbar menu.

// Country endings that are really two parts, so "shop.example.co.uk"
// belongs to "example.co.uk" and not to "co.uk".
const TWO_PART_ENDINGS = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au',
  'co.nz', 'co.jp', 'co.kr', 'co.in', 'co.id', 'co.th', 'co.za',
  'com.br', 'com.mx', 'com.sg', 'com.my', 'com.ph', 'com.vn', 'com.kh',
  'com.tr', 'com.cn', 'com.hk', 'com.tw',
]);

/** The website a web address belongs to, e.g. "movies.example.com" -> "example.com". */
export function siteOf(url) {
  let host;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    host = parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
  const isIpAddress = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
  if (isIpAddress || !host.includes('.')) return host;

  const parts = host.split('.');
  const keep = TWO_PART_ENDINGS.has(parts.slice(-2).join('.')) ? 3 : 2;
  return parts.slice(-keep).join('.');
}

/**
 * A new tab is a pop-up to close when protection is on, the page that opened it
 * is on a guarded site, and the new tab goes somewhere other than that site.
 */
export function shouldCloseNewTab({ sourceUrl, targetUrl, guardedSites, enabled }) {
  if (!enabled) return false;
  const source = siteOf(sourceUrl);
  if (!source || !guardedSites.includes(source)) return false;
  return siteOf(targetUrl) !== source;
}
