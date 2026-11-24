---
title: Stellar Wallet and Payments
description: Set up the clinic's Stellar wallet and receive patient payments.
---

# Stellar Wallet and Payments

Health Watchers receives patient payments through the Stellar network in **XLM** or **USDC**. Payments settle in seconds and every payment has a receipt.

**Where:** **Wallet** in the main menu (`/wallet`).

## 1. Make sure the clinic has a wallet

A wallet is normally created during [onboarding](./onboarding-a-clinic.md). The **Account Overview** shows the clinic's **Public Key**, a QR code, and the **Federation Address** if one is set. Click **Copy Address** to share it.

If no wallet exists, a Clinic Admin can set one up under **Settings → Stellar**.

## 2. Enable USDC (recommended)

If the wallet shows *No USDC trustline — create one to receive USDC payments*, click the button to create the trustline. Without it, the clinic can only receive XLM.

On the test network you can click **Fund with Friendbot** to add test XLM.

## 3. Receive payments

- **From an invoice:** open **Invoices**, create or open the invoice, and click **Send** to email it. Patients pay from the patient portal. If a patient pays another way, use **Mark paid** on the invoice.
- **In person:** show the patient the QR code on the **Wallet** page, or share the address.

Confirmed payments appear under **Recent Transactions** and on the **Payments** page.

## 4. Set balance alerts

Under **Balance Alert Settings**, set **Low Balance Warning (XLM)**, **Critical Balance (XLM)** and **Large Transaction (XLM)**, then click **Save Alert Settings**.

## Sending a payment

Click **Send Payment** and enter the **Destination Public Key**, the **Amount (XLM)** and an optional **Memo**. Click **Review Payment**, check the details, then click **Send Payment** again to confirm. Stellar payments cannot be reversed, so double-check the address.
