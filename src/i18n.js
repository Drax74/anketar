import messages from './locales/hr.json' with { type: 'json' };

export const locale = messages.locale;
const plurals = new Intl.PluralRules(locale);

// Messages contain plain text, never HTML. Missing keys/parameters fail loudly
// in development and builds rather than silently shipping untranslated labels.
export function t(key, params = {}) {
    if (!Object.hasOwn(messages, key)) throw new Error(`Unknown language key: ${key}`);
    return messages[key].replace(/\{(\w+)\}/g, (_, name) => {
        if (!Object.hasOwn(params, name)) throw new Error(`Missing ${name} for language key: ${key}`);
        return String(params[name]);
    });
}

export function plural(key, count) {
    return t(`${key}.${plurals.select(count)}`, { count });
}

// Use for markup and quoted attributes; t() itself belongs in textContent,
// setAttribute, alerts and other plain-text sinks.
export function htmlText(key, params) {
    return t(key, params).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

// Resolve static copy before the page is served, including metadata. This keeps
// the initial HTML useful without waiting for JavaScript to update the DOM.
export function localizeHtml(source) {
    return source.replace(/\{\{t:([\w.]+)\}\}/g, (_, key) => htmlText(key));
}
