// shortcut: matches numbers by their last 10 digits (Indian mobiles), so +91/0 prefixes match; switch to libphonenumber if you call abroad.
export function phoneKey(phone: string) {
  return phone.replace(/\D/g, "").slice(-10);
}
