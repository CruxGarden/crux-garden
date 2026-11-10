# Migration interface

Host-neutral React interface. Import `MigrationApp` and supply a stable `MigrationClient` implementing job requests, native path selection, and reveal. Native adapters live in the app, never this package.

```tsx
import { MigrationApp } from '@cruxgarden/migration-ui';

<MigrationApp client={hostMigrationClient} />
```

Embedded mode is the default. The host owns fonts, global styles, Mood tokens and Plasma context; the component does not install a second root or apply a global Mood. Include the shared Garden styles in your host once. Standalone hosts may explicitly request `appearance="standalone"` and apply the exported initial Mood.

This source package is consumed by the monorepo bundler; publishing a compiled package and connecting Builder's existing database/host are later integration work.
