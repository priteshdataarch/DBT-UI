import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      role: 'ADMIN' | 'EDITOR' | 'VIEWER';
      teamId: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: 'ADMIN' | 'EDITOR' | 'VIEWER';
    teamId?: string;
  }
}
