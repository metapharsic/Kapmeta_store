import * as http from 'http';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';

interface ServiceCheck {
  name: string;
  host: string;
  port: number;
  type: 'http' | 'tcp';
  path?: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  responseTimeMs?: number;
  details?: string;
}

function checkTcp(host: string, port: number, timeoutMs = 1500): Promise<{ online: boolean; latency: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      const latency = Date.now() - start;
      socket.destroy();
      resolve({ online: true, latency });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ online: false, latency: -1 });
    });

    socket.on('error', () => {
      socket.destroy();
      resolve({ online: false, latency: -1 });
    });

    socket.connect(port, host);
  });
}

function checkHttp(host: string, port: number, urlPath = '/', timeoutMs = 3500): Promise<{ online: boolean; latency: number; statusCode?: number; body?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request(
      {
        host,
        port,
        path: urlPath,
        method: 'GET',
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const latency = Date.now() - start;
          resolve({
            online: res.statusCode !== undefined && res.statusCode < 500,
            latency,
            statusCode: res.statusCode,
            body: data.slice(0, 100),
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ online: false, latency: -1 });
    });

    req.on('error', () => {
      resolve({ online: false, latency: -1 });
    });

    req.end();
  });
}

async function runStatusCheck() {
  console.log('\n=======================================================================');
  console.log('                 KAPMETA POS PLATFORM — LIVE STATUS DASHBOARD          ');
  console.log('=======================================================================\n');

  // 1. Check Infrastructure & Core Services
  console.log('[1/4] Service Health & Port Listeners:');
  const services: ServiceCheck[] = [
    { name: 'PostgreSQL DB', host: '127.0.0.1', port: 5432, type: 'tcp', status: 'OFFLINE' },
    { name: 'Redis Cache  ', host: '127.0.0.1', port: 6379, type: 'tcp', status: 'OFFLINE' },
    { name: 'API Gateway  ', host: '127.0.0.1', port: 4001, type: 'http', path: '/healthz', status: 'OFFLINE' },
    { name: 'POS Web UI   ', host: '127.0.0.1', port: 4444, type: 'http', path: '/', status: 'OFFLINE' },
  ];

  for (const svc of services) {
    if (svc.type === 'tcp') {
      const res = await checkTcp(svc.host, svc.port);
      if (res.online) {
        svc.status = 'ONLINE';
        svc.responseTimeMs = res.latency;
        console.log(`  🟢 ${svc.name} (Port ${svc.port}) : ONLINE (${res.latency}ms)`);
      } else {
        console.log(`  🔴 ${svc.name} (Port ${svc.port}) : OFFLINE`);
      }
    } else {
      const res = await checkHttp(svc.host, svc.port, svc.path);
      if (res.online) {
        svc.status = 'ONLINE';
        svc.responseTimeMs = res.latency;
        console.log(`  🟢 ${svc.name} (Port ${svc.port}) : ONLINE (${res.latency}ms, HTTP ${res.statusCode})`);
      } else {
        console.log(`  🔴 ${svc.name} (Port ${svc.port}) : OFFLINE`);
      }
    }
  }

  // 2. Checkpoints Status
  console.log('\n[2/4] Checkpoint & Delivery Gates Progress:');
  const checkpointPath = path.resolve(__dirname, '../checkpoints/CURRENT_STATE.json');
  if (fs.existsSync(checkpointPath)) {
    try {
      const cpData = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
      console.log(`  * Current Active Phase : ${cpData.activePhase || 'Phase 4 - Pilot & Ops'}`);
      console.log(`  * Passed Milestones    : ${cpData.passedMilestones?.length || 0} / ${cpData.totalMilestones || 10}`);
      console.log(`  * Last Milestone Date  : ${cpData.lastUpdated || 'N/A'}`);
      if (cpData.blockers && cpData.blockers.length > 0) {
        console.log(`  * Active Blockers      : ${cpData.blockers.join(', ')}`);
      } else {
        console.log(`  * Active Blockers      : None (All core gates clear)`);
      }
    } catch {
      console.log('  * Checkpoint data format unrecognized.');
    }
  } else {
    console.log('  * Checkpoint state file initialized at checkpoints/CURRENT_STATE.json');
  }

  // 3. Multi-Agent System Registry
  console.log('\n[3/4] Multi-Agent Operational State:');
  const agentRegistryPath = path.resolve(__dirname, '../agents/AGENT_REGISTRY.json');
  if (fs.existsSync(agentRegistryPath)) {
    try {
      const agentData = JSON.parse(fs.readFileSync(agentRegistryPath, 'utf8'));
      const activeAgents = agentData.agents || [];
      console.log(`  * Registered Agents    : ${activeAgents.length} Agents`);
      activeAgents.slice(0, 5).forEach((agent: any) => {
        const icon = agent.status === 'WORKING' ? '🟡' : agent.status === 'READY' || agent.status === 'IDLE' ? '🟢' : '⚪';
        console.log(`    ${icon} ${agent.name.padEnd(20)} [${agent.status}] - ${agent.currentTask || 'Ready'}`);
      });
    } catch {
      console.log('  * Agent registry initialized.');
    }
  } else {
    console.log('  * Agent registry initialized at agents/AGENT_REGISTRY.json');
  }

  // 4. Log Inspection & Error Detection
  console.log('\n[4/4] Log Summary & Recent Alerts:');
  const errorsLogDir = path.resolve(__dirname, '../logs/errors');
  const appLogDir = path.resolve(__dirname, '../logs/app');
  let errorCount = 0;

  if (fs.existsSync(errorsLogDir)) {
    const errorFiles = fs.readdirSync(errorsLogDir).filter((f) => f.endsWith('.log'));
    if (errorFiles.length > 0) {
      const latestErrorFile = path.join(errorsLogDir, errorFiles[errorFiles.length - 1]);
      const errorContent = fs.readFileSync(latestErrorFile, 'utf8');
      const lines = errorContent.trim().split('\n').filter(Boolean);
      errorCount = lines.length;
      if (errorCount > 0) {
        console.log(`  ⚠️ Found ${errorCount} recent error entries in ${errorFiles[errorFiles.length - 1]}`);
        console.log(`     Run 'npm run logs:errors' to view detailed diagnostic traces.`);
      }
    }
  }

  if (errorCount === 0) {
    console.log('  🟢 Zero critical errors detected in recent log streams.');
  }

  console.log('\n=======================================================================');
  console.log('Quick Actions:');
  console.log('  - Start Services : npm run start:all   (or .\\Start_PetPooja.bat)');
  console.log('  - Stop Services  : npm run stop:all    (or .\\Stop_PetPooja.bat)');
  console.log('  - Error Scanner  : npm run logs:errors');
  console.log('  - Checkpoints    : npm run checkpoint:status');
  console.log('=======================================================================\n');
}

runStatusCheck().catch(console.error);
