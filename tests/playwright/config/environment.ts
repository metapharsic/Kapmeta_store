/**
 * Environment & Runtime Configuration for Playwright Tests
 */
export interface EnvironmentConfig {
  baseUrl: string;
  apiUrl: string;
  wsUrl: string;
  dbUrl: string;
  timeoutMs: number;
  retries: number;
  headless: boolean;
  defaultOutletId: string;
}

const env = process.env.NODE_ENV || "test";

export const ENV_CONFIG: Record<string, EnvironmentConfig> = {
  local: {
    baseUrl: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    apiUrl: process.env.PLAYWRIGHT_API_URL || "http://localhost:4001",
    wsUrl: process.env.PLAYWRIGHT_WS_URL || "ws://localhost:4001/ws",
    dbUrl: process.env.DATABASE_URL || "postgresql://pos:pos@localhost:5432/kapmeta",
    timeoutMs: 30000,
    retries: 0,
    headless: process.env.CI ? true : false,
    defaultOutletId: process.env.DEFAULT_OUTLET_ID || "outlet_dev_01",
  },
  test: {
    baseUrl: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    apiUrl: process.env.PLAYWRIGHT_API_URL || "http://localhost:4001",
    wsUrl: process.env.PLAYWRIGHT_WS_URL || "ws://localhost:4001/ws",
    dbUrl: process.env.DATABASE_URL || "postgresql://pos:pos@localhost:5432/kapmeta",
    timeoutMs: 30000,
    retries: 1,
    headless: true,
    defaultOutletId: process.env.DEFAULT_OUTLET_ID || "outlet_test_01",
  },
  staging: {
    baseUrl: process.env.STAGING_BASE_URL || "https://staging-pos.kapmeta.com",
    apiUrl: process.env.STAGING_API_URL || "https://staging-api.kapmeta.com",
    wsUrl: process.env.STAGING_WS_URL || "wss://staging-api.kapmeta.com/ws",
    dbUrl: process.env.STAGING_DATABASE_URL || "",
    timeoutMs: 45000,
    retries: 2,
    headless: true,
    defaultOutletId: process.env.STAGING_OUTLET_ID || "outlet_staging_01",
  },
};

export const currentEnv: EnvironmentConfig = ENV_CONFIG[env] || ENV_CONFIG.local;
