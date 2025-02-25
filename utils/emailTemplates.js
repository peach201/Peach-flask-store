export const verificationEmail = (name, url) => `
  <div style="max-width: 600px; margin: 20px auto; padding: 20px; font-family: Arial, sans-serif;">
    <h2 style="color: #2d3748;">Hi ${name},</h2>
    <p>Please verify your email by clicking the button below:</p>
    <a href="${url}" style="display: inline-block; padding: 10px 20px; background: #4299e1; color: white; text-decoration: none; border-radius: 4px;">
      Verify Email
    </a>
    <p style="margin-top: 20px;">If you didn't create an account, you can safely ignore this email.</p>
  </div>
`;

export const passwordResetEmail = (name, url) => `
  <div style="max-width: 600px; margin: 20px auto; padding: 20px; font-family: Arial, sans-serif;">
    <h2 style="color: #2d3748;">Hi ${name},</h2>
    <p>You requested a password reset. Click the button below to reset your password:</p>
    <a href="${url}" style="display: inline-block; padding: 10px 20px; background: #48bb78; color: white; text-decoration: none; border-radius: 4px;">
      Reset Password
    </a>
    <p style="margin-top: 20px;">This link will expire in 10 minutes.</p>
  </div>
`;