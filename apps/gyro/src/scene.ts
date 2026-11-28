import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { getVar } from "@cruxgarden/garden-ui/lib/moods/tokens";
import { personaToken } from "@cruxgarden/garden-ui/lib/moods/persona-tokens";
import { opticsShader } from "./optics";
import { addGlowFlow } from "./glow";
import { states, stateKeys, type PersonaState } from "./states";
export type SceneInput = {
  state: PersonaState;
  paused: boolean;
  reduced: boolean;
  intensity: number;
  moodRevision: number;
};
type Profile = {
  color: T.Color;
  alpha: number;
  speed: number;
  innerSpeed: number;
  middleSpeed: number;
  outerSpeed: number;
  spread: number;
  glow: number;
  glowSpread: number;
  flow: number;
  pulse: number;
  iridescence: number;
  rgbSplit: number;
};

// Three simple rings, with a shared state language across four visual styles.
export function createScene(host: HTMLElement, input: () => SceneInput) {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.setClearColor(0, 0);
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive gyroscope rings. Drag to orbit; scroll to zoom.",
  );
  renderer.domElement.setAttribute("role", "img");
  host.appendChild(renderer.domElement);
  const scene = new T.Scene();
  // Orthographic, centered framing keeps the default motion symmetric in screen space.
  const camera = new T.OrthographicCamera(-3, 3, 3, -3, 0.1, 100);
  camera.position.set(0, 0, 9.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 16;
  controls.minZoom = 0.7;
  controls.maxZoom = 1.5;
  const pmrem = new T.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.85;
  room.dispose();
  pmrem.dispose();
  const body = new T.Group();
  scene.add(body);
  const physical = new T.MeshPhysicalMaterial({
    metalness: 0.92,
    roughness: 0.32,
  });
  const physicals = [physical, physical.clone(), physical.clone()];
  const glowUniforms = physicals.map(addGlowFlow);
  let shades = [0.68, 1, 1.24];
  const flats = [0, 1, 2].map(
    () => new T.MeshBasicMaterial({ toneMapped: false }),
  );
  const ramp = new T.DataTexture(
    new Uint8Array([65, 145, 215, 255]),
    4,
    1,
    T.RedFormat,
  );
  ramp.minFilter = ramp.magFilter = T.NearestFilter;
  ramp.needsUpdate = true;
  const toons = [0, 1, 2].map(
    () => new T.MeshToonMaterial({ gradientMap: ramp }),
  );
  const outline = new T.MeshBasicMaterial({ side: T.BackSide });
  outline.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n transformed += normal * .028;",
    );
  };
  outline.customProgramCacheKey = () => "gyro-outline-v1";
  const thin = [1.25, 1.59, 1.93].map(
    (radius) => new T.TorusGeometry(radius, 0.043, 24, 192),
  );
  const thick = [1.25, 1.59, 1.93].map(
    (radius) => new T.TorusGeometry(radius, 0.085, 24, 160),
  );
  const rings = thin.map((geometry, i) => {
    const ring = new T.Mesh<T.TorusGeometry, T.Material>(
      geometry,
      physicals[i]!,
    );
    body.add(ring);
    return ring;
  });
  const outlines = thick.map((geometry) => {
    const ring = new T.Mesh(geometry, outline);
    body.add(ring);
    ring.visible = false;
    return ring;
  });
  const key = new T.DirectionalLight(0xffffff, 1.8);
  key.position.set(2, 4, 5);
  scene.add(key);
  scene.add(new T.HemisphereLight(0xffffff, 0x000000, 0.6));
  const composer = new EffectComposer(renderer);
  const render = new RenderPass(scene, camera);
  composer.addPass(render);
  const bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.1, 0.18, 1.2);
  composer.addPass(bloom);
  const optics = new ShaderPass(opticsShader);
  composer.addPass(optics);
  const output = new OutputPass();
  composer.addPass(output);
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    composer.setSize(width, height);
    camera.left = (-3 * width) / height;
    camera.right = (3 * width) / height;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const probe = document.createElement("span");
  probe.hidden = true;
  host.appendChild(probe);
  const swatch = document.createElement("canvas");
  swatch.width = swatch.height = 1;
  const context = swatch.getContext("2d", { willReadFrequently: true })!;
  function readColor(variable: string) {
    probe.style.color = `var(${variable})`;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = getComputedStyle(probe).color;
    context.fillRect(0, 0, 1, 1);
    const pixel = context.getImageData(0, 0, 1, 1).data;
    return {
      color: new T.Color().setRGB(
        pixel[0]! / 255,
        pixel[1]! / 255,
        pixel[2]! / 255,
        T.SRGBColorSpace,
      ),
      alpha: pixel[3]! / 255,
    };
  }
  let revision = -1,
    motionScale = 1,
    returnDuration = 0.4,
    globalSplit = 0,
    style = "";
  let profiles = {} as Record<PersonaState, Profile>;
  let previous = performance.now(),
    rotationTime = [0, 0, 0],
    pulseTime = 0;
  const current = {
    ...states.idle,
    color: new T.Color("#76adff"),
    alpha: 1,
    speed: 0.18 as number,
    innerSpeed: 1,
    middleSpeed: 0.65,
    outerSpeed: 0.35,
    spread: 0.9 as number,
    tilt: 0.28 as number,
    pulse: 0.025 as number,
    energy: 0.45 as number,
    glow: 1.25,
    glowSpread: 0.15,
    flow: 0,
    iridescence: 0,
    rgbSplit: 0,
  };
  const spectralColor = new T.Color();
  const front = new T.Quaternion();
  let activeState = input().state;
  let returning: {
    elapsed: number;
    rotations: T.Quaternion[];
    cameraRotation: T.Quaternion;
    distance: number;
    zoom: number;
    pulseTime: number;
  } | null = null;
  function resetPose() {
    // Flush orbit inertia before restoring the camera, so it cannot pull away again.
    controls.enableDamping = false;
    controls.update();
    controls.reset();
    rotationTime.fill(0);
    pulseTime = 0;
    returning = null;
    controls.enabled = true;
  }
  let active = true;
  const lost = (event: Event) => {
    event.preventDefault();
    active = false;
    host.dataset.renderStatus = "lost";
  };
  const restored = () => {
    active = true;
    host.dataset.renderStatus = "ready";
  };
  renderer.domElement.addEventListener("webglcontextlost", lost);
  renderer.domElement.addEventListener("webglcontextrestored", restored);
  host.dataset.renderStatus = "ready";
  renderer.setAnimationLoop((now) => {
    const delta = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (!active || document.hidden) return;
    const options = input();
    if (revision !== options.moodRevision) {
      revision = options.moodRevision;
      const css = getComputedStyle(document.documentElement);
      const token = (name: string, max = 1, min = 0) =>
        T.MathUtils.clamp(
          Number.parseFloat(css.getPropertyValue(name)) || 0,
          min,
          max,
        );
      profiles = Object.fromEntries(
        stateKeys.map((state) => {
          const name = (property: string) =>
            getVar(personaToken(state, property));
          return [
            state,
            {
              ...readColor(name("color")),
              speed: token(name("speed"), 1.8),
              innerSpeed: token(name("innerSpeed"), 2),
              middleSpeed: token(name("middleSpeed"), 2),
              outerSpeed: token(name("outerSpeed"), 2),
              spread: Math.max(0.65, token(name("size"), 1.3)),
              glow: token(name("glow"), 2),
              glowSpread: token(name("glowSpread")),
              flow: token(name("flow")),
              pulse: token(name("pulse"), 0.35),
              iridescence: token(name("iridescence")),
              rgbSplit: token(name("rgbSplit")),
            },
          ];
        }),
      ) as Record<PersonaState, Profile>;
      motionScale = token("--motion-scale", 3);
      const duration = css.getPropertyValue("--motion-duration-slow").trim();
      returnDuration =
        Math.max(0, Number.parseFloat(duration) || 0) /
        (duration.endsWith("ms") ? 1000 : 1);
      globalSplit = token("--lens-chromatic-aberration");
      optics.uniforms.grain!.value = token("--film-grain");
      shades = ["inner", "middle", "outer"].map((ring) =>
        token(`--persona-ring-${ring}-shade`, 1.5),
      );
      const outlineColor = readColor("--persona-outline-color");
      outline.color.copy(outlineColor.color);
      outline.opacity = outlineColor.alpha;
      outline.transparent = outlineColor.alpha < 1;
      const requested = css.getPropertyValue("--persona-render-style").trim();
      const nextStyle = ["glow", "metal", "flat", "cartoon"].includes(requested)
        ? requested
        : "glow";
      if (style !== nextStyle) {
        style = nextStyle;
        host.dataset.style = style;
        controls.enableRotate = style !== "flat";
        bloom.enabled = style === "glow";
        for (const material of physicals) {
          material.metalness = style === "metal" ? 0.92 : 0;
          material.roughness = style === "metal" ? 0.32 : 0.4;
        }
        rings.forEach((ring, i) => {
          ring.material =
            style === "flat"
              ? flats[i]!
              : style === "cartoon"
                ? toons[i]!
                : physicals[i]!;
          ring.geometry = style === "cartoon" ? thick[i]! : thin[i]!;
          outlines[i]!.visible = style === "cartoon";
        });
        controls.update();
      }
    }
    const still = options.paused || options.reduced || motionScale === 0;
    const changed = activeState !== options.state;
    if (changed) {
      activeState = options.state;
      returning = {
        elapsed: 0,
        rotations: rings.map((ring) => ring.quaternion.clone()),
        cameraRotation: camera.quaternion.clone(),
        distance: camera.position.length(),
        zoom: camera.zoom,
        pulseTime,
      };
      rotationTime.fill(0);
      // Ignore drag/zoom while returning; a rapid state change captures this pose anew.
      controls.enabled = false;
      controls.enableDamping = false;
      controls.update();
    }
    const resetting = returning !== null;
    let returnBlend = 0;
    if (returning) {
      const duration = returnDuration * motionScale;
      if (!still && !changed) returning.elapsed += delta;
      const progress =
        options.reduced || duration === 0
          ? 1
          : Math.min(1, returning.elapsed / duration);
      returnBlend = T.MathUtils.smoothstep(progress, 0, 1);
      camera.quaternion.slerpQuaternions(
        returning.cameraRotation,
        front,
        returnBlend,
      );
      camera.position
        .set(0, 0, T.MathUtils.lerp(returning.distance, 9.2, returnBlend))
        .applyQuaternion(camera.quaternion);
      camera.zoom = T.MathUtils.lerp(returning.zoom, 1, returnBlend);
      camera.updateProjectionMatrix();
      pulseTime = returning.pulseTime * (1 - returnBlend);
    }
    const target = { ...states[options.state], ...profiles[options.state] };
    const blend = still
      ? 1
      : 1 - Math.exp((-delta * 2.6) / Math.max(0.1, motionScale));
    for (const name of [
      "speed",
      "innerSpeed",
      "middleSpeed",
      "outerSpeed",
      "spread",
      "tilt",
      "pulse",
      "energy",
      "glow",
      "glowSpread",
      "flow",
      "iridescence",
      "rgbSplit",
      "alpha",
    ] as const)
      current[name] = T.MathUtils.lerp(current[name], target[name], blend);
    current.color.lerp(target.color, blend);
    if (!still && !resetting) {
      [current.innerSpeed, current.middleSpeed, current.outerSpeed].forEach(
        (rate, i) => {
          rotationTime[i]! +=
            delta * current.speed * rate * options.intensity * motionScale;
        },
      );
      pulseTime += delta * motionScale;
    }
    const pulsePhase = options.reduced || motionScale === 0 ? 0 : pulseTime;
    const breath = Math.sin(pulsePhase * 2) * current.pulse;
    rings.forEach((ring, i) => {
      const angle =
        options.reduced || motionScale === 0 ? 0 : rotationTime[i]! * 0.65;
      // Every state begins with the same head-on, concentric rings.
      ring.rotation.set(
        i === 0 ? angle : i === 2 ? -angle : 0,
        i === 1 ? -angle : 0,
        0,
      );
      if (returning) {
        ring.quaternion.slerpQuaternions(
          returning.rotations[i]!,
          front,
          returnBlend,
        );
      }
      ring.scale.setScalar(current.spread + breath * 0.18);
      outlines[i]!.rotation.copy(ring.rotation);
      outlines[i]!.scale.copy(ring.scale);
      const palettePhase = pulsePhase * 0.07 + i * 0.33;
      spectralColor.setRGB(
        0.5 + 0.5 * Math.cos(6.2831 * palettePhase),
        0.5 + 0.5 * Math.cos(6.2831 * (palettePhase + 0.33)),
        0.5 + 0.5 * Math.cos(6.2831 * (palettePhase + 0.67)),
      );
      flats[i]!.color.copy(current.color).lerp(
        spectralColor,
        current.iridescence,
      );
      flats[i]!.color.multiplyScalar(shades[i]!);
      toons[i]!.color.copy(flats[i]!.color);
      physicals[i]!.color.copy(flats[i]!.color);
      physicals[i]!.emissive.copy(physicals[i]!.color);
      physicals[i]!.emissiveIntensity =
        style === "glow" ? current.glow * (1 + breath * 0.5) : 0;
    });
    for (const material of [...physicals, ...flats, ...toons]) {
      material.opacity = current.alpha;
      material.transparent = current.alpha < 1;
    }
    bloom.radius = current.glowSpread;
    bloom.threshold = 0.2;
    bloom.strength = 0.03 + current.glowSpread * 0.32 + current.energy * 0.02;
    glowUniforms.forEach((uniforms, i) => {
      uniforms.gyroFlow.value = current.flow;
      uniforms.gyroFlowTime.value = pulsePhase + i * 0.8;
    });
    optics.uniforms.aberration!.value = Math.max(globalSplit, current.rgbSplit);
    optics.uniforms.time!.value = pulsePhase;
    if (returning && returnBlend === 1) resetPose();
    controls.enableDamping = !still && !returning;
    controls.update();
    composer.render();
  });
  return {
    reset() {
      resetPose();
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.domElement.removeEventListener("webglcontextrestored", restored);
      [...thin, ...thick].forEach((g) => g.dispose());
      [...physicals, ...flats, ...toons, outline].forEach((m) => m.dispose());
      ramp.dispose();
      environment.dispose();
      bloom.dispose();
      optics.dispose();
      output.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      probe.remove();
    },
  };
}
