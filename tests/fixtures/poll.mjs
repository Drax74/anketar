// Entirely fictional data. Every Supabase request is intercepted before leaving the browser.
export async function mockPoll(page, { tied = false, failReads = false, failScrape = false } = {}) {
    const email = 'marko@example.test';
    const user = { id: '00000000-0000-4000-8000-000000000001', email, aud: 'authenticated', role: 'authenticated', user_metadata: { full_name: 'Marko Kovač' } };
    const members = ['Marko Kovač', 'Ana Novak', 'Iva Horvat', 'Petar Kovač', 'Luka Marić', 'Ema Babić', 'Ivan Jurić', 'Sara Matić'].map((name, index) => ({ id: index + 1, email: index ? `user${index}@example.test` : email, name }));
    const titles = ['Loft u centru', 'Apartman Sol', 'Casa Madrid', 'Studio Retiro', 'Smještaj <b>Madrid</b> & "ekipa"'];
    const options = titles.map((title, index) => ({ id: `option-${index}`, title, price: String(420 - index * 20), image: '/anketar/hero-cover-image.webp', link: 'https://www.airbnb.com/rooms/test', created_by: members[index].email, note: 'Blizu centra i metroa.', description: 'Svijetao smještaj za zajedničko putovanje.' }));
    const votes = [8, tied ? 8 : 6, 4, 1].flatMap((count, index) => members.slice(0, count).map((member, number) => ({ id: index * 100 + number + 1, option_id: `option-${index}`, user_email: member.email })));
    const backend = { options, votes, writes: [], reads: [], failReads, failScrape, failWrites: false, writeDelay: 0, readDelay: 0 };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, email, role: 'authenticated', aud: 'authenticated', exp: expires })}.test-only-signature`;
    await page.addInitScript(session => {
        localStorage.setItem('sb-aucksurcmgkzuulpwuvu-auth-token', JSON.stringify(session));
    }, { access_token: token, refresh_token: 'test-only-refresh', expires_in: 3600, expires_at: expires, token_type: 'bearer', user });
    await page.routeWebSocket('**/realtime/v1/websocket*', () => {});
    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.hostname !== 'aucksurcmgkzuulpwuvu.supabase.co') return route.abort();
        const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (url.pathname.startsWith('/auth/v1/')) return json(user);
        if (url.pathname === '/functions/v1/scraper') {
            return backend.failScrape ? json({ error: 'test-only scraping failure' }, 502)
                : json({ title: 'Novi loft', image: '/anketar/hero-cover-image.webp', description: 'Novi prijedlog.' });
        }
        if (!url.pathname.startsWith('/rest/v1/')) return route.abort();
        const table = url.pathname.split('/').at(-1);
        if (request.method() === 'GET') {
            backend.reads.push(table);
            if (backend.readDelay) await new Promise(resolve => setTimeout(resolve, backend.readDelay));
            return backend.failReads ? json({ message: 'test-only unavailable' }, 503)
                : json(table === 'whitelist' ? members : backend[table]);
        }
        backend.writes.push({ table, method: request.method() });
        if (backend.writeDelay) await new Promise(resolve => setTimeout(resolve, backend.writeDelay));
        if (backend.failWrites) return json({ message: 'test-only rejected write' }, 403);
        const body = request.postDataJSON();
        if (table === 'options' && request.method() === 'PATCH') {
            const item = backend.options.find(option => option.id === url.searchParams.get('id')?.slice(3));
            Object.assign(item, body);
            return json([item]);
        }
        if (table === 'options' && request.method() === 'POST') {
            backend.options.push(...body);
            return json(null);
        }
        if (table === 'votes' && request.method() === 'DELETE') {
            backend.votes = backend.votes.filter(vote => !(vote.option_id === url.searchParams.get('option_id')?.slice(3) && vote.user_email === url.searchParams.get('user_email')?.slice(3)));
            return json(null);
        }
        if (table === 'votes' && request.method() === 'POST') {
            backend.votes.push({ id: 9999, ...body[0] });
            return json(null);
        }
        throw new Error(`Unexpected mocked operation: ${request.method()} ${table}`);
    });
    return backend;
}
