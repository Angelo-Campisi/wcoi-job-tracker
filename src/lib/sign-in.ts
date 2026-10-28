// Sign-in rules that do not need the database, so they can be tested directly.

export type PinCheckResult = "ok" | "wrong" | "locked" | "paused" | "inactive";

// Same rule as the database (set_user_pin): exactly 6 digits, unique per person.
export const PIN_LENGTH = 6;

export function isValidPinFormat(pin: string): boolean {
  return /^[0-9]{6}$/.test(pin);
}

// Adds one keypad digit, ignoring taps once the PIN is complete.
export function addPinDigit(pin: string, digit: string): string {
  if (!/^[0-9]$/.test(digit) || pin.length >= PIN_LENGTH) return pin;
  return pin + digit;
}

export function removePinDigit(pin: string): string {
  return pin.slice(0, -1);
}

// Plain-language message for each result.
export function pinResultMessage(result: PinCheckResult, lockoutMinutes: number): string | null {
  switch (result) {
    case "ok":
      return null;
    case "wrong":
      return "That PIN didn't match anyone. Try again.";
    case "locked":
      return `Too many wrong tries on this tablet. Wait ${lockoutMinutes} minutes, then try again.`;
    case "paused":
      return "Sign-in is paused for a while because of too many wrong PINs. Call the office.";
    case "inactive":
      return "This sign-in is turned off. Ask the office.";
  }
}

// The Supabase login behind each app user. People never see or type this:
// they sign in with a PIN, and the server opens the session for them.
export function loginEmailFor(appUserId: string): string {
  return `user-${appUserId}@tablet.wcoi.invalid`;
}

// True when the screen should lock: no taps or typing for the set number of minutes.
// Uses clock time, so a tablet that went to sleep locks as soon as it wakes.
export function isIdle(lastActivityMs: number, nowMs: number, lockMinutes: number): boolean {
  return nowMs - lastActivityMs >= lockMinutes * 60_000;
}
