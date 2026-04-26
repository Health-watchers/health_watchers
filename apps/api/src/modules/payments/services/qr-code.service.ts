import QRCode from 'qrcode';

export interface QRCodeOptions {
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  type?: 'image/png' | 'image/jpeg' | 'image/webp';
  width?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
}

export class QRCodeService {
  /**
   * Generate Stellar payment URI
   */
  static generateStellarPaymentURI(
    destination: string,
    amount: string,
    assetCode: string = 'XLM',
    memo?: string,
    clinicName?: string
  ): string {
    const params = new URLSearchParams();
    params.append('destination', destination);
    params.append('amount', amount);
    params.append('asset_code', assetCode);
    if (memo) params.append('memo', memo);
    if (memo) params.append('memo_type', 'text');

    return `web+stellar:pay?${params.toString()}`;
  }

  /**
   * Generate QR code as PNG buffer
   */
  static async generateQRCodePNG(
    data: string,
    options: QRCodeOptions = {}
  ): Promise<Buffer> {
    const defaultOptions = {
      errorCorrectionLevel: 'H' as const,
      type: 'image/png' as const,
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      ...options,
    };

    return QRCode.toBuffer(data, defaultOptions);
  }

  /**
   * Generate QR code as data URL
   */
  static async generateQRCodeDataURL(
    data: string,
    options: QRCodeOptions = {}
  ): Promise<string> {
    const defaultOptions = {
      errorCorrectionLevel: 'H' as const,
      type: 'image/png' as const,
      width: 300,
      margin: 2,
      ...options,
    };

    return QRCode.toDataURL(data, defaultOptions);
  }

  /**
   * Generate QR code as SVG string
   */
  static async generateQRCodeSVG(data: string): Promise<string> {
    return QRCode.toString(data, {
      errorCorrectionLevel: 'H',
      type: 'image/svg+xml',
      width: 300,
      margin: 2,
    });
  }
}
