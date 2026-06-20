export interface EnvConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  API_PREFIX: string;
  WEB_ORIGIN: string;
  MONGO_URI: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
  ADMIN_NAME: string;
}

const required = [
  'MONGO_URI',
  'JWT_SECRET',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD'
] as const;

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  for (const key of required) {
    if (!raw[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  const jwtSecret = String(raw.JWT_SECRET);
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  return {
    NODE_ENV: (raw.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
    PORT: Number(raw.PORT || 4000),
    API_PREFIX: String(raw.API_PREFIX || 'api'),
    WEB_ORIGIN: String(raw.WEB_ORIGIN || 'http://localhost:3000'),
    MONGO_URI: String(raw.MONGO_URI),
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: String(raw.JWT_EXPIRES_IN || '8h'),
    ADMIN_EMAIL: String(raw.ADMIN_EMAIL).toLowerCase().trim(),
    ADMIN_PASSWORD: String(raw.ADMIN_PASSWORD),
    ADMIN_NAME: String(raw.ADMIN_NAME || 'GDE TORT Admin')
  };
}
