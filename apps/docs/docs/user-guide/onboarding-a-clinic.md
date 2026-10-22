---
title: Onboarding a Clinic
description: Set up a new clinic with the five-step onboarding wizard.
---

# Onboarding a Clinic

**Who:** the first administrator of a new clinic. **Time:** about 10 minutes.

When a new clinic signs in for the first time, Health Watchers opens the **onboarding wizard** (`/onboarding`). The progress bar at the top shows five steps: **Clinic Info → Wallet → Staff → Settings → Review**. Your progress is saved after each step, so you can close the browser and continue later.

## Step 1: Clinic Info

1. Enter the **Clinic Name**, for example *City Medical Center*.
2. Enter the clinic's **Address**, **Phone** and **Email**.
3. Optionally enter a **Specialty**, for example *General Practice*.
4. Click **Next →**.

## Step 2: Stellar Wallet

The wallet is used to receive patient payments. Choose one option:

- **Generate new keypair**: Health Watchers creates and securely stores a new wallet for you. On the test network it is funded automatically. Choose this if you are unsure.
- **Import existing key**: paste your existing **Stellar Public Key** (it starts with `G…`).

Click **Next →**. You can change the wallet later. See [Stellar wallet and payments](./stellar-wallet-and-payments.md).

## Step 3: Staff Setup

1. Enter the **Admin Email** of the person who will manage the clinic account.
2. Optionally enter their **Admin Name**.
3. Click **Next →**. You can invite the rest of your team later. See [Inviting staff](./inviting-staff.md).

## Step 4: Settings

1. Choose your **Timezone**.
2. Set the **Default Appointment Duration (minutes)**, between 5 and 240. The default is 30.
3. Click **Next →**.

## Step 5: Review & Confirm

Check the summary: clinic name, address, phone, email, Stellar wallet, timezone and appointment duration. Click **← Back** to correct anything, then confirm to activate the clinic. You are taken to the dashboard.

## Troubleshooting

| Message | What to do |
|---------|------------|
| *Clinic name is required* / *Address is required* | Fill in the highlighted field |
| *Public key is required when importing* | Paste the key, or switch to **Generate new keypair** |
| *Failed to save step* | Check your internet connection and click **Next →** again |
