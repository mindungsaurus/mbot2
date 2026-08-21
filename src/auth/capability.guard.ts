import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserCapabilityType } from '@prisma/client';
import type { AuthRequest } from './auth.types';
import { REQUIRED_CAPABILITIES_KEY } from './capability.decorator';

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<UserCapabilityType[]>(
        REQUIRED_CAPABILITIES_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    if (required.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthRequest>();
    const granted = new Set(req.user?.capabilities ?? []);
    const ok = required.every((capability) => granted.has(capability));
    if (!ok) {
      throw new ForbiddenException('capability required');
    }
    return true;
  }
}
