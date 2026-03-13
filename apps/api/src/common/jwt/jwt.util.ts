import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface JwtPayloadInput {
  userId: string;
  role: string;
  rememberMe?: boolean;
}

@Injectable()
export class JwtUtil {
  private static readonly DEFAULT_EXPIRY = 8 * 60 * 60; // 8 hours in seconds
  private static readonly REMEMBER_ME_EXPIRY = 30 * 24 * 60 * 60; // 30 days in seconds

  constructor(private readonly jwtService: JwtService) {}

  generateToken(input: JwtPayloadInput): string {
    const expiresIn = input.rememberMe
      ? JwtUtil.REMEMBER_ME_EXPIRY
      : JwtUtil.DEFAULT_EXPIRY;

    return this.jwtService.sign(
      {
        userId: input.userId,
        role: input.role,
      },
      {
        expiresIn,
      },
    );
  }
}
