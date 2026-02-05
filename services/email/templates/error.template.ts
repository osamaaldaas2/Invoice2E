export const getErrorEmailHtml = (errorMessage: string, invoiceNumber?: string): string => {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
    .error-box { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ Processing Error</h1>
    </div>
    <div class="content">
      <p>We encountered an error while processing${invoiceNumber ? ` invoice ${invoiceNumber}` : ' your request'}.</p>
      
      <div class="error-box">
        <strong>Error Details:</strong><br>
        ${errorMessage}
      </div>
      
      <p>Please try again or contact support if the problem persists.</p>
      <p>Email: support@invoice2e.de</p>
    </div>
    <div class="footer">
      <p>© 2026 Invoice2E. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
};
