# Service brand artwork

All 32 catalog services have locally bundled SVG brand artwork, rendered through the reusable `ServiceIcon` component. The same component serves the catalog, selected guide, import history, cloud service picker, cloud jobs and Dropbox downloads. It is exported for future hosts. Logos are decorative beside readable service labels, so screen readers do not repeat names. The service grid uses fixed icon slots, left-aligned contents and consistent leading padding so marks and names line up down each column. No remote image requests, icon font or full icon-library runtime is required.

Brand colors and geometry remain image content. The surrounding backing uses the shared `logoSurface` Mood token (editable and persisted through the existing Mood controls); corner shape uses the existing `radiusSm` token. iCloud Photos and iCloud Drive use the iCloud service mark. This identifies the source service and does not imply endorsement or partnership.

## Provenance and notices

`packages/migration-ui/src/assets/services/sources.json` records every service mapping, exact source URL, pinned repository revision, byte count and SHA-256. Assets total less than 45 KB uncompressed. No personal account data is included.

- Most artwork comes from [Dashboard Icons](https://github.com/homarr-labs/dashboard-icons), pinned to the revision in the manifest. Its collection license is reproduced in [dashboard-icons-LICENSE.txt](dashboard-icons-LICENSE.txt). Third-party marks remain the property of their respective owners.
- Flickr's geometry comes from [Simple Icons](https://github.com/simple-icons/simple-icons), pinned in its source URL. Its two existing subpaths are colored with the service's blue/pink colors; geometry is retained. The CC0 dedication is reproduced in [simple-icons-LICENSE.txt](simple-icons-LICENSE.txt).
- Apple Notes comes from [Apple Notes icon on Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Apple_Notes_icon.svg), attributed there to Apple Inc. and marked public domain/ineligible. SVG bytes are unchanged; the source URL and hash are recorded. Trademark rights are separate from the file's stated copyright status.

Keep source/license notices when reusing these assets. New services should add an explicit mapping and sourced local artwork, not a remote favicon fetch or an invented substitute.
