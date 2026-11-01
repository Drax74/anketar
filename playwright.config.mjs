import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 30_000,
    expect: { timeout: 10_000 },
    fullyParallel: false,
    workers: 1,
    use: {
        baseURL: 'http://127.0.0.1:4174/anketar/',
        viewport: { width: 390, height: 844 },
        trace: 'retain-on-failure',
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
            : {}
    },
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort',
        url: 'http://127.0.0.1:4174/anketar/',
        reuseExistingServer: !process.env.CI
    }
});
