import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailUtil {
  constructor(private readonly configService: ConfigService) {}

  async sendEmail(options: SendEmailOptions): Promise<void> {
    // In production, this would use Nodemailer/SendGrid.
    // For MVP / test, this is a no-op that can be mocked.
    // The implementation will be extended when Email infrastructure is set up.
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    if (!smtpHost) {
      console.log('[EmailUtil] SMTP not configured — email preview:');
      console.log(`  To: ${options.to}`);
      console.log(`  Subject: ${options.subject}`);
      console.log(`  HTML: ${options.html}`);
      return;
    }
    // Production implementation would go here
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
  ): Promise<void> {
    const baseUrl = this.configService.get<string>(
      'APP_BASE_URL',
      'http://localhost:5173',
    );
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

    await this.sendEmail({
      to: email,
      subject: 'CDMP 密碼重設',
      html: `
        <p>您好，</p>
        <p>我們收到您的密碼重設請求。請點擊以下連結重設您的密碼：</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>此連結將在 24 小時後失效。</p>
        <p>如果您並未要求重設密碼，請忽略此郵件。</p>
      `,
    });
  }
}
