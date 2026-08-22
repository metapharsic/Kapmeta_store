import * as dotenv from 'dotenv';
import * as path from 'path';

// Ensure root .env is loaded
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'debug',
  ports: {
    posWeb: Number(process.env.POS_PORT || process.env.PORT || 4444),
    apiGateway: Number(process.env.API_PORT || 4001),
    adminWeb: Number(process.env.ADMIN_PORT || 4445),
    database: Number(process.env.DB_PORT || 5432),
    redis: Number(process.env.REDIS_PORT || 6379),
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://pos:pos@localhost:5432/petpooja',
    poolMax: Number(process.env.DATABASE_POOL_MAX || 20),
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_jwt_secret_key_minimum_32_characters_long',
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  },
  integrations: {
    swiggyBase: process.env.SWIGGY_API_BASE || 'https://api.swiggy.com',
    zomatoBase: process.env.ZOMATO_API_BASE || 'https://api.zomato.com',
    paymentGateway: process.env.PAYMENT_GATEWAY || 'razorpay',
  }
};
