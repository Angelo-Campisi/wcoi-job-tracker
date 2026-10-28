import { describe, expect, it } from "vitest";
import { addPinDigit, isIdle, isValidPinFormat, loginEmailFor, pinResultMessage, removePinDigit } from "./sign-in";

describe("PIN format", () => {
  it("accepts exactly 6 digits", () => {
    expect(isValidPinFormat("111111")).toBe(true);
    expect(isValidPinFormat("012345")).toBe(true);
  });

  it("refuses too short, too long, or non-digits", () => {
    expect(isValidPinFormat("")).toBe(false);
    expect(isValidPinFormat("1111")).toBe(false);
    expect(isValidPinFormat("1234567")).toBe(false);
    expect(isValidPinFormat("12a456")).toBe(false);
    expect(isValidPinFormat(" 12345")).toBe(false);
  });
});

describe("keypad", () => {
  it("adds digits up to 6", () => {
    expect(addPinDigit("", "1")).toBe("1");
    expect(addPinDigit("12345", "6")).toBe("123456");
    expect(addPinDigit("123456", "7")).toBe("123456");
  });

  it("ignores anything that is not one digit", () => {
    expect(addPinDigit("12", "x")).toBe("12");
    expect(addPinDigit("12", "34")).toBe("12");
  });

  it("deletes the last digit", () => {
    expect(removePinDigit("123")).toBe("12");
    expect(removePinDigit("")).toBe("");
  });
});

describe("messages", () => {
  it("says nothing on success", () => {
    expect(pinResultMessage("ok", 15)).toBeNull();
  });

  it("tells a locked-out person how long to wait", () => {
    expect(pinResultMessage("locked", 15)).toContain("15 minutes");
  });

  it("has a message for every failure", () => {
    expect(pinResultMessage("wrong", 15)).toBeTruthy();
    expect(pinResultMessage("inactive", 15)).toBeTruthy();
    expect(pinResultMessage("paused", 15)).toBeTruthy();
  });
});

describe("login email", () => {
  it("is tied to the app user and can never receive mail", () => {
    const email = loginEmailFor("20000000-0000-4000-8000-0000000000a1");
    expect(email).toBe("user-20000000-0000-4000-8000-0000000000a1@tablet.wcoi.invalid");
  });
});

describe("inactivity lock", () => {
  const minute = 60_000;

  it("stays unlocked before the limit", () => {
    expect(isIdle(0, 5 * minute - 1, 5)).toBe(false);
  });

  it("locks at the limit", () => {
    expect(isIdle(0, 5 * minute, 5)).toBe(true);
  });

  it("locks right away after a long sleep", () => {
    expect(isIdle(0, 60 * minute, 5)).toBe(true);
  });
});
