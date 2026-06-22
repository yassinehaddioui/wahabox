import { execSync } from 'child_process'
import { test } from '@playwright/test'

test.beforeEach(() => {
  try {
    execSync(
      'redis-cli EVAL \'for _,k in ipairs(redis.call("KEYS","rl:*")) do redis.call("DEL",k) end\' 0',
      { timeout: 3000 },
    )
  } catch {
    // Redis cleanup is best-effort
  }
})
