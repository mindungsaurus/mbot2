import type { Request } from 'express';

export type AuthUser = {
  id: string;
  username: string;
};

export type AuthRequest = Request & {
  user: AuthUser;
  token: string;
};
