import { Controller, Get, Param, Res } from "@nestjs/common";
import { uuidSchema } from "@advo/contracts";
import { parse, type HttpReply } from "../../common/http.js";
import { readMediaAsset } from "./media.service.js";

/**
 * Public read access to uploaded images.
 *
 * No guard and no session: this route is fetched by the guest captive portal,
 * which runs before anyone has authenticated, from a phone that may be on a
 * 2 Mbps link. Two things follow from that and are the whole design of this file:
 *
 * 1. **The bytes are already optimised at upload time.** Nothing is resized or
 *    re-encoded per request, so serving is a single indexed row read. Resizing on
 *    the read path would put a CPU-bound operation in front of the one endpoint
 *    we cannot afford to be slow.
 * 2. **The response is immutable and cached at the edge.** An asset id never
 *    changes meaning — a replacement logo is a new row with a new id — so the
 *    browser can keep it for a year and a re-upload is picked up instantly by
 *    being a different URL. That is why `logo_url` is stored as an absolute URL
 *    rather than a mutable "current logo" pointer.
 */
@Controller("media")
export class MediaController {
  @Get(":id")
  async serve(@Param("id") assetId: string, @Res() res: HttpReply) {
    const asset = await readMediaAsset(parse(uuidSchema, assetId));

    res
      .header("Content-Type", asset.contentType)
      .header("Content-Length", String(asset.byteSize))
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .header("ETag", `"${asset.checksum}"`)
      // A logo is decorative: it must never block the portal from painting.
      .header("Cross-Origin-Resource-Policy", "cross-origin")
      // Prisma hands `Bytes` back as a `Uint8Array`; `Buffer.from` gives Fastify the
      // `Buffer` it writes without a copy into a stream wrapper.
      .send(Buffer.from(asset.bytes));
  }
}
