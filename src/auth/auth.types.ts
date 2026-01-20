import type { Request } from 'express';

export type AuthUser = {
  id: string;
  username: string;
  isAdmin: boolean;
};

export type AuthRequest = Request & {
  user: AuthUser;
  token: string;
};
