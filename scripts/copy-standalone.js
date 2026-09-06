const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  console.log('[Build Hook] Copying static assets to standalone directory...');
  const rootDir = path.resolve(__dirname, '..');
  
  const staticSrc = path.join(rootDir, '.next', 'static');
  const staticDest = path.join(rootDir, '.next', 'standalone', '.next', 'static');
  copyDir(staticSrc, staticDest);

  const publicSrc = path.join(rootDir, 'public');
  const publicDest = path.join(rootDir, '.next', 'standalone', 'public');
  copyDir(publicSrc, publicDest);

  console.log('✅ [Build Hook] Successfully copied static assets & public folder to .next/standalone!');
} catch (err) {
  console.error('❌ [Build Hook] Error copying standalone assets:', err);
}
