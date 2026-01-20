import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

type PublicUser = {
  id: string;
  username: string;
  isAdmin: boolean;
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  private normalizeUsername(raw: string): string {
    return (raw ?? '').trim().toLowerCase();
  }

  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async register(usernameRaw: string, passwordRaw: string): Promise<PublicUser> {
    const username = this.normalizeUsername(usernameRaw);
    const password = (passwordRaw ?? '').trim();

    if (!username || !password) {
      throw new BadRequestException('username/password가 필요합니다.');
    }

    const exists = await this.prisma.user.findUnique({
      where: { username },
    });
    if (exists) {
      throw new BadRequestException('이미 존재하는 사용자입니다.');
    }

    const salt = randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(password, salt);

    const user = await this.prisma.user.create({
      data: { username, passwordHash, passwordSalt: salt },
    });

    return { id: user.id, username: user.username, isAdmin: user.isAdmin };
  }

  async login(usernameRaw: string, passwordRaw: string): Promise<{
    token: string;
    user: PublicUser;
  }> {
    const username = this.normalizeUsername(usernameRaw);
    const password = (passwordRaw ?? '').trim();

    if (!username || !password) {
      throw new BadRequestException('username/password가 필요합니다.');
    }

    const user = await this.prisma.user.findUnique({
      where: { username },
    });
    if (!user) {
      throw new UnauthorizedException('로그인 정보가 올바르지 않습니다.');
    }

    const testHash = this.hashPassword(password, user.passwordSalt);
    const ok = timingSafeEqual(
      Buffer.from(testHash, 'hex'),
      Buffer.from(user.passwordHash, 'hex'),
    );
    if (!ok) {
      throw new UnauthorizedException('로그인 정보가 올바르지 않습니다.');
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);

    await this.prisma.userSession.create({
      data: {
        tokenHash,
        userId: user.id,
        lastSeenAt: new Date(),
      },
    });

    return {
      token,
      user: { id: user.id, username: user.username, isAdmin: user.isAdmin },
    };
  }

  async getUserByToken(token: string): Promise<PublicUser | null> {
    const raw = (token ?? '').trim();
    if (!raw) return null;

    const tokenHash = this.hashToken(raw);
    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) return null;

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      id: session.user.id,
      username: session.user.username,
      isAdmin: session.user.isAdmin,
    };
  }

  async claimAdmin(userId: string, keyRaw: string): Promise<PublicUser> {
    const adminKey = (process.env.ADMIN_KEY ?? '').trim();
    if (!adminKey) {
      throw new BadRequestException('ADMIN_KEY not set');
    }

    const key = (keyRaw ?? '').trim();
    if (!key) {
      throw new BadRequestException('admin key required');
    }

    if (key !== adminKey) {
      throw new UnauthorizedException('invalid admin key');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isAdmin: true },
    });

    return { id: user.id, username: user.username, isAdmin: user.isAdmin };
  }

  async logout(token: string): Promise<void> {
    const raw = (token ?? '').trim();
    if (!raw) return;

    const tokenHash = this.hashToken(raw);
    await this.prisma.userSession.deleteMany({ where: { tokenHash } });
  }
}
