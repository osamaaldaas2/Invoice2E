export interface PasswordResetEmailData {
    userName: string;
    resetUrl: string;
    expiryMinutes: number;
}

export const getPasswordResetEmailHtml = (data: PasswordResetEmailData): string => {
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
    .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 12px; border-radius: 6px; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Password Reset Request</h1>
    </div>
    <div class="content">
      <p>Hello ${data.userName},</p>
      <p>We received a request to reset your password for your Invoice2E account.</p>

      <p style="text-align: center;">
        <a href="${data.resetUrl}" class="button">Reset Your Password</a>
      </p>

      <div class="warning">
        <strong>This link expires in ${data.expiryMinutes} minutes.</strong>
        If you did not request a password reset, please ignore this email.
      </div>

      <p style="font-size: 12px; color: #6b7280;">
        If the button doesn't work, copy and paste this URL into your browser:<br>
        <a href="${data.resetUrl}">${data.resetUrl}</a>
      </p>
    </div>
    <div class="footer">
      <p>&copy; 2026 Invoice2E. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
};

export const getPasswordResetEmailText = (data: PasswordResetEmailData): string => {
    return `
Password Reset Request

Hello ${data.userName},

We received a request to reset your password for your Invoice2E account.

Reset your password by visiting this link:
${data.resetUrl}

This link expires in ${data.expiryMinutes} minutes.
If you did not request a password reset, please ignore this email.

© 2026 Invoice2E
`;
};
