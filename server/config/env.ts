import dotenv from 'dotenv';

dotenv.config();

export const serverEnv = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3000),
  publicOrigin: process.env.PUBLIC_ORIGIN || '',
  dbHost: process.env.DB_HOST || '127.0.0.1',
  dbPort: Number(process.env.DB_PORT || 3306),
  dbName: process.env.DB_NAME || 'aman',
  dbUser: process.env.DB_USER || 'aman_app',
  dbPassword: process.env.DB_PASSWORD || '',
  sessionSecret: process.env.SESSION_SECRET || '',
};
