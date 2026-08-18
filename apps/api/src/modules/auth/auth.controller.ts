import { Body, Controller, Get, Ip, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createZodDto } from 'nestjs-zod';
import {
  loginSchema,
  type AuthUser,
  type LoginResponse,
  type RefreshResponse,
} from '@counselos/shared';
import type { Request, Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService, type AuthSession } from './auth.service';
import { REFRESH_COOKIE, refreshCookieOptions } from './refresh-cookie';

/** Canonical schema from packages/shared, so the form and the pipe agree. */
class LoginDto extends createZodDto(loginSchema) {}

/**
 * HTTP only — no business logic (Architecture Rule 1).
 *
 * The browser never talks to Supabase; every auth operation proxies through
 * here. That is what keeps the access token in memory and the refresh token in
 * an httpOnly cookie, and what keeps one audited path into the system.
 */
@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    // Read once at construction, through ConfigService — process.env is allowed
    // only in instrument.ts and env.validation.ts (18 §9).
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  /**
   * @Public because you cannot present an access token in order to obtain one.
   * Rate limiting inside AuthService is what stops this being a free oracle.
   */
  @Public()
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const session = await this.authService.login(body.email, body.password, ip);
    this.setRefreshCookie(res, session);
    return this.authService.toLoginResponse(session);
  }

  /**
   * @Public deliberately: the caller's access token has just expired, so it
   * cannot authenticate here. The httpOnly cookie IS the credential.
   */
  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponse> {
    const session = await this.authService.refresh(this.readRefreshCookie(req));
    // Rotated, not reused — a refresh token that survives its own use is a
    // replayable credential.
    this.setRefreshCookie(res, session);
    return { accessToken: session.accessToken };
  }

  /** @Public so signing out works even once the access token has expired. */
  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<null> {
    await this.authService.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(this.isProduction));
    return null;
  }

  /** Lets the frontend rehydrate after a reload, since the token is in memory. */
  @Get('me')
  me(@CurrentUser() user: AuthUser | undefined): AuthUser {
    // Never undefined here: JwtAuthGuard throws rather than passing through on
    // a route without @Public().
    return user as AuthUser;
  }

  private setRefreshCookie(res: Response, session: AuthSession): void {
    res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions(this.isProduction));
  }

  private readRefreshCookie(req: Request): string {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof token === 'string' ? token : '';
  }
}
