-- AlterEnum
-- Admin-authored cover images for the guest Explore feed and the public
-- "Our Hotspots" cards. Both are optimised by the media service exactly like a
-- campaign creative; they get their own kinds so each surface prunes its own
-- unreferenced uploads instead of sharing one bucket with ad creatives.
ALTER TYPE "media_asset_kind" ADD VALUE 'LISTING_IMAGE';
ALTER TYPE "media_asset_kind" ADD VALUE 'PUBLIC_HOTSPOT_IMAGE';
