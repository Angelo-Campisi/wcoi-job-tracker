// Sign-in rules that do not need the database, so they can be tested directly.

export type PinCheckResult = "ok" | "wrong" | "locked" | "inactive";

// Same rule as the database (set_user_pin): 4 to 8 digits.
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;

export function isValidPinFormat(pin: string): boolean {
  return /^[0-9]{4,8}$/.test(pin);
}

// Adds one keypad digit, ignoring taps past the longest allowed PIN.
export function addPinDigit(pin: string, digit: string): string {
  if (!/^[0-9]$/.test(digit) || pin.length >= PIN_MAX_LENGTH) return pin;
  return pin + digit;
}

export function removePinDigit(pin: string): string {
  return pin.slice(0, -1);
}

// Plain-language message for each result. Never says whether the name or the PIN
// was the problem beyond what the person already chose on screen.
export function pinResultMessage(result: PinCheckResult, lockoutMinutes: number): string | null {
  switch (result) {
    case "ok":
      return null;
    case "wrong":
      return "That PIN didn't match. Try again.";
    case "locked":
      return `Too many wrong tries. Try again in ${lockoutMinutes} minutes, or ask the office to reset your PIN.`;
    case "inactive":
      return "This sign-in is turned off. Ask the office.";
  }
}

// The Supabase login behind each app user. People never see or type this:
// they sign in with name and PIN, and the server opens the session for them.
export function loginEmailFor(appUserId: string): string {
  return `user-${appUserId}@tablet.wcoi.invalid`;
}

// True when the screen should lock: no taps or typing for the set number of minutes.
// Uses clock time, so a tablet that went to sleep locks as soon as it wakes.
export function isIdle(lastActivityMs: number, nowMs: number, lockMinutes: number): boolean {
  return nowMs - lastActivityMs >= lockMinutes * 60_000;
}
