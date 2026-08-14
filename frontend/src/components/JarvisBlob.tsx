import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'
import { STATES, type OrbState } from './states'

const COUNT = 5000
const RING_COUNT = 900

// rotation speed per state, indexed like STATES (talking holds still, facing you)
const SPIN = [0, 0.05, 0.08, 0.1, 0.15, 0.2, 0.12, 0.06, 0.1]

// sculpted 3D head: gaussian feature field over an ellipsoid skull —
// recessed eye sockets w/ glowing irises (feat 2), lip ridges (1 upper, 1.5 lower)
function faceTargets(positions: Float32Array, count: number) {
  const face = new Float32Array(count * 3)
  const feat = new Float32Array(count)
  const g1 = (d: number, s: number) => Math.exp(-(d * d) / (s * s))
  const g2 = (dx: number, dy: number, s: number) => Math.exp(-(dx * dx + dy * dy) / (s * s))
  const S = 1.18

  // pre-pass: gather the dots each eye will recruit so irises can be laid out evenly
  const eyeL: number[] = []
  const eyeR: number[] = []
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3]
    const y = positions[i * 3 + 1]
    const z = positions[i * 3 + 2]
    if (z <= 0.15) continue
    if (Math.hypot(x + 0.3, y - 0.16) < 0.13) eyeL.push(i)
    else if (Math.hypot(x - 0.3, y - 0.16) < 0.13) eyeR.push(i)
  }
  // index → [eyeCenterX, ordinal, eyeCount]
  const irisLookup = new Map<number, [number, number, number]>()
  eyeL.forEach((idx, k) => irisLookup.set(idx, [-0.3, k, eyeL.length]))
  eyeR.forEach((idx, k) => irisLookup.set(idx, [0.3, k, eyeR.length]))

  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    const x = positions[i3]
    const y = positions[i3 + 1]
    const z = positions[i3 + 2]
    let hx = x * 0.78
    let hy = y * 0.92
    let hz = z * 0.8
    let f = 0

    // jaw narrows toward the chin, skull stays full
    if (y < -0.1) hx *= 1 - Math.min(0.34, (-y - 0.1) * (-y - 0.1) * 0.75)

    if (z > 0.15) {
      let dz = 0
      // brow ridge
      dz += 0.05 * g1(y - 0.3, 0.1) * g1(x, 0.45)
      // eye sockets carved in
      const eL = g2(x + 0.3, y - 0.16, 0.15)
      const eR = g2(x - 0.3, y - 0.16, 0.15)
      dz -= 0.12 * Math.max(eL, eR)
      // nose: bridge, tip, nostril wings
      const noseB = g1(x, 0.075) * g1(y + 0.02, 0.22)
      const noseT = g2(x, y + 0.24, 0.1)
      dz += 0.11 * noseB
      dz += 0.1 * noseT
      dz += 0.05 * (g2(x + 0.1, y + 0.27, 0.06) + g2(x - 0.1, y + 0.27, 0.06))
      // cheekbones
      dz += 0.05 * (g2(x + 0.45, y + 0.06, 0.17) + g2(x - 0.45, y + 0.06, 0.17))
      // lips with a shadowed slit between
      const lipU = g1(y + 0.44, 0.05) * g1(x, 0.24)
      const lipL = g1(y + 0.53, 0.055) * g1(x, 0.22)
      dz += 0.05 * lipU + 0.06 * lipL
      dz -= 0.06 * g1(y + 0.485, 0.028) * g1(x, 0.18)
      // chin boss
      dz += 0.05 * g2(x, y + 0.78, 0.15)
      hz += dz * z

      // glowing irises inside shadowed sockets — even golden-angle discs
      const iris = irisLookup.get(i)
      const dEye = Math.min(Math.hypot(x + 0.3, y - 0.16), Math.hypot(x - 0.3, y - 0.16))
      if (iris) {
        const [cx, k, n] = iris
        const rr = Math.sqrt((k + 0.5) / n) * 0.095
        const ang = k * 2.399963
        hx = (cx + Math.cos(ang) * rr) * 0.78
        hy = (0.16 + Math.sin(ang) * rr * 0.7) * 0.92
        hz = 0.58
        f = 2
      } else if (dEye < 0.2) {
        f = -1 // socket shadow ring
      } else if (lipU > 0.35) {
        f = 1
      } else if (lipL > 0.35) {
        f = 1.5
      } else if (noseB > 0.55 || noseT > 0.55) {
        f = 0.6 // subtle nose highlight
      }
    }

    // subtle ears
    if (Math.abs(x) > 0.86 && Math.abs(y - 0.02) < 0.22 && Math.abs(z) < 0.3) {
      hx *= 1.07
      hz *= 0.9
    }

    face[i3] = hx * S
    face[i3 + 1] = hy * S
    face[i3 + 2] = hz * S
    feat[i] = f
  }
  return { face, feat }
}

// Sample particle targets from a real scanned human head (Lee Perry-Smith, CC-BY,
// shipped with three.js examples). Features are anchored to the nose tip so the
// glowing eyes / animated mouth land on true anatomy.
function sampleHeadMesh(mesh: THREE.Mesh, count: number, face: Float32Array, feat: Float32Array) {
  const sampler = new MeshSurfaceSampler(mesh).build()
  const p = new THREE.Vector3()
  mesh.geometry.computeBoundingBox()
  const bb = mesh.geometry.boundingBox!
  const center = bb.getCenter(new THREE.Vector3())
  const size = bb.getSize(new THREE.Vector3())
  const scale = 2.55 / size.y

  for (let i = 0; i < count; i++) {
    sampler.sample(p)
    face[i * 3] = (p.x - center.x) * scale
    face[i * 3 + 1] = (p.y - center.y) * scale
    face[i * 3 + 2] = (p.z - center.z) * scale
  }

  // landmarks measured from the scan: nose tip is the frontmost point of the whole bust;
  // eye sockets sit ~0.16 above it, the mouth slit ~0.18 below (profiled via z-per-y bins)
  let zFront = -Infinity
  let noseY = 0
  for (let i = 0; i < count; i++) {
    if (face[i * 3 + 2] > zFront) {
      zFront = face[i * 3 + 2]
      noseY = face[i * 3 + 1]
    }
  }
  const eyeY = noseY + 0.16
  const mouthY = noseY - 0.18

  for (let i = 0; i < count; i++) {
    const x = face[i * 3]
    const y = face[i * 3 + 1]
    const z = face[i * 3 + 2]
    let f = 0
    if (z > 0.3) {
      const dEye = Math.min(Math.hypot(x + 0.18, y - eyeY), Math.hypot(x - 0.18, y - eyeY))
      const dNose = Math.hypot(x, y - noseY)
      if (dEye < 0.075) f = 2
      else if (dEye < 0.12) f = -1
      else if (Math.abs(x) < 0.14 && Math.abs(y - mouthY) < 0.04 && z > zFront - 0.35) f = y >= mouthY ? 1 : 1.5
      else if (dNose < 0.055 && z > zFront - 0.12) f = 0.6
    }
    feat[i] = f
  }
}

// scattered dust annulus around the blob
function ringDistribution(count: number) {
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const phases = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const r = 1.55 + Math.pow(Math.random(), 1.6) * 1.25
    const ang = Math.random() * Math.PI * 2
    positions[i * 3] = Math.cos(ang) * r
    positions[i * 3 + 1] = (Math.random() - 0.5) * 0.16 * (r - 1.2)
    positions[i * 3 + 2] = Math.sin(ang) * r
    sizes[i] = 0.8 + Math.random() * 1.8
    phases[i] = Math.random()
  }
  return { positions, sizes, phases }
}

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
  attribute vec3 aFace;
  attribute float aFeat;
  varying float vAlpha;
  varying float vBoost;

  vec3 rotY(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  void applyState(int st, vec3 p, float t, float phase, vec3 facePos, float feat, out vec3 pos, out float breath, out float boost) {
    pos = p;
    boost = 0.0;
    // ever-present breathing baseline in every state
    breath = 1.0 + 0.04 * sin(t * 1.2 + phase * 6.2831);

    if (st == 0) {
      // talking: particles assemble into a sculpted face; eyes glow, mouth moves
      pos = facePos;
      breath = 1.0 + 0.012 * sin(t * 1.5 + phase * 6.2831);
      if (feat < -0.5) {
        boost = -0.75; // dark eye sockets
      } else if (feat > 1.75) {
        boost = 1.7 + 0.5 * sin(t * 3.0 + phase * 3.0);
      } else if (feat > 1.25) {
        // lower lip drops with speech cadence
        float open = (0.5 + 0.5 * sin(t * 9.0)) * (0.55 + 0.45 * sin(t * 2.3));
        pos.y -= open * 0.07;
        boost = 0.8;
      } else if (feat > 0.75) {
        boost = 0.8;
      } else if (feat > 0.25) {
        boost = 0.45;
      } else if (facePos.z < 0.0) {
        boost = -0.6; // rear skull recedes so the face reads
      }
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
      // shaping: sphere morphs to a cube and back
      vec3 d = normalize(p);
      vec3 cubep = d / max(max(abs(d.x), abs(d.y)), abs(d.z)) * 0.82;
      float m = smoothstep(0.25, 0.75, 0.5 + 0.5 * sin(t * 0.9));
      pos = mix(pos, cubep, m);
    }
  }

  void main() {
    vec3 posA; float breathA; float boostA;
    applyState(uStateFrom, position, uTime, aPhase, aFace, aFeat, posA, breathA, boostA);
    vec3 posB; float breathB; float boostB;
    applyState(uStateTo, position, uTime, aPhase, aFace, aFeat, posB, breathB, boostB);

    // staggered per-particle blend: particles flow into the new state as a wave
    float k = smoothstep(0.0, 1.0, clamp(uBlend * 1.35 - aPhase * 0.35, 0.0, 1.0));
    vec3 pos = mix(posA, posB, k);
    float breath = mix(breathA, breathB, k);
    float boost = mix(boostA, boostB, k);

    pos *= breath;

    // in the talking state, iris particles swell into solid glowing orbs
    float talkK = mix(uStateFrom == 0 ? 1.0 : 0.0, uStateTo == 0 ? 1.0 : 0.0, k);
    float irisK = talkK * step(1.75, aFeat);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = 4.2 * (1.0 / -mvPosition.z);
    gl_PointSize *= 300.0;
    gl_PointSize = clamp(gl_PointSize, 1.0, 6.0);
    gl_PointSize *= 1.0 + irisK * 1.6;

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
    vec3 color = ember * max(0.0, 1.0 + vBoost);
    gl_FragColor = vec4(color, mask * clamp(vAlpha + vBoost * 0.4, 0.0, 1.0));
  }
`

const ringVertexShader = /* glsl */ `
  uniform float uTime;
  attribute float aSize;
  attribute float aPhase;
  varying float vTwinkle;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(aSize * (150.0 / -mvPosition.z), 0.5, 4.0);
    vTwinkle = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 1.4 + aPhase * 6.2831), 1.5);
  }
`

const ringFragmentShader = /* glsl */ `
  varying float vTwinkle;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float mask = smoothstep(0.5, 0.22, d);
    if (mask < 0.01) discard;
    vec3 ember = vec3(1.0, 0.62, 0.3);
    gl_FragColor = vec4(ember * (0.5 + vTwinkle * 0.7), mask * vTwinkle * 0.55);
  }
`

const coreVertexShader = /* glsl */ `
  varying float vFacing;

  void main() {
    vec3 n = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vFacing = abs(dot(n, normalize(-mvPosition.xyz)));
    gl_Position = projectionMatrix * mvPosition;
  }
`

const coreFragmentShader = /* glsl */ `
  uniform float uIntensity;
  varying float vFacing;

  void main() {
    // hottest at the center, fading to nothing at the rim
    float f = pow(vFacing, 2.4);
    vec3 hot = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.85, 0.6), f);
    gl_FragColor = vec4(hot * f * uIntensity, f * 0.6 * uIntensity);
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
  const groupRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Points>(null)
  const ringMatRef = useRef<THREE.ShaderMaterial>(null)
  const coreRef = useRef<THREE.Mesh>(null)
  const coreMatRef = useRef<THREE.ShaderMaterial>(null)
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

  const faceData = useMemo(() => faceTargets(positions, COUNT), [positions])

  // swap in the real scanned head once it loads (procedural head is the instant fallback)
  useEffect(() => {
    let cancelled = false
    const draco = new DRACOLoader()
    draco.setDecoderPath('/draco/')
    const loader = new GLTFLoader()
    loader.setDRACOLoader(draco)
    loader.load('/models/head.glb', (gltf) => {
      if (cancelled) return
      let mesh: THREE.Mesh | undefined
      gltf.scene.traverse((o) => {
        if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh
      })
      if (!mesh) return
      sampleHeadMesh(mesh, COUNT, faceData.face, faceData.feat)
      const geo = pointsRef.current?.geometry
      if (geo) {
        geo.attributes.aFace.needsUpdate = true
        geo.attributes.aFeat.needsUpdate = true
      }
    })
    return () => {
      cancelled = true
      draco.dispose()
    }
  }, [faceData])

  const ring = useMemo(() => ringDistribution(RING_COUNT), [])

  useFrame((frame, delta) => {
    const points = pointsRef.current
    if (!points) return

    const tr = trans.current
    tr.blend = Math.min(1, tr.blend + delta / 1.2)
    const ease = tr.blend * tr.blend * (3 - 2 * tr.blend)
    if (tr.to === 0) {
      // talking: settle rotation so the face looks at the camera
      const twoPi = Math.PI * 2
      const target = Math.round(points.rotation.y / twoPi) * twoPi
      points.rotation.y = THREE.MathUtils.damp(points.rotation.y, target, 3.5, delta)
    } else {
      points.rotation.y += delta * THREE.MathUtils.lerp(SPIN[tr.from], SPIN[tr.to], ease)
    }

    // subtle parallax toward the mouse (whole assembly tilts)
    pointer.current.x = THREE.MathUtils.lerp(pointer.current.x, frame.pointer.x, 0.05)
    pointer.current.y = THREE.MathUtils.lerp(pointer.current.y, frame.pointer.y, 0.05)
    if (groupRef.current) {
      groupRef.current.rotation.x = -pointer.current.y * 0.25
      groupRef.current.rotation.z = pointer.current.x * 0.15
    }

    // dust ring counter-rotates slowly with a gentle wobble
    if (ringRef.current) {
      ringRef.current.rotation.y -= delta * 0.045
      ringRef.current.rotation.x = 0.35 + Math.sin(frame.clock.elapsedTime * 0.2) * 0.04
    }
    if (ringMatRef.current) {
      ringMatRef.current.uniforms.uTime.value = frame.clock.elapsedTime
    }

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
      // core recedes while the face is on-screen so features stay readable
      const talkAmount = tr.to === 0 ? ease : tr.from === 0 ? 1 - ease : 0
      shadowRef.current.style.transform =
        `translateX(${(-pointer.current.x * 46).toFixed(1)}px) ` +
        `scale(${(breath + spread).toFixed(3)}, ${breath.toFixed(3)})`
      shadowRef.current.style.opacity = (0.85 + (breath - 1) * 2.6).toFixed(3)

      // core pulses with the same breath, amplified
      if (coreRef.current) {
        coreRef.current.scale.setScalar((1 + (breath - 1) * 2.2) * (1 - talkAmount * 0.75))
      }
      if (coreMatRef.current) {
        coreMatRef.current.uniforms.uIntensity.value = (0.85 + (breath - 1) * 4.0) * (1 - talkAmount * 0.8)
      }
    }
  })

  return (
    <group ref={groupRef}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
          <bufferAttribute attach="attributes-aFace" args={[faceData.face, 3]} />
          <bufferAttribute attach="attributes-aFeat" args={[faceData.feat, 1]} />
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
      <points ref={ringRef} rotation={[0.35, 0, -0.15]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[ring.positions, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[ring.sizes, 1]} />
          <bufferAttribute attach="attributes-aPhase" args={[ring.phases, 1]} />
        </bufferGeometry>
        <shaderMaterial
          key={ringVertexShader + ringFragmentShader}
          ref={ringMatRef}
          vertexShader={ringVertexShader}
          fragmentShader={ringFragmentShader}
          uniforms={{ uTime: { value: 0 } }}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.5, 48, 48]} />
        <shaderMaterial
          key={coreVertexShader + coreFragmentShader}
          ref={coreMatRef}
          vertexShader={coreVertexShader}
          fragmentShader={coreFragmentShader}
          uniforms={{ uIntensity: { value: 0.85 } }}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}
