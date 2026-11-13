> Naming update (November 12, 2026): the personal agent is **Assistant**. **Crux Garden Migrate**, formerly **Migration**, is the current product name. Existing `apps/migration` and `migration-*` package names remain internal identifiers. Historical implementation status and proposed phases below are reference context; consult the current monorepo project plans.

# Crux Garden Home — Leaner UI Direction

Status: proposed visual refinement, not a finalized product design.

## Intent
Preserve the dark botanical character of the existing Crux Garden storyboard, while making the everyday product UI calmer, more legible, and more content-led. The original mockups remain the source of truth for the broader narrative and brand; the new image is an exploratory Home dashboard variant.

## Design principles
- **Content first:** prioritize real photographs, documents, music, and applications rather than decorative UI.
- **Quiet surfaces:** dark forest/green glass surfaces with restrained contrast, spacing, and mostly monochrome hairline borders.
- **Iridescence as emphasis:** reserve the rainbow edge for active, selected, featured, or focus states; avoid applying it equally to every card.
- **Editorial typography with functional restraint:** warm cream serif for welcoming headlines and section headings; clear sans-serif for navigation, data, controls, and dense views.
- **Amber means attention:** use amber sparingly for active states and moments needing focus, not as ubiquitous decoration.
- **Progressive density:** Home is inviting and calm; Lab can be information-dense; Field prioritizes offline clarity; Station prioritizes creation. All share one component system.
- **Assistant as a capability, not only a chatbot:** offer contextual actions on files, collections, devices, and workspace modules. Surface permissions, local/cloud execution, and approvals clearly.
- **Make status useful:** a compact 'At a glance' strip can show actionable system/storage/network/household state without turning Home into a monitoring console.
- **Accessibility and responsive behavior:** ensure text contrast, keyboard and controller navigation, focus states, and adaptive layouts for TV, desktop, tablet, and mobile.

## New exploratory Home variant
File: `Mockups/12 · Home — Leaner Exploration.png`

Notable changes: a calmer visual hierarchy; a large featured family album; compact Documents, Media, Applications, and Assistant cards; integrated search; a restrained system/household overview; iridescent emphasis on a featured surface rather than every panel.

**Caveat:** The generated image is a visual concept, not an implementation specification. Names, content, storage metrics, health indicators, and application labels are illustrative. Do not treat them as live system data or committed features.

## Suggested next design work
1. Produce real desktop, couch/TV, and mobile layouts from shared tokens.
2. Test Home with large real libraries and multiple household members.
3. Define interaction states for selected, loading, error, offline, and permission approval.
4. Define a reusable card and workspace composition system consistent with the Crux Garden builder.
5. Verify accessible contrast and reduce decorative effects where they compete with content.
