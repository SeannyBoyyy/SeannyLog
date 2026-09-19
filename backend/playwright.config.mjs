import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./e2e', workers:1, timeout:30000, fullyParallel:false,
  use:{baseURL:'http://localhost:8080/seannylog/', headless:true,
    channel:process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'chrome' : undefined),
    viewport:{width:390, height:844}, timezoneId:'Asia/Manila'},
  webServer:{command:'node test/serve.mjs', url:'http://localhost:8080/seannylog/', reuseExistingServer:false}
});
