/**
 * Centralized Test Execution Logger for Playwright
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  STEP = 4,
}

class TestLogger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel) {
    this.level = level;
  }

  private formatMessage(prefix: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString().substring(11, 19);
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] ${prefix} ${message}${metaStr}`;
  }

  step(stepName: string, detail?: string) {
    console.log(`\x1b[36m${this.formatMessage("▶ STEP:", stepName, detail ? { detail } : undefined)}\x1b[0m`);
  }

  info(message: string, meta?: any) {
    if (this.level <= LogLevel.INFO) {
      console.log(`\x1b[32m${this.formatMessage("ℹ INFO:", message, meta)}\x1b[0m`);
    }
  }

  warn(message: string, meta?: any) {
    if (this.level <= LogLevel.WARN) {
      console.warn(`\x1b[33m${this.formatMessage("⚠ WARN:", message, meta)}\x1b[0m`);
    }
  }

  error(message: string, error?: any) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`\x1b[31m${this.formatMessage("✖ ERROR:", message, error)}\x1b[0m`);
    }
  }

  debug(message: string, meta?: any) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`\x1b[90m${this.formatMessage("⚙ DEBUG:", message, meta)}\x1b[0m`);
    }
  }
}

export const logger = new TestLogger();
