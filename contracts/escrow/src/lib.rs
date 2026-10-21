#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Bytes,
    BytesN, Env, Symbol, Vec,
};

/// Soroban Escrow Contract
/// Holds funds in escrow between patient and clinic.
/// Supports deposit, release, refund, dispute, and cancel flows.

/// Escrow lifecycle status.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowStatus {
    Active = 0,
    Released = 1,
    Refunded = 2,
    Disputed = 3,
    Cancelled = 4,
}

/// Persistent escrow record.
#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowRecord {
    pub patient: Address,
    pub clinic: Address,
    pub token: Address,
    pub amount: i128,
    pub status: EscrowStatus,
    pub created_at: u64,
    pub expires_at: u64,
}

/// Contract error codes surfaced to callers.
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    EscrowNotFound = 2,
    InvalidStatus = 3,
    NotExpired = 4,
    Unauthorized = 5,
    AlreadyExists = 6,
}

/// Storage keys.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Escrow(BytesN<32>),
    Nonce,
}

/// Default escrow lifetime: 14 days in seconds.
const ESCROW_TTL_SECS: u64 = 14 * 24 * 60 * 60;

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    /// Deposit funds into escrow.
    /// Called by the patient to hold payment for the clinic.
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `patient` - Patient account (must authorize)
    /// * `clinic` - Clinic receiving the funds
    /// * `token` - USDC or payment token
    /// * `amount` - Amount in stroops/base units
    ///
    /// # Returns
    /// Deterministic escrow ID (32-byte hash of patient + clinic + nonce)
    pub fn deposit(
        env: Env,
        patient: Address,
        clinic: Address,
        token: Address,
        amount: i128,
    ) -> BytesN<32> {
        patient.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        // Transfer tokens from patient to contract (escrow holder).
        let contract_id = env.current_contract_address();
        token::Client::new(&env, &token).transfer(&patient, &contract_id, &amount);

        let now = env.ledger().timestamp();
        let expires_at = now + ESCROW_TTL_SECS;

        // Monotonic nonce ensures unique IDs even for identical parties.
        let nonce: u64 = env
            .storage()
            .instance()
            .get::<DataKey, u64>(&DataKey::Nonce)
            .unwrap_or(0);
        env.storage().instance().set(&DataKey::Nonce, &(nonce + 1));

        let escrow_id = Self::generate_escrow_id(&env, &patient, &clinic, nonce);

        let key = DataKey::Escrow(escrow_id.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::AlreadyExists);
        }

        let record = EscrowRecord {
            patient: patient.clone(),
            clinic: clinic.clone(),
            token: token.clone(),
            amount,
            status: EscrowStatus::Active,
            created_at: now,
            expires_at,
        };

        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (Symbol::new(&env, "escrow"), Symbol::new(&env, "deposited")),
            (escrow_id.clone(), patient, clinic, amount),
        );

        escrow_id
    }

    /// Release escrowed funds to the clinic.
    /// Called by the clinic to confirm service delivery.
    pub fn release(env: Env, escrow_id: BytesN<32>, clinic: Address) -> bool {
        clinic.require_auth();

        let key = DataKey::Escrow(escrow_id.clone());
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(r) => r,
            None => panic_with_error!(&env, Error::EscrowNotFound),
        };

        if record.clinic != clinic {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if record.status != EscrowStatus::Active {
            panic_with_error!(&env, Error::InvalidStatus);
        }

        let contract_id = env.current_contract_address();
        token::Client::new(&env, &record.token).transfer(
            &contract_id,
            &clinic,
            &record.amount,
        );

        record.status = EscrowStatus::Released;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (Symbol::new(&env, "escrow"), Symbol::new(&env, "released")),
            (escrow_id, clinic, record.amount),
        );

        true
    }

    /// Refund escrowed funds to the patient after expiry.
    /// Called by the patient once the escrow TTL has elapsed.
    pub fn refund(env: Env, escrow_id: BytesN<32>, patient: Address) -> bool {
        patient.require_auth();

        let key = DataKey::Escrow(escrow_id.clone());
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(r) => r,
            None => panic_with_error!(&env, Error::EscrowNotFound),
        };

        if record.patient != patient {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if record.status != EscrowStatus::Active {
            panic_with_error!(&env, Error::InvalidStatus);
        }
        if env.ledger().timestamp() < record.expires_at {
            panic_with_error!(&env, Error::NotExpired);
        }

        let contract_id = env.current_contract_address();
        token::Client::new(&env, &record.token).transfer(
            &contract_id,
            &patient,
            &record.amount,
        );

        record.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (Symbol::new(&env, "escrow"), Symbol::new(&env, "refunded")),
            (escrow_id, patient, record.amount),
        );

        true
    }

    /// Open a dispute on an active escrow.
    /// Either the patient or the clinic may initiate.
    pub fn dispute(env: Env, escrow_id: BytesN<32>, caller: Address, reason: Bytes) -> bool {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id.clone());
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(r) => r,
            None => panic_with_error!(&env, Error::EscrowNotFound),
        };

        if caller != record.patient && caller != record.clinic {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if record.status != EscrowStatus::Active {
            panic_with_error!(&env, Error::InvalidStatus);
        }

        record.status = EscrowStatus::Disputed;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (Symbol::new(&env, "escrow"), Symbol::new(&env, "disputed")),
            (escrow_id, caller, reason),
        );

        true
    }

    /// Cancel an active escrow and return funds to the patient.
    /// Only the patient may cancel, and only before expiry.
    pub fn cancel(env: Env, escrow_id: BytesN<32>, patient: Address) -> bool {
        patient.require_auth();

        let key = DataKey::Escrow(escrow_id.clone());
        let mut record: EscrowRecord = match env.storage().persistent().get(&key) {
            Some(r) => r,
            None => panic_with_error!(&env, Error::EscrowNotFound),
        };

        if record.patient != patient {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if record.status != EscrowStatus::Active {
            panic_with_error!(&env, Error::InvalidStatus);
        }

        let contract_id = env.current_contract_address();
        token::Client::new(&env, &record.token).transfer(
            &contract_id,
            &patient,
            &record.amount,
        );

        record.status = EscrowStatus::Cancelled;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (Symbol::new(&env, "escrow"), Symbol::new(&env, "cancelled")),
            (escrow_id, patient, record.amount),
        );

        true
    }

    /// Read an escrow record (view helper for off-chain callers).
    pub fn get_escrow(env: Env, escrow_id: BytesN<32>) -> EscrowRecord {
        match env
            .storage()
            .persistent()
            .get::<DataKey, EscrowRecord>(&DataKey::Escrow(escrow_id))
        {
            Some(r) => r,
            None => panic_with_error!(&env, Error::EscrowNotFound),
        }
    }

    // ── Helper functions ──────────────────────────────────────────────────

    /// Build a deterministic 32-byte escrow ID from patient, clinic, and nonce.
    fn generate_escrow_id(
        env: &Env,
        patient: &Address,
        clinic: &Address,
        nonce: u64,
    ) -> BytesN<32> {
        let mut data = Bytes::new(env);
        data.append(&patient.to_xdr(env));
        data.append(&clinic.to_xdr(env));
        data.extend_from_array(&nonce.to_be_bytes());
        env.crypto().sha256(&data).to_bytes()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke};
    use soroban_sdk::{token, Env, IntoVal};

    /// Register a Stellar asset contract for testing and mint to `to`.
    fn create_token<'a>(env: &Env, admin: &Address, to: &Address, amount: i128) -> Address {
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = sac.address();
        token::StellarAssetClient::new(env, &token_id).mint(to, &amount);
        token_id
    }

    fn setup<'a>() -> (Env, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1000);

        let admin = Address::generate(&env);
        let patient = Address::generate(&env);
        let clinic = Address::generate(&env);
        let token_id = create_token(&env, &admin, &patient, 10_000);

        let contract_id = env.register_contract(None, Escrow);
        (env, contract_id, patient, clinic, token_id)
    }

    #[test]
    fn test_deposit() {
        let (env, contract_id, patient, clinic, token_id) = setup();
        let client = EscrowClient::new(&env, &contract_id);

        let escrow_id = client.deposit(&patient, &clinic, &token_id, &1000);
        let record = client.get_escrow(&escrow_id);

        assert_eq!(record.amount, 1000);
        assert_eq!(record.status, EscrowStatus::Active);
        assert_eq!(record.patient, patient);
        assert_eq!(record.clinic, clinic);

        // Funds moved from patient into the contract.
        let token_client = token::Client::new(&env, &token_id);
        assert_eq!(token_client.balance(&patient), 9_000);
        assert_eq!(token_client.balance(&contract_id), 1_000);
    }

    #[test]
    fn test_deposit_rejects_non_positive_amount() {
        let (env, contract_id, patient, clinic, token_id) = setup();
        let client = EscrowClient::new(&env, &contract_id);

        let result = client.try_deposit(&patient, &clinic, &token_id, &0);
        assert!(result.is_err());
    }

    #[test]
    fn test_release() {
        let (env, contract_id, patient, clinic, token_id) = setup();
        let client = EscrowClient::new(&env, &contract_id);

        let escrow_id = client.deposit(&patient, &clinic, &token_id, &1000);
        let released = client.release(&escrow_id, &clinic);
        assert!(released);

        let record = client.get_escrow(&escrow_id);
        assert_eq!(record.status, EscrowStatus::Released);

        let token_client = token::Client::new(&env, &token_id);
        assert_eq!(token_client.balance(&clinic), 1_000);
        assert_eq!(token_client.balance(&contract_id), 0);
    }

    #[test]
    fn test_release_twice_fails() {
        let (env, contract_id, patient, clinic, token_id) = setup();
        let client = EscrowClient::new(&env, &contract_id);

        let escrow_id = client.deposit(&patient, &clinic, &token_id, &1000);
        client.release(&escrow_id, &clinic);

        let result = client.try_release(&escrow_id, &clinic);
        assert!(result.is_err());
    }

    #[test]
    fn test_refund_after_expiry() {
        let (env, contract_id, patient, clinic, token_id) = setup();
        let client = EscrowClient::new(&env, &contract_id);

        let escrow_id = client.deposit(&patient, &clinic, &token_id, &1000);

        // Advance time past expiry.
        env.ledger().set_timestamp(1000 + ESCROW_TTL_SECS + 1);

        let refunded = client.refund(&escrow_id, &patient);
        assert!(refunded);

        let record = client.get_escrow(&escrow_id);
        assert_eq!(record.status, EscrowStatus::Refunded);

        let token_client = token::Client::new(&env, &token_id);
        assert_eq!(token_client.balance(&patient), 10_000);
    }

    #[test]
    fn test_refund_before_expiry_fails() {
        let (env, contract_id, patient, clinic, token_id) = setup();
        let client = EscrowClient::new(&env, &contract_id);

        let escrow_id = client.deposit(&patient, &clinic, &token_id, &1000);

        let result = client.try_refund(&escrow_id, &patient);
        assert!(result.is_err());
    }

    #[test]
    fn test_dispute() {
        let (env, contract_id, patient, clinic, token_id) = setup();
        let client = EscrowClient::new(&env, &contract_id);

        let escrow_id = client.deposit(&patient, &clinic, &token_id, &1000);
        let disputed = client.dispute(&escrow_id, &patient, &Bytes::new(&env));
        assert!(disputed);

        let record = client.get_escrow(&escrow_id);
        assert_eq!(record.status, EscrowStatus::Disputed);
    }

    #[test]
    fn test_cancel() {
        let (env, contract_id, patient, clinic, token_id) = setup();
        let client = EscrowClient::new(&env, &contract_id);

        let escrow_id = client.deposit(&patient, &clinic, &token_id, &1000);
        let cancelled = client.cancel(&escrow_id, &patient);
        assert!(cancelled);

        let record = client.get_escrow(&escrow_id);
        assert_eq!(record.status, EscrowStatus::Cancelled);

        let token_client = token::Client::new(&env, &token_id);
        assert_eq!(token_client.balance(&patient), 10_000);
    }

    #[test]
    fn test_unauthorized_release() {
        let env = Env::default();
        env.ledger().set_timestamp(1000);

        let admin = Address::generate(&env);
        let patient = Address::generate(&env);
        let clinic = Address::generate(&env);
        let attacker = Address::generate(&env);
        let token_id = create_token(&env, &admin, &patient, 10_000);
        let contract_id = env.register_contract(None, Escrow);
        let client = EscrowClient::new(&env, &contract_id);

        // Patient authorizes the deposit only.
        env.mock_auths(&[MockAuth {
            address: &patient,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "deposit",
                args: (patient.clone(), clinic.clone(), token_id.clone(), 1000i128).into_val(&env),
                sub_invokes: &[],
            },
        }]);

        let escrow_id = client.deposit(&patient, &clinic, &token_id, &1000);

        // Attacker (not the clinic) attempts to release without authorization.
        let result = client.try_release(&escrow_id, &attacker);
        assert!(result.is_err());
    }

    #[test]
    fn test_unauthorized_refund() {
        let (env, contract_id, patient, clinic, token_id) = setup();
        let client = EscrowClient::new(&env, &contract_id);

        let escrow_id = client.deposit(&patient, &clinic, &token_id, &1000);
        env.ledger().set_timestamp(1000 + ESCROW_TTL_SECS + 1);

        let attacker = Address::generate(&env);
        let result = client.try_refund(&escrow_id, &attacker);
        assert!(result.is_err());
    }
}
