import { useEffect, type ReactNode } from "react";
import { PlasmaCanvas, PlasmaProvider } from "@cruxgarden/plasma-ui";
import { usePlasmaOn } from "./usePlasmaOn";
import { usePlasmaTier } from "./usePlasmaTier";
import { PLASMA_TIERS } from "./tiers";
import { GROUND_CLASS } from "./ground";
import { usePlasmaOptics } from "./usePlasmaOptics";

// Shared material only: Home can use the existing Mood/Plasma surface without
// starting the author's workspace, audio engine or ingestion services.
const WORKSPACE_FLOW = 0.45;
const WORKSPACE_STRETCH = 1.4;
export const CHROME_ATTR = "data-plasma-chrome";

export default function PlasmaMaterial({
  children,
  enabled = true,
  stillPanels = true,
  inWorkspace = false,
  lit = 0,
}: {
  children: ReactNode;
  enabled?: boolean;
  stillPanels?: boolean;
  inWorkspace?: boolean;
  lit?: number;
}) {
  const requested = usePlasmaOn();
  const on = enabled && requested;
  const tier = usePlasmaTier();
  const optics = usePlasmaOptics();
  // The last stage of the garden warming up (lib/moods/signals.ts): below
  // LIT_FROM only the colour comes back, and past it the iridescence climbs
  // toward the landing page's rim. Quantised, so this is a few dozen renders
  // across a fade, and the renderer takes them through configure().
  // The stylesheets, the ground and the overlays key off the same attribute.
  useEffect(() => {
    const html = document.documentElement;
    if (on && optics.flatChrome) html.setAttribute(CHROME_ATTR, "flat");
    else html.removeAttribute(CHROME_ATTR);
  }, [on, optics.flatChrome]);
  const t = PLASMA_TIERS[tier];
  const flowCap = Math.min(t.flow ?? 3, inWorkspace ? WORKSPACE_FLOW : 3);
  const stretchCap = Math.min(
    t.stretch ?? 3,
    inWorkspace ? WORKSPACE_STRETCH : 3,
  );
  return (
    <PlasmaProvider
      theme="dark"
      {...t}
      // The Mood's material: the field it paints, the tint and body of every
      // surface, the rim, how high they float — and the optics: refraction,
      // and dispersion, the chromatic aberration in the bend. Frost is the
      // Mood's too, capped by the tier (a weak GPU turns the blur chains off).
      mood={{
        colors: optics.colors,
        blend: optics.blend,
        spring: { stiffness: 170, damping: 16 },
      }}
      // A Mood may ask for a still ground of one colour instead of the field.
      {...(optics.background ? { background: optics.background } : {})}
      tint={optics.tint}
      opacity={optics.opacity}
      frost={Math.min(optics.frost, t.frost ?? 1)}
      rim={optics.rim + lit * optics.rimActivity}
      rimWidth={optics.rimWidth}
      rimColor={optics.rimColor}
      smoothness={optics.smoothness}
      edgeLine={optics.edgeLine}
      wash={optics.wash}
      formIn={optics.formIn}
      formSpeed={optics.formSpeed}
      formOut={optics.formOut}
      // The pointer: the bead that follows it (the tier may still say no on a
      // weak GPU), and the light the edges throw toward it.
      pointerDrop={optics.pointerDrop && t.pointerDrop !== false}
      // Desktop panels stay still; Flow changes their light, not their shape.
      // Website material retains the Mood's motion within the tier budget.
      flow={stillPanels ? 0 : Math.min(optics.flow, flowCap)}
      stretch={stillPanels ? 0 : Math.min(optics.stretch, stretchCap)}
      viscosity={optics.viscosity}
      ambientDrops={optics.ambientDrops && t.ambientDrops !== false}
      pointerPull={!stillPanels && optics.pointerPull}
      highlight={optics.pointerLight ? 1 : 0}
      elevation={optics.elevation}
      shimmer={optics.shimmer}
      glow={optics.glow}
      grain={optics.grain}
      refraction={optics.refraction}
      dispersion={optics.dispersion}
      // Surfaces would fuse below blend/2, and the Plasma Mood's paneGap
      // puts more than that between two tiles — PlasmaSurfaces registers
      // every surface with fuse:false anyway, so panes keep their own edges
      // whatever the layout does. The Mood's token (Soft Black's thin
      // gutters ask for a small one, or three panes read as one slab).
      blend={optics.blend}
      grid={24}
      // The app shows far more surfaces at once than the teaser's one panel.
      // Changing this recompiles the shaders, so it is set once, here.
      maxSurfaces={24}
      // The overlays (PlasmaOverlay: a dialog above the scrim) sample this
      // canvas as their background, so its frames are kept after they show.
      preserveDrawingBuffer
      canvas={false}
    >
      {/* Behind the app's content, above the page background. */}
      {on && <PlasmaCanvas zIndex={-7} className={GROUND_CLASS} />}
      {children}
    </PlasmaProvider>
  );
}
