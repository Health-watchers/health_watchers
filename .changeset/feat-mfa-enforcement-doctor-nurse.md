---
"api": minor
---

feat: enforce MFA for DOCTOR and NURSE roles with 7-day grace period (HIPAA)

- Add DOCTOR and NURSE to MFA_REQUIRED_ROLES (previously only CLINIC_ADMIN and SUPER_ADMIN)
- First login without MFA assigns a 7-day grace period (mfaGracePeriodEndsAt) and returns tokens with a mfa_required warning
- After grace period expires, login is blocked (403) until MFA is set up
- Add mfaGracePeriodEndsAt field to UserModel with DB index
- Add daily mfa-grace-period-job that sends email reminders 3 days and 1 day before the deadline
- Add migration 20260624_add_mfa_grace_period for the supporting compound index
