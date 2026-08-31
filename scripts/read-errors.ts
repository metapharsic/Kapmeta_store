import * as fs from 'fs';
import * as path from 'path';

interface LogError {
  service: string;
  filePath: string;
  lineNumber: number;
  timestamp: string;
  level: string;
  message: string;
  rawLine: string;
  stack?: string;
  suggestedAction?: string;
}

const LOGS_DIR = path.resolve(__dirname, '../logs');

function scanDirectory(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory() && item.name !== 'archive') {
      scanDirectory(fullPath, fileList);
    } else if (item.isFile() && item.name.endsWith('.log')) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

function parseLogFile(filePath: string): LogError[] {
  const relativePath = path.relative(LOGS_DIR, filePath);
  const serviceName = relativePath.split(path.sep)[0] || 'general';
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const detectedErrors: LogError[] = [];

  const errorPatterns = [
    /\b(error|fatal|exception|unhandledRejection|uncaughtException|panic|fail|failed)\b/i,
    /HTTP\/1\.[01]\s+5\d\d/,
    /PrismaClientKnownRequestError|PrismaClientValidationError/,
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/,
    /TS\d{4}:/
  ];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Check if line matches JSON Lines structure
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        const isErrorLevel = parsed.level && (parsed.level.toLowerCase() === 'error' || parsed.level.toLowerCase() === 'fatal');
        const hasErrorMessage = parsed.message && errorPatterns.some((p) => p.test(parsed.message));

        if (isErrorLevel || hasErrorMessage) {
          detectedErrors.push({
            service: parsed.service || serviceName,
            filePath: relativePath,
            lineNumber: index + 1,
            timestamp: parsed.timestamp || new Date().toISOString(),
            level: (parsed.level || 'ERROR').toUpperCase(),
            message: parsed.message || parsed.error || trimmed,
            rawLine: trimmed,
            stack: parsed.stack,
            suggestedAction: getSuggestedRemediation(parsed.message || parsed.error || ''),
          });
        }
        return;
      } catch {
        // Fall through to plain text parsing
      }
    }

    // Check plain text lines
    const isError = errorPatterns.some((p) => p.test(trimmed));
    if (isError && !trimmed.includes('[INFO]') && !trimmed.includes('[SUCCESS]') && !trimmed.includes('"level":"info"')) {
      detectedErrors.push({
        service: serviceName,
        filePath: relativePath,
        lineNumber: index + 1,
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: trimmed,
        rawLine: trimmed,
        suggestedAction: getSuggestedRemediation(trimmed),
      });
    }
  });

  return detectedErrors;
}

function getSuggestedRemediation(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('econnrefused 127.0.0.1:5432') || lower.includes('postgresql')) {
    return 'Database connection failed. Ensure local PostgreSQL service is running on port 5432.';
  }
  if (lower.includes('econnrefused 127.0.0.1:6379') || lower.includes('redis')) {
    return 'Redis connection failed. Start Redis on port 6379 or verify REDIS_URL in .env.';
  }
  if (lower.includes('port 4001') || lower.includes('port 4444') || lower.includes('eaddrinuse')) {
    return 'Port conflict detected. Run "npm run stop:all" (or Stop_PetPooja.bat) to release occupied ports.';
  }
  if (lower.includes('prismaclientknownrequesterror') || lower.includes('migration')) {
    return 'Database schema discrepancy. Run "npm run db:migrate" to update PostgreSQL tables.';
  }
  if (lower.includes('jwt') || lower.includes('unauthorized')) {
    return 'Authentication signature error. Verify JWT_SECRET is synchronized in .env.';
  }
  return 'Review service logs in logs/' + (message.slice(0, 30)) + ' and consult brain/MULTI_AGENT_RESOLVER.md.';
}

export function runErrorScanner(): { totalScanned: number; errorCount: number; errors: LogError[] } {
  console.log('\n=======================================================================');
  console.log('                 KAPMETA POS — AUTOMATED LOG & ERROR SCANNER           ');
  console.log('=======================================================================\n');

  if (!fs.existsSync(LOGS_DIR)) {
    console.log('Logs directory not found. No logs to scan.');
    return { totalScanned: 0, errorCount: 0, errors: [] };
  }

  const logFiles = scanDirectory(LOGS_DIR);
  console.log(`Scanning ${logFiles.length} log files across logs/...`);

  const allErrors: LogError[] = [];
  for (const file of logFiles) {
    const errs = parseLogFile(file);
    allErrors.push(...errs);
  }

  if (allErrors.length === 0) {
    console.log('\n  🟢 Clean bill of health! Zero unhandled errors found in active logs.\n');
  } else {
    console.log(`\n  ⚠️  Found ${allErrors.length} error entries across services:\n`);

    // Group by Service
    const grouped = allErrors.reduce((acc, err) => {
      acc[err.service] = acc[err.service] || [];
      acc[err.service].push(err);
      return acc;
    }, {} as Record<string, LogError[]>);

    for (const [svc, errList] of Object.entries(grouped)) {
      console.log(`┌── [Service: ${svc.toUpperCase()}] (${errList.length} errors)`);
      errList.slice(0, 5).forEach((e) => {
        console.log(`│ [${e.timestamp}] [${e.filePath}:${e.lineNumber}]`);
        console.log(`│   Message: ${e.message.slice(0, 120)}`);
        if (e.suggestedAction) {
          console.log(`│   -> Recommended Fix: ${e.suggestedAction}`);
        }
      });
      if (errList.length > 5) {
        console.log(`│   ... and ${errList.length - 5} more entries.`);
      }
      console.log('└───');
    }

    // Write aggregated error report to logs/errors/errors-YYYY-MM-DD.log
    const errorsDir = path.join(LOGS_DIR, 'errors');
    if (!fs.existsSync(errorsDir)) fs.mkdirSync(errorsDir, { recursive: true });
    const today = new Date().toISOString().split('T')[0];
    const reportPath = path.join(errorsDir, `errors-${today}.log`);

    const logEntries = allErrors.map((e) => JSON.stringify(e)).join('\n');
    fs.writeFileSync(reportPath, logEntries, 'utf8');
    console.log(`\nAggregated error report written to: logs/errors/errors-${today}.log`);
  }

  console.log('=======================================================================\n');
  return { totalScanned: logFiles.length, errorCount: allErrors.length, errors: allErrors };
}

if (require.main === module) {
  runErrorScanner();
}
