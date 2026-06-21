const ENV = {
  get DATABASE_URL() {
    return process.env.DATABASE_URL!
  },
  get SERVER_MASTER_SECRET() {
    return process.env.SERVER_MASTER_SECRET!
  },
  get REDIS_URL() {
    return process.env.REDIS_URL ?? 'redis://localhost:6379'
  },
  get SESSION_SECRET() {
    return process.env.SESSION_SECRET ?? 'dev-session-secret-change-in-production'
  },
  get APP_URL() {
    return process.env.APP_URL ?? 'http://localhost:3000'
  },
}

export function validateEnv(): void {
  const required = ['DATABASE_URL', 'SERVER_MASTER_SECRET'] as const
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`)
    }
  }
}

export default ENV
