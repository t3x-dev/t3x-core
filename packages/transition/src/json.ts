import type { ProtocolValue } from './contracts';
import { NonCanonicalValueError, SchemaInvalidError } from './errors';

const textDecoder = new TextDecoder('utf-8', { fatal: true });

function assertDecodedUnicode(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new NonCanonicalValueError('String contains an unpaired high surrogate', path);
      }
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      throw new NonCanonicalValueError('String contains an unpaired low surrogate', path);
    }
  }
}

class StrictJsonParser {
  private position = 0;

  constructor(private readonly source: string) {}

  parse(): ProtocolValue {
    this.skipWhitespace();
    const value = this.parseValue('$');
    this.skipWhitespace();
    if (this.position !== this.source.length) this.fail('Unexpected trailing input', '$');
    return value;
  }

  private parseValue(path: string): ProtocolValue {
    const character = this.source[this.position];
    if (character === '"') return this.parseString(path);
    if (character === '{') return this.parseObject(path);
    if (character === '[') return this.parseArray(path);
    if (character === 't') return this.parseLiteral('true', true, path);
    if (character === 'f') return this.parseLiteral('false', false, path);
    if (character === 'n') return this.parseLiteral('null', null, path);
    if (character === '-' || (character !== undefined && character >= '0' && character <= '9')) {
      return this.parseNumber(path);
    }
    return this.fail('Expected a JSON value', path);
  }

  private parseObject(path: string): { [key: string]: ProtocolValue } {
    this.position += 1;
    this.skipWhitespace();
    const result: { [key: string]: ProtocolValue } = {};
    const keys = new Set<string>();

    if (this.consume('}')) return result;

    while (true) {
      if (this.source[this.position] !== '"') this.fail('Expected an object key', path);
      const key = this.parseString(`${path} key`);
      if (keys.has(key)) this.fail(`Duplicate object key ${JSON.stringify(key)}`, path);
      keys.add(key);
      this.skipWhitespace();
      if (!this.consume(':')) this.fail('Expected a colon after an object key', path);
      this.skipWhitespace();
      const value = this.parseValue(`${path}.${key}`);
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
      this.skipWhitespace();
      if (this.consume('}')) return result;
      if (!this.consume(',')) this.fail('Expected a comma between object entries', path);
      this.skipWhitespace();
    }
  }

  private parseArray(path: string): ProtocolValue[] {
    this.position += 1;
    this.skipWhitespace();
    const result: ProtocolValue[] = [];
    if (this.consume(']')) return result;

    while (true) {
      result.push(this.parseValue(`${path}[${result.length}]`));
      this.skipWhitespace();
      if (this.consume(']')) return result;
      if (!this.consume(',')) this.fail('Expected a comma between array entries', path);
      this.skipWhitespace();
    }
  }

  private parseString(path: string): string {
    const start = this.position;
    this.position += 1;

    while (this.position < this.source.length) {
      const code = this.source.charCodeAt(this.position);
      if (code === 0x22) {
        this.position += 1;
        let value: string;
        try {
          value = JSON.parse(this.source.slice(start, this.position)) as string;
        } catch {
          return this.fail('Invalid JSON string', path);
        }
        assertDecodedUnicode(value, path);
        return value;
      }
      if (code < 0x20) this.fail('Unescaped control character in JSON string', path);
      if (code === 0x5c) {
        this.position += 1;
        const escapeCode = this.source[this.position];
        if (escapeCode === 'u') {
          const digits = this.source.slice(this.position + 1, this.position + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(digits)) this.fail('Invalid Unicode escape', path);
          this.position += 5;
          continue;
        }
        if (escapeCode === undefined || !'"\\/bfnrt'.includes(escapeCode)) {
          this.fail('Invalid JSON escape', path);
        }
      }
      this.position += 1;
    }

    return this.fail('Unterminated JSON string', path);
  }

  private parseNumber(path: string): number {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
      this.source.slice(this.position)
    );
    if (match === null) return this.fail('Invalid JSON number', path);
    this.position += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) {
      throw new NonCanonicalValueError('Numbers must be finite I-JSON values', path);
    }
    return value;
  }

  private parseLiteral<T extends boolean | null>(literal: string, value: T, path: string): T {
    if (this.source.slice(this.position, this.position + literal.length) !== literal) {
      return this.fail(`Invalid JSON literal; expected ${literal}`, path);
    }
    this.position += literal.length;
    return value;
  }

  private skipWhitespace(): void {
    while (' \n\r\t'.includes(this.source[this.position] ?? 'x')) this.position += 1;
  }

  private consume(character: string): boolean {
    if (this.source[this.position] !== character) return false;
    this.position += 1;
    return true;
  }

  private fail(message: string, path: string): never {
    throw new SchemaInvalidError(`${message} at input offset ${this.position}`, path);
  }
}

/** Parse UTF-8 JSON without losing duplicate-key or malformed-Unicode evidence. */
export function parseProtocolJson(bytes: Uint8Array | string): ProtocolValue {
  let source: string;
  try {
    source = typeof bytes === 'string' ? bytes : textDecoder.decode(bytes);
  } catch {
    throw new SchemaInvalidError('Protocol bytes are not valid UTF-8');
  }
  return new StrictJsonParser(source).parse();
}
