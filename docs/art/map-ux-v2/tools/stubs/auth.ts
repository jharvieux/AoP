export function useAuth() {
  return {
    state: {
      status: 'authenticated' as const,
      session: {
        accessToken: 'fixture',
        refreshToken: 'fixture',
        expiresAt: Number.MAX_SAFE_INTEGER,
        user: { id: 'user-0', email: 'anne@example.test' },
      },
    },
  }
}
