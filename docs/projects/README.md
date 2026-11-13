# Projects

These are the three current planning projects in the shared monorepo. A project page describes scope and evidence; it is not a promise of a separate binary, database or daemon.

| Project | Responsibility | State |
| --- | --- | --- |
| [Home](home/README.md) | Everyday libraries, applications and personal computing experience | Product/design plan; app implementation not started here |
| [Migrate](migrate/README.md) | Acquire selected data, preserve originals and verify copies | Standalone implementation; comparison checkpoint included, final qualification pending |
| [Lifecycle](lifecycle/README.md) | Runtime/service ownership, health, shutdown, recovery and future maintenance | Planning; Migrate has a narrower implemented background lifecycle |

Home consumes capabilities. Migrate owns migration workflows. Lifecycle should coordinate supported host/service operations without becoming a second owner of migration jobs or content. Shared packages stay shared; separate project plans do not require three independent runtimes.

Lab, Field and Station remain broader product context. Builder and the other existing repositories are not part of the current cross-machine clone setup. See [roadmap](../../ROADMAP.md), [source mapping](source-map.md) and [Omarchy setup order](lifecycle/omarchy-setup.md).
