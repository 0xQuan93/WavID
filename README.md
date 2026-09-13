# WavID

Verifiable creative history as living visual identity.

- [The original thesis](<Verifiable Creative History as Living Visual Identity>)
- [Browser Studio 0.2 — run, explore and export](studio/README.md)
- [WaveWarz developer integration guide](studio/docs/INTEGRATION.md)
- [Release evidence and remaining work](studio/docs/RELEASE-CHECKLIST.md)

The studio turns public WaveWarz observations into deterministic material-v1
forms on the visitor's device. It includes a live roster view, inspectable
history and fingerprints, portable definitions, and PNG identity kits with
exact-artifact receipts. It needs no generation backend or model installation.

```sh
cd studio
npm ci --ignore-scripts
npm test
npm run dev
```

Use Node.js 22.12 or newer. The studio opens at http://127.0.0.1:18990/.
`npm run build` creates a static site; WaveWarz.info can instead mount the
reusable React component within its existing application.

This is a public developer-review handoff, not a deployed WaveWarz feature or
complete provenance protocol. File integrity is distinct from artist ownership,
trusted timestamps and platform signatures. Official accounts, authenticated
saves and durable identity lineage remain host-integration work.

The original thesis is preserved unchanged. No project-wide permissive license
is granted by this handoff; confirm adoption terms with the maintainer and retain
the [component notices](studio/THIRD_PARTY_NOTICES.md). Public records and links
do not grant rights to the underlying music or artist artwork.
