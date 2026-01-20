import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AdminGuard } from './admin.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, AdminGuard, PrismaClient],
  exports: [AuthService, AuthGuard, AdminGuard],
})
export class AuthModule {}
