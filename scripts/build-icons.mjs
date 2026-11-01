import { readFile, writeFile, mkdir } from 'node:fs/promises';
import subsetFont from 'subset-font';

const mapping = JSON.parse(await readFile(new URL('../src/shared/material-icons.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../node_modules/@fontsource-variable/material-symbols-outlined/files/material-symbols-outlined-latin-fill-normal.woff2', import.meta.url));
const characters = Object.values(mapping).map(value => String.fromCodePoint(parseInt(value, 16))).join('');
const subset = await subsetFont(source, characters, {
    targetFormat: 'woff2',
    // Retain license and font-family names in the generated subset.
    preserveNameIds: [0, 1, 2, 3, 4, 5, 6, 13, 14]
});
if (subset.length > 32_000) throw new Error(`Icon subset unexpectedly exceeds 32 KB: ${subset.length} bytes`);
const output = new URL('../src/assets/fonts/material-symbols.woff2', import.meta.url);
await mkdir(new URL('../src/assets/fonts/', import.meta.url), { recursive: true });
const previous = await readFile(output).catch(() => null);
if (!previous?.equals(subset)) await writeFile(output, subset);
console.log(`Material Symbols: ${Object.keys(mapping).length} icons, ${(subset.length / 1024).toFixed(1)} KB (${(source.length / 1024).toFixed(0)} KB original).`);
