/** Minimal HTML email templates for transactional emails */

export function passwordResetTemplate(resetUrl: string, expiresInMinutes = 60): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Password Reset</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>Reset Your Password</h2>
  <p>You requested a password reset for your Health Watchers account.</p>
  <p>Click the button below to set a new password. This link expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.</p>
  <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;margin:16px 0">
    Reset Password
  </a>
  <p>If you didn't request this, you can safely ignore this email.</p>
  <hr style="margin-top:32px">
  <small style="color:#6b7280">Health Watchers &mdash; This link expires in ${expiresInMinutes} minutes.</small>
</body>
</html>`;
}

export function appointmentReminderTemplate(params: {
  patientName: string;
  doctorName: string;
  date: string;
  time: string;
  location: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Appointment Reminder</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>Appointment Reminder</h2>
  <p>Hi ${params.patientName},</p>
  <p>This is a reminder for your upcoming appointment:</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:8px;font-weight:bold">Doctor</td><td style="padding:8px">${params.doctorName}</td></tr>
    <tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Date</td><td style="padding:8px">${params.date}</td></tr>
    <tr><td style="padding:8px;font-weight:bold">Time</td><td style="padding:8px">${params.time}</td></tr>
    <tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Location</td><td style="padding:8px">${params.location}</td></tr>
  </table>
  <hr style="margin-top:32px">
  <small style="color:#6b7280">Health Watchers</small>
</body>
</html>`;
}

export function paymentReceiptTemplate(params: {
  patientName: string;
  amount: string;
  currency: string;
  transactionId: string;
  date: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Payment Receipt</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>Payment Receipt</h2>
  <p>Hi ${params.patientName}, thank you for your payment.</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:8px;font-weight:bold">Amount</td><td style="padding:8px">${params.amount} ${params.currency}</td></tr>
    <tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Transaction ID</td><td style="padding:8px">${params.transactionId}</td></tr>
    <tr><td style="padding:8px;font-weight:bold">Date</td><td style="padding:8px">${params.date}</td></tr>
  </table>
  <hr style="margin-top:32px">
  <small style="color:#6b7280">Health Watchers</small>
</body>
</html>`;
}

export function accountLockedTemplate(unlockAfterMinutes = 15): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Account Locked</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>Account Temporarily Locked</h2>
  <p>Your Health Watchers account has been temporarily locked due to multiple failed login attempts.</p>
  <p>Your account will automatically unlock after <strong>${unlockAfterMinutes} minutes</strong>.</p>
  <p>If this wasn't you, please contact support immediately or reset your password.</p>
  <hr style="margin-top:32px">
  <small style="color:#6b7280">Health Watchers Security Team</small>
</body>
</html>`;
}
