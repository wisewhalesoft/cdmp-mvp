import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { HashUtil } from '@/common/hash/hash.util';
import { JwtUtil } from '@/common/jwt/jwt.util';
import { EmailUtil } from '@/common/email/email.util';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { LoginDto } from './dto/login.dto';

export interface LoginResult {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    isSalesManager: boolean;
  };
}

export interface MessageResult {
  message: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TokenBlocklist)
    private readonly tokenBlocklistRepository: Repository<TokenBlocklist>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepository: Repository<PasswordResetToken>,
    private readonly jwtUtil: JwtUtil,
    private readonly jwtService: JwtService,
    private readonly emailUtil: EmailUtil,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    // BR: Email 查詢前轉小寫
    const email = dto.email.toLowerCase();

    // Find user by email (TypeORM parameterized query for SQL injection safety)
    const user = await this.userRepository.findOne({
      where: { email },
    });

    // BR-002: 不存在的 email 回傳統一錯誤訊息
    if (!user) {
      throw new UnauthorizedException({
        error: ERROR_CODES.INVALID_CREDENTIALS,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS,
      });
    }

    // BR-001: bcrypt compare
    const isPasswordValid = await HashUtil.compare(
      dto.password,
      user.password_hash,
    );

    // BR-002: 錯誤密碼回傳統一錯誤訊息
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        error: ERROR_CODES.INVALID_CREDENTIALS,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS,
      });
    }

    // BR-003: 帳號停用檢查在密碼驗證之後
    if (user.status === 'disabled') {
      throw new ForbiddenException({
        error: ERROR_CODES.ACCOUNT_DISABLED,
        message: ERROR_MESSAGES.ACCOUNT_DISABLED,
      });
    }

    // F002SM / F008 AD-E02-1：旗標統一以 boolean 形式回傳，
    // Admin 帳號亦回傳 false（非 undefined）以避免前端 undefined 邊界
    const isSalesManager = user.is_sales_manager ?? false;

    // Generate JWT（含 is_sales_manager 旗標供 SalesManagerGuard 使用，AD-E02-1）
    const token = this.jwtUtil.generateToken({
      userId: user.id,
      role: user.role,
      isSalesManager,
      rememberMe: dto.rememberMe ?? false,
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isSalesManager,
      },
    };
  }

  async logout(token: string, userId: string): Promise<void> {
    // Decode JWT to get expiration time
    const decoded = this.jwtService.decode(token) as { exp?: number };
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 8 * 60 * 60 * 1000);

    // Upsert: ignore if token already in blocklist (idempotent)
    const existing = await this.tokenBlocklistRepository.findOne({
      where: { token },
    });
    if (!existing) {
      await this.tokenBlocklistRepository.save(
        this.tokenBlocklistRepository.create({
          token,
          user_id: userId,
          expires_at: expiresAt,
        }),
      );
    }
  }

  async isTokenRevoked(token: string): Promise<boolean> {
    const entry = await this.tokenBlocklistRepository.findOne({
      where: { token },
    });
    return entry !== null;
  }

  // F009: 忘記密碼 — 建立重設 Token 並寄送 Email
  async forgotPassword(dto: { email: string }): Promise<MessageResult> {
    const email = dto.email.toLowerCase();
    const user = await this.userRepository.findOne({ where: { email } });

    // BR-4: 無論 Email 是否存在，回應一律相同
    if (user) {
      const resetToken = randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await this.passwordResetTokenRepository.save(
        this.passwordResetTokenRepository.create({
          user_id: user.id,
          token: resetToken,
          expires_at: expiresAt,
        }),
      );

      // 非同步寄送 Email（不阻塞回應）
      this.emailUtil.sendPasswordResetEmail(email, resetToken).catch(() => {
        // Email 寄送失敗記錄但不影響回應
      });
    }

    return { message: '若此 Email 存在，重設連結已寄出' };
  }

  // F009: 重設密碼
  async resetPassword(dto: {
    token: string;
    newPassword: string;
  }): Promise<MessageResult> {
    // BR-5: 密碼長度驗證 (defense in depth, DTO 已驗證)
    if (dto.newPassword.length < 8) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.VALIDATION_PASSWORD_LENGTH,
        message: ERROR_MESSAGES.VALIDATION_PASSWORD_LENGTH,
      });
    }

    // 查詢 Token
    const tokenRecord = await this.passwordResetTokenRepository.findOne({
      where: { token: dto.token },
    });

    // TS-F009-007: Token 不存在
    if (!tokenRecord) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.RESET_TOKEN_INVALID,
        message: ERROR_MESSAGES.RESET_TOKEN_INVALID,
      });
    }

    // TS-F009-006: Token 已使用
    if (tokenRecord.used_at !== null) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.RESET_TOKEN_USED,
        message: ERROR_MESSAGES.RESET_TOKEN_USED,
      });
    }

    // TS-F009-005: Token 已過期
    if (new Date() > new Date(tokenRecord.expires_at)) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.RESET_TOKEN_EXPIRED,
        message: ERROR_MESSAGES.RESET_TOKEN_EXPIRED,
      });
    }

    // 查詢使用者
    const user = await this.userRepository.findOne({
      where: { id: tokenRecord.user_id },
    });

    if (!user) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.RESET_TOKEN_INVALID,
        message: ERROR_MESSAGES.RESET_TOKEN_INVALID,
      });
    }

    // BR-6: bcrypt hash 新密碼
    user.password_hash = await HashUtil.hash(dto.newPassword);
    // BR-7: 設定 password_changed_at 以失效所有舊 Session Token
    // AuthGuard 會比對 JWT iat (seconds) 與 password_changed_at
    // 加 1 秒確保在同一秒內發行的 JWT 也會被失效
    user.password_changed_at = new Date(Date.now() + 1000);
    await this.userRepository.save(user);

    // BR-2: 標記 Token 已使用
    tokenRecord.used_at = new Date();
    await this.passwordResetTokenRepository.save(tokenRecord);

    return { message: '密碼已成功重設，請重新登入' };
  }

}
