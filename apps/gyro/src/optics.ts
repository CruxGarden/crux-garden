// Canvas-only optical treatment: interface text stays crisp and accessible.
export const opticsShader = {
  uniforms: {
    tDiffuse: { value: null },
    aberration: { value: 0 },
    grain: { value: 0 },
    time: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float aberration;
    uniform float grain;
    uniform float time;
    varying vec2 vUv;
    float noise(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec2 radial = vUv - 0.5;
      vec2 offset = (radial * (0.35 + dot(radial, radial)) + vec2(0.07, 0.015)) * aberration * 0.018;
      vec4 center = texture2D(tDiffuse, vUv);
      vec4 red = texture2D(tDiffuse, clamp(vUv + offset, 0.0, 1.0));
      vec4 blue = texture2D(tDiffuse, clamp(vUv - offset, 0.0, 1.0));
      vec3 spectrum = vec3(red.r, center.g, blue.b);
      // Seed is frozen alongside motion; no grain flicker in reduced-motion mode.
      float texture = noise(gl_FragCoord.xy + floor(time * 24.0));
      spectrum *= 1.0 + (texture - 0.5) * grain * 0.45;
      gl_FragColor = vec4(max(spectrum, vec3(0.0)), max(center.a, max(red.a, blue.a)));
    }
  `,
};
