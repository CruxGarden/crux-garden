import type { MeshPhysicalMaterial } from "three";

// A smooth traveling brightness envelope, never a color stripe or strobe.
export function addGlowFlow(material: MeshPhysicalMaterial) {
  const uniforms = { gyroFlow: { value: 0 }, gyroFlowTime: { value: 0 } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      `varying float gyroRingU;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n gyroRingU = uv.x;",
      );
    shader.fragmentShader =
      `varying float gyroRingU;\nuniform float gyroFlow, gyroFlowTime;\n${shader.fragmentShader}`.replace(
        "#include <emissivemap_fragment>",
        `
      #include <emissivemap_fragment>
      float currentWave = .5 + .5 * sin(gyroRingU * 12.56637 - gyroFlowTime * 1.7);
      totalEmissiveRadiance *= mix(1., .55 + .45 * currentWave * currentWave * currentWave, gyroFlow);
    `,
      );
  };
  material.customProgramCacheKey = () => "gyro-soft-electrical-flow-v1";
  return uniforms;
}
