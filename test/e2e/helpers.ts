import { execSync } from 'child_process'

export function clearRateLimits() {
  try {
    const before = execSync('redis-cli KEYS "rl:*" 2>&1', { timeout: 3000, encoding: 'utf8' }).toString().trim()
    execSync("redis-cli EVAL 'for _,k in ipairs(redis.call(\"KEYS\",\"rl:*\")) do redis.call(\"DEL\",k) end' 0", { timeout: 3000 })
    const after = execSync('redis-cli KEYS "rl:*" 2>&1', { timeout: 3000, encoding: 'utf8' }).toString().trim()
    process.stderr.write(`[rl-cleanup] before: "${before}" after: "${after}"\n`)
  } catch (e) {
    process.stderr.write(`[rl-cleanup] FAILED: ${e}\n`)
  }
}
