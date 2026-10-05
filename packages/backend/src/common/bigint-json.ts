declare global {
  interface BigInt {
    toJSON(): string;
  }
}

// Money and byte counters are BIGINT; the public API contract serializes them as decimal strings.
if (typeof (BigInt.prototype as { toJSON?: unknown }).toJSON !== "function") {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    value: function toJSON(this: bigint) {
      return this.toString();
    },
    writable: true,
    configurable: true,
  });
}

export {};
