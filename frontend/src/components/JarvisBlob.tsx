import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { STATES, type OrbState } from './states'

const COUNT = 5000

// rotation speed per state, indexed like STATES
const SPIN = [0.35, 0.05, 0.08, 0.1, 0.15, 0.2, 0.12, 0.06, 0.1]

// Evenly dot the sphere surface (golden-angle spiral), like thinking-orbs' dotted globe
function fibonacciSphere(count: number): Float32Array {
  const positions = new Float32Array(count * 3)
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const radius = Math.sqrt(1 - y * y)
    const theta = golden * i
    positions[i * 3] = Math.cos(theta) * radius
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = Math.sin(theta) * radius
  }
  return positions
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform int uState;
  attribute float aPhase;
  varying float vAlpha;
  varying float vBoost;

  vec3 rotY(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  void main() {
    vec3 pos = position;
    float boost = 0.0;
    float breath = 1.0 + 0.04 * sin(uTime * 1.2 + aPhase * 6.2831);

    if (uState == 0) {
      // working: orbits wobble on a tilting axis
      float a = 0.3 * sin(uTime * 0.8);
      float c = cos(a), s = sin(a);
      pos = vec3(pos.x, c * pos.y - s * pos.z, s * pos.y + c * pos.z);
    } else if (uState == 1) {
      // searching: a bright meridian sweeps the globe
      float ang = atan(pos.x, pos.z);
      float sweep = uTime * 1.6;
      float d = abs(atan(sin(ang - sweep), cos(ang - sweep)));
      boost = smoothstep(0.55, 0.0, d) * 1.6;
    } else if (uState == 2) {
      // solving: latitude bands scramble, then click back
      float band = floor((pos.y + 1.0) * 3.0);
      float cycle = floor(uTime * 0.4);
      float t = fract(uTime * 0.4);
      float scramble = smoothstep(0.0, 0.25, t) * smoothstep(1.0, 0.55, t);
      float off = sin(band * 12.9898 + cycle * 7.31) * scramble * 1.3;
      pos = rotY(pos, off);
      boost = (1.0 - scramble) * 0.3;
    } else if (uState == 3) {
      // listening: waveform rolls through the rings
      float w = sin(pos.y * 9.0 - uTime * 5.0);
      breath += 0.09 * w;
      boost = max(0.0, w) * 0.9;
    } else if (uState == 4) {
      // connecting: constellation twinkle
      boost = pow(0.5 + 0.5 * sin(uTime * 4.0 + aPhase * 40.0), 3.0) * 1.4;
    } else if (uState == 5) {
      // weaving: strands plait around the sphere
      pos = rotY(pos, 0.4 * sin(pos.y * 4.0 + uTime * 1.3));
    } else if (uState == 6) {
      // composing: undulating multi-band sash
      breath += 0.07 * sin(pos.y * 12.0 + uTime * 2.5) * sin(uTime * 0.6);
      boost = max(0.0, sin(pos.y * 12.0 + uTime * 2.5)) * 0.5;
    } else if (uState == 7) {
      // breathing: one deep slow pulse
      breath = 1.0 + 0.13 * sin(uTime * 1.4);
    } else {
      // shaping: sphere -> cube -> pyramid -> sphere
      vec3 d = normalize(position);
      vec3 cubep = d / max(max(abs(d.x), abs(d.y)), abs(d.z)) * 0.82;
      // radial cast onto a square pyramid (4 slanted planes + base)
      float m = max(-d.y / 0.5, dot(d, vec3(2.0, 1.0, 0.0)) / 0.9);
      m = max(m, dot(d, vec3(-2.0, 1.0, 0.0)) / 0.9);
      m = max(m, dot(d, vec3(0.0, 1.0, 2.0)) / 0.9);
      m = max(m, dot(d, vec3(0.0, 1.0, -2.0)) / 0.9);
      vec3 pyrp = d / m * 0.85;

      float cyc = mod(uTime * 0.45, 3.0);
      float f = smoothstep(0.25, 0.75, fract(cyc));
      if (cyc < 1.0) pos = mix(pos, cubep, f);
      else if (cyc < 2.0) pos = mix(cubep, pyrp, f);
      else pos = mix(pyrp, pos, f);
    }

    pos *= breath;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = 4.2 * (1.0 / -mvPosition.z);
    gl_PointSize *= 300.0;
    gl_PointSize = clamp(gl_PointSize, 1.0, 6.0);

    // fade dots on the far side for depth
    vAlpha = smoothstep(-1.2, 1.2, pos.z) * 0.75 + 0.25;
    vBoost = boost;
  }
`

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vBoost;

  void main() {
    // round soft-edged dot
    float d = length(gl_PointCoord - 0.5);
    float mask = smoothstep(0.5, 0.35, d);
    if (mask < 0.01) discard;

    vec3 ember = vec3(1.0, 0.62, 0.28);
    vec3 color = ember * (1.0 + vBoost);
    gl_FragColor = vec4(color, mask * min(1.0, vAlpha + vBoost * 0.4));
  }
`

export default function JarvisBlob({ state }: { state: OrbState }) {
  const pointsRef = useRef<THREE.Points>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const stateIndex = STATES.indexOf(state)

  const { positions, phases } = useMemo(() => {
    const phases = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) phases[i] = Math.random()
    return { positions: fibonacciSphere(COUNT), phases }
  }, [])

  useFrame((frame, delta) => {
    const points = pointsRef.current
    if (!points) return
    points.rotation.y += delta * SPIN[stateIndex]

    // subtle parallax toward the mouse
    pointer.current.x = THREE.MathUtils.lerp(pointer.current.x, frame.pointer.x, 0.05)
    pointer.current.y = THREE.MathUtils.lerp(pointer.current.y, frame.pointer.y, 0.05)
    points.rotation.x = -pointer.current.y * 0.25
    points.rotation.z = pointer.current.x * 0.15

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = frame.clock.elapsedTime
      materialRef.current.uniforms.uState.value = stateIndex
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        key={vertexShader + fragmentShader}
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{ uTime: { value: 0 }, uState: { value: 0 } }}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
