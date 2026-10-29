import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Tests run from the project root (npm test), so resolve files from there.
const path = (rel: string) => resolve(process.cwd(), rel)
const read = (rel: string) => readFileSync(path(rel), 'utf8')

// --- the database rules (from the versioned migration; tests never touch the real database) ---
const migrationFile = readdirSync(path('supabase/migrations')).find((f) => f.includes('team_allowlist'))
const sql = read(`supabase/migrations/${migrationFile}`)
const policies = [...sql.matchAll(/create policy "([^"]+)"\s+on public\.(\w+) for (\w+) to (\w+)([^;]*);/gi)].map((m) => ({
  name: m[1],
  table: m[2],
  command: m[3].toLowerCase(),
  role: m[4].toLowerCase(),
  body: m[0],
}))

describe('row-level security migration', () => {
  it('exists', () => {
    expect(migrationFile).toBeDefined()
  })

  it('turns row-level security on and forces it for every table it creates', () => {
    const created = [...sql.matchAll(/create table public\.(\w+)/gi)].map((m) => m[1])
    expect(created).toContain('team_members')
    for (const table of created) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} force row level security`, 'i'))
    }
  })

  it('forces row-level security on the cards table too', () => {
    expect(sql).toMatch(/alter table public\.cards force row level security/i)
  })

  it('only ever grants access to signed-in users, never anonymous or public', () => {
    expect(policies.length).toBeGreaterThanOrEqual(5)
    for (const p of policies) expect(p.role, p.name).toBe('authenticated')
  })

  it('has no policy that lets everyone in', () => {
    expect(sql).not.toMatch(/\b(using|with check)\s*\(\s*true\s*\)/i)
  })

  it('covers read, add, edit and delete on cards, and read-only on team_members', () => {
    const on = (table: string) => policies.filter((p) => p.table === table).map((p) => p.command).sort()
    expect(on('cards')).toEqual(['delete', 'insert', 'select', 'update'])
    expect(on('team_members')).toEqual(['select']) // nobody can edit the allowlist through the API
  })

  it('requires team membership for every card operation', () => {
    for (const p of policies.filter((p) => p.table === 'cards')) {
      expect(p.body, p.name).toMatch(/public\.team_members/)
      expect(p.body, p.name).toMatch(/auth\.uid\(\)/)
    }
  })

  it('ties new cards to the signed-in user so ownership cannot be forged', () => {
    const insert = policies.find((p) => p.table === 'cards' && p.command === 'insert')!
    expect(insert.body).toMatch(/created_by\s*=\s*\(select auth\.uid\(\)\)/i)
  })

  it('lets people delete only their own cards', () => {
    const del = policies.find((p) => p.table === 'cards' && p.command === 'delete')!
    expect(del.body).toMatch(/created_by\s*=\s*\(select auth\.uid\(\)\)/i)
  })

  it('shows people only their own membership row', () => {
    const own = policies.find((p) => p.table === 'team_members')!
    expect(own.body).toMatch(/user_id\s*=\s*\(select auth\.uid\(\)\)/i)
  })

  it('keys the allowlist on the user id, which cannot be claimed by signing up with someone else’s email', () => {
    expect(sql).toMatch(/user_id\s+uuid primary key references auth\.users\s*\(id\) on delete cascade/i)
    expect(sql).not.toMatch(/auth\.jwt\(\)/i) // no trusting the email claim
  })

  it('stops an edit from changing who owns a card', () => {
    expect(sql).toMatch(/new\.created_by\s*:=\s*old\.created_by/i)
    expect(sql).toMatch(/create trigger cards_protect_columns\s+before update on public\.cards/i)
  })

  it('writes every function with a fixed search_path and no public access', () => {
    for (const fn of sql.matchAll(/create function [^$]*?\$\$/gi)) expect(fn[0]).toMatch(/set search_path\s*=\s*''/i)
    expect(sql).toMatch(/revoke all on function public\.cards_protect_columns\(\) from public, anon, authenticated/i)
    expect(sql).not.toMatch(/security definer/i)
  })

  it('takes table permissions away from anonymous users and dangerous ones from everyone else', () => {
    expect(sql).toMatch(/revoke all on public\.cards from public, anon/i)
    expect(sql).toMatch(/revoke truncate, references, trigger on public\.cards from authenticated/i)
    expect(sql).toMatch(/revoke all on public\.team_members from public, anon, authenticated/i)
    expect([...sql.matchAll(/grant\s+(\w+)\s+on\s+public\.(\w+)/gi)].map((m) => `${m[1]} ${m[2]}`)).toEqual(['select team_members'])
  })

  it('limits field lengths in the database, matching the form', () => {
    expect(sql).toMatch(/char_length\(title\)\s*<=\s*100/)
    expect(sql).toMatch(/char_length\(assignee\)\s*<=\s*60/)
  })
})

// --- the front end must not leak or misuse secrets ---
const sourceFiles = (readdirSync(path('src'), { recursive: true }) as string[]).filter(
  (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.|^test[\\/]/.test(f),
)

describe('front-end secrets', () => {
  it('never mentions the service-role key', () => {
    const needle = 'service' + '_role'
    for (const f of sourceFiles) expect(read(`src/${f}`).toLowerCase(), f).not.toContain(needle)
  })

  it('reads only the public (publishable) key', () => {
    const client = read('src/supabase.ts')
    expect(client).toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
    expect(client).not.toMatch(/SECRET|SERVICE/i)
  })

  it('never lets the browser choose who owns a card', () => {
    expect(read('src/api.ts')).not.toMatch(/\.(insert|update)\(\{[^}]*created_by/s)
  })

  // The Vercel CLI doesn't upload .gitignore, so this repository check only runs where the file exists (local, CI).
  it.skipIf(!existsSync(path('.gitignore')))('keeps local env files out of git', () => {
    expect(read('.gitignore')).toMatch(/^\*\.local$/m)
  })

  it('only documents public variables in .env.example', () => {
    const names = [...read('.env.example').matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1])
    expect(names.length).toBeGreaterThan(0)
    for (const n of names) expect(n).toMatch(/^VITE_/)
    expect(read('.env.example')).not.toMatch(/service|secret/i)
  })

  it('does not render user text as HTML', () => {
    for (const f of sourceFiles) expect(read(`src/${f}`), f).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(/)
  })
})
