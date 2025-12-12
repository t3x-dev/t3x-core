import type Ajv from "ajv";
import { isIP } from "net";

type FormatValidator = (value: string) => boolean;

export function registerDefaultFormats(ajv: Ajv): void {
  const validators: Record<string, FormatValidator> = {
    "date-time": value => !Number.isNaN(Date.parse(value)),
    date: value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)),
    time: value => /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?(\.\d+)?(Z|[+-][01]\d:[0-5]\d)?$/.test(value),
    email: value =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254,
    uri: value => {
      try {
        const parsed = new URL(value);
        return Boolean(parsed.protocol && parsed.host);
      } catch {
        return false;
      }
    },
    hostname: value =>
      /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/.test(value),
    ipv4: value => isIP(value) === 4,
    ipv6: value => isIP(value) === 6,
    uuid: value =>
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1345][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
        value,
      ),
  };

  for (const [name, validate] of Object.entries(validators)) {
    ajv.addFormat(name, {
      type: "string",
      validate,
    });
  }
}
