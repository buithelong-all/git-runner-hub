const asar = require('@electron/asar');
const path = require('path');
const fs = require('fs');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else if (exists) {
    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

async function build() {
  const root = path.resolve(__dirname, '..');
  const staging = path.resolve(root, 'dist', 'staging');
  const dest = path.resolve(root, 'dist', 'win-unpacked', 'resources', 'app.asar');

  if (fs.existsSync(staging)) {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  fs.mkdirSync(staging, { recursive: true });

  console.log('Copying files to staging...');
  copyRecursiveSync(path.join(root, 'src'), path.join(staging, 'src'));
  copyRecursiveSync(path.join(root, 'scripts'), path.join(staging, 'scripts'));
  copyRecursiveSync(path.join(root, 'templates'), path.join(staging, 'templates'));
  fs.copyFileSync(path.join(root, 'package.json'), path.join(staging, 'package.json'));

  console.log(`Packaging ${staging} -> ${dest}...`);
  await asar.createPackage(staging, dest);
  fs.rmSync(staging, { recursive: true, force: true });
  console.log('✅ app.asar packaged successfully!');
}

build().catch(err => {
  console.error('Build error:', err);
  process.exit(1);
});
