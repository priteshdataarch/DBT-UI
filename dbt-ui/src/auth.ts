import NextAuth from 'next-auth';
import authConfig from '@/auth.config';

if (!process.env.AUTH_SECRET && process.env.NODE_ENV !== 'production') {
  process.env.AUTH_SECRET = 'dev-only-insecure-secret-change-for-production';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 14 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { id: string; role: string; teamId: string };
        token.id = u.id;
        token.role = u.role as 'ADMIN' | 'EDITOR' | 'VIEWER';
        token.teamId = u.teamId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = String(token.id ?? token.sub);
        const r = token.role;
        session.user.role =
          r === 'ADMIN' || r === 'EDITOR' || r === 'VIEWER' ? r : 'VIEWER';
        session.user.teamId = String(token.teamId ?? '');
      }
      return session;
    },
  },
});
