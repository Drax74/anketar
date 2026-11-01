import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { t, htmlText, localizeHtml } from '../../src/i18n.js';
import { formatVotes } from '../../src/shared/helpers/format.js';

test('Croatian vote plurals include teen and compound-number exceptions', () => {
    for (const [count, expected] of [
        [0, '0 glasova'], [1, '1 glas'], [2, '2 glasa'], [4, '4 glasa'],
        [5, '5 glasova'], [11, '11 glasova'], [12, '12 glasova'], [14, '14 glasova'],
        [21, '21 glas'], [22, '22 glasa'], [101, '101 glas'], [111, '111 glasova']
    ]) assert.equal(formatVotes(count), expected);
});

test('parameter substitution preserves user text and escapes it only for HTML', () => {
    const name = '<img src=x onerror="alert(1)"> & \'član\'';
    assert.equal(t('stay.creator', { name }), `Prijedlog: ${name}`);
    assert.equal(htmlText('stay.creator', { name }), 'Prijedlog: &lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;član&#39;');
    assert.equal(t('auth.loginFailed', { message: '{name}' }), 'Login failed: {name}');
});

test('missing keys and parameters cannot silently appear in the interface', () => {
    assert.throws(() => t('missing.key'), /Unknown language key/);
    assert.throws(() => t('stay.creator'), /Missing name/);
    assert.throws(() => t('toString'), /Unknown language key/);
    assert.throws(() => localizeHtml('<title>{{t:missing.key}}</title>'), /Unknown language key/);
});

test('the initial document and HTML partials resolve all language markers', async () => {
    for (const path of ['index.html', 'src/components/controls-bar.html', 'src/components/leaderboard.html']) {
        const source = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
        const rendered = localizeHtml(source);
        assert.doesNotMatch(rendered, /\{\{t:/);
        if (path === 'index.html') {
            assert.match(rendered, /<html lang="hr">/);
            assert.match(rendered, /<title>Madrid - Trkadzije &amp; Rumoljubi<\/title>/);
            assert.match(rendered, /placeholder="Unesi Booking.com ili Airbnb link"/);
        }
    }
});
