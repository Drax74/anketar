// Await interception before importing any module that creates a backend client.
// Vite removes this branch and its dynamic import from production builds.
if (import.meta.env.DEV && import.meta.env.MODE === 'mock') {
    const { startMocks } = await import('./mocks/browser.js');
    await startMocks();
}
await import('./main.js');
