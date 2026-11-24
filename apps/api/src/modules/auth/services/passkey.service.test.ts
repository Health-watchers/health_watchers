jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  generateAuthenticationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
}));
jest.mock('../models/passkey.model', () => ({
  PasskeyModel: { find: jest.fn(), findOne: jest.fn(), create: jest.fn() },
}));
jest.mock('../models/webauthn-challenge.model', () => ({
  WebAuthnChallengeModel: { create: jest.fn(), findOneAndDelete: jest.fn() },
}));

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { PasskeyModel } from '../models/passkey.model';
import { WebAuthnChallengeModel } from '../models/webauthn-challenge.model';
import {
  createAuthenticationOptions,
  createRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from './passkey.service';

const USER_ID = '507f1f77bcf86cd799439022';
const future = () => new Date(Date.now() + 60_000);

const assertion = { id: 'cred-1', rawId: 'cred-1', type: 'public-key', response: {} } as any;

function selectable<T>(value: T) {
  return { select: jest.fn().mockResolvedValue(value) };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WEBAUTHN_RP_ID = 'clinic.example.com';
  process.env.WEBAUTHN_ORIGIN = 'https://clinic.example.com, https://staging.clinic.example.com';
});

describe('createRegistrationOptions', () => {
  it('requires user verification, excludes existing credentials and stores the challenge', async () => {
    (PasskeyModel.find as jest.Mock).mockReturnValue(
      selectable([{ credentialId: 'existing', transports: ['internal'] }])
    );
    (generateRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'reg-challenge' });

    const { challengeId, options } = await createRegistrationOptions({
      id: USER_ID,
      email: 'doc@clinic.com',
      fullName: 'Dr. Grey',
    });

    expect(options).toEqual({ challenge: 'reg-challenge' });
    expect(generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: 'clinic.example.com',
        userName: 'doc@clinic.com',
        excludeCredentials: [{ id: 'existing', transports: ['internal'] }],
        authenticatorSelection: expect.objectContaining({ userVerification: 'required' }),
      })
    );
    expect(WebAuthnChallengeModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeId,
        challenge: 'reg-challenge',
        ceremony: 'registration',
        userId: USER_ID,
      })
    );
  });
});

describe('verifyRegistration', () => {
  it('rejects a challenge issued to another user', async () => {
    (WebAuthnChallengeModel.findOneAndDelete as jest.Mock).mockResolvedValue({
      challenge: 'c',
      userId: 'someone-else',
      expiresAt: future(),
    });

    const result = await verifyRegistration({
      userId: USER_ID,
      challengeId: 'id',
      response: assertion,
      name: 'Laptop',
    });

    expect(result).toBeNull();
    expect(verifyRegistrationResponse).not.toHaveBeenCalled();
  });

  it('rejects an expired challenge', async () => {
    (WebAuthnChallengeModel.findOneAndDelete as jest.Mock).mockResolvedValue({
      challenge: 'c',
      userId: USER_ID,
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await verifyRegistration({
      userId: USER_ID,
      challengeId: 'id',
      response: assertion,
      name: 'Laptop',
    });

    expect(result).toBeNull();
  });

  it('persists a verified credential with its public key base64url-encoded', async () => {
    (WebAuthnChallengeModel.findOneAndDelete as jest.Mock).mockResolvedValue({
      challenge: 'c',
      userId: USER_ID,
      expiresAt: future(),
    });
    (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-1',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['internal', 'hybrid'],
        },
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
      },
    });
    (PasskeyModel.create as jest.Mock).mockImplementation(async (doc) => ({
      toObject: () => ({ _id: 'pk', ...doc }),
    }));

    const result = await verifyRegistration({
      userId: USER_ID,
      challengeId: 'id',
      response: assertion,
      name: 'Laptop',
    });

    expect(verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'c',
        expectedOrigin: ['https://clinic.example.com', 'https://staging.clinic.example.com'],
        expectedRPID: 'clinic.example.com',
        requireUserVerification: true,
      })
    );
    expect(result).toMatchObject({
      credentialId: 'cred-1',
      publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
      deviceType: 'multiDevice',
      backedUp: true,
      name: 'Laptop',
    });
  });

  it('returns null when the library throws on a malformed response', async () => {
    (WebAuthnChallengeModel.findOneAndDelete as jest.Mock).mockResolvedValue({
      challenge: 'c',
      userId: USER_ID,
      expiresAt: future(),
    });
    (verifyRegistrationResponse as jest.Mock).mockRejectedValue(new Error('bad attestation'));

    const result = await verifyRegistration({
      userId: USER_ID,
      challengeId: 'id',
      response: assertion,
      name: 'Laptop',
    });

    expect(result).toBeNull();
    expect(PasskeyModel.create).not.toHaveBeenCalled();
  });
});

describe('createAuthenticationOptions', () => {
  it('omits allowCredentials for a usernameless sign-in', async () => {
    (generateAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'auth' });

    await createAuthenticationOptions();

    expect(PasskeyModel.find).not.toHaveBeenCalled();
    expect(generateAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({ allowCredentials: undefined, userVerification: 'required' })
    );
  });

  it("restricts allowCredentials to the user's passkeys for a second-factor challenge", async () => {
    (PasskeyModel.find as jest.Mock).mockReturnValue(
      selectable([{ credentialId: 'cred-1', transports: ['usb'] }])
    );
    (generateAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'auth' });

    await createAuthenticationOptions(USER_ID);

    expect(generateAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({ allowCredentials: [{ id: 'cred-1', transports: ['usb'] }] })
    );
    expect(WebAuthnChallengeModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ ceremony: 'authentication', userId: USER_ID })
    );
  });
});

describe('verifyAuthentication', () => {
  function storedPasskey(overrides: Record<string, unknown> = {}) {
    return {
      _id: 'pk-1',
      userId: USER_ID,
      credentialId: 'cred-1',
      publicKey: Buffer.from([9, 9]).toString('base64url'),
      counter: 4,
      transports: ['internal'],
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it('consumes the challenge so it cannot be replayed', async () => {
    (WebAuthnChallengeModel.findOneAndDelete as jest.Mock).mockResolvedValue(null);

    const result = await verifyAuthentication({ challengeId: 'used', response: assertion });

    expect(WebAuthnChallengeModel.findOneAndDelete).toHaveBeenCalledWith({
      challengeId: 'used',
      ceremony: 'authentication',
    });
    expect(result).toBeNull();
  });

  it("rejects another user's passkey on a user-scoped challenge", async () => {
    (WebAuthnChallengeModel.findOneAndDelete as jest.Mock).mockResolvedValue({
      challenge: 'c',
      userId: USER_ID,
      expiresAt: future(),
    });
    (PasskeyModel.findOne as jest.Mock).mockResolvedValue(
      storedPasskey({ userId: '507f1f77bcf86cd799439099' })
    );

    const result = await verifyAuthentication({ challengeId: 'id', response: assertion });

    expect(result).toBeNull();
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it('updates the signature counter and last-used time on success', async () => {
    const passkey = storedPasskey();
    (WebAuthnChallengeModel.findOneAndDelete as jest.Mock).mockResolvedValue({
      challenge: 'c',
      expiresAt: future(),
    });
    (PasskeyModel.findOne as jest.Mock).mockResolvedValue(passkey);
    (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 5 },
    });

    const result = await verifyAuthentication({ challengeId: 'id', response: assertion });

    expect(result).toEqual({ userId: USER_ID, passkeyId: 'pk-1' });
    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        requireUserVerification: true,
        credential: expect.objectContaining({ id: 'cred-1', counter: 4 }),
      })
    );
    expect(passkey.counter).toBe(5);
    expect(passkey.save).toHaveBeenCalled();
  });

  it('returns null when the signature does not verify', async () => {
    const passkey = storedPasskey();
    (WebAuthnChallengeModel.findOneAndDelete as jest.Mock).mockResolvedValue({
      challenge: 'c',
      expiresAt: future(),
    });
    (PasskeyModel.findOne as jest.Mock).mockResolvedValue(passkey);
    (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({ verified: false });

    const result = await verifyAuthentication({ challengeId: 'id', response: assertion });

    expect(result).toBeNull();
    expect(passkey.save).not.toHaveBeenCalled();
  });
});
