import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthRequest } from './auth.types';

function parseBearer(header?: string): string | null {
  const value = (header ?? '').trim();
  if (!value) return null;
  const [scheme, token] = value.split(' ');
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token.trim();
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = parseBearer(req.headers?.authorization as string | undefined);
    if (!token) {
      throw new UnauthorizedException('인증 토큰이 필요합니다.');
    }

    const user = await this.auth.getUserByToken(token);
    if (!user) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    req.user = user;
    req.token = token;
    return true;
  }
}
