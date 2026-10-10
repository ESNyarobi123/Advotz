import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.resolve(process.cwd(), "../..");

/**
 * Workspace packages whose relative imports carry the ESM `.js` extension even
 * though the file on disk is TypeScript.
 *
 * `@advo/contracts` is authored for Node (`moduleResolution: NodeNext`), which
 * requires `./features.js` in `index.ts`. The backend, `tsx` and the integration
 * tests all compile it that way, so the source cannot drop the extension. Both
 * Next.js apps, however, compile that package straight from source
 * (`transpilePackages`), and webpack will not accept a `.js` specifier for a
 * `.ts` file — the route dies with:
 *
 *     Module not found: Can't resolve './features.js'
 *
 * The bundler therefore needs the same substitution NodeNext performs. It is
 * applied only to specifiers issued from inside these directories: a global
 * `resolve.extensionAlias` would add a `.ts` probe to *every* `.js` request in
 * the graph, including all of `node_modules`.
 */
const TYPESCRIPT_SOURCE_DIRS = [path.resolve(repoRoot, "packages/contracts/src")];

type ResolverRequest = {
  request?: unknown;
  context?: { issuer?: unknown } | null;
};

type ResolveCallback = (error?: Error | null, result?: unknown) => void;

/** The slice of webpack's `enhanced-resolve` surface this plugin uses. */
type ResolverLike = {
  ensureHook: (name: string) => unknown;
  getHook: (name: string) => {
    tapAsync: (
      name: string,
      handler: (request: ResolverRequest, context: unknown, callback: ResolveCallback) => void,
    ) => void;
  };
  doResolve: (
    hook: unknown,
    request: ResolverRequest,
    message: string,
    context: unknown,
    callback: ResolveCallback,
  ) => void;
};

/** Rewrites `./x.js` to `./x` when only `x.ts`/`x.tsx` exists beside the issuer. */
function typescriptSourceJsResolution() {
  return {
    apply(resolver: ResolverLike) {
      const resolveHook = resolver.ensureHook("resolve");
      resolver.getHook("described-resolve").tapAsync("AdvoTypeScriptSourceJs", (request, context, callback) => {
        const specifier = request.request;
        const issuer = request.context?.issuer;

        if (typeof specifier !== "string" || typeof issuer !== "string") return callback();
        if (!specifier.startsWith(".") || !specifier.endsWith(".js")) return callback();
        if (!TYPESCRIPT_SOURCE_DIRS.some((dir) => issuer.startsWith(`${dir}${path.sep}`))) return callback();
        // A real sibling `.js` file always wins; only the TypeScript case is rewritten.
        if (existsSync(path.resolve(path.dirname(issuer), specifier))) return callback();

        return resolver.doResolve(
          resolveHook,
          { ...request, request: specifier.slice(0, -".js".length) },
          "advo: strip .js from a TypeScript source specifier",
          context,
          callback,
        );
      });
    },
  };
}

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@advo/ui", "@advo/contracts", "@advo/i18n", "@advo/api-client"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  webpack(config) {
    // `resolve.plugins` is typed for webpack plugins (`apply(compiler)`), while
    // this is an `enhanced-resolve` resolver plugin (`apply(resolver)`); the
    // shape is checked by `ResolverLike` above, so the cast is the only bridge.
    config.resolve.plugins = [
      ...(config.resolve.plugins ?? []),
      typescriptSourceJsResolution() as unknown as (typeof config.resolve.plugins)[number],
    ];
    return config;
  },
};

export default nextConfig;
