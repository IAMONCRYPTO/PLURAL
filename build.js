import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');

async function build() {
  console.log('Starting production build...');

  // 1. Clean previous dist folder
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  // 2. Run esbuild bundler
  console.log('Bundling client-side scripts...');
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'js', 'app.js')],
    bundle: true,
    minify: true,
    sourcemap: true,
    outfile: path.join(distDir, 'js', 'bundle.js'),
    format: 'esm', // keep as ES module to preserve dynamic imports
    platform: 'browser',
    target: ['es2020'],
  });

  // 3. Copy CSS
  console.log('Copying stylesheets...');
  fs.mkdirSync(path.join(distDir, 'css'), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, 'css', 'styles.css'),
    path.join(distDir, 'css', 'styles.css')
  );

  // 4. Copy Assets (if exists)
  const assetsSrc = path.join(__dirname, 'assets');
  const assetsDest = path.join(distDir, 'assets');
  
  function copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  if (fs.existsSync(assetsSrc)) {
    console.log('Copying assets recursively...');
    try {
      copyDirRecursive(assetsSrc, assetsDest);
    } catch (err) {
      console.warn('Failed to copy some assets:', err.message);
    }
  }

  // 5. Copy and process index.html
  console.log('Processing index.html...');
  let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  // Replace module app.js load with bundled js load
  html = html.replace(
    '<script type="module" src="js/app.js"></script>',
    '<script type="module" src="js/bundle.js"></script>'
  );
  fs.writeFileSync(path.join(distDir, 'index.html'), html);

  console.log('Build completed successfully! Files written to /dist');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
