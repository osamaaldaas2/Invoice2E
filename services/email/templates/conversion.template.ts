import { ConversionEmailData } from '../types';

export const getConversionEmailHtml = (data: ConversionEmailData): string => {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
    .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .details { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .details table { width: 100%; }
    .details td { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .success-icon { font-size: 48px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-icon">✅</div>
      <h1>Invoice Converted Successfully!</h1>
    </div>
    <div class="content">
      <p>Great news! Your invoice has been converted to ${data.format === 'UBL' ? 'UBL 2.1' : 'XRechnung 3.0.2'} format.</p>
      
      <div class="details">
        <table>
          <tr><td><strong>Invoice Number:</strong></td><td>${data.invoiceNumber}</td></tr>
          <tr><td><strong>Date:</strong></td><td>${data.invoiceDate}</td></tr>
          <tr><td><strong>Buyer:</strong></td><td>${data.buyerName}</td></tr>
          <tr><td><strong>Amount:</strong></td><td>${data.totalAmount.toFixed(2)} ${data.currency}</td></tr>
          <tr><td><strong>Format:</strong></td><td>${data.format}</td></tr>
        </table>
      </div>
      
      <p style="text-align: center;">
        <a href="${data.downloadLink}" class="button">Download XML File</a>
      </p>
      
      <p><small>This download link expires in 24 hours. The XML file is also attached to this email.</small></p>
    </div>
    <div class="footer">
      <p>© 2026 Invoice2E. All rights reserved.</p>
      <p>Need help? Contact support@invoice2e.de</p>
    </div>
  </div>
</body>
</html>`;
};

export const getConversionEmailText = (data: ConversionEmailData): string => {
    return `
Invoice Converted Successfully!

Your invoice has been converted to ${data.format === 'UBL' ? 'UBL 2.1' : 'XRechnung 3.0.2'} format.

Details:
- Invoice Number: ${data.invoiceNumber}
- Date: ${data.invoiceDate}
- Buyer: ${data.buyerName}
- Amount: ${data.totalAmount.toFixed(2)} ${data.currency}
- Format: ${data.format}

Download your file: ${data.downloadLink}
(Link expires in 24 hours)

© 2026 Invoice2E
`;
};
