import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      apiKey: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    apiKey: string
  }
}
