import { parsePhoneNumber } from "libphonenumber-js/max";

export function identifyNumber(number, country) {
  const input = String(number ?? "").trim();

  if (!input) {
    return { status: "empty" };
  }

  try {
    const phone = parsePhoneNumber(input, country);

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
