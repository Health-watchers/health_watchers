#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env, Symbol, Vec};

/// Soroban Escrow Contract
/// Holds funds in escrow between patient and clinic
/// Supports deposit, release, refund, and dispute resolution

#[derive(Clone)]
pub enum EscrowStatus {
    Active = 0,
    Released = 1,
    Refunded = 2,
    Disputed = 3,
    Cancelled = 4,
}

#[derive(Clone)]
pub struct EscrowRecord {
    pub patient: Address,
    pub clinic: Address,
    pub amount: i128,
    pub status: u32,
    pub created_at: u64,
    pub expires_at: u64,
}

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    /// Deposit funds into escrow
    /// Called by patient to hold payment in escrow for clinic
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `patient` - Patient account (must authorize)
    /// * `clinic` - Clinic receiving the funds
    /// * `token` - USDC or payment token
    /// * `amount` - Amount in stroops/base units
    ///
    /// # Returns
    /// Escrow ID (hash of patient + clinic + nonce)
    pub fn deposit(
        env: Env,
        patient: Address,
        clinic: Address,
        token: Address,
        amount: i128,
    ) -> Vec<u8> {
        // Require authorization from patient account
        patient.require_auth();

        // Validate inputs
        if amount <= 0 {
            panic!("Amount must be positive");
        }

        // Transfer tokens from patient to contract (escrow holder)
        let contract_id = env.current_contract_address();
        soroban_sdk::token::Client::new(&env, &token)
            .transfer(&patient, &contract_id, &amount);

        // Create escrow record
        let now = env.ledger().timestamp();
        let expires_at = now + (14 * 24 * 60 * 60); // 14 days

        let escrow_id = Self::generate_escrow_id(&env, &patient, &clinic, now);

        // Store escrow record in contract state
        let key = Symbol::new(&env, "escrow");
        let mut escrows = env.storage().instance().get::<Symbol, Vec<EscrowRecord>>(&key)
            .unwrap_or_else(|| Vec::new(&env));

        let record = EscrowRecord {
            patient: patient.clone(),
            clinic: clinic.clone(),
            amount,
            status: EscrowStatus::Active as u32,
            created_at: now,
            expires_at,
        };

        escrows.push_back(record);
        env.storage().instance().set(&key, &escrows);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "escrow"), Symbol::new(&env, "deposited")),
            (escrow_id.clone(), amount),
        );

        escrow_id
    }

    /// Release escrowed funds to clinic
    /// Called by clinic to confirm service delivery
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `escrow_id` - ID of escrow to release
    /// * `clinic` - Clinic account (must authorize)
    /// * `token` - Token address for transfer
    pub fn release(
        env: Env,
        escrow_id: Vec<u8>,
        clinic: Address,
        token: Address,
    ) -> bool {
        clinic.require_auth();

        // Find and update escrow record
        let key = Symbol::new(&env, "escrow");
        let mut escrows = env.storage().instance().get::<Symbol, Vec<EscrowRecord>>(&key)
            .unwrap_or_else(|| Vec::new(&env));

        let mut found = false;
        for i in 0..escrows.len() {
            let mut record = escrows.get(i).unwrap();

            // Verify clinic matches and status is Active
            if record.clinic == clinic && record.status == EscrowStatus::Active as u32 {
                found = true;

                // Transfer funds from contract to clinic
                let contract_id = env.current_contract_address();
                soroban_sdk::token::Client::new(&env, &token)
                    .transfer(&contract_id, &clinic, &record.amount);

                // Update status
                record.status = EscrowStatus::Released as u32;
                escrows.set(i, record.clone());

                // Emit event
                env.events().publish(
                    (Symbol::new(&env, "escrow"), Symbol::new(&env, "released")),
                    (escrow_id.clone(), record.amount),
                );

                break;
            }
        }

        if found {
            env.storage().instance().set(&key, &escrows);
        }

        found
    }

    /// Refund escrowed funds to patient
    /// Called by patient after timeout (14 days) if not released
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `escrow_id` - ID of escrow to refund
    /// * `patient` - Patient account (must authorize)
    /// * `token` - Token address for transfer
    pub fn refund(
        env: Env,
        escrow_id: Vec<u8>,
        patient: Address,
        token: Address,
    ) -> bool {
        patient.require_auth();

        let key = Symbol::new(&env, "escrow");
        let mut escrows = env.storage().instance().get::<Symbol, Vec<EscrowRecord>>(&key)
            .unwrap_or_else(|| Vec::new(&env));

        let now = env.ledger().timestamp();
        let mut found = false;

        for i in 0..escrows.len() {
            let mut record = escrows.get(i).unwrap();

            if record.patient == patient
                && record.status == EscrowStatus::Active as u32
                && now >= record.expires_at {
                found = true;

                // Transfer funds from contract back to patient
                let contract_id = env.current_contract_address();
                soroban_sdk::token::Client::new(&env, &token)
                    .transfer(&contract_id, &patient, &record.amount);

                // Update status
                record.status = EscrowStatus::Refunded as u32;
                escrows.set(i, record.clone());

                // Emit event
                env.events().publish(
                    (Symbol::new(&env, "escrow"), Symbol::new(&env, "refunded")),
                    (escrow_id.clone(), record.amount),
                );

                break;
            }
        }

        if found {
            env.storage().instance().set(&key, &escrows);
        }

        found
    }

    /// Open dispute on escrow
    /// Either patient or clinic can initiate
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `escrow_id` - ID of escrow
    /// * `reason` - Reason for dispute
    pub fn dispute(
        env: Env,
        escrow_id: Vec<u8>,
        reason: Vec<u8>,
    ) -> bool {
        let caller = env.invoker();
        caller.require_auth();

        let key = Symbol::new(&env, "escrow");
        let mut escrows = env.storage().instance().get::<Symbol, Vec<EscrowRecord>>(&key)
            .unwrap_or_else(|| Vec::new(&env));

        let mut found = false;
        for i in 0..escrows.len() {
            let mut record = escrows.get(i).unwrap();

            if record.status == EscrowStatus::Active as u32 {
                found = true;
                record.status = EscrowStatus::Disputed as u32;
                escrows.set(i, record);

                // Emit event with reason
                env.events().publish(
                    (Symbol::new(&env, "escrow"), Symbol::new(&env, "disputed")),
                    (escrow_id.clone(), reason),
                );

                break;
            }
        }

        if found {
            env.storage().instance().set(&key, &escrows);
        }

        found
    }

    // ── Helper functions ──────────────────────────────────────────────────

    fn generate_escrow_id(env: &Env, patient: &Address, clinic: &Address, nonce: u64) -> Vec<u8> {
        // Create deterministic ID from patient + clinic + nonce
        let mut data = Vec::new(env);
        data.push_back(patient.clone() as u32 as u8);
        data.push_back(clinic.clone() as u32 as u8);
        data.push_back((nonce >> 56) as u8);
        data.push_back((nonce >> 48) as u8);
        data.push_back((nonce >> 40) as u8);
        data.push_back((nonce >> 32) as u8);
        data.push_back((nonce >> 24) as u8);
        data.push_back((nonce >> 16) as u8);
        data.push_back((nonce >> 8) as u8);
        data.push_back(nonce as u8);

        data
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger, MockAuth};
    use soroban_sdk::Env;

    #[test]
    fn test_deposit() {
        let env = Env::default();
        env.ledger().set_timestamp(1000);

        let patient = Address::random(&env);
        let clinic = Address::random(&env);
        let token = Address::random(&env);

        let contract = Escrow;
        let escrow_id = contract.deposit(
            env.clone(),
            patient.clone(),
            clinic.clone(),
            token.clone(),
            1000,
        );

        assert!(!escrow_id.is_empty());
    }

    #[test]
    fn test_release() {
        let env = Env::default();
        env.ledger().set_timestamp(1000);

        let patient = Address::random(&env);
        let clinic = Address::random(&env);
        let token = Address::random(&env);

        let contract = Escrow;
        let escrow_id = contract.deposit(
            env.clone(),
            patient.clone(),
            clinic.clone(),
            token.clone(),
            1000,
        );

        let released = contract.release(env, escrow_id, clinic, token);
        assert!(released);
    }

    #[test]
    fn test_refund_after_expiry() {
        let env = Env::default();
        env.ledger().set_timestamp(1000);

        let patient = Address::random(&env);
        let clinic = Address::random(&env);
        let token = Address::random(&env);

        let contract = Escrow;
        contract.deposit(
            env.clone(),
            patient.clone(),
            clinic.clone(),
            token.clone(),
            1000,
        );

        // Advance time past expiry
        env.ledger().set_timestamp(1000 + (15 * 24 * 60 * 60));

        let refunded = contract.refund(env, vec![], patient, token);
        assert!(refunded);
    }

    #[test]
    fn test_dispute() {
        let env = Env::default();
        env.ledger().set_timestamp(1000);

        let patient = Address::random(&env);
        let clinic = Address::random(&env);
        let token = Address::random(&env);

        let contract = Escrow;
        let escrow_id = contract.deposit(
            env.clone(),
            patient.clone(),
            clinic.clone(),
            token.clone(),
            1000,
        );

        let disputed = contract.dispute(env, escrow_id, Vec::new(&env));
        assert!(disputed);
    }
}
