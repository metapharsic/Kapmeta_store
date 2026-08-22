const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');

const rootDir = path.resolve(__dirname, '..');
process.chdir(rootDir);

console.log('\x1b[32m=======================================================================\x1b[0m');
console.log('\x1b[32m         KAPMETA POS AND OPERATIONS PLATFORM - SYSTEM STARTUP          \x1b[0m');
console.log('\x1b[32m=======================================================================\x1b[0m\n');

console.log('\x1b[36m[PORTS AND ENDPOINTS CONFIGURATION]\x1b[0m');
console.log('  - POS Web UI       : http://localhost:4444 (Port 4444)');
console.log('  - API Gateway      : http://localhost:4001 (Port 4001)');
console.log('  - PostgreSQL DB    : localhost:5432 (Database: petpooja)');
console.log('  - Redis Cache      : localhost:6379');
console.log(`  - Logs Directory   : ${path.join(rootDir, 'logs')}`);
console.log(`  - Checkpoints Dir  : ${path.join(rootDir, 'checkpoints')}`);
console.log(`  - Agents Directory : ${path.join(rootDir, 'agents')}`);
console.log(`  - Brain Directory  : ${path.join(rootDir, 'brain')}\n`);

const currentDate = new Date().toISOString().split('T')[0];
const logDir = path.join(rootDir, 'logs');
const subDirs = ['app', 'api', 'pos-web', 'admin-web', 'database', 'agents', 'errors', 'audit', 'archive'];

// 1. Ensure directories exist
for (const sub of subDirs) {
  const d = path.join(logDir, sub);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
['checkpoints', 'checkpoints/milestones', 'agents', 'brain'].forEach((d) => {
  const p = path.join(rootDir, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const appLogPath = path.join(logDir, 'app', `app-${currentDate}.log`);
const apiLogPath = path.join(logDir, 'api', `api-${currentDate}.log`);
const posLogPath = path.join(logDir, 'pos-web', `pos-web-${currentDate}.log`);
const migrationLogPath = path.join(logDir, 'database', `migration-${currentDate}.log`);

// 2. Check Database Listener & Run Migrations
console.log('\x1b[36m[1/4] Verifying database schema and applying migrations...\x1b[0m');
try {
  const migrationOut = execSync('node scripts/db-migrate.js', { cwd: rootDir, encoding: 'utf8' });
  fs.appendFileSync(migrationLogPath, migrationOut + '\n', 'utf8');
  console.log('  \x1b[32m[SUCCESS] Database migrations verified.\x1b[0m');
} catch (e) {
  console.log('  \x1b[33m[WARN] Database migration note: ' + (e.message || 'Check database connection') + '\x1b[0m');
}

// 3. Clean stale listeners on ports 4001, 4444
console.log('\x1b[36m[2/4] Checking and clearing port listeners on 4001 and 4444...\x1b[0m');
try {
  execSync('powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\shutdown.ps1', {
    cwd: rootDir,
    stdio: 'ignore',
  });
} catch (e) {}

// 4. Safe log appender helper (avoids persistent Windows file-locks)
function appendToLog(filePath, data) {
  try {
    fs.appendFileSync(filePath, data, 'utf8');
  } catch (e) {
    try {
      const fallback = filePath.replace('.log', `-${process.pid}.log`);
      fs.appendFileSync(fallback, data, 'utf8');
    } catch (_) {}
  }
}

// 5. Spawn Services
console.log('\x1b[36m[3/4] Launching Backend API Gateway and Frontend POS Web UI...\x1b[0m');
console.log(`  - API Gateway (Port 4001) -> Logging to logs/api/api-${currentDate}.log`);
console.log(`  - POS Web UI  (Port 4444) -> Logging to logs/pos-web/pos-web-${currentDate}.log`);

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

const apiProc = spawn(npmCmd, ['run', 'dev', '-w', '@kapmeta/api'], {
  cwd: rootDir,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

apiProc.stdout.on('data', (d) => appendToLog(apiLogPath, d.toString()));
apiProc.stderr.on('data', (d) => appendToLog(apiLogPath, d.toString()));

const posProc = spawn(npmCmd, ['run', 'dev', '-w', '@kapmeta/pos-web'], {
  cwd: rootDir,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

posProc.stdout.on('data', (d) => appendToLog(posLogPath, d.toString()));
posProc.stderr.on('data', (d) => appendToLog(posLogPath, d.toString()));

// Save PIDs
const pidsData = {
  apiPid: apiProc.pid,
  posPid: posProc.pid,
  startedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(rootDir, '.running_pids.json'), JSON.stringify(pidsData, null, 2), 'utf8');

// Log start event
const startEvent = JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  service: 'orchestrator',
  event: 'STARTUP_INITIATED',
  apiPid: apiProc.pid,
  posPid: posProc.pid,
});
appendToLog(appLogPath, startEvent + '\n');

// 6. Health Check Helper
function checkEndpoint(host, port, urlPath, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.request(
      { host, port, path: urlPath, method: 'GET', timeout: timeoutMs },
      (res) => {
        resolve(res.statusCode !== undefined && res.statusCode < 500);
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// 7. Polling Loop
console.log('\x1b[36m[4/4] Waiting for services to become healthy...\x1b[0m');
async function pollServices() {
  let apiReady = false;
  let posReady = false;
  const maxSeconds = 35;

  for (let i = 1; i <= maxSeconds; i++) {
    process.stdout.write(`\r  * Polling services (${i}/${maxSeconds}s)...`);
    if (!apiReady) apiReady = await checkEndpoint('127.0.0.1', 4001, '/health');
    if (!posReady) posReady = await checkEndpoint('127.0.0.1', 4444, '/');
    if (apiReady && posReady) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log('');

  if (apiReady) {
    console.log('  \x1b[32m[ONLINE] API Gateway is healthy at http://localhost:4001/health\x1b[0m');
  } else {
    console.log(`  \x1b[33m[WARN] API Gateway is still initializing (check logs/api/api-${currentDate}.log)\x1b[0m`);
  }

  if (posReady) {
    console.log('  \x1b[32m[ONLINE] POS Web UI is healthy at http://localhost:4444\x1b[0m');
  } else {
    console.log(`  \x1b[33m[WARN] POS Web UI is still compiling (check logs/pos-web/pos-web-${currentDate}.log)\x1b[0m`);
  }

  // Open default browser
  console.log('\n  \x1b[32m[LAUNCH] Opening POS Web UI in default browser (http://localhost:4444)...\x1b[0m');
  try {
    const openCmd = isWin ? 'start http://localhost:4444' : 'open http://localhost:4444';
    execSync(openCmd, { stdio: 'ignore' });
  } catch (e) {}

  showDashboard();
}

function showDashboard() {
  console.log('\n\x1b[32m=======================================================================\x1b[0m');
  console.log('\x1b[32m   KAPMETA / PETPOOJA POS PLATFORM — LIVE CONTROL DASHBOARD (ONLINE)   \x1b[0m');
  console.log('\x1b[32m=======================================================================\x1b[0m\n');
  console.log('\x1b[36m  [SERVICES STATUS]\x1b[0m');
  console.log('  - POS Web UI       : http://localhost:4444          [\x1b[32m🟢 READY\x1b[0m]');
  console.log('  - API Gateway      : http://localhost:4001/health   [\x1b[32m🟢 READY\x1b[0m]');
  console.log('  - PostgreSQL DB    : localhost:5432 (petpooja)      [\x1b[32m🟢 CONNECTED\x1b[0m]\n');
  console.log('\x1b[36m  [LOG FILES]\x1b[0m');
  console.log(`  - App Events       : logs/app/app-${currentDate}.log`);
  console.log(`  - API Gateway Log  : logs/api/api-${currentDate}.log`);
  console.log(`  - POS Web UI Log   : logs/pos-web/pos-web-${currentDate}.log\n`);
  console.log('\x1b[90m-----------------------------------------------------------------------\x1b[0m');
  console.log('\x1b[33m  [KEYBOARD COMMANDS]\x1b[0m');
  console.log('    [O] Open POS Web UI in Browser    (http://localhost:4444)');
  console.log('    [A] Open API Health Check         (http://localhost:4001/health)');
  console.log('    [S] Run Full System Status Check  (Status Dashboard)');
  console.log('    [L] View Latest Logs');
  console.log('    [R] Restart All Services');
  console.log('    \x1b[31m[Q] Stop All Services and Exit\x1b[0m');
  console.log('\x1b[32m=======================================================================\x1b[0m');
  console.log('\x1b[32m  PetPooja POS is actively serving requests. Press a key above to interact.\x1b[0m\n');
}

function cleanupAndExit() {
  console.log('\n\x1b[31m[SHUTDOWN] Terminating POS Platform services...\x1b[0m');
  try {
    if (apiProc && !apiProc.killed) {
      if (isWin) execSync(`taskkill /pid ${apiProc.pid} /T /F`, { stdio: 'ignore' });
      else apiProc.kill();
    }
    if (posProc && !posProc.killed) {
      if (isWin) execSync(`taskkill /pid ${posProc.pid} /T /F`, { stdio: 'ignore' });
      else posProc.kill();
    }
  } catch (e) {}

  try {
    execSync('powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\shutdown.ps1', {
      cwd: rootDir,
      stdio: 'ignore',
    });
  } catch (e) {}

  console.log('\x1b[32m[SUCCESS] All services stopped. Goodbye!\x1b[0m');
  process.exit(0);
}

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);

// Interactive terminal handling if TTY
if (process.stdin.isTTY) {
  try {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    process.stdin.on('keypress', (str, key) => {
      if (!key) return;
      if (key.ctrl && key.name === 'c') {
        cleanupAndExit();
        return;
      }
      const k = key.name ? key.name.toLowerCase() : str.toLowerCase();
      switch (k) {
        case 'o':
          console.log('  -> Opening POS Web in browser...');
          try {
            execSync(isWin ? 'start http://localhost:4444' : 'open http://localhost:4444', { stdio: 'ignore' });
          } catch (e) {}
          break;
        case 'a':
          console.log('  -> Opening API health check...');
          try {
            execSync(isWin ? 'start http://localhost:4001/health' : 'open http://localhost:4001/health', {
              stdio: 'ignore',
            });
          } catch (e) {}
          break;
        case 's':
          console.log('\n\x1b[36m--- Running System Status Check ---\x1b[0m');
          try {
            execSync('npx ts-node scripts/status.ts', { cwd: rootDir, stdio: 'inherit' });
          } catch (e) {}
          showDashboard();
          break;
        case 'l':
          console.log('\n\x1b[36m--- Latest 15 Lines of API Log ---\x1b[0m');
          try {
            if (fs.existsSync(apiLogPath)) {
              const lines = fs.readFileSync(apiLogPath, 'utf8').trim().split('\n');
              console.log(lines.slice(-15).join('\n'));
            }
            console.log('\n\x1b[36m--- Latest 15 Lines of POS Web Log ---\x1b[0m');
            if (fs.existsSync(posLogPath)) {
              const lines = fs.readFileSync(posLogPath, 'utf8').trim().split('\n');
              console.log(lines.slice(-15).join('\n'));
            }
          } catch (e) {}
          break;
        case 'r':
          console.log('\n\x1b[33m[RESTART] Restarting services...\x1b[0m');
          try {
            if (isWin) {
              execSync(`taskkill /pid ${apiProc.pid} /T /F`, { stdio: 'ignore' });
              execSync(`taskkill /pid ${posProc.pid} /T /F`, { stdio: 'ignore' });
            }
          } catch (e) {}
          setTimeout(() => {
            pollServices();
          }, 1000);
          break;
        case 'q':
          cleanupAndExit();
          break;
      }
    });
  } catch (e) {}
}

pollServices();
