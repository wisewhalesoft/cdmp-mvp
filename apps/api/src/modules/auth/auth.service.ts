import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@/database/entities/user.entity';
import { HashUtil } from '@/common/hash/hash.util';
import { JwtUtil } from '@/common/jwt/jwt.util';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { LoginDto } from './dto/login.dto';

export interface LoginResult {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtUtil: JwtUtil,
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

    // Generate JWT
    const token = this.jwtUtil.generateToken({
      userId: user.id,
      role: user.role,
      rememberMe: dto.rememberMe ?? false,
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
