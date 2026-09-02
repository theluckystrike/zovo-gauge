# Building Gauge

Requirements: Node.js 20+, npm, and a real Supabase anonymous key for the licence
verification function.

1. Copy `.env.example` to `.env`.
2. Set `SUPABASE_ANON_KEY` in `.env`, or export it in the build environment.
3. Run `npm install`.
4. Run `npm test -- --runInBand`.
5. Run `npm run build`.
6. Load `Extensions/Combined/dist/chrome` as an unpacked MV3 extension.

The build intentionally fails if the anonymous key is absent. The key is public
client configuration rather than a server secret, but it must be present so paid
activation does not silently fail.
