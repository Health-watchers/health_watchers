/**
 * Root / jailbreak detection (issue #1500).
 *
 * Behaviour is configured at build time with EXPO_PUBLIC_COMPROMISED_DEVICE_POLICY:
 *   warn  (default) — show a one-time warning and continue
 *   block           — refuse to show patient data on the device
 *   off             — skip the check
 *
 * Detection is best effort: a determined attacker can hide root, so this protects users
 * from unknowingly exposing PHI on a compromised device rather than acting as access control.
 */
import { Platform } from 'react-native';
import JailMonkey from 'jail-monkey';

export type CompromisedDevicePolicy = 'warn' | 'block' | 'off';

export interface DeviceIntegrity {
  compromised: boolean;
  reasons: string[];
  policy: CompromisedDevicePolicy;
}

export function getCompromisedDevicePolicy(
  raw = process.env.EXPO_PUBLIC_COMPROMISED_DEVICE_POLICY
): CompromisedDevicePolicy {
  return raw === 'block' || raw === 'off' ? raw : 'warn';
}

export function checkDeviceIntegrity(
  policy: CompromisedDevicePolicy = getCompromisedDevicePolicy()
): DeviceIntegrity {
  if (policy === 'off' || Platform.OS === 'web') {
    return { compromised: false, reasons: [], policy };
  }

  const reasons: string[] = [];
  try {
    if (JailMonkey.isJailBroken()) {
      reasons.push(Platform.OS === 'ios' ? 'jailbroken' : 'rooted');
    }
    // Frida / Xposed style runtime hooking (Android only; always false on iOS)
    if (JailMonkey.hookDetected()) reasons.push('runtime hooking detected');
  } catch {
    // Native module missing (Expo Go) — nothing to report
  }

  return { compromised: reasons.length > 0, reasons, policy };
}
