// waiter_flow_demo.js
// Run with: node scripts/waiter_flow_demo.js
// Requires puppeteer (npm i puppeteer)
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();
  const screenshotDir = path.resolve(__dirname, '..', 'artifacts');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir);

  // 1. Open login page
  await page.goto('http://localhost:4444/login', {waitUntil: 'networkidle2'});
  await page.screenshot({path: path.join(screenshotDir, '01_login_page.png')});

  // 2. Fill credentials and login
  await page.type('#email', 'admin@hotelkapila.com');
  await page.type('#password', 'password123');
  await page.type('#outletId', '11111111-1111-1111-1111-111111111111');
  await page.click('button.submit-btn');
  await page.waitForNavigation({waitUntil: 'networkidle2'});
  await page.screenshot({path: path.join(screenshotDir, '02_after_login.png')});

  // 3. Navigate to waiter dashboard
  await page.goto('http://localhost:4444/waiter', {waitUntil: 'networkidle2'});
  await page.waitForSelector('.floor-map', {timeout: 5000});
  await page.screenshot({path: path.join(screenshotDir, '03_waiter_dashboard.png')});

  // 4. Click + New Order on table T-01 (assume button has data-table-id="T-01")
  await page.waitForSelector('[data-table-id="T-01"] .new-order-btn');
  await page.click('[data-table-id="T-01"] .new-order-btn');
  await page.waitForSelector('.order-panel', {timeout: 5000});
  await page.screenshot({path: path.join(screenshotDir, '04_order_panel_open.png')});

  // 5. Add first menu item (assume list item with text "Hotel Kapila Special Chicken Biryani")
  const itemSelector = 'div.menu-item:contains("Hotel Kapila Special Chicken Biryani")';
  // puppeteer doesn't support :contains, use xpath
  const [item] = await page.$x("//div[contains(., 'Hotel Kapila Special Chicken Biryani')]");
  if (item) {
    await item.click();
  }
  await page.screenshot({path: path.join(screenshotDir, '05_item_added.png')});

  // 6. Send to Kitchen (KOT)
  await page.click('button.send-to-kitchen');
  await page.waitForTimeout(2000); // wait for backend
  await page.screenshot({path: path.join(screenshotDir, '06_sent_to_kitchen.png')});

  // 7. Verify table status changed to occupied (red)
  const status = await page.$eval('[data-table-id="T-01"]', el => el.getAttribute('data-status'));
  console.log('Table T-01 status:', status);
  await page.screenshot({path: path.join(screenshotDir, '07_table_occupied.png')});

  await browser.close();
})();
