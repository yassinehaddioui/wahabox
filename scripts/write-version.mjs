import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
const date = new Date().toISOString()

writeFileSync(
  new URL('../version.json', import.meta.url),
  JSON.stringify({ sha, date }, null, 2) + '\n',
)
