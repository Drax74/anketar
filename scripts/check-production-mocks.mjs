import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(process.argv[2] || 'dist');
let files = 0;
async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await inspect(path);
        else {
            if (/mockServiceWorker|mock-tools|mocks?[-.]/i.test(entry.name)) throw new Error(`Mock asset in production: ${path}`);
            if (!/\.(js|css|html|json|webmanifest)$/.test(entry.name)) continue;
            const text = await readFile(path, 'utf8');
            for (const marker of ['anketar-mock-data-v1', 'anketar-mock-changes-v1', 'mock-only-signature', 'Fictional local data', '.mock-tools', 'Unsupported mock operation', 'mockServiceWorker.js', 'member32@example.test']) {
                if (text.includes(marker)) throw new Error(`Mock marker ${marker} in production: ${path}`);
            }
            files++;
        }
    }
}
await inspect(root);
if (!files) throw new Error('No production files inspected');
console.log(`Verified ${files} production files: mock worker, handlers and fixture data are excluded.`);
