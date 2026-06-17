// Manual dev launcher — bypass electron-vite spawn issue
const { spawn } = require('child_process');
const path = require('path');

console.log('[Dev] Starting Vite dev server...');

// Start vite dev server for renderer
const vite = spawn(
  process.execPath,
  [path.join(__dirname, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'), 'dev', '--skipElectron'],
  { stdio: 'inherit', env: { ...process.env } }
);

// Wait 3 seconds for dev server to start
setTimeout(() => {
  console.log('\n[Dev] Launching Electron...\n');
  
  // Launch electron with dev server URL
  const electronBin = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
  const mainFile = path.join(__dirname, 'out', 'main', 'index.js');
  
  const electron = spawn(electronBin, [mainFile], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RENDERER_URL: 'http://localhost:5173' }
  });

  electron.on('exit', (code) => {
    console.log(`\n[Dev] Electron exited with code ${code}`);
    vite.kill();
    process.exit(code);
  });
}, 3000);

process.on('SIGINT', () => {
  vite.kill();
  process.exit();
});
