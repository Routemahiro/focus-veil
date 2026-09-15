const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const koffiVersion = require('../node_modules/koffi/package.json').version;
const packageName = `@koromix/koffi-win32-x64`;
const destDirectory = path.join(__dirname, '..', 'node_modules', '@koromix', 'koffi-win32-x64');

function alreadyPrepared() {
  return fs.existsSync(path.join(destDirectory, 'package.json'));
}

function prepareWin32Koffi() {
  if (alreadyPrepared()) {
    return;
  }

  const workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'focus-veil-koffi-'));
  try {
    const packed = execFileSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['pack', `${packageName}@${koffiVersion}`, '--pack-destination', workDirectory],
      { encoding: 'utf8' }
    )
      .trim()
      .split(/\r?\n/)
      .pop();

    const tarball = path.join(workDirectory, packed);
    const extractRoot = path.join(workDirectory, 'extract');
    fs.mkdirSync(extractRoot, { recursive: true });
    execFileSync('tar', ['-xzf', tarball, '-C', extractRoot]);

    const extractedPackage = path.join(extractRoot, 'package');
    fs.mkdirSync(path.dirname(destDirectory), { recursive: true });
    fs.rmSync(destDirectory, { recursive: true, force: true });
    fs.cpSync(extractedPackage, destDirectory, { recursive: true });
  } finally {
    fs.rmSync(workDirectory, { recursive: true, force: true });
  }
}

module.exports = async function prepareWinKoffi(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  prepareWin32Koffi();
};

if (require.main === module) {
  prepareWin32Koffi();
}
