export function formatPhoneNumber(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10);
}

export function formatZipCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 5);
}

export function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10;
}

export function isValidZipCode(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 5;
}

export function isValidDateFormat(value: string): boolean {
  if (!value) return true;
  const pattern = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
  return pattern.test(value);
}
