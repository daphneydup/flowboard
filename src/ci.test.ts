import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')
const workflow = read('.github/workflows/ci.yml')
const vercel = JSON.parse(read('vercel.json'))
const pkg = JSON.parse(read('package.json'))

describe('the pipeline runs the tests automatically', () => {
  it('has an npm test script that runs once and exits', () => {
    expect(pkg.scripts.test).toBe('vitest run')
    expect(pkg.scripts.ci).toContain('npm test')
  })

  it('runs lint, tests and build in GitHub Actions on pushes to main and on pull requests', () => {
    expect(workflow).toMatch(/^on:\s*\n\s+push:\s*\n\s+branches:\s*\[main\]\s*\n\s+pull_request:/m)
    for (const step of ['npm ci', 'npm run lint', 'npm test', 'npm run build']) expect(workflow).toContain(`run: ${step}`)
    expect(workflow.indexOf('npm test')).toBeLessThan(workflow.indexOf('npm run build'))
  })

  it('gives the workflow read-only access and no real secrets', () => {
    expect(workflow).toMatch(/permissions:\s*\n\s+contents: read/)
    expect(workflow).not.toContain('secrets.')
    expect(workflow).toContain('example.supabase.co')
    expect(workflow).not.toMatch(/[a-z]{20}\.supabase\.co/) // no real project reference
  })

  it('blocks Vercel builds, including CLI deploys, when a test fails', () => {
    expect(vercel.buildCommand).toMatch(/^npm test && /)
    expect(vercel.buildCommand).toContain('npm run build')
  })
})
