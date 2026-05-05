import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

export default {
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        const { authorizeCredentials } = await import('@/lib/authCredentials');
        return authorizeCredentials(
          credentials?.email as string | undefined,
          credentials?.password as string | undefined
        );
      },
    }),
  ],
} satisfies NextAuthConfig;
