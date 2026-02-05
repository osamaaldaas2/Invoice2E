export const getWelcomeEmailHtml = (userName: string): string => {
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
    .feature { padding: 10px; margin: 10px 0; background: white; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>👋 Welcome to Invoice2E!</h1>
    </div>
    <div class="content">
      <p>Hello ${userName},</p>
      <p>Thank you for joining Invoice2E! We're excited to help you convert your invoices to XRechnung format.</p>
      
      <h3>🚀 Getting Started</h3>
      <div class="feature">✅ Upload your PDF invoice</div>
      <div class="feature">✅ Review extracted data</div>
      <div class="feature">✅ Download XRechnung XML</div>
      
      <p style="text-align: center;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/en/upload" class="button">Convert Your First Invoice</a>
      </p>
      
      <p>Need help? Check our <a href="${process.env.NEXT_PUBLIC_APP_URL}/en/help">documentation</a> or contact us at support@invoice2e.de</p>
    </div>
    <div class="footer">
      <p>© 2026 Invoice2E. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
};

export const getWelcomeEmailText = (userName: string): string => {
    return `
Welcome to Invoice2E!

Hello ${userName},

Thank you for joining Invoice2E! We're excited to help you convert your invoices to XRechnung format.

Getting Started:
1. Upload your PDF invoice
2. Review extracted data
3. Download XRechnung XML

Need help? Contact support@invoice2e.de

© 2026 Invoice2E
`;
};
