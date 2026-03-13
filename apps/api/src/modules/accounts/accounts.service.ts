import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@/database/entities/user.entity';
import { HashUtil } from '@/common/hash/hash.util';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { CreateAccountDto } from './dto/create-account.dto';

export interface CreateAccountResult {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  created_at: Date;
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createAccount(dto: CreateAccountDto): Promise<CreateAccountResult> {
    const email = dto.email.toLowerCase();

    // Check for duplicate email
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException({
        error: ERROR_CODES.ACCOUNT_EMAIL_EXISTS,
        message: ERROR_MESSAGES.ACCOUNT_EMAIL_EXISTS,
      });
    }

    // Hash password
    const passwordHash = await HashUtil.hash(dto.password);

    // Create and save user
    const user = this.userRepository.create({
      name: dto.name,
      email,
      password_hash: passwordHash,
      role: dto.role,
      status: 'active',
    });

    const saved = await this.userRepository.save(user);

    return {
      id: saved.id,
      name: saved.name,
      email: saved.email,
      role: saved.role,
      status: saved.status,
      created_at: saved.created_at,
    };
  }
}
