import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export const totpService = {
  async setup(
    email: string
  ): Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }> {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(email, 'Health Watchers', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrCodeDataUrl };
  },

  verify(token: string, secret: string): boolean {
    return authenticator.verify({ token, secret });
  },
};
