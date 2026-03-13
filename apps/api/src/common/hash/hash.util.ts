import * as bcrypt from 'bcryptjs';

const BCRYPT_COST = 10;

export class HashUtil {
  static async hash(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST);
  }

  static async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
