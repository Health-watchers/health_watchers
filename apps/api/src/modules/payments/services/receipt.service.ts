import { PaymentRecord } from '../models/payment-record.model';

export interface ReceiptData {
  receiptNumber: string;
  date: Date;
  clinicName: string;
  clinicAddress?: string;
  patientName: string;
  patientId: string;
  amount: string;
  assetCode: string;
  usdEquivalent: string;
  exchangeRate: string;
  txHash: string;
  memo: string;
  clinicPublicKey: string;
}

export class ReceiptService {
  /**
   * Generate receipt number (auto-incrementing per clinic)
   */
  static generateReceiptNumber(clinicId: string, sequence: number): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const seq = String(sequence).padStart(6, '0');
    return `RCP-${clinicId.slice(0, 4).toUpperCase()}-${year}${month}-${seq}`;
  }

  /**
   * Generate receipt HTML
   */
  static generateReceiptHTML(data: ReceiptData): string {
    const explorerUrl = `https://stellar.expert/explorer/public/${data.txHash}`;
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 5px 0; color: #666; }
    .section { margin-bottom: 20px; }
    .section-title { font-weight: bold; font-size: 14px; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .label { font-weight: bold; color: #333; }
    .value { color: #666; }
    .amount { font-size: 18px; font-weight: bold; color: #2563eb; }
    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px; }
    .qr-section { text-align: center; margin: 20px 0; }
    .qr-section img { max-width: 200px; }
    .explorer-link { color: #2563eb; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Payment Receipt</h1>
      <p>Receipt #${data.receiptNumber}</p>
    </div>

    <div class="section">
      <div class="section-title">Clinic Information</div>
      <div class="row">
        <span class="label">Clinic:</span>
        <span class="value">${data.clinicName}</span>
      </div>
      ${data.clinicAddress ? `
      <div class="row">
        <span class="label">Address:</span>
        <span class="value">${data.clinicAddress}</span>
      </div>
      ` : ''}
    </div>

    <div class="section">
      <div class="section-title">Patient Information</div>
      <div class="row">
        <span class="label">Patient Name:</span>
        <span class="value">${data.patientName}</span>
      </div>
      <div class="row">
        <span class="label">Patient ID:</span>
        <span class="value">${data.patientId}</span>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Payment Details</div>
      <div class="row">
        <span class="label">Date:</span>
        <span class="value">${data.date.toLocaleDateString()} ${data.date.toLocaleTimeString()}</span>
      </div>
      <div class="row">
        <span class="label">Amount:</span>
        <span class="value amount">${data.amount} ${data.assetCode}</span>
      </div>
      <div class="row">
        <span class="label">USD Equivalent:</span>
        <span class="value">$${data.usdEquivalent}</span>
      </div>
      <div class="row">
        <span class="label">Exchange Rate:</span>
        <span class="value">1 ${data.assetCode} = $${data.exchangeRate}</span>
      </div>
      <div class="row">
        <span class="label">Memo:</span>
        <span class="value">${data.memo}</span>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Stellar Transaction</div>
      <div class="row">
        <span class="label">Transaction Hash:</span>
        <span class="value"><a href="${explorerUrl}" class="explorer-link" target="_blank">${data.txHash.slice(0, 16)}...</a></span>
      </div>
      <div class="row">
        <span class="label">Clinic Public Key:</span>
        <span class="value">${data.clinicPublicKey.slice(0, 16)}...</span>
      </div>
    </div>

    <div class="footer">
      <p>This receipt is proof of payment on the Stellar blockchain.</p>
      <p>For support, please contact the clinic with Receipt #${data.receiptNumber}</p>
      <p>Generated on ${new Date().toISOString()}</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Calculate USD equivalent
   */
  static calculateUSDEquivalent(amount: string, exchangeRate: string): string {
    const amountNum = parseFloat(amount);
    const rateNum = parseFloat(exchangeRate);
    return (amountNum * rateNum).toFixed(2);
  }
}
