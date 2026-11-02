// In-memory Supabase/Phoenix server. Messages travel through the browser's real
// WebSocket and Supabase SDK; tests never call app subscription callbacks.
export function createRealtimeHub(backend) {
    const clients = new Map();
    const events = [];
    let duplicateEvents = false;
    let paused = false;
    const pending = [];

    function sendChange(connection, change) {
        const binding = connection.filters.find(filter => filter.table === change.table);
        if (!binding) return;
        const record = change.record;
        const columns = Object.entries({ ...change.old_record, ...record }).map(([name, value]) => ({
            name, type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? 'int8' : 'text'
        }));
        connection.socket.send(JSON.stringify([
            connection.joinRef, null, connection.topic, 'postgres_changes',
            { ids: [binding.id], data: { schema: 'public', commit_timestamp: new Date().toISOString(), errors: [], columns, ...change } }
        ]));
    }

    backend.broadcast = (table, type, record = {}, old_record = {}) => {
        const change = structuredClone({ table, type, record, old_record });
        events.push(change);
        const recipients = [];
        for (const client of clients.values()) {
            if (!client.online) continue;
            for (const connection of client.connections) {
                if (!connection.joined) continue;
                recipients.push({ client, connection });
            }
        }
        if (paused) pending.push({ change, recipients });
        else deliver(change, recipients);
    };

    function deliver(change, recipients) {
        for (const { client, connection } of recipients) {
            if (!client.online || !connection.joined || !client.connections.has(connection)) continue;
            sendChange(connection, change);
            if (duplicateEvents) sendChange(connection, change);
        }
    }

    return {
        clients, events,
        set duplicateEvents(value) { duplicateEvents = value; },
        pauseDelivery() { paused = true; },
        resumeDelivery() {
            paused = false;
            for (const { change, recipients } of pending.splice(0)) deliver(change, recipients);
        },
        async attach(page, name) {
            const client = { online: true, joins: 0, connections: new Set() };
            clients.set(name, client);
            await page.routeWebSocket('**/realtime/v1/websocket*', socket => {
                const connection = { socket, joined: false, filters: [] };
                client.connections.add(connection);
                socket.onClose(() => client.connections.delete(connection));
                if (!client.online) {
                    socket.close({ code: 1012, reason: 'test-only disconnect' });
                    return;
                }
                socket.onMessage(raw => {
                    const [joinRef, ref, topic, event, payload] = JSON.parse(String(raw));
                    const reply = response => socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]));
                    if (event === 'phx_join') {
                        connection.joinRef = joinRef;
                        connection.topic = topic;
                        connection.filters = payload.config.postgres_changes.map((filter, index) => ({ ...filter, id: index + 1 }));
                        connection.joined = true;
                        client.joins++;
                        reply({ postgres_changes: connection.filters });
                    } else if (event === 'phx_leave') {
                        connection.joined = false;
                        reply({});
                    } else if (event === 'heartbeat') reply({});
                });
            });
        },
        disconnect(name) {
            const client = clients.get(name);
            client.online = false;
            for (const connection of client.connections) {
                connection.joined = false;
                connection.socket.close({ code: 1012, reason: 'test-only disconnect' });
            }
        },
        reconnect(name) { clients.get(name).online = true; }
    };
}
