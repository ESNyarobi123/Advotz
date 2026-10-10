import { beforeAll, afterAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { planFeaturesWithDefaults, type PlanFeatures } from "@advo/contracts";
import { MediaAssetKind, prisma } from "@advo/db";
import { FakeOmadaAdapter } from "@advo/omada";
import { resetTestDatabase } from "../test/db.js";
import { AuthService } from "./auth/auth.service.js";
import { saveController } from "./network/controllers.service.js";
import { startTrial, upsertPlan } from "./subscriptions/subscriptions.service.js";
import { MAX_IMAGE_EDGE, BACKGROUND_MAX_EDGE, readMediaAsset, uploadResellerBackground, uploadResellerLogo } from "./media/media.service.js";

/**
 * The upload path end to end, against the real database.
 *
 * The unit suite proves the optimiser's image quality. This suite proves the
 * *service* rules around it, which are the ones a reseller can actually hit:
 *
 * - the plan gate is enforced in the service, so a locked plan gets a
 *   `FEATURE_LOCKED_BY_PLAN` refusal from the API and not merely a hidden button;
 * - what gets stored is the optimised bytes, never the raw upload, so the
 *   guarantee "a heavy logo cannot slow the portal" holds for every row;
 * - the row that is served is the row that was stored, byte for byte;
 * - re-uploading does not grow the table without bound.
 */

const auth = new AuthService();

/** Features that grant logo upload, and the same plan with it turned off. */
function features(logoUpload: boolean, backgroundUpload = logoUpload): PlanFeatures {
  return planFeaturesWithDefaults({
    branding: { logo_upload: logoUpload, background_upload: backgroundUpload, colors_edit: true, platform_badge_removable: false },
  });
}

/**
 * A photo rather than a mark: noisy gradients are what makes a large JPEG large,
 * so the optimiser's "smaller file, same perceived quality" claim is exercised
 * on the kind of image a reseller actually uploads as a background.
 */
async function heavyPhoto(width = 2400, height = 1600): Promise<Buffer> {
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const noise = ((x * 7919 + y * 104729) % 23) - 11;
      pixels[offset] = Math.max(0, Math.min(255, (x / width) * 255 + noise));
      pixels[offset + 1] = Math.max(0, Math.min(255, (y / height) * 255 + noise));
      pixels[offset + 2] = Math.max(0, Math.min(255, 180 - (x / width) * 120 + noise));
    }
  }
  return sharp(pixels, { raw: { width, height, channels } }).jpeg({ quality: 98 }).toBuffer();
}

/** A realistic heavy logo: flat brand colours and hard edges at 2048 px. */
async function heavyLogo(size = 2048): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#0f62fe"/>
    <circle cx="256" cy="220" r="130" fill="#ffffff"/>
    <rect x="80" y="370" width="352" height="40" rx="20" fill="#ffffff"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 6 }).toBuffer();
}

describe("media upload and serving", () => {
  let adminId: string;
  let seq = 0;

  async function newReseller(n: number): Promise<{ resellerId: string; ownerUserId: string }> {
    const referralCode = `MDIA${n}`;
    await auth.createAgent(adminId, {
      name: `Agent ${referralCode}`,
      email: `agent${referralCode}@advo.test`,
      phone: `+25574${String(n).padStart(7, "0")}`,
      password: "AgentSecure123!",
      referralCode,
    });
    const agent = await prisma.user.findFirstOrThrow({ where: { agent: { referralCode } }, include: { agent: true } });
    const actor = {
      id: agent.id,
      role: "AGENT" as const,
      email: agent.email,
      name: agent.name,
      status: "ACTIVE" as const,
      emailVerifiedAt: null,
      resellerId: null,
      agentId: agent.agent!.id,
      mfaEnabled: false,
      mfaPassed: false,
      sessionId: "test",
    };
    const invite = await auth.createInvitation(actor, {
      businessName: `Media Tenant ${n}`,
      contactName: `Owner ${n}`,
      email: `mediaowner${n}@advo.test`,
      phone: `+25575${String(n).padStart(7, "0")}`,
      consentConfirmed: true,
    });
    const token = (invite as { devInvitationToken?: string }).devInvitationToken!;
    await auth.acceptInvitation({ token, ownerName: `Owner ${n}`, password: "OwnerSecure123!", acceptTerms: true });
    const reseller = await prisma.reseller.findFirstOrThrow({ where: { owner: { email: `mediaowner${n}@advo.test` } } });
    return { resellerId: reseller.id, ownerUserId: reseller.ownerUserId };
  }

  /** A reseller on a fresh plan with the given logo entitlement. */
  async function tenantWithLogo(uploadAllowed: boolean) {
    seq += 1;
    const plan = await upsertPlan(adminId, {
      code: `media-plan-${seq}`,
      name: `Media Plan ${seq}`,
      description: "Media test plan",
      priceTzs: 20_000n,
      periodDays: 30,
      trialEligible: true,
      trialDays: 30,
      lifecycle: "PUBLISHED",
      visibility: "PUBLIC",
      commercialPromise: "standard",
      features: features(uploadAllowed),
      isDemo: true,
    });
    const reseller = await newReseller(seq);
    await startTrial(reseller.resellerId, plan.id, reseller.ownerUserId);
    return reseller;
  }

  beforeAll(async () => {
    await resetTestDatabase();
    FakeOmadaAdapter.resetSharedState();
    const admin = await auth.bootstrapAdmin({ email: "admin@media.test", password: "AdminSecurePass1", name: "Admin" });
    adminId = admin.userId;
    await saveController(adminId, { name: "Simulated", mode: "FAKE", isDefault: true });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("stores the optimised bytes, never the raw upload", async () => {
    const tenant = await tenantWithLogo(true);
    const original = await heavyLogo(2048);

    const uploaded = await uploadResellerLogo(tenant.resellerId, tenant.ownerUserId, {
      buffer: original,
      fileName: "brand.png",
    });

    expect(uploaded.contentType).toBe("image/webp");
    expect(uploaded.originalBytes).toBe(original.length);
    expect(uploaded.byteSize).toBeLessThan(original.length);
    expect(uploaded.savedPercent).toBeGreaterThan(0);
    expect(Math.max(uploaded.width, uploaded.height)).toBe(MAX_IMAGE_EDGE);

    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: uploaded.id } });
    // The stored payload is WebP and is exactly the size that was reported, so the
    // saving cannot be a claim made only in the response.
    expect(asset.kind).toBe(MediaAssetKind.PORTAL_LOGO);
    expect(asset.ownerId).toBe(tenant.resellerId);
    expect(asset.byteSize).toBe(asset.bytes.length);
    expect(asset.byteSize).toBe(uploaded.byteSize);
    // And it is a real, decodable image at the promised dimensions.
    const meta = await sharp(Buffer.from(asset.bytes)).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(uploaded.width);
    expect(meta.height).toBe(uploaded.height);
  });

  it("serves back exactly the stored bytes under a stable, unguessable id", async () => {
    const tenant = await tenantWithLogo(true);
    const uploaded = await uploadResellerLogo(tenant.resellerId, tenant.ownerUserId, { buffer: await heavyLogo() });

    const served = await readMediaAsset(uploaded.id);
    const stored = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: uploaded.id } });
    expect(Buffer.compare(Buffer.from(served.bytes), Buffer.from(stored.bytes))).toBe(0);
    expect(served.contentType).toBe("image/webp");
    expect(served.byteSize).toBe(uploaded.byteSize);
    // A checksum, not a timestamp: it can be an ETag that never changes for a given id.
    expect(served.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a plan that does not grant branding.logo_upload", async () => {
    const tenant = await tenantWithLogo(false);
    await expect(uploadResellerLogo(tenant.resellerId, tenant.ownerUserId, { buffer: await heavyLogo(512) })).rejects.toMatchObject({
      response: { code: "FEATURE_LOCKED_BY_PLAN" },
    });
    // The refusal happens before the encode, so nothing was written.
    expect(await prisma.mediaAsset.count({ where: { ownerId: tenant.resellerId } })).toBe(0);
  });

  it("refuses a reseller with no active subscription at all", async () => {
    seq += 1;
    const reseller = await newReseller(seq);
    await expect(uploadResellerLogo(reseller.resellerId, reseller.ownerUserId, { buffer: await heavyLogo(512) })).rejects.toMatchObject({
      response: { code: "FEATURE_LOCKED_BY_PLAN" },
    });
  });

  it("rejects a bad file before it can be an asset", async () => {
    const tenant = await tenantWithLogo(true);
    await expect(uploadResellerLogo(tenant.resellerId, tenant.ownerUserId, { buffer: Buffer.from("not an image") })).rejects.toThrow(
      /not an image we can read/,
    );
    expect(await prisma.mediaAsset.count({ where: { ownerId: tenant.resellerId } })).toBe(0);
  });

  it("bounds how many logos one reseller can keep", async () => {
    const tenant = await tenantWithLogo(true);
    const keep = 5;

    // One more than the retention window, so exactly one is pruned.
    for (let i = 0; i < keep + 1; i += 1) {
      await uploadResellerLogo(tenant.resellerId, tenant.ownerUserId, { buffer: await heavyLogo(512) });
    }

    const assets = await prisma.mediaAsset.findMany({
      where: { kind: MediaAssetKind.PORTAL_LOGO, ownerType: "RESELLER", ownerId: tenant.resellerId },
      orderBy: { createdAt: "desc" },
    });
    expect(assets.length).toBe(keep);
    // The newest upload is always among the survivors; a reseller can never prune
    // the logo they just set.
    const newest = assets[0]!;
    const served = await readMediaAsset(newest.id);
    expect(served.byteSize).toBeGreaterThan(0);
  });

  it("records the saving in the audit trail", async () => {
    const tenant = await tenantWithLogo(true);
    const original = await heavyLogo(2048);
    const uploaded = await uploadResellerLogo(tenant.resellerId, tenant.ownerUserId, { buffer: original, fileName: "brand.png" });

    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "media.logo_uploaded", targetId: uploaded.id },
    });
    const metadata = event.metadata as { originalBytes: number; byteSize: number };
    expect(metadata.originalBytes).toBe(original.length);
    expect(metadata.byteSize).toBe(uploaded.byteSize);
    expect(event.resellerId).toBe(tenant.resellerId);
  });

  /**
   * The background is the same pipeline with a different gate, box and audit
   * action. These tests exist because the two surfaces share one implementation:
   * if a later change tightens the logo path, the background must not silently
   * keep the old behaviour.
   */
  describe("portal background", () => {
    /** A reseller whose plan grants exactly the two upload surfaces listed. */
    async function tenantWithBackground(logoUpload: boolean, backgroundUpload: boolean) {
      seq += 1;
      const plan = await upsertPlan(adminId, {
        code: `bg-plan-${seq}`,
        name: `Background Plan ${seq}`,
        description: "Background test plan",
        priceTzs: 20_000n,
        periodDays: 30,
        trialEligible: true,
        trialDays: 30,
        lifecycle: "PUBLISHED",
        visibility: "PUBLIC",
        commercialPromise: "standard",
        features: features(logoUpload, backgroundUpload),
        isDemo: true,
      });
      const reseller = await newReseller(seq);
      await startTrial(reseller.resellerId, plan.id, reseller.ownerUserId);
      return reseller;
    }

    it("stores a background in the larger box under its own media kind", async () => {
      const tenant = await tenantWithBackground(true, true);
      const original = await heavyPhoto();

      const uploaded = await uploadResellerBackground(tenant.resellerId, tenant.ownerUserId, {
        buffer: original,
        fileName: "night-city.jpg",
      });

      expect(uploaded.contentType).toBe("image/webp");
      expect(uploaded.byteSize).toBeLessThan(original.length);
      // The background box is wider than the logo box: a full-page photo cropped to
      // 512 px would be visibly soft on a tablet.
      expect(Math.max(uploaded.width, uploaded.height)).toBe(BACKGROUND_MAX_EDGE);
      expect(Math.max(uploaded.width, uploaded.height)).toBeGreaterThan(MAX_IMAGE_EDGE);

      const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: uploaded.id } });
      expect(asset.kind).toBe(MediaAssetKind.PORTAL_BACKGROUND);
      expect(asset.ownerId).toBe(tenant.resellerId);
      expect(asset.byteSize).toBe(asset.bytes.length);
      expect(asset.originalName).toBe("night-city.jpg");

      const served = await readMediaAsset(uploaded.id);
      expect(Buffer.compare(Buffer.from(served.bytes), Buffer.from(asset.bytes))).toBe(0);
    });

    it("refuses a background when the plan grants logos but not backgrounds", async () => {
      const tenant = await tenantWithBackground(true, false);
      await expect(
        uploadResellerBackground(tenant.resellerId, tenant.ownerUserId, { buffer: await heavyPhoto(1200, 800) }),
      ).rejects.toMatchObject({ response: { code: "FEATURE_LOCKED_BY_PLAN" } });
      expect(
        await prisma.mediaAsset.count({
          where: { kind: MediaAssetKind.PORTAL_BACKGROUND, ownerId: tenant.resellerId },
        }),
      ).toBe(0);

      // …and the logo surface on that same plan still works, so the refusal is the
      // background gate firing and not the whole plan being locked.
      await expect(uploadResellerLogo(tenant.resellerId, tenant.ownerUserId, { buffer: await heavyLogo(512) })).resolves.toMatchObject({
        contentType: "image/webp",
      });
    });

    it("never lets a background evict the live logo, or the reverse", async () => {
      const tenant = await tenantWithBackground(true, true);
      const keep = 5;

      // Fill both surfaces past their retention window.
      for (let i = 0; i < keep + 2; i += 1) {
        await uploadResellerLogo(tenant.resellerId, tenant.ownerUserId, { buffer: await heavyLogo(512) });
        await uploadResellerBackground(tenant.resellerId, tenant.ownerUserId, { buffer: await heavyPhoto(1000, 700) });
      }

      const logos = await prisma.mediaAsset.count({
        where: { kind: MediaAssetKind.PORTAL_LOGO, ownerType: "RESELLER", ownerId: tenant.resellerId },
      });
      const backgrounds = await prisma.mediaAsset.count({
        where: { kind: MediaAssetKind.PORTAL_BACKGROUND, ownerType: "RESELLER", ownerId: tenant.resellerId },
      });
      // Scoped per kind: each surface keeps its own five.
      expect(logos).toBe(keep);
      expect(backgrounds).toBe(keep);
    });

    it("records the background saving under its own audit action", async () => {
      const tenant = await tenantWithBackground(true, true);
      const original = await heavyPhoto(1800, 1200);
      const uploaded = await uploadResellerBackground(tenant.resellerId, tenant.ownerUserId, { buffer: original });

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: "media.background_uploaded", targetId: uploaded.id },
      });
      const metadata = event.metadata as { originalBytes: number; byteSize: number };
      expect(metadata.originalBytes).toBe(original.length);
      expect(metadata.byteSize).toBe(uploaded.byteSize);
      expect(event.resellerId).toBe(tenant.resellerId);
    });
  });
});
