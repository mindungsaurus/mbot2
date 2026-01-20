import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import type { AuthRequest } from './auth.types';

type AuthBody = {
  username?: string;
  password?: string;
};

type AdminKeyBody = {
  key?: string;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() body: AuthBody) {
    return this.auth.register(body?.username ?? '', body?.password ?? '');
  }

  @Post('login')
  async login(@Body() body: AuthBody) {
    return this.auth.login(body?.username ?? '', body?.password ?? '');
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: AuthRequest) {
    return req.user;
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(@Req() req: AuthRequest) {
    await this.auth.logout(req.token);
    return { ok: true };
  }

  @Post('claim-admin')
  @UseGuards(AuthGuard)
  async claimAdmin(@Req() req: AuthRequest, @Body() body: AdminKeyBody) {
    return this.auth.claimAdmin(req.user.id, body?.key ?? '');
  }
}
