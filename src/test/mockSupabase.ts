import { vi } from 'vitest'

// A stand-in for the Supabase client. Tests import this instead of the real one,
// so nothing can ever talk to the live project.
export const authMock = {
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}

export const fromMock = vi.fn()

export const supabase = { auth: authMock, from: fromMock }

export function resetSupabaseMock() {
  for (const fn of Object.values(authMock)) fn.mockReset()
  authMock.getSession.mockResolvedValue({ data: { session: null } })
  authMock.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  for (const name of ['signInWithPassword', 'signUp', 'resend', 'resetPasswordForEmail', 'updateUser', 'signOut'] as const) {
    authMock[name].mockResolvedValue({ data: { session: null }, error: null })
  }
  fromMock.mockReset()
  fromMock.mockImplementation((table: string) => {
    throw new Error(`Unmocked supabase.from('${table}') call in a test`)
  })
}

// Build the chainable query object the real client returns. Every chained method
// returns the same builder; awaiting it yields `result`.
export function queryBuilder(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'maybeSingle']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null, ...result }).then(resolve, reject)
  return builder as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<unknown>
}
