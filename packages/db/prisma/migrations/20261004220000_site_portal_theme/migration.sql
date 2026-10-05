-- Captive portal theme.
-- Resellers design their guest WiFi page (colors, radius, button style) in the
-- Captive Portal designer; the shape is validated by `portalThemeSchema` in
-- @advo/contracts and read by the portal app to style the guest page.
ALTER TABLE "Site" ADD COLUMN "portalTheme" JSONB;
