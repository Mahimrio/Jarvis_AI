import { useMemo, useRef, type RefObject } from 'react'
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
  uniform int uStateFrom;
  uniform int uStateTo;
  uniform float uBlend;
  attribute float aPhase;
  varying float vAlpha;
  varying float vBoost;

  vec3 rotY(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  void applyState(int st, vec3 p, float t, float phase, out vec3 pos, out float breath, out float boost) {
    pos = p;
    boost = 0.0;
    // ever-present breathing baseline in every state
    breath = 1.0 + 0.04 * sin(t * 1.2 + phase * 6.2831);

    if (st == 0) {
      // working: orbits wobble on a tilting axis
      float a = 0.3 * sin(t * 0.8);
      float c = cos(a), s = sin(a);
      pos = vec3(pos.x, c * pos.y - s * pos.z, s * pos.y + c * pos.z);
    } else if (st == 1) {
      // searching: a bright meridian sweeps the globe
      float ang = atan(pos.x, pos.z);
      float sweep = t * 1.6;
      float d = abs(atan(sin(ang - sweep), cos(ang - sweep)));
      boost = smoothstep(0.55, 0.0, d) * 1.6;
    } else if (st == 2) {
      // solving: latitude bands scramble, then click back
      float band = floor((pos.y + 1.0) * 3.0);
      float cycle = floor(t * 0.4);
      float ft = fract(t * 0.4);
      float scramble = smoothstep(0.0, 0.25, ft) * smoothstep(1.0, 0.55, ft);
      float off = sin(band * 12.9898 + cycle * 7.31) * scramble * 1.3;
      pos = rotY(pos, off);
      boost = (1.0 - scramble) * 0.3;
    } else if (st == 3) {
      // listening: waveform rolls through the rings
      float w = sin(pos.y * 9.0 - t * 5.0);
      breath += 0.09 * w;
      boost = max(0.0, w) * 0.9;
    } else if (st == 4) {
      // connecting: constellation twinkle
      boost = pow(0.5 + 0.5 * sin(t * 4.0 + phase * 40.0), 3.0) * 1.4;
    } else if (st == 5) {
      // weaving: strands plait around the sphere
      pos = rotY(pos, 0.4 * sin(pos.y * 4.0 + t * 1.3));
    } else if (st == 6) {
      // composing: undulating multi-band sash
      breath += 0.07 * sin(pos.y * 12.0 + t * 2.5) * sin(t * 0.6);
      boost = max(0.0, sin(pos.y * 12.0 + t * 2.5)) * 0.5;
    } else if (st == 7) {
      // breathing: one deep slow pulse
      breath = 1.0 + 0.13 * sin(t * 1.4);
    } else {
      // shaping: sphere -> cube -> pyramid -> sphere
      vec3 d = normalize(p);
      vec3 cubep = d / max(max(abs(d.x), abs(d.y)), abs(d.z)) * 0.82;
      // radial cast onto a square pyramid (4 slanted planes + base)
      float m = max(-d.y / 0.5, dot(d, vec3(2.0, 1.0, 0.0)) / 0.9);
      m = max(m, dot(d, vec3(-2.0, 1.0, 0.0)) / 0.9);
      m = max(m, dot(d, vec3(0.0, 1.0, 2.0)) / 0.9);
      m = max(m, dot(d, vec3(0.0, 1.0, -2.0)) / 0.9);
      vec3 pyrp = d / m * 0.85;

      float cyc = mod(t * 0.45, 3.0);
      float f = smoothstep(0.25, 0.75, fract(cyc));
      if (cyc < 1.0) pos = mix(pos, cubep, f);
      else if (cyc < 2.0) pos = mix(cubep, pyrp, f);
      else pos = mix(pyrp, pos, f);
    }
  }

  void main() {
    vec3 posA; float breathA; float boostA;
    applyState(uStateFrom, position, uTime, aPhase, posA, breathA, boostA);
    vec3 posB; float breathB; float boostB;
    applyState(uStateTo, position, uTime, aPhase, posB, breathB, boostB);

    // staggered per-particle blend: particles flow into the new state as a wave
    float k = smoothstep(0.0, 1.0, clamp(uBlend * 1.35 - aPhase * 0.35, 0.0, 1.0));
    vec3 pos = mix(posA, posB, k);
    float breath = mix(breathA, breathB, k);
    float boost = mix(boostA, boostB, k);

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

export default function JarvisBlob({
  state,
  shadowRef,
}: {
  state: OrbState
  shadowRef?: RefObject<HTMLDivElement | null>
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const stateIndex = STATES.indexOf(state)
  const trans = useRef({ from: stateIndex, to: stateIndex, blend: 1 })

  if (stateIndex !== trans.current.to) {
    trans.current.from = trans.current.to
    trans.current.to = stateIndex
    trans.current.blend = 0
  }

  const { positions, phases } = useMemo(() => {
    const phases = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) phases[i] = Math.random()
    return { positions: fibonacciSphere(COUNT), phases }
  }, [])

  useFrame((frame, delta) => {
    const points = pointsRef.current
    if (!points) return

    const tr = trans.current
    tr.blend = Math.min(1, tr.blend + delta / 1.2)
    const ease = tr.blend * tr.blend * (3 - 2 * tr.blend)
    points.rotation.y += delta * THREE.MathUtils.lerp(SPIN[tr.from], SPIN[tr.to], ease)

    // subtle parallax toward the mouse
    pointer.current.x = THREE.MathUtils.lerp(pointer.current.x, frame.pointer.x, 0.05)
    pointer.current.y = THREE.MathUtils.lerp(pointer.current.y, frame.pointer.y, 0.05)
    points.rotation.x = -pointer.current.y * 0.25
    points.rotation.z = pointer.current.x * 0.15

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = frame.clock.elapsedTime
      materialRef.current.uniforms.uStateFrom.value = tr.from
      materialRef.current.uniforms.uStateTo.value = tr.to
      materialRef.current.uniforms.uBlend.value = tr.blend
    }

    // mirror the shader's silhouette so the floor shadow tracks the blob
    if (shadowRef?.current) {
      const t = frame.clock.elapsedTime
      const breathFor = (idx: number) => {
        if (idx === 7) return 1 + 0.13 * Math.sin(t * 1.4)
        if (idx === 3) return 1 + 0.055 * Math.sin(t * 5.0)
        if (idx === 8) {
          const m = 0.5 + 0.5 * Math.sin(t * 0.9)
          return 1 - 0.12 * Math.min(1, Math.max(0, (m - 0.25) / 0.5))
        }
        return 1 + 0.04 * Math.sin(t * 1.2)
      }
      const breath = THREE.MathUtils.lerp(breathFor(tr.from), breathFor(tr.to), ease)
      const spread = (breath - 1) * 4
      shadowRef.current.style.transform =
        `translateX(${(-pointer.current.x * 46).toFixed(1)}px) ` +
        `scale(${(breath + spread).toFixed(3)}, ${breath.toFixed(3)})`
      shadowRef.current.style.opacity = (0.55 + (breath - 1) * 2.2).toFixed(3)
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
        uniforms={{ uTime: { value: 0 }, uStateFrom: { value: 0 }, uStateTo: { value: 0 }, uBlend: { value: 1 } }}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
