import { readFile, writeFile, mkdir } from 'node:fs/promises';
import subsetFont from 'subset-font';

// Prefer this small face for Croatian letters; Fontsource's other language
// faces remain available for names and accommodation text in other languages.
const source = await readFile(new URL('../node_modules/@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2', import.meta.url));
const subset = await subsetFont(source, 'ĆćČčĐđŠšŽž', {
    targetFormat: 'woff2',
    preserveNameIds: [0, 1, 2, 3, 4, 5, 6, 13, 14]
});
if (subset.length > 12_000) throw new Error(`Croatian font unexpectedly exceeds 12 KB: ${subset.length} bytes`);
const output = new URL('../src/assets/fonts/inter-croatian.woff2', import.meta.url);
await mkdir(new URL('../src/assets/fonts/', import.meta.url), { recursive: true });
const previous = await readFile(output).catch(() => null);
if (!previous?.equals(subset)) await writeFile(output, subset);
console.log(`Inter Croatian letters: ${(subset.length / 1024).toFixed(1)} KB (${(source.length / 1024).toFixed(0)} KB original).`);
