# Certificate pinning and root/jailbreak detection

The mobile app handles PHI and payment data, so it does not rely on the device trust store
alone. Two controls run at startup in `src/App.tsx`, before any network request is made:

| Control                   | Module                           | Library                               |
| ------------------------- | -------------------------------- | ------------------------------------- |
| SSL public-key pinning    | `src/security/sslPinning.ts`     | `react-native-ssl-public-key-pinning` |
| Root/jailbreak detection  | `src/security/deviceIntegrity.ts`| `jail-monkey`                         |

Both are native modules. They work in EAS development and release builds, but **not in
Expo Go**. Use `eas build --profile development` to test locally.

## SSL public-key pinning

### How it works

The app pins the **Subject Public Key Info (SPKI)** of the API host's certificate, not the
certificate itself. Certificates can be renewed without an app release as long as the key pair
stays the same. Pinning is enforced in the native networking stack (OkHttp on Android,
TrustKit on iOS), so it covers both `fetch` and `axios`.

If the server presents a key that is not in the pin set (for example a proxy using a
user-installed CA, such as mitmproxy, Charles or a corporate TLS inspector), the TLS handshake
fails and the request errors out. The app logs only the hostname that failed, never request
contents.

### Configuration

Pins are injected at build time through EAS secrets (they are public values, but keeping them
out of git lets staging and production differ):

| Variable                             | Required          | Description                                                                 |
| ------------------------------------ | ----------------- | --------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`                | yes               | API base URL. Its hostname is the pinned domain.                            |
| `EXPO_PUBLIC_SSL_PUBLIC_KEY_HASHES`  | release builds    | Comma-separated base64 SHA-256 SPKI hashes: **primary, backup[, …]**.       |
| `EXPO_PUBLIC_SSL_PINS_EXPIRE_ON`     | no                | `yyyy-MM-dd`. After this date pinning is lifted (safety valve for stale apps). |

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SSL_PUBLIC_KEY_HASHES \
  --value "<primary-pin>,<backup-pin>" --type string
```

Release builds **fail closed**: if the pin set is missing, malformed or has fewer than two
distinct pins, the app shows "Secure connection unavailable" and makes no API calls. Development
builds without pins log a warning and continue unpinned, so `localhost` keeps working.

### Generating pins

Primary pin, from the live API certificate:

```bash
HOST=api.healthwatchers.example.com
openssl s_client -connect "$HOST:443" -servername "$HOST" </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

Backup pin, from a **new key pair that is not deployed yet**. Generate it and store the private
key offline (in the secrets vault, not on the servers):

```bash
openssl genrsa -out api-backup-key.pem 2048
openssl rsa -in api-backup-key.pem -pubout -outform der \
  | openssl dgst -sha256 -binary | openssl enc -base64
```

### Pin rotation plan

Every shipped build carries **two** pins, the current key and the backup key, so the server
key can change without stranding installed apps.

1. **Routine certificate renewal (same key).** Renew the certificate with the existing key
   (`openssl req -new -key <current-key>`). The pins don't change and no app release is needed.
2. **Planned key rotation.**
   1. Issue the new certificate using the **backup** key. Installed apps already trust it.
   2. Generate a fresh backup key pair and compute its pin.
   3. Ship an app release whose pin set is `new primary (old backup), new backup`.
   4. Wait until adoption of that release is high enough (watch the minimum supported version
      in store analytics), then retire the old key.
3. **Emergency (key compromised).** Switch the server to the backup key immediately; installed
   apps keep working. Then follow step 2.2 onwards to get back to two pins.
4. **Safety valve.** Set `EXPO_PUBLIC_SSL_PINS_EXPIRE_ON` to a date about 12 months after the
   release date, so an app that never updates eventually stops pinning instead of breaking
   for good. Every release moves the date forward.

Never pin only the leaf key with no backup: iOS (TrustKit) requires at least two pins per
domain, and the app refuses to start with fewer.

### Verifying with mitmproxy (acceptance test)

1. Build a preview build with pins configured: `eas build --profile preview`.
2. Run `mitmproxy` (or `mitmweb`) on a laptop on the same network as the device.
3. On the device, set the Wi-Fi HTTP proxy to the laptop's IP and port `8080`.
4. Open `http://mitm.it` on the device, then install and trust the mitmproxy CA
   (Android: *Settings → Security → Install certificate*; iOS: install the profile, then enable
   it under *Settings → General → About → Certificate Trust Settings*).
5. Open the app and sign in.

**Expected:** every API request fails. mitmproxy shows the TLS handshake being aborted by the
client, and the device log shows `SSL pin validation failed for <api host>`. Removing the proxy
makes requests succeed again.

For comparison, a development build without `EXPO_PUBLIC_SSL_PUBLIC_KEY_HASHES` shows the
decrypted traffic in mitmproxy. That is the situation pinning prevents.

> **iOS development builds:** `expo-dev-client`'s network inspector interferes with pinning.
> Test pinning on a preview/production build, or disable the inspector with
> `expo-build-properties` (`ios.networkInspector: false`).

## Root / jailbreak detection

At startup, `checkDeviceIntegrity()` uses `jail-monkey` to look for root/jailbreak indicators
(su binaries, Magisk, Cydia, writable system paths, test-keys) and, on Android, runtime
hooking frameworks such as Frida or Xposed.

The response is configurable per build with `EXPO_PUBLIC_COMPROMISED_DEVICE_POLICY`:

| Policy            | Behaviour                                                                       |
| ----------------- | ------------------------------------------------------------------------------- |
| `warn` (default)  | One-time alert explaining the risk to the user. The app keeps working.          |
| `block`           | The app shows "Device not supported" and never loads patient data.              |
| `off`             | No check (e.g. internal QA builds on rooted test devices).                      |

The default is `warn` so patients on rooted phones aren't locked out of their own records.
Clinics or deployments with stricter requirements can ship a `block` build.

Root detection is a best-effort signal, not an access control. A determined attacker can hide
root from it. Server-side controls (short-lived tokens, refresh-token rotation, audit logging)
remain the primary defence.
