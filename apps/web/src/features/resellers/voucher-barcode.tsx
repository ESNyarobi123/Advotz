"use client";

/**
 * Barcode for voucher cards.
 *
 * Six-digit (and other numeric) codes use Interleaved 2 of 5 — compact and
 * scannable. Legacy alphanumeric codes fall back to a Code 128B-style encoding.
 */

const ITF_PATTERNS = [
  "00110",
  "10001",
  "01001",
  "11000",
  "00101",
  "10100",
  "01100",
  "00011",
  "10010",
  "01010",
] as const;

function encodeItfWidths(payload: string): Array<{ kind: "bar" | "space"; wide: boolean }> {
  const out: Array<{ kind: "bar" | "space"; wide: boolean }> = [
    { kind: "bar", wide: false },
    { kind: "space", wide: false },
    { kind: "bar", wide: false },
    { kind: "space", wide: false },
  ];
  for (let i = 0; i < payload.length; i += 2) {
    const bars = ITF_PATTERNS[Number(payload[i])]!;
    const spaces = ITF_PATTERNS[Number(payload[i + 1])]!;
    for (let j = 0; j < 5; j++) {
      out.push({ kind: "bar", wide: bars[j] === "1" });
      out.push({ kind: "space", wide: spaces[j] === "1" });
    }
  }
  // Stop
  out.push({ kind: "bar", wide: true }, { kind: "space", wide: false }, { kind: "bar", wide: false });
  return out;
}

/** Simple Code 128B bitstring for alphanumeric legacy codes. */
const C128 = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
  "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
  "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
  "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
  "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
  "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
  "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
  "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
  "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
  "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
  "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
  "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
  "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
  "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
  "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
  "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
  "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
  "10111101110", "11101011110", "11101011110", "11010000100", "11010010000",
  "11010011100", "1100011101011",
];

function encodeCode128Bits(text: string): string {
  const startB = 104;
  let bits = C128[startB]!;
  let sum = startB;
  for (let i = 0; i < text.length; i++) {
    const v = Math.max(0, Math.min(94, text.charCodeAt(i) - 32));
    bits += C128[v]!;
    sum += v * (i + 1);
  }
  bits += C128[sum % 103]!;
  bits += C128[106]!;
  return bits;
}

function modulesFromCode(code: string): Array<{ black: boolean; width: number }> {
  const cleaned = code.replace(/[^0-9A-Za-z]/g, "") || "0";
  if (/^\d+$/.test(cleaned)) {
    let digits = cleaned;
    if (digits.length % 2 === 1) digits = `0${digits}`;
    const widths = encodeItfWidths(digits);
    return widths.map((w) => ({
      black: w.kind === "bar",
      width: w.wide ? 2.4 : 1.1,
    }));
  }
  const bits = encodeCode128Bits(cleaned);
  return bits.split("").map((b) => ({ black: b === "1", width: 1.3 }));
}

/** Renders a barcode for the voucher code. */
export function VoucherBarcode({
  code,
  className,
  height = 36,
}: {
  code: string;
  className?: string;
  height?: number;
}) {
  const modules = modulesFromCode(code);
  const total = modules.reduce((sum, m) => sum + m.width, 0);
  let x = 0;

  return (
    <svg
      aria-hidden="true"
      className={className}
      height={height}
      role="img"
      viewBox={`0 0 ${total} ${height}`}
      width="100%"
      preserveAspectRatio="none"
    >
      <rect fill="#fff" height={height} width={total} x={0} y={0} />
      {modules.map((m, i) => {
        const rect =
          m.black ? (
            <rect fill="#0f172a" height={height} key={i} width={m.width} x={x} y={0} />
          ) : null;
        x += m.width;
        return rect;
      })}
    </svg>
  );
}

/** SVG markup for the printable PDF sheet. */
export function voucherBarcodeSvgMarkup(code: string, height = 40): string {
  const modules = modulesFromCode(code);
  const total = modules.reduce((sum, m) => sum + m.width, 0);
  let x = 0;
  const bars = modules
    .map((m) => {
      const rect = m.black
        ? `<rect x="${x.toFixed(2)}" y="0" width="${m.width}" height="${height}" fill="#0f172a"/>`
        : "";
      x += m.width;
      return rect;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${height}" viewBox="0 0 ${total} ${height}" preserveAspectRatio="none"><rect width="${total}" height="${height}" fill="#fff"/>${bars}</svg>`;
}
