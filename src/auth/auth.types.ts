import type { Request } from 'express';
import type { UserCapabilityType } from '@prisma/client';

export type AuthUser = {
  id: string;
  username: string;
  isAdmin: boolean;
  capabilities: UserCapabilityType[];
};

export type AuthRequest = Request & {
  user: AuthUser;
  token: string;
};
