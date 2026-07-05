import express from 'express';
import { config } from 'dotenv';
import { fileURLToPath, URL as NodeURL } from 'url';
import { dirname, join } from 'path';
import https from 'https';
import http from 'http';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const NIM_BASE = 'https://integrate.api.nvidia.com/v1';

// Custom CORS Middleware to allow requests from hosted Netlify domain
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-NVIDIA-API-KEY');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const serveDir = process.env.NODE_ENV === 'production' ? join(__dirname, 'dist') : __dirname;
console.log(`Serving static files from: ${serveDir}`);

app.use(express.static(serveDir, {
  setHeaders(res, path) {
    if (path.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
  }
}));

const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  keepAliveMsecs: 5000,
  freeSocketTimeout: 30000,
  timeout: 45000
});

function nvidiaApiCall(options) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: options.model,
      messages: options.messages,
      stream: options.stream,
      max_tokens: options.max_tokens,
      temperature: options.temperature
    });

    const reqOptions = {
      method: 'POST',
      hostname: 'integrate.api.nvidia.com',
      path: '/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Connection': 'keep-alive'
      },
      agent: keepAliveAgent,
      timeout: 45000 // 45 seconds timeout for high-latency connections
    };

    const req = https.request(reqOptions, (res) => {
      resolve(res);
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Connection to NVIDIA API timed out'));
    });

    req.write(postData);
    req.end();
  });
}

async function describeImage(imageBase64, apiKey) {
  try {
    const response = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        model: 'meta/llama-3.2-11b-vision-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image in detailed points, focusing on objects, text, colors, layout, and overall context.' },
              { type: 'image_url', image_url: { url: imageBase64 } }
            ]
          }
        ],
        max_tokens: 350,
        temperature: 0.2
      });

      const reqOptions = {
        method: 'POST',
        hostname: 'integrate.api.nvidia.com',
        path: '/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 45000
      };

      const req = https.request(reqOptions, (res) => {
        resolve(res);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Vision request timed out'));
      });

      req.write(postData);
      req.end();
    });

    const body = await new Promise((resolve) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve(data));
    });

    if (response.statusCode !== 200) {
      console.error('[Vision Model Error]:', response.statusCode, body);
      return '[Failed to analyze image due to API error]';
    }

    const parsed = JSON.parse(body);
    return parsed.choices?.[0]?.message?.content || '[No description returned]';
  } catch (err) {
    console.error('[Vision Connection Error]:', err.message);
    return `[Failed to connect to image analysis model: ${err.message}]`;
  }
}

app.post('/api/chat', async (req, res) => {
  const { model, messages, stream = true, max_tokens = 8192, temperature = 0.7, images } = req.body;
  const customApiKey = req.headers['x-nvidia-api-key'];
  const apiKey = customApiKey || process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: 'NVIDIA_API_KEY is not configured on the server, and no personal API Key was provided.' });
  }

  // Intercept images and describe them using VLM if target model is not a vision model
  let processedMessages = JSON.parse(JSON.stringify(messages)); // deep clone
  if (images && Array.isArray(images) && images.length > 0) {
    console.log(`[Vision Preprocessor]: Analyzing ${images.length} image(s) using meta/llama-3.2-11b-vision-instruct...`);
    const descriptions = [];
    for (let i = 0; i < images.length; i++) {
      const desc = await describeImage(images[i], apiKey);
      descriptions.push(`[Image ${i + 1} Description]:\n${desc}`);
    }
    
    // Append descriptions to the last user message
    const lastUserMsg = processedMessages.slice().reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      lastUserMsg.content += `\n\n[Visual Context: Attached Image(s) Description:\n${descriptions.join('\n---\n')}]`;
      console.log(`[Vision Preprocessor]: Successfully appended image descriptions to prompt.`);
    }
  }

  if (model.startsWith('z-ai/glm')) {
    processedMessages = [];
    let systemPromptContent = '';
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPromptContent += (systemPromptContent ? '\n' : '') + msg.content;
      } else {
        processedMessages.push({ ...msg });
      }
    }
    
    if (systemPromptContent) {
      const firstUserMsgIdx = processedMessages.findIndex(m => m.role === 'user');
      if (firstUserMsgIdx !== -1) {
        processedMessages[firstUserMsgIdx].content = `[INSTRUCTIONS]\n${systemPromptContent}\n\n[USER INPUT]\n${processedMessages[firstUserMsgIdx].content}`;
      } else {
        processedMessages.unshift({ role: 'user', content: systemPromptContent });
      }
    }
  }

  try {
    let response;
    const maxRetries = 4;
    let attempt = 0;
    let lastErrorText = '';

    while (attempt < maxRetries) {
      try {
        response = await nvidiaApiCall({
          model,
          messages: processedMessages,
          stream,
          max_tokens,
          temperature,
          apiKey
        });

        if (response.statusCode === 200) {
          break;
        }

        // Collect error body text
        lastErrorText = await new Promise((resolve) => {
          let body = '';
          response.on('data', chunk => body += chunk);
          response.on('end', () => resolve(body));
        });

        console.warn(`[NIM Attempt ${attempt + 1}/${maxRetries} failed for ${model}] Status: ${response.statusCode}. Error: ${lastErrorText}`);
        attempt++;

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (err) {
        lastErrorText = err.message;
        console.warn(`[NIM Attempt ${attempt + 1}/${maxRetries} failed for ${model}] Connection error: ${lastErrorText}`);
        attempt++;

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    if (!response || response.statusCode !== 200) {
      const finalStatus = response ? response.statusCode : 500;
      console.error(`NIM API permanently failed after ${maxRetries} retries for model ${model} (status ${finalStatus}):`, lastErrorText);
      return res.status(finalStatus).json({ error: lastErrorText });
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      response.on('data', (chunk) => {
        res.write(chunk);
      });

      response.on('end', () => {
        res.end();
      });

      response.on('error', (err) => {
        console.error('Streaming connection error:', err.message);
        res.end();
      });
    } else {
      let responseBody = '';
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        try {
          res.json(JSON.parse(responseBody));
        } catch (e) {
          res.status(500).json({ error: 'Failed to parse JSON response: ' + responseBody });
        }
      });
    }
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter q' });
  }

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.error('[Search Router Error]: status', response.status);
      return res.status(response.status).json({ error: 'Search failed' });
    }

    const html = await response.text();
    const results = [];
    
    const titleRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    let count = 0;
    
    while ((match = titleRegex.exec(html)) !== null && count < 5) {
      let rawUrl = match[1];
      const matchEndIndex = titleRegex.lastIndex;
      
      if (rawUrl.includes('uddg=')) {
        const split = rawUrl.split('uddg=');
        if (split[1]) {
          rawUrl = decodeURIComponent(split[1].split('&')[0]);
        }
      }
      if (rawUrl.startsWith('//')) {
        rawUrl = 'https:' + rawUrl;
      }
      
      const title = match[2].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
      
      const subHtml = html.slice(matchEndIndex, matchEndIndex + 2000);
      const snippetMatch = subHtml.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").trim() : '';
      
      results.push({
        title,
        url: rawUrl,
        snippet
      });
      count++;
    }

    res.json(results);
  } catch (err) {
    console.error('[Search Connection Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function cleanHtml(html) {
  let text = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
  text = text.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&#39;/g, "'");
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

async function robustFetchHtml(targetUrl) {
  const trimmedUrl = targetUrl.trim();
  let urlObj;
  try {
    urlObj = new NodeURL(trimmedUrl);
  } catch {
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      urlObj = new NodeURL('https://' + trimmedUrl);
    } else {
      throw new Error('Invalid URL');
    }
  }

  const finalUrl = urlObj.href;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1'
  };

  try {
    const response = await fetch(finalUrl, { headers, redirect: 'follow' });
    if (response.ok) {
      return await response.text();
    }
    console.warn(`Standard fetch got non-ok status ${response.status} for ${finalUrl}`);
  } catch (err) {
    console.warn(`Standard fetch failed for ${finalUrl}:`, err.message);
  }

  return new Promise((resolve, reject) => {
    let redirectCount = 0;
    
    function makeRequest(currentUrl) {
      try {
        const parsed = new NodeURL(currentUrl);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const options = {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'GET',
          headers,
          rejectUnauthorized: false,
          timeout: 10000
        };

        const req = client.request(options, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            redirectCount++;
            if (redirectCount > 5) {
              reject(new Error('Too many redirects'));
              return;
            }
            let redirectUrl = res.headers.location;
            if (!redirectUrl.startsWith('http')) {
              redirectUrl = new NodeURL(redirectUrl, currentUrl).href;
            }
            makeRequest(redirectUrl);
            return;
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Server returned status ${res.statusCode}`));
            return;
          }

          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve(data));
        });

        req.on('error', (err) => {
          if (isHttps && redirectCount === 0 && (err.code === 'ECONNRESET' || err.message.includes('ssl') || err.message.includes('tls'))) {
            console.warn(`HTTPS request failed, retrying on HTTP:`, err.message);
            const httpUrl = currentUrl.replace(/^https:/i, 'http:');
            makeRequest(httpUrl);
          } else {
            reject(err);
          }
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timed out'));
        });
        
        req.end();
      } catch (err) {
        reject(err);
      }
    }

    makeRequest(finalUrl);
  });
}

app.post('/api/extract-url', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  try {
    const html = await robustFetchHtml(url);
    const cleanText = cleanHtml(html);
    res.json({ text: cleanText });
  } catch (error) {
    console.error('URL extraction error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fetch-html', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  try {
    const html = await robustFetchHtml(url);

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'No title found';

    const metas = [];
    const metaRegex = /<meta\s+([^>]*?)>/gi;
    let match;
    while ((match = metaRegex.exec(html)) !== null) {
      const attributes = match[1];
      const nameMatch = attributes.match(/(?:name|property)\s*=\s*["']([^"']*)["']/i);
      const contentMatch = attributes.match(/content\s*=\s*["']([^"']*)["']/i);
      if (nameMatch && contentMatch) {
        metas.push({ name: nameMatch[1], content: contentMatch[1] });
      }
    }

    const scripts = [];
    const scriptRegex = /<script\s+([^>]*?)>/gi;
    while ((match = scriptRegex.exec(html)) !== null) {
      const srcMatch = match[1].match(/src\s*=\s*["']([^"']*)["']/i);
      if (srcMatch) {
        scripts.push(srcMatch[1]);
      } else {
        scripts.push('inline script');
      }
    }

    const imageAlts = [];
    const imgRegex = /<img\s+([^>]*?)>/gi;
    while ((match = imgRegex.exec(html)) !== null) {
      const altMatch = match[1].match(/alt\s*=\s*["']([^"']*)["']/i);
      const srcMatch = match[1].match(/src\s*=\s*["']([^"']*)["']/i);
      if (altMatch) {
        imageAlts.push({ src: srcMatch ? srcMatch[1] : 'unknown', alt: altMatch[1] });
      }
    }

    const formElements = [];
    const inputRegex = /<(input|button|select|textarea)\s+([^>]*?)>/gi;
    while ((match = inputRegex.exec(html)) !== null) {
      const tag = match[1];
      const attrs = match[2];
      const nameMatch = attrs.match(/name\s*=\s*["']([^"']*)["']/i);
      const typeMatch = attrs.match(/type\s*=\s*["']([^"']*)["']/i);
      formElements.push({
        tag,
        name: nameMatch ? nameMatch[1] : 'unnamed',
        type: typeMatch ? typeMatch[1] : (tag === 'input' ? 'text' : '')
      });
    }

    const links = [];
    const linkRegex = /<link\s+([^>]*?)>/gi;
    while ((match = linkRegex.exec(html)) !== null) {
      const relMatch = match[1].match(/rel\s*=\s*["']([^"']*)["']/i);
      const hrefMatch = match[1].match(/href\s*=\s*["']([^"']*)["']/i);
      if (relMatch && hrefMatch) {
        links.push({ rel: relMatch[1], href: hrefMatch[1] });
      }
    }

    const outline = [];
    const tagRegex = /<\/?(header|nav|main|section|article|aside|footer|form|h1|h2|h3)[^>]*>/gi;
    while ((match = tagRegex.exec(html)) !== null) {
      outline.push(match[0]);
    }

    let bodyText = '';
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      let bodyHtml = bodyMatch[1];
      bodyHtml = bodyHtml.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
      bodyHtml = bodyHtml.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '');
      bodyHtml = bodyHtml.replace(/<!--[\s\S]*?-->/g, '');
      bodyHtml = bodyHtml.replace(/<[^>]+>/g, ' ');
      bodyText = bodyHtml.replace(/\s+/g, ' ').trim();
    } else {
      let contentHtml = html;
      contentHtml = contentHtml.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
      contentHtml = contentHtml.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '');
      contentHtml = contentHtml.replace(/<!--[\s\S]*?-->/g, '');
      contentHtml = contentHtml.replace(/<[^>]+>/g, ' ');
      bodyText = contentHtml.replace(/\s+/g, ' ').trim();
    }

    const bodyWords = bodyText.split(/\s+/).slice(0, 2500).join(' ');

    res.json({
      title,
      metaTags: metas.slice(0, 20),
      scriptCount: scripts.length,
      scriptSources: scripts.slice(0, 10),
      imageAlts: imageAlts.slice(0, 15),
      formElements: formElements.slice(0, 20),
      linkRefs: links.slice(0, 15),
      htmlOutline: outline.slice(0, 50).join('\n'),
      visibleText: bodyWords
    });
  } catch (error) {
    console.error('Scraper API failed:', error.message);
    res.status(500).json({ error: `⚠️ Could not fetch URL. Check if site is public and try again.` });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  PLURAL server running at:`);
  console.log(`    Local:   http://localhost:${PORT}`);
  console.log(`    Network: http://0.0.0.0:${PORT}\n`);
});
