import { z } from "zod";
import {
  packageCardLayoutSchema,
  packageCardStyleSchema,
  visibilityPreferencesSchema,
} from "./features.js";

/**
 * The reseller designer's live-preview handshake.
 *
 * The designer embeds the *real* guest portal in an `iframe` rather than drawing
 * its own approximation, so the two can never drift. The cost is that the frame
 * renders the **saved** design: while a reseller drags a colour or drops in a
 * background photo, the phone still shows yesterday's page. That reads as the
 * customisation not working, which is exactly how it was reported.
 *
 * This message closes that gap. The designer posts its **draft** appearance and
 * the portal paints it over the saved theme — visually only, and only inside
 * `?preview=1`. Nothing here is persisted, so a preview can never publish a
 * change the reseller has not saved.
 *
 * Every field is optional and means "leave the saved value alone" when absent:
 * the portal remains authoritative for anything the frame does not send, and a
 * plan that forbids a control simply never sends it.
 */
export const PORTAL_PREVIEW_MESSAGE = "advo:portal-preview";
/**
 * Sent by the frame once it is listening.
 *
 * A `postMessage` that arrives before the frame has mounted is dropped, and the
 * reseller's first colour change would be the one that appears to do nothing.
 * The designer answers this by re-sending the draft, so ordering stops mattering.
 */
export const PORTAL_PREVIEW_READY = "advo:portal-preview-ready";

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1b5ea4");

/**
 * A relative `/media/...` path or an absolute `http(s)` URL.
 *
 * Deliberately narrow: this string is fanned out into a CSS `url()` by the
 * portal, so `data:`, `javascript:` and friends are refused at the door rather
 * than relied on not to do anything there.
 */
const previewImageUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(16384)
  .regex(/^(\/|https?:\/\/|blob:|data:image\/)/, "Use a relative path, http(s) URL, blob URL, or data image URI");

export const portalPreviewAppearanceSchema = z
  .object({
    /** The brand colours, posted only where the plan lets the reseller edit them. */
    colors: z
      .object({
        primary: hexColorSchema.optional(),
        accent: hexColorSchema.optional(),
        /** The page colour behind the cards. */
        background: hexColorSchema.optional(),
        preset: z.string().trim().max(24).optional(),
      })
      .strict()
      .optional(),
    /** `null` clears the saved photo; absent leaves it alone. */
    backgroundUrl: previewImageUrlSchema.nullable().optional(),
    /** `null` clears the saved logo; absent leaves it alone. */
    logoUrl: previewImageUrlSchema.nullable().optional(),
    cardStyle: packageCardStyleSchema.optional(),
    cardLayout: packageCardLayoutSchema.optional(),
    showPlatformBadge: z.boolean().optional(),
    visibility: visibilityPreferencesSchema.optional(),
    defaultLocale: z.enum(["en", "sw"]).optional(),
  })
  .strict();

export type PortalPreviewAppearance = z.infer<
  typeof portalPreviewAppearanceSchema
>;

export const portalPreviewMessageSchema = z
  .object({
    type: z.literal(PORTAL_PREVIEW_MESSAGE),
    appearance: portalPreviewAppearanceSchema,
  })
  .strict();

export type PortalPreviewMessage = z.infer<typeof portalPreviewMessageSchema>;
