import { prisma } from "@advo/db";
import type { PublicHotspotInput } from "@advo/contracts";
import { notFound } from "../../common/errors.js";

/**
 * Curated marketing hotspots for the public "Our Hotspots" page.
 *
 * Admin manages these independently of reseller Site rows so the marketing map
 * never leaks network inventory or unpublished sites.
 */

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  return value;
}

function toAdminRow(row: {
  id: string;
  name: string;
  address: string;
  city: string;
  region: string;
  latitude: { toString(): string } | number;
  longitude: { toString(): string } | number;
  category: string;
  description: string;
  imageUrl: string | null;
  portalSlug: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    region: row.region,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    category: row.category,
    description: row.description,
    imageUrl: row.imageUrl,
    portalSlug: row.portalSlug,
    sortOrder: row.sortOrder,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPublicRow(row: {
  id: string;
  name: string;
  address: string;
  city: string;
  region: string;
  latitude: { toString(): string } | number;
  longitude: { toString(): string } | number;
  category: string;
  description: string;
  imageUrl: string | null;
  portalSlug: string | null;
}) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    region: row.region,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    category: row.category,
    description: row.description,
    imageUrl: row.imageUrl,
    portalSlug: row.portalSlug,
  };
}

function dataFromInput(input: PublicHotspotInput) {
  return {
    name: input.name,
    address: input.address,
    city: input.city,
    region: input.region,
    latitude: input.latitude,
    longitude: input.longitude,
    category: input.category,
    description: input.description,
    imageUrl: emptyToNull(input.imageUrl),
    portalSlug: emptyToNull(input.portalSlug),
    sortOrder: input.sortOrder,
    active: input.active,
  };
}

/** Active hotspots for the public marketing map, cheapest-sort first. */
export async function listPublicHotspots() {
  const rows = await prisma.publicHotspot.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(toPublicRow);
}

/** Full catalog for Admin, including hidden rows. */
export async function listAdminHotspots() {
  const rows = await prisma.publicHotspot.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(toAdminRow);
}

export async function createPublicHotspot(input: PublicHotspotInput) {
  const row = await prisma.publicHotspot.create({ data: dataFromInput(input) });
  return toAdminRow(row);
}

export async function updatePublicHotspot(id: string, input: PublicHotspotInput) {
  const existing = await prisma.publicHotspot.findUnique({ where: { id } });
  if (!existing) notFound("Hotspot not found");
  const row = await prisma.publicHotspot.update({ where: { id }, data: dataFromInput(input) });
  return toAdminRow(row);
}

export async function deletePublicHotspot(id: string) {
  const existing = await prisma.publicHotspot.findUnique({ where: { id } });
  if (!existing) notFound("Hotspot not found");
  await prisma.publicHotspot.delete({ where: { id } });
  return { ok: true };
}
