// Entirely fictional data. Every Supabase request is intercepted before leaving the browser.
export function createPollBackend({ tied = false, failReads = false, failScrape = false, role = 'user', legacySchema = false } = {}) {
    const email = 'marko@example.test';
    const members = ['Marko Kovač', 'Ana Novak', 'Iva Horvat', 'Petar Kovač', 'Luka Marić', 'Ema Babić', 'Ivan Jurić', 'Sara Matić'].map((name, index) => ({ id: index + 1, email: index ? `user${index}@example.test` : email, name }));
    if (!legacySchema) members.forEach((member, index) => { member.role = index ? 'user' : role; });
    const titles = ['Loft u centru', 'Apartman Sol', 'Casa Madrid', 'Studio Retiro', 'Smještaj <b>Madrid</b> & "ekipa"'];
    const options = titles.map((title, index) => ({ id: `option-${index}`, title, price: String(420 - index * 20), image: '/anketar/hero-cover-image.webp', link: 'https://www.airbnb.com/rooms/test', created_by: members[index].email, note: 'Blizu centra i metroa.', description: 'Svijetao smještaj za zajedničko putovanje.' }));
    if (!legacySchema) options.forEach(option => { option.is_taken = false; });
    const votes = [8, tied ? 8 : 6, 4, 1].flatMap((count, index) => members.slice(0, count).map((member, number) => ({ id: index * 100 + number + 1, option_id: `option-${index}`, user_email: member.email })));
    return { options, votes, members, legacySchema, writes: [], reads: [], requests: [], failReads, failScrape, failWrites: false, writeDelay: 0, readDelay: 0, nextVoteId: 1000 };
}

export async function mockPoll(page, { googleName = 'Marko Kovač', backend = null, memberIndex = 0, realtimeHub = null, clientName = 'default', ...options } = {}) {
    backend ??= createPollBackend(options);
    const { members, legacySchema } = backend;
    const email = members[memberIndex].email;
    const user = { id: `00000000-0000-4000-8000-${String(memberIndex + 1).padStart(12, '0')}`, email, aud: 'authenticated', role: 'authenticated', user_metadata: { full_name: googleName } };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, email, role: 'authenticated', aud: 'authenticated', exp: expires })}.test-only-signature`;
    await page.addInitScript(session => {
        localStorage.setItem('sb-aucksurcmgkzuulpwuvu-auth-token', JSON.stringify(session));
    }, { access_token: token, refresh_token: 'test-only-refresh', expires_in: 3600, expires_at: expires, token_type: 'bearer', user });
    if (realtimeHub) await realtimeHub.attach(page, clientName);
    else await page.routeWebSocket('**/realtime/v1/websocket*', () => {});
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
        backend.requests.push({ email, table, method: request.method() });
        if (request.method() === 'GET') {
            backend.reads.push(table);
            if (backend.readDelay) await new Promise(resolve => setTimeout(resolve, backend.readDelay));
            const response = structuredClone(table === 'whitelist' ? members : backend[table]);
            await backend.beforeRead?.({ email, table });
            return backend.failReads ? json({ message: 'test-only unavailable' }, 503)
                : json(response);
        }
        backend.writes.push({ table, method: request.method() });
        if (backend.writeDelay) await new Promise(resolve => setTimeout(resolve, backend.writeDelay));
        if (backend.failWrites) return json({ message: 'test-only rejected write' }, 403);
        await backend.beforeWrite?.({ email, table, method: request.method() });
        const body = request.postDataJSON();
        if (table === 'options' && request.method() === 'PATCH') {
            const item = backend.options.find(option => option.id === url.searchParams.get('id')?.slice(3));
            if (members[memberIndex].role !== 'super_admin' && item.created_by !== email) return json({ message: 'not allowed' }, 403);
            if (legacySchema && Object.hasOwn(body, 'is_taken')) return json({ message: 'column is_taken does not exist' }, 400);
            const previous = structuredClone(item);
            Object.assign(item, body);
            backend.broadcast?.('options', 'UPDATE', item, previous);
            return json([item]);
        }
        if (table === 'options' && request.method() === 'POST') {
            const saved = body.map(item => legacySchema ? item : { ...item, is_taken: false });
            backend.options.push(...saved);
            saved.forEach(item => backend.broadcast?.('options', 'INSERT', item));
            return json(saved);
        }
        if (table === 'votes' && request.method() === 'DELETE') {
            const previous = [...backend.votes];
            backend.votes = backend.votes.filter(vote => !(vote.option_id === url.searchParams.get('option_id')?.slice(3) && vote.user_email === url.searchParams.get('user_email')?.slice(3)));
            previous.filter(vote => !backend.votes.includes(vote)).forEach(vote => backend.broadcast?.('votes', 'DELETE', {}, { id: vote.id }));
            return json(null);
        }
        if (table === 'votes' && request.method() === 'POST') {
            const vote = { id: backend.nextVoteId++, ...body[0] };
            if (!backend.votes.some(item => item.option_id === vote.option_id && item.user_email === vote.user_email)) {
                backend.votes.push(vote);
                backend.broadcast?.('votes', 'INSERT', vote);
            }
            return json(null);
        }
        throw new Error(`Unexpected mocked operation: ${request.method()} ${table}`);
    });
    return backend;
}
