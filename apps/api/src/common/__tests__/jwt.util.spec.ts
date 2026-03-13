import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { JwtUtil } from '../jwt/jwt.util';

describe('JwtUtil', () => {
  let jwtUtil: JwtUtil;
  let jwtService: JwtService;

  const TEST_SECRET = 'test-jwt-secret-key-for-testing';

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        JwtUtil,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: TEST_SECRET }),
        },
      ],
    }).compile();

    jwtUtil = module.get<JwtUtil>(JwtUtil);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should generate a valid JWT token', () => {
    const token = jwtUtil.generateToken({
      userId: 'test-user-id',
      role: 'admin',
    });

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
  });

  it('should include userId, role, iat, exp in JWT payload', () => {
    const token = jwtUtil.generateToken({
      userId: 'test-user-id',
      role: 'admin',
    });

    const payload = jwtService.verify(token);
    expect(payload.userId).toBe('test-user-id');
    expect(payload.role).toBe('admin');
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
  });

  it('should use default 8h expiration', () => {
    const token = jwtUtil.generateToken({
      userId: 'test-user-id',
      role: 'admin',
    });

    const payload = jwtService.verify(token);
    const diff = payload.exp - payload.iat;
    expect(diff).toBe(8 * 60 * 60); // 8 hours in seconds
  });

  it('should use 30d expiration when rememberMe is true', () => {
    const token = jwtUtil.generateToken({
      userId: 'test-user-id',
      role: 'admin',
      rememberMe: true,
    });

    const payload = jwtService.verify(token);
    const diff = payload.exp - payload.iat;
    expect(diff).toBe(30 * 24 * 60 * 60); // 30 days in seconds
  });
});
