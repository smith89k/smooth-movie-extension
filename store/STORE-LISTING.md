# Chrome Web Store – what to upload and paste

Everything the Developer Dashboard asks for, in the order it asks.
Dashboard: https://chrome.google.com/webstore/devconsole

## 0. Before you start

1. Run `npm test` and `npm run test:browser` – both must pass.
2. If you changed anything, raise `"version"` in `manifest.json` (each upload needs a higher number).
3. Run `npm run package` → upload `dist/smooth-movie-<version>.zip`.
4. Push this repo to GitHub so the privacy policy link below works.

## 1. Package

Click **New item** → upload the zip from `dist/`.

## 2. Store listing tab

**Description** (paste as is):

```
Smooth Movie makes watching videos in your browser calmer.

• Blocks ads – stops requests to well-known ad networks on every site and hides leftover ad boxes.
• Closes pop-up tabs – turn it on for the sites you choose. When the site tries to open another website in a new tab, the tab is closed and you are taken back to your video.
• Smoother playback – asks common web video players (hls.js and video.js) to keep about two minutes of video ready instead of thirty seconds, and gets past small gaps where a video gets stuck.

The toolbar menu has simple on/off switches and shows how many ads and pop-up tabs were blocked in the current tab.

Private by design: no accounts, no tracking, no analytics. Your settings stay in your own browser.

Good to know:
• It cannot make your internet faster. It saves more video ahead, so short slowdowns don't stop playback.
• Paid streaming services lock their own players, so the playback boost changes little there.
• On sites where pop-up closing is on, links that open other websites in a new tab are closed too. Turn the switch off for that site if you need one.
```

**Category:** Privacy & Security
**Language:** English

**Images** (all in `store/images/`, remake with `npm run store-images`):

| Field | File |
| --- | --- |
| Store icon (128×128) | `icons/icon128.png` |
| Screenshot 1 (1280×800) | `store/images/screenshot-1-overview.jpg` |
| Screenshot 2 (1280×800) | `store/images/screenshot-2-popups.jpg` |
| Small promo tile (440×280) | `store/images/promo-small-440x280.jpg` |

**Homepage URL:** https://github.com/smith89k/smooth-movie-extension
**Support URL:** https://github.com/smith89k/smooth-movie-extension/issues

## 3. Privacy tab

**Single purpose:**

```
Make watching video in the browser less interrupted: block ads, close unwanted pop-up tabs on sites the user chooses, and let web video players buffer further ahead.
```

**Permission justifications:**

| Permission | Paste this |
| --- | --- |
| `storage` | Saves the user's on/off switches and the list of sites where pop-up tab closing is turned on. Also keeps per-tab block counts shown in the menu (session storage, cleared when the tab closes). |
| `declarativeNetRequest` | Blocks requests to a built-in, static list of known ad network domains. The list ships inside the extension; the user can turn it on or off. |
| `webNavigation` | Detects when a page opens a new tab (onCreatedNavigationTarget) so the extension can close pop-up tabs on sites where the user turned this on. |
| `webRequest` | Read-only: counts requests that Chrome already blocked (net::ERR_BLOCKED_BY_CLIENT) to show "Blocked N ads in this tab" in the menu. It does not block, change or record requests. |
| Host permission (`<all_urls>`) | Ads and pop-up tabs appear on any video site, so ad blocking, the playback helper script and pop-up tab detection must work on all sites the user visits. No page content or browsing data is read, stored or sent anywhere. |

**Are you using remote code?** No, I am not using remote code.

**Data usage:** tick **nothing** in the list of data types (the extension collects no user data). Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/smith89k/smooth-movie-extension/blob/main/PRIVACY.md

## 4. Distribution tab

- **Payments:** Free
- **Visibility:** Public (or Unlisted to test with a private link first)
- **Regions:** All regions

## 5. Account tab (one time)

Check that the publisher name and contact email are filled in and the email is verified. The dashboard will not let you submit without it.

## 6. Submit

Click **Submit for review**. Because the extension asks for access to all sites, Google's review usually takes a few days, sometimes longer.
