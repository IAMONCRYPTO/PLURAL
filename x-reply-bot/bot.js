import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COOKIES_PATH = path.join(__dirname, 'cookies.json');
const TARGETS_PATH = path.join(__dirname, 'targets.txt');
const COMPLETED_PATH = path.join(__dirname, 'completed.txt');

// Custom Reply message with clean line breaks
const REPLY_MESSAGE = `AI models hallucinate. Single prompt answers are risky.

So I built Plural: 4 specialized AI agents debate each other on your prompt, reach consensus, and deliver one verified response.

No bias. No BS. Just the truth.

👉 http://plural-unity.netlify.app

#buildinpublic #SaaS`;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('🤖 X.com Reply Assistant Starting...');

  // 1. Load Cookies
  if (!fs.existsSync(COOKIES_PATH)) {
    console.error('❌ Error: cookies.json not found!');
    process.exit(1);
  }
  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));

  // 2. Load Targets
  if (!fs.existsSync(TARGETS_PATH)) {
    console.error('❌ Error: targets.txt not found!');
    process.exit(1);
  }
  const targetLines = fs.readFileSync(TARGETS_PATH, 'utf8').split('\n');
  const urls = targetLines
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  if (urls.length === 0) {
    console.log('⚠️ No target tweet URLs found in targets.txt. Add some links and try again!');
    process.exit(0);
  }

  console.log(`📋 Found ${urls.length} target URLs to process.`);

  // 3. Launch Puppeteer (Headed by default so user can watch the progress)
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 850 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Set User-Agent to prevent bot detection
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Set X.com domain cookies
  console.log('🔑 Injecting auth cookies...');
  await page.setCookie(...cookies);

  // Navigate to X.com to verify login session
  console.log('🌐 Opening X.com...');
  await page.goto('https://x.com', { waitUntil: 'domcontentloaded' });
  await delay(4000);

  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/i/flow/login')) {
    console.error('❌ Error: Cookie session expired! Please update cookies.json with new credentials.');
    await browser.close();
    process.exit(1);
  }
  console.log('✅ Session authenticated successfully.');

  const completedUrls = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`\n────────────────────────────────────────`);
    console.log(`[${i + 1}/${urls.length}] Processing: ${url}`);

    try {
      // Navigate to target tweet
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await delay(5000);

      // Look for reply textbox
      const textEditorSelector = 'div[role="textbox"], [data-testid="tweetTextarea_0"]';
      await page.waitForSelector(textEditorSelector, { timeout: 15000 });
      
      console.log('✍️ Found reply box. Clicking and typing...');
      await page.click(textEditorSelector);
      await delay(1000);

      // Type reply characters with natural human delay
      await page.type(textEditorSelector, REPLY_MESSAGE, { delay: 35 });
      await delay(1500);

      // Find and click the reply submit button
      const replyBtnSelector = '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]';
      await page.waitForSelector(replyBtnSelector, { timeout: 10000 });
      
      console.log('🚀 Sending reply...');
      await page.click(replyBtnSelector);
      await delay(5000); // Wait for tweet submission

      console.log('✅ Reply posted successfully!');
      completedUrls.push(url);

      // Write to completed log instantly
      fs.appendFileSync(COMPLETED_PATH, `${url} - ${new Date().toISOString()}\n`);

      // Cooldown delay to prevent spam flagging (random between 15-25 seconds)
      if (i < urls.length - 1) {
        const cooldown = Math.floor(Math.random() * 10000) + 15000;
        console.log(`⏳ Cooldown: Waiting for ${Math.round(cooldown / 1000)} seconds before next post...`);
        await delay(cooldown);
      }
    } catch (err) {
      console.error(`❌ Failed to reply to ${url}:`, err.message);
    }
  }

  // 4. Update targets.txt to remove completed links
  const remainingLines = targetLines.filter(line => {
    const trimmed = line.trim();
    return !completedUrls.includes(trimmed);
  });
  fs.writeFileSync(TARGETS_PATH, remainingLines.join('\n'));

  console.log('\n========================================');
  console.log(`🎉 Job finished! Processed ${completedUrls.length} links successfully.`);
  console.log('========================================');

  await browser.close();
}

run().catch(console.error);
