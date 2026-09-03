import { prisma } from "../apps/api/src/prisma";

export async function provisionAgentTelemetry() {
  console.log("=== Provisioning agent_telemetry table in PostgreSQL ===");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS agent_telemetry (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      role VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'ONLINE',
      domain TEXT NOT NULL,
      port INTEGER,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      health VARCHAR(32) NOT NULL DEFAULT 'Passing',
      current_task TEXT NOT NULL,
      metrics JSONB,
      assigned_files JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log("agent_telemetry table created or verified.");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `);
  console.log("notifications table verified with updated_at.");

  // NOTE: The roster was previously 8 rows, with QA (agent-qa) and SRE (agent-sre)
  // seeded as two separate agents. They are now consolidated into a single
  // "QA & SRE Agent" row (id: agent-qa-sre) covering both verification/testing
  // and logging/health/diagnostics. Drop any legacy rows left over from a prior
  // run of this script so re-running it against an already-provisioned database
  // converges on the current 7-agent roster instead of leaving stale 8th/9th rows.
  await prisma.$executeRawUnsafe(
    `DELETE FROM agent_telemetry WHERE id IN ('agent-qa', 'agent-sre')`
  );

  const agents = [
    {
      id: "agent-orchestrator",
      name: "Orchestrator Agent",
      role: "SYSTEM_COORDINATOR",
      status: "ONLINE",
      domain: "Cross-System Workflow Coordination & Port Management (4001, 4444, 5432)",
      port: 4001,
      latencyMs: 1,
      health: "Passing",
      currentTask: "Supervising backend, frontend and persistence processes",
      metrics: { apiPort: 4001, posPort: 4444, dbPort: 5432, supervisor: "active" },
      assignedFiles: ["scripts/startup.ps1", "scripts/shutdown.ps1", "scripts/status.ts", "Start_KapMeta.bat"],
    },
    {
      id: "agent-a2a",
      name: "A2A Coordination Agent",
      role: "A2A_COORDINATOR",
      status: "ONLINE",
      domain: "Inter-Agent Protocol, State Sync & Admin Hub Telemetry",
      port: 4001,
      latencyMs: 2,
      health: "Passing",
      currentTask: "Routing inter-agent WebSocket topics and aggregating live telemetry",
      metrics: { activeAgents: 7, protocolVersion: "2.0", syncChannels: ["HTTP", "WS", "REGISTRY"] },
      assignedFiles: ["agents/a2a-agent.md", "agents/AGENT_REGISTRY.json", "agents/task-board.json", "apps/api/src/routes/admin.ts", "apps/pos-web/pages/admin.tsx"],
    },
    {
      id: "agent-frontend",
      name: "Frontend UI Agent",
      role: "UI_ENGINEER",
      status: "ONLINE",
      domain: "POS Web UI (Port 4444) & Admin Management Consoles",
      port: 4444,
      latencyMs: 3,
      health: "Passing",
      currentTask: "Serving KapMeta POS shell, touch billing, KDS board & executive admin",
      metrics: { posPort: 4444, bundleOptimized: true, touchSupport: true },
      assignedFiles: ["apps/pos-web/pages/*", "apps/pos-web/components/*", "apps/pos-web/lib/auth.ts"],
    },
    {
      id: "agent-backend",
      name: "Backend API Agent",
      role: "BACKEND_ENGINEER",
      status: "ONLINE",
      domain: "API Gateway (Port 4001), Services & Event Bus",
      port: 4001,
      latencyMs: 2,
      health: "Passing",
      currentTask: "Routing HTTP endpoints, JWT claim verification, and event subscriptions",
      metrics: { apiPort: 4001, activeRoutes: 18, jwtScoping: "outlet_id" },
      assignedFiles: ["apps/api/src/index.ts", "apps/api/src/routes/*", "services/*"],
    },
    {
      id: "agent-database",
      name: "Database Persistence Agent",
      role: "DBA_ENGINEER",
      status: "ONLINE",
      domain: "PostgreSQL (Port 5432) & Prisma Multi-Tenant Schema",
      port: 5432,
      latencyMs: 1,
      health: "Passing",
      currentTask: "Maintaining multi-tenant schema, seed tools, and backup parity",
      metrics: { dbPort: 5432, poolConnections: 10, minorUnitStandard: "BIGINT paise" },
      assignedFiles: ["kapmeta/schema.prisma", "scripts/db-migrate.js", "scripts/seed-dynamic-data.ts"],
    },
    {
      id: "agent-integration",
      name: "Integration Hub Agent",
      role: "INTEGRATION_ENGINEER",
      status: "ONLINE",
      domain: "Online Aggregators (Swiggy/Zomato), Payments & Thermal Printers",
      port: 4001,
      latencyMs: 4,
      health: "Passing",
      currentTask: "Handling HMAC webhooks, idempotent ingestion, and DLQ retries",
      metrics: { supportedChannels: ["SWIGGY", "ZOMATO"], webhookActive: true },
      assignedFiles: ["services/integration-hub/*", "services/integration/*"],
    },
    {
      id: "agent-qa-sre",
      name: "QA & SRE Agent",
      role: "QA_SRE_ENGINEER",
      status: "ONLINE",
      domain: "Verification & Testing (Unit/Contract/E2E) plus Logging, Process Monitoring & Diagnostics",
      port: 4001,
      latencyMs: 5,
      health: "Passing",
      currentTask: "Running vitest suites, type validation & pilot simulation drills while monitoring logs/ directory, service heartbeats and error traces",
      metrics: { testsPassing: 55, pilotDrills: "ENABLED", e2eValidation: true, logScanner: "active", healthChecksPassing: true },
      assignedFiles: ["tests/*", "scripts/pilot-e2e-simulation.ts", "vitest.config.ts", "logs/*", "scripts/status.ts"],
    },
  ];

  for (const agent of agents) {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO agent_telemetry (
        id, name, role, status, domain, port, latency_ms, health, current_task, metrics, assigned_files, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        domain = EXCLUDED.domain,
        port = EXCLUDED.port,
        latency_ms = EXCLUDED.latency_ms,
        health = EXCLUDED.health,
        current_task = EXCLUDED.current_task,
        metrics = EXCLUDED.metrics,
        assigned_files = EXCLUDED.assigned_files,
        updated_at = NOW();
      `,
      agent.id,
      agent.name,
      agent.role,
      agent.status,
      agent.domain,
      agent.port,
      agent.latencyMs,
      agent.health,
      agent.currentTask,
      JSON.stringify(agent.metrics),
      JSON.stringify(agent.assignedFiles)
    );
  }

  console.log(`Seeded ${agents.length} agents into agent_telemetry table.`);
  const count: any[] = await prisma.$queryRawUnsafe("SELECT count(*)::int as cnt FROM agent_telemetry");
  console.log("Total agents currently in database:", count[0]?.cnt);
}

if (require.main === module) {
  provisionAgentTelemetry()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to provision agent telemetry:", err);
      process.exit(1);
    });
}
