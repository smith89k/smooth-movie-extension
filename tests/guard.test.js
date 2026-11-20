import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteOf, shouldCloseNewTab } from '../lib/guard.js';

test('siteOf drops www and subdomains', () => {
  assert.equal(siteOf('https://www.movies-example.com/watch/1'), 'movies-example.com');
  assert.equal(siteOf('https://player.cdn.movies-example.com/x'), 'movies-example.com');
});

test('siteOf keeps two-part country endings together', () => {
  assert.equal(siteOf('https://shop.example.co.uk/'), 'example.co.uk');
  assert.equal(siteOf('https://www.example.com.au/'), 'example.com.au');
});

test('siteOf keeps localhost and ip addresses as they are', () => {
  assert.equal(siteOf('http://localhost:8080/page'), 'localhost');
  assert.equal(siteOf('http://127.0.0.1:8080/page'), '127.0.0.1');
});

test('siteOf returns empty text for pages that are not websites', () => {
  assert.equal(siteOf('about:blank'), '');
  assert.equal(siteOf('chrome://newtab/'), '');
  assert.equal(siteOf('not a url'), '');
  assert.equal(siteOf(undefined), '');
});

const guarded = {
  sourceUrl: 'https://www.movies-example.com/film/1',
  guardedSites: ['movies-example.com'],
  enabled: true,
};

test('closes a new tab that goes to another site from a guarded page', () => {
  assert.equal(shouldCloseNewTab({ ...guarded, targetUrl: 'https://ads-example.net/click' }), true);
});

test('closes a blank new tab from a guarded page', () => {
  assert.equal(shouldCloseNewTab({ ...guarded, targetUrl: 'about:blank' }), true);
});

test('keeps a new tab that stays on the same site', () => {
  assert.equal(shouldCloseNewTab({ ...guarded, targetUrl: 'https://movies-example.com/film/2' }), false);
});

test('keeps new tabs when the page is not guarded', () => {
  assert.equal(
    shouldCloseNewTab({ ...guarded, guardedSites: ['other-example.com'], targetUrl: 'https://ads-example.net/' }),
    false,
  );
});

test('keeps new tabs when protection is switched off', () => {
  assert.equal(shouldCloseNewTab({ ...guarded, enabled: false, targetUrl: 'https://ads-example.net/' }), false);
});
