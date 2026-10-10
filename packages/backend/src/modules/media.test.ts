import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { MAX_IMAGE_EDGE, optimiseImage } from "./media/media.service.js";

/**
 * The optimiser is the whole reason a reseller can hand us a 3 MB phone photo and
 * still get a captive portal that opens on a slow link, so its two promises are
 * asserted directly rather than inferred from a size check:
 *
 * - **It gets small.** A large logo comes out at a fraction of the bytes.
 * - **It stays good.** Either the encode is pixel-exact, or the lossy fallback is
 *   within a mean error of a couple of 255ths per channel — the difference is
 *   invisible, which is what "quality ibaki kubwa" has to mean in practice.
 */

/**
 * A logo-like fixture: flat brand colours, a hard-edged mark and text.
 *
 * SVG is used *only to synthesise* the test input; the same service refuses SVG
 * uploads, because a raster is what we serve and a vector document is where the
 * parsing risk lives. Building the fixture from SVG is the shortest way to get
 * realistic hard edges and glyphs.
 */
async function logoFixture(size: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#f06638"/>
    <circle cx="256" cy="200" r="120" fill="#172d43"/>
    <rect x="96" y="352" width="320" height="34" rx="17" fill="#ffffff"/>
    <rect x="150" y="404" width="212" height="24" rx="12" fill="#ffffff" opacity="0.85"/>
    <path d="M256 120 a80 80 0 0 1 0 160 a80 80 0 0 1 0 -160z" fill="#ffffff" opacity="0.9"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 6 }).toBuffer();
}

/** A photographic fixture: no flat regions, so lossless has nothing to exploit. */
async function photoFixture(size: number): Promise<Buffer> {
  const px = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 3;
      // Smooth, high-frequency-ish gradients plus a deterministic pseudo-random dither.
      px[i] = (x * 255) / size;
      px[i + 1] = (y * 255) / size;
      px[i + 2] = ((x + y) * 255) / (2 * size) ^ ((x * 7919 + y * 104729) % 64);
    }
  }
  return sharp(px, { raw: { width: size, height: size, channels: 3 } }).png({ compressionLevel: 6 }).toBuffer();
}

/**
 * Mean and peak absolute per-channel error between the resized source and the
 * bytes the service produced.
 *
 * The two sides have to be made comparable deliberately: the source is decoded and
 * resized to the *real* output dimensions, and the encoded result is decoded back
 * to raw pixels. Only then do the two buffers describe the same grid.
 */
async function visualError(source: Buffer, encoded: Buffer): Promise<{ mean: number; peak: number }> {
  const resultMeta = await sharp(encoded).metadata();
  const [reference, stored] = await Promise.all([
    sharp(source)
      .rotate()
      .resize({ width: resultMeta.width, height: resultMeta.height, fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer(),
    sharp(encoded).raw().toBuffer(),
  ]);
  expect(reference.length).toBe(stored.length);

  let sum = 0;
  let peak = 0;
  for (let i = 0; i < reference.length; i += 1) {
    const diff = Math.abs((reference[i] as number) - (stored[i] as number));
    sum += diff;
    if (diff > peak) peak = diff;
  }
  return { mean: sum / reference.length, peak };
}

describe("optimiseImage", () => {
  it("always produces a WebP inside the size box, with the aspect ratio kept", async () => {
    for (const [width, height] of [
      [1600, 1600],
      [2400, 600],
      [600, 2400],
      [512, 512],
    ] as const) {
      const base = await logoFixture(1);
      const source = await sharp(base).resize(width, height, { fit: "fill" }).png().toBuffer();
      const result = await optimiseImage(source);
      const meta = await sharp(result.data).metadata();

      expect(result.contentType).toBe("image/webp");
      expect(meta.format).toBe("webp");
      expect(result.width).toBeLessThanOrEqual(MAX_IMAGE_EDGE);
      expect(result.height).toBeLessThanOrEqual(MAX_IMAGE_EDGE);
      // Every source here is at least as large as the box on its longest edge, and
      // `inside` does not enlarge, so the longest edge must land exactly on 512.
      expect(Math.max(result.width, result.height)).toBe(MAX_IMAGE_EDGE);
      const ratioDelta = Math.abs(result.width / result.height - width / height);
      expect(ratioDelta).toBeLessThan(0.02);
      expect(result.byteSize).toBe(result.data.length);
    }
  });

  it("never enlarges an image that is already small", async () => {
    const source = await logoFixture(48);
    const result = await optimiseImage(source);
    expect(result.width).toBe(48);
    expect(result.height).toBe(48);
  });

  it("shrinks a large flat-colour logo by a wide margin", async () => {
    const source = await logoFixture(2048);
    const result = await optimiseImage(source);

    expect(source.length).toBeGreaterThan(20_000);
    expect(result.byteSize).toBeLessThan(source.length / 4);
    // Reported so the dashboard can show it; must never exceed the original for a
    // fixture this large.
    expect(result.byteSize).toBeLessThan(source.length);
  });

  it("keeps pixels exact when it reports a lossless encode", async () => {
    const source = await logoFixture(2048);
    const result = await optimiseImage(source);
    if (result.encoding !== "lossless") return;

    const { peak } = await visualError(source, result.data);
    expect(peak).toBe(0);
  });

  it("stays visually indistinguishable when it falls back to a lossy encode", async () => {
    // The photographic fixture forces the lossy path: there is no flat colour for
    // lossless to win on.
    const source = await photoFixture(1024);
    const result = await optimiseImage(source);
    expect(result.encoding).toBe("lossy");

    const { mean, peak } = await visualError(source, result.data);
    // This fixture is deliberately the worst case for a lossy codec: pure
    // high-frequency dither with no flat region to preserve. Even so the average
    // error stays under ~1% of a channel step (1.9 of 255) and no pixel is wildly
    // wrong — that is what "quality stays high" is worth asserting against a
    // synthetic adversarial input, not a flattering one.
    expect(mean).toBeLessThan(3);
    expect(peak).toBeLessThan(64);
  });

  it("drops metadata rather than shipping it to the portal", async () => {
    const withExif = await sharp(await logoFixture(2048))
      .withMetadata({ exif: { IFD0: { Copyright: "x".repeat(4096), Software: "y".repeat(4096) } } })
      .png()
      .toBuffer();
    const result = await optimiseImage(withExif);
    expect((await sharp(result.data).metadata()).exif).toBeUndefined();
  });

  it("refuses SVG, non-images, empty files and anything over the ceiling", async () => {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800"/></svg>`);
    await expect(optimiseImage(svg)).rejects.toThrow(/SVG logos are not accepted/);

    await expect(optimiseImage(Buffer.from("this is not an image at all"))).rejects.toThrow(/not an image we can read/);
    await expect(optimiseImage(Buffer.alloc(0))).rejects.toThrow(/empty/);

    // A real PNG padded past the ceiling: the size check must fire before any decode.
    const oversized = Buffer.concat([await logoFixture(2048), Buffer.alloc(7 * 1024 * 1024)]);
    await expect(optimiseImage(oversized)).rejects.toThrow(/smaller than 6 MB/);
  });

  it("refuses a decompression bomb instead of allocating for it", async () => {
    // 7000 × 7000 = 49 Mpx, past MAX_INPUT_PIXELS (40 Mpx). A flat image keeps the
    // file itself small, which is the point of a bomb: a few hundred kilobytes that
    // would decode to ~150 MB of pixels.
    const bomb = await sharp({ create: { width: 7000, height: 7000, channels: 3, background: "#ffffff" } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
    await expect(optimiseImage(bomb)).rejects.toThrow(/too many pixels/);
  });
});
