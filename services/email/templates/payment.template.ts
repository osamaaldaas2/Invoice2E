import { PaymentEmailData } from '../types';

export const getPaymentEmailHtml = (data: PaymentEmailData): string => {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
    .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .details { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .big-number { font-size: 48px; font-weight: bold; color: #10b981; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💳 Payment Confirmed!</h1>
    </div>
    <div class="content">
      <p style="text-align: center;">
        <span class="big-number">+${data.creditsPurchased}</span><br>
        <span>credits added to your account</span>
      </p>
      
      <div class="details">
        <p><strong>Payment Details:</strong></p>
        <p>Amount Paid: ${data.amountPaid.toFixed(2)} ${data.currency}</p>
        <p>Credits Purchased: ${data.creditsPurchased}</p>
        <p>Available Credits: ${data.availableCredits}</p>
        ${data.receiptUrl ? `<p><a href="${data.receiptUrl}">View Receipt</a></p>` : ''}
      </div>
      
      <p style="text-align: center;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/en/dashboard" class="button">Start Converting Invoices</a>
      </p>
    </div>
    <div class="footer">
      <p>© 2026 Invoice2E. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
};

export const getPaymentEmailText = (data: PaymentEmailData): string => {
    return `
Payment Confirmed!

${data.creditsPurchased} credits have been added to your account.

Payment Details:
- Amount Paid: ${data.amountPaid.toFixed(2)} ${data.currency}
- Credits Purchased: ${data.creditsPurchased}
- Available Credits: ${data.availableCredits}

Start converting invoices now!

© 2026 Invoice2E
`;
};
