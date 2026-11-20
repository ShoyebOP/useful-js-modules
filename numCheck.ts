import { parsePhoneNumber } from "libphonenumber-js/max";

/** A successfully parsed phone number. */
export interface PhoneNumberSuccess {
  /** Detected ISO 3166-1 alpha-2 country code, or null when it cannot be determined. */
  country: string | null;
  /** Country calling code without the leading "+", e.g. "880". */
  callingCode: string;
  /** Number type, e.g. "MOBILE" or "FIXED_LINE_OR_MOBILE", or null. */
  type: string | null;
  /** Whether the number is valid for its region and type. */
  valid: boolean;
  /** Number formatted in international form. */
  number: string;
}

/** A failed parse. Check `status` to distinguish the failure modes. */
export interface PhoneNumberFailure {
  status: "empty" | "unrecognized" | "invalid_or_unrecognized";
}

export type IdentifyNumberResult = PhoneNumberSuccess | PhoneNumberFailure;

export function identifyNumber(
  number: string | number | null | undefined,
  country?: string,
): IdentifyNumberResult {
  const input = String(number ?? "").trim();

  if (!input) {
    return { status: "empty" };
  }

  try {
    // libphonenumber-js types `defaultCountry` as a CountryCode union; the
    // runtime accepts any string, so keep that behavior with a narrow cast.
    const phone = parsePhoneNumber(
      input,
      country as Parameters<typeof parsePhoneNumber>[1],
    );

    if (!phone) {
      return { status: "unrecognized" };
    }

    return {
      country: phone.country ?? null,
      callingCode: phone.countryCallingCode,
      type: phone.getType() ?? null,
      valid: phone.isValid(),
      number: phone.formatInternational(),
    };
  } catch {
    return { status: "invalid_or_unrecognized" };
  }
}
