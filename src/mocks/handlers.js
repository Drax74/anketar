import { http, HttpResponse, ws } from 'msw';
import { backendUrl } from '../backend-config.js';
import { createMockSession } from './session.js';
import { readMockData, writeMockData, withMockWrite, currentMockMember, publishMockChange, onMockChange } from './store.js';

const api = backendUrl;
const realtime = ws.link(`${api.replace(/^http/, 'ws')}/realtime/v1/websocket*`);
const connections = new Set();

onMockChange(change => {
    for (const connection of connections) {
        const binding = connection.filters.find(filter => filter.table === change.table);
        if (!binding) continue;
        const columns = Object.entries({ ...change.old_record, ...change.record }).map(([name, value]) => ({
            name, type: typeof value === 'boolean' ? 'bool' : 'text'
        }));
        connection.client.send(JSON.stringify([
            connection.joinRef, null, connection.topic, 'postgres_changes',
            { ids: [binding.id], data: { schema: 'public', commit_timestamp: new Date().toISOString(), errors: [], columns, ...change } }
        ]));
    }
});

const socketHandler = realtime.addEventListener('connection', ({ client }) => {
    const connection = { client, filters: [] };
    connections.add(connection);
    client.addEventListener('close', () => connections.delete(connection));
    client.addEventListener('message', event => {
        const [joinRef, ref, topic, type, payload] = JSON.parse(String(event.data));
        const reply = response => client.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]));
        if (type === 'phx_join') {
            connection.joinRef = joinRef;
            connection.topic = topic;
            connection.filters = payload.config.postgres_changes.map((filter, index) => ({ ...filter, id: index + 1 }));
            reply({ postgres_changes: connection.filters });
        } else if (type === 'heartbeat') reply({});
        else if (type === 'phx_leave') { connections.delete(connection); reply({}); }
    });
});

const error = (message, status = 400) => HttpResponse.json({ message }, { status });
const equalFilter = (url, field) => url.searchParams.get(field)?.replace(/^eq\./, '');

export const handlers = [
    socketHandler,
    http.all(`${api}/auth/v1/*`, ({ request }) => {
        const path = new URL(request.url).pathname;
        if (path.endsWith('/logout')) return new HttpResponse(null, { status: 204 });
        return HttpResponse.json(path.endsWith('/token') ? createMockSession() : createMockSession().user);
    }),
    http.post(`${api}/functions/v1/scraper`, async ({ request }) => {
        const { url } = await request.json();
        // Never fetch the submitted URL. "manual" exercises the fallback form.
        if (String(url).includes('manual')) return error('Mock scraper unavailable', 502);
        return HttpResponse.json({ title: 'Novi probni smještaj', image: '/anketar/hero-cover-image.webp', description: 'Izmišljeni prijedlog dodan u lokalnom mock načinu.' });
    }),
    http.all(`${api}/rest/v1/:table`, async ({ request, params }) => {
        const table = String(params.table);
        const url = new URL(request.url);
        const member = currentMockMember();
        if (request.method === 'GET') {
            const data = readMockData();
            if (table === 'whitelist') return HttpResponse.json(data.members);
            if (table === 'options' || table === 'votes') return HttpResponse.json(data[table]);
            return error('Unknown mock table', 404);
        }
        const body = request.method === 'DELETE' ? null : await request.json();
        return withMockWrite(data => {
            if (table === 'options' && request.method === 'POST') {
                const rows = body;
                if (!Array.isArray(rows) || rows.some(row => row.created_by !== member.email)) return error('Creator must be the current mock member', 403);
                const saved = rows.map(row => ({ ...row, is_taken: false }));
                data.options.push(...saved);
                writeMockData(data);
                saved.forEach(row => publishMockChange('options', 'INSERT', row));
                return HttpResponse.json(saved, { status: 201 });
            }
            if (table === 'options' && request.method === 'PATCH') {
                const option = data.options.find(option => String(option.id) === equalFilter(url, 'id'));
                if (!option) return error('Mock accommodation not found', 404);
                if (member.role !== 'super_admin' && option.created_by !== member.email) return error('Not allowed', 403);
                const previous = { ...option };
                for (const field of ['title', 'price', 'image', 'note', 'is_taken']) {
                    if (Object.hasOwn(body, field)) option[field] = body[field];
                }
                writeMockData(data);
                publishMockChange('options', 'UPDATE', option, previous);
                return HttpResponse.json([option]);
            }
            if (table === 'votes' && request.method === 'POST') {
                const [payload] = body;
                if (payload.user_email !== member.email) return error('Vote must belong to current mock member', 403);
                if (!data.votes.some(vote => vote.option_id === payload.option_id && vote.user_email === member.email)) {
                    const vote = { ...payload, id: crypto.randomUUID() };
                    data.votes.push(vote);
                    writeMockData(data);
                    publishMockChange('votes', 'INSERT', vote);
                }
                return new HttpResponse(null, { status: 201 });
            }
            if (table === 'votes' && request.method === 'DELETE') {
                if (equalFilter(url, 'user_email') !== member.email) return error('Not allowed', 403);
                const vote = data.votes.find(vote => vote.option_id === equalFilter(url, 'option_id') && vote.user_email === member.email);
                if (vote) {
                    data.votes = data.votes.filter(item => item.id !== vote.id);
                    writeMockData(data);
                    publishMockChange('votes', 'DELETE', {}, { id: vote.id });
                }
                return new HttpResponse(null, { status: 204 });
            }
            return error('Unsupported mock operation', 405);
        });
    })
];
