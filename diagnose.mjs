import { chromium } from 'playwright';

async function diagnose() {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Capture all console logs and errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[BROWSER ERROR] ${msg.text()}`);
    } else {
      console.log(`[BROWSER LOG] ${msg.text()}`);
    }
  });

  page.on('pageerror', err => {
    console.log(`[PAGE CRASH ERROR]: ${err.stack || err.message}`);
  });

  // Inject local storage to bypass RoleGuard
  await page.addInitScript(() => {
    localStorage.setItem('hd_current_user', 'ing.jaime158@gmail.com');
    localStorage.setItem('hd_user_role', 'Administrador');
    localStorage.setItem('hd_user_name', 'Jaime Master');
    localStorage.setItem('hd_user_allowed_views', JSON.stringify([]));
  });

  try {
    console.log("Navigating directly to monitor page...");
    await page.goto('http://localhost:5173/#/monitor', { waitUntil: 'networkidle', timeout: 15000 });
    
    console.log("Page loaded. Waiting 5 seconds to capture any runtime crashes...");
    await page.waitForTimeout(5000);
    
  } catch (e) {
    console.error("Navigation or page wait failed:", e.message);
  } finally {
    await browser.close();
    console.log("Browser closed.");
  }
}

diagnose();
