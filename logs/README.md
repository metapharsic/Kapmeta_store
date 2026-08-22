# PetPooja POS Platform — Unified Logging Architecture

**Owner:** SRE & Multi-Agent Operations  
**Format Standard:** Structured JSON Lines (`.log`) and UTF-8 Plain Text Streams with ISO 8601 Timestamps  

---

## 1. Directory Structure

```
logs/
├── api/            # API Gateway & Backend Service logs (port 4001)
│   └── api-YYYY-MM-DD.log
├── pos-web/        # POS Web UI & Frontend Next.js logs (port 4444)
│   └── pos-web-YYYY-MM-DD.log
├── admin-web/      # Admin Web Portal logs (port 4445)
│   └── admin-web-YYYY-MM-DD.log
├── app/            # Application orchestrator & lifecycle events
│   └── app-YYYY-MM-DD.log
├── database/       # Database migrations, connections & pool logs
│   ├── migration-YYYY-MM-DD.log
│   └── query-YYYY-MM-DD.log
├── agents/         # Multi-agent coordination, tasks & handoff logs
│   ├── orchestrator-YYYY-MM-DD.log
│   └── agent-execution-YYYY-MM-DD.log
├── errors/         # Aggregated error logs & stack traces
│   └── errors-YYYY-MM-DD.log
├── audit/          # Immutable privileged mutation audit logs
│   └── audit-YYYY-MM-DD.log
└── archive/        # Rotated historical logs (>30 days)
```

---

## 2. Automatic Log Appending Standard

- All frontend, backend, database, and agent processes append stdout and stderr streams continuously to their respective date-stamped log files (`YYYY-MM-DD.log`).
- Logs are NEVER truncated or overwritten by startup/shutdown events; they append automatically (`>>` / `Tee-Object -Append`).
- Each log entry contains ISO 8601 UTC timestamps, service identifiers, correlation IDs (`X-Correlation-Id`), log level (`DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`), and contextual payloads.

---

## 3. Automated Error Scanner

To inspect, scan, and parse errors across all logs for debugging:

```bash
# Run the real-time log error scanner
npm run logs:errors

# Or run via PowerShell
powershell -File .\scripts\error-scanner.ps1
```

The error reader extracts error messages, unhandled rejections, HTTP 5xx responses, and stack traces with precise line numbers and provides diagnostic guidance for multi-agent reasoning.
