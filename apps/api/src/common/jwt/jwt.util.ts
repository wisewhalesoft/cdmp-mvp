import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface JwtPayloadInput {
  userId: string;
  role: string;
  // E07 業務主管旗標（AD-E02-1）：JWT 攜帶以利 SalesManagerGuard 直接讀取
  // 不需每 request 再 hit DB；undefined → 視為 false
  // ⚠️ DEPRECATED（AD-E07 v3.0 / 2026-05-16）：由 businessRole 取代；保留欄位以便過渡期 callsite 漸進改造
  isSalesManager?: boolean;
  // E07 業務角色（AD-E07 v3.0 / m14 / 2026-05-16 新增）
  // 允許值：'director' / 'section_chief' / null
  // legacy JWT（v1.x 簽發）未含此欄位，AuthGuard 應將 undefined 降級為 null
  businessRole?: 'director' | 'section_chief' | null;
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
        isSalesManager: input.isSalesManager ?? false,
        // F002 §4.6：JWT 攜帶 businessRole；未提供時顯式寫 null（legacy 降級語意一致）
        businessRole: input.businessRole ?? null,
      },
      {
        expiresIn,
      },
    );
  }
}
