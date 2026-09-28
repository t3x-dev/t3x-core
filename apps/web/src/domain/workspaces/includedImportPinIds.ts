export interface ImportPinRef {
  id: string;
  type: string;
}

/** Pin IDs currently included as Compose `+` import evidence. */
export function includedImportPinIds(pins: readonly ImportPinRef[]): string[] {
  return pins.filter((pin) => pin.type === 'import').map((pin) => pin.id);
}
