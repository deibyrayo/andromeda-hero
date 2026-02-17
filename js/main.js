import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

// --- CONFIGURATION ---
const isMobile = window.innerWidth < 768;
const CONFIG = {
  particleCount: isMobile ? 65000 : 120000,
  cameraZ: isMobile ? 40 : 28,
  bgColor: 0x030305,
};

// --- STATE ---
const STATE = {
  mouse: new THREE.Vector2(0, 0),
  hands: {
    active: false,
    left: {
      pos: new THREE.Vector3(-100, 0, 0),
      target: new THREE.Vector3(-100, 0, 0),
      state: 0,
    },
    right: {
      pos: new THREE.Vector3(100, 0, 0),
      target: new THREE.Vector3(100, 0, 0),
      state: 0,
    },
  },
  mode: 0,
  targetMode: 0,
  audioLevel: 0,
  time: 0,
  colorPalette: 0,
};

// --- SCENE SETUP ---
const container = document.getElementById("canvas-container");
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: "high-performance",
  alpha: false,
  stencil: false,
  depth: true,
});

// Optimize pixel ratio for smoothness
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.CineonToneMapping;
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(CONFIG.bgColor, 0.015);
scene.background = new THREE.Color(CONFIG.bgColor);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.z = CONFIG.cameraZ;

// --- POST PROCESSING ---
const renderScene = new RenderPass(scene, camera);

// Smoother, dreamier bloom
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.5,
  0.4,
  0.85,
);
bloomPass.threshold = 0.1;
bloomPass.strength = 1.0;
bloomPass.radius = 0.8;

// Custom Shader for Chromatic Aberration & Grain
const outputShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRGBShift: { value: 0.002 },
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
            uniform float uTime;
            uniform float uRGBShift;
            varying vec2 vUv;
            
            float random(vec2 p) {
                return fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453);
            }

            void main() {
                vec2 uv = vUv;
                
                // Chromatic aberration at edges
                float dist = distance(uv, vec2(0.5));
                vec2 offset = (uv - 0.5) * dist * uRGBShift;
                
                float r = texture2D(tDiffuse, uv + offset).r;
                float g = texture2D(tDiffuse, uv).g;
                float b = texture2D(tDiffuse, uv - offset).b;
                
                vec3 color = vec3(r, g, b);
                
                // Subtle film grain
                float noise = (random(uv + uTime) - 0.5) * 0.04;
                color += noise;
                
                gl_FragColor = vec4(color, 1.0);
            }
        `,
};

const finalPass = new ShaderPass(outputShader);
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);
composer.addPass(finalPass);

// --- PARTICLE SYSTEM ---
const particleVertexShader = `
        uniform float uTime;
        uniform float uMode;
        uniform vec3 uHandLeft;
        uniform vec3 uHandRight;
        uniform float uHandLeftState;
        uniform float uHandRightState;
        uniform float uAudio;
        
        attribute vec3 aRandom;
        attribute float aIndex;

        varying vec3 vColor;
        varying float vAlpha;
        varying float vDist;

        // Simplex Noise
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
            const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
            const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
            vec3 i  = floor(v + dot(v, C.yyy) );
            vec3 x0 = v - i + dot(i, C.xxx) ;
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min( g.xyz, l.zxy );
            vec3 i2 = max( g.xyz, l.zxy );
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            i = mod289(i);
            vec4 p = permute( permute( permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                    + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                    + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
            float n_ = 0.142857142857;
            vec3  ns = n_ * D.wyz - D.xzx;
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_ );
            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            vec4 b0 = vec4( x.xy, y.xy );
            vec4 b1 = vec4( x.zw, y.zw );
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
            vec3 p0 = vec3(a0.xy,h.x);
            vec3 p1 = vec3(a0.zw,h.y);
            vec3 p2 = vec3(a1.xy,h.z);
            vec3 p3 = vec3(a1.zw,h.w);
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
            p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
        }

        // --- Shapes ---
        vec3 getPosSphere(float idx) {
            float phi = acos( -1.0 + ( 2.0 * idx ) / ${CONFIG.particleCount}.0 );
            float theta = sqrt( ${CONFIG.particleCount}.0 * 3.1415926 ) * phi;
            float r = 12.0 + aRandom.x * 2.0;
            return vec3(r * sin(phi) * cos(theta), r * sin(phi) * sin(theta), r * cos(phi));
        }

        vec3 getPosTorus(float idx) {
            float t = idx * 0.1;
            float r = 10.0 + aRandom.y * 3.0;
            float tube = 3.0 + aRandom.x * 2.0;
            float angle = (idx / ${CONFIG.particleCount}.0) * 6.28 * 15.0;
            return vec3(
                (r + tube * cos(angle)) * cos(t),
                (r + tube * cos(angle)) * sin(t),
                tube * sin(angle)
            );
        }

        vec3 getPosLattice(float idx) {
            float size = 25.0;
            float step = pow(${CONFIG.particleCount}.0, 1.0/3.0);
            float x = mod(idx, step);
            float y = mod(floor(idx/step), step);
            float z = floor(idx/(step*step));
            return (vec3(x, y, z) / step - 0.5) * size;
        }

        vec3 getPosVortex(float idx) {
            float r = (idx / ${CONFIG.particleCount}.0) * 18.0;
            float ang = r * 3.0;
            float h = (aRandom.x - 0.5) * 8.0 * (1.0 - r/20.0);
            return vec3(r * cos(ang), r * sin(ang), h);
        }

        // --- Blending ---
        vec3 blend(vec3 p1, vec3 p2, float t) {
            return mix(p1, p2, smoothstep(0.0, 1.0, t));
        }

        void main() {
            // Slow fluid movement
            float t = uTime * 0.15; 
            vec3 pos = vec3(0.0);
            
            // Mode Interpolation
            float m = uMode; 
            vec3 pSphere = getPosSphere(aIndex);
            vec3 pTorus = getPosTorus(aIndex);
            vec3 pLattice = getPosLattice(aIndex);
            vec3 pVortex = getPosVortex(aIndex);

            // Add noise to base shapes for organic feel
            vec3 noiseBase = vec3(
                snoise(vec3(aIndex*0.01, t*0.2, 0.0)),
                snoise(vec3(aIndex*0.01, 0.0, t*0.2)),
                snoise(vec3(0.0, aIndex*0.01, t*0.2))
            );

            pSphere += noiseBase * 4.0;
            pTorus += noiseBase * 2.0;
            pLattice += noiseBase * 1.5;
            pVortex += noiseBase * 2.0;

            // Animate rotation for Torus
            float c = cos(t*0.3); float s = sin(t*0.3);
            pTorus.xy = mat2(c, -s, s, c) * pTorus.xy;
            pTorus.xz = mat2(c, -s, s, c) * pTorus.xz;

            // Animate Vortex
            float va = t * 1.0 - length(pVortex.xy)*0.2;
            float vc = cos(va); float vs = sin(va);
            pVortex.xy = mat2(vc, -vs, vs, vc) * pVortex.xy;

            // Mix based on mode
            if(m <= 0.0) pos = pSphere;
            else if(m <= 1.0) pos = mix(pSphere, pTorus, m);
            else if(m <= 2.0) pos = mix(pTorus, pLattice, m - 1.0);
            else if(m <= 3.0) pos = mix(pLattice, pVortex, m - 2.0);
            else pos = pVortex;

            // Audio reactivity
            pos *= (1.0 + uAudio * 0.4);

            // Hand Interaction (Soft Forces)
            if (uHandLeft.x > -90.0) {
                float d = distance(pos, uHandLeft);
                float influence = smoothstep(12.0, 0.0, d);
                if (uHandLeftState < 0.0) { // Pinch - Pull
                    pos = mix(pos, uHandLeft, influence * 0.3); 
                } else { // Open - Push/Displace
                     pos += normalize(pos - uHandLeft) * influence * 8.0;
                }
            }
            
            if (uHandRight.x < 90.0) {
                float d = distance(pos, uHandRight);
                float influence = smoothstep(12.0, 0.0, d);
                if (uHandRightState < 0.0) { // Pinch
                    pos = mix(pos, uHandRight, influence * 0.3);
                } else { // Open
                    pos += normalize(pos - uHandRight) * influence * 8.0;
                }
            }

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = (1.5 + aRandom.y * 2.0 + uAudio * 5.0) * (30.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
            
            // Soft depth fade
            vDist = length(pos);
            float depthFade = smoothstep(60.0, 10.0, -mvPosition.z);
            vAlpha = depthFade * (0.2 + aRandom.z * 0.6);
            vColor = pos; 
        }
    `;

const particleFragmentShader = `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDist;

        void main() {
            // Soft circular particle
            vec2 center = gl_PointCoord - 0.5;
            float dist = length(center);
            if (dist > 0.5) discard;
            
            float glow = 1.0 - smoothstep(0.0, 0.5, dist);
            glow = pow(glow, 1.5); // Soften edge

            // Color gradient based on spatial position
            vec3 col = mix(uColor1, uColor2, smoothstep(-20.0, 20.0, vColor.x + vColor.y));
            
            gl_FragColor = vec4(col, vAlpha * glow);
        }
    `;

// Geometry Setup
const geometry = new THREE.BufferGeometry();
const indices = new Float32Array(CONFIG.particleCount);
const randoms = new Float32Array(CONFIG.particleCount * 3);

for (let i = 0; i < CONFIG.particleCount; i++) {
  indices[i] = i;
  randoms[i * 3] = Math.random();
  randoms[i * 3 + 1] = Math.random();
  randoms[i * 3 + 2] = Math.random();
}

geometry.setAttribute(
  "position",
  new THREE.BufferAttribute(
    new Float32Array(CONFIG.particleCount * 3).fill(0),
    3,
  ),
);
geometry.setAttribute("aIndex", new THREE.BufferAttribute(indices, 1));
geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 3));

const palettes = [
  { c1: new THREE.Color("#A855F7"), c2: new THREE.Color("#2dd4bf") }, // Bright Purple / Teal
  { c1: new THREE.Color("#f472b6"), c2: new THREE.Color("#60a5fa") }, // Pink / Blue
  { c1: new THREE.Color("#fb923c"), c2: new THREE.Color("#e11d48") }, // Orange / Rose
];

const material = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uMode: { value: 0 },
    uHandLeft: { value: new THREE.Vector3(-100, 0, 0) },
    uHandRight: { value: new THREE.Vector3(100, 0, 0) },
    uHandLeftState: { value: 0 },
    uHandRightState: { value: 0 },
    uAudio: { value: 0 },
    uColor1: { value: palettes[0].c1 },
    uColor2: { value: palettes[0].c2 },
  },
  vertexShader: particleVertexShader,
  fragmentShader: particleFragmentShader,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const points = new THREE.Points(geometry, material);
scene.add(points);

// --- AUDIO SYSTEM ---
let audioContext, analyser, dataArray;
const setupAudio = async () => {
  if (audioContext) return;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    const btn = document.getElementById("btn-audio");
    btn.classList.add("bg-white/10", "border-white/20");
    btn.querySelector("i").classList.remove("text-white/60");
    btn.querySelector("i").classList.add("text-emerald-400");
  } catch (e) {
    console.error("Audio denied", e);
  }
};

// --- HAND TRACKING SYSTEM (Robust) ---
const initHandTracking = async () => {
  const btn = document.getElementById("btn-cam");
  const videoElement = document.getElementById("input-video");

  // Indicate loading
  btn.querySelector("i").classList.add("animate-spin");

  try {
    // Initialize MediaPipe Hands
    const hands = new window.Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      },
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1, // 0 for faster speed on mobile, 1 for accuracy
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    hands.onResults(onHandsResults);

    // Initialize Camera Utils
    const cam = new window.Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 640,
      height: 480,
    });

    await cam.start();

    // Success UI update
    btn.querySelector("i").classList.remove("animate-spin");
    btn.querySelector("i").classList.add("text-emerald-400", "text-white");
    document
      .getElementById("cam-active-indicator")
      .classList.remove("opacity-0");
  } catch (err) {
    console.error("Camera Init Error:", err);
    btn.querySelector("i").classList.remove("animate-spin");
    alert("Could not access camera. Please allow permissions.");
  }
};

function onHandsResults(results) {
  STATE.hands.active = false;

  // Reset if lost
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    STATE.hands.left.target.set(-100, 0, 0);
    STATE.hands.right.target.set(100, 0, 0);
    document.getElementById("hand-status").classList.add("opacity-0");
  } else {
    STATE.hands.active = true;
    document.getElementById("hand-status").classList.remove("opacity-0");

    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const landmarks = results.multiHandLandmarks[i];
      const handedness = results.multiHandedness[i].label; // Left or Right

      // Convert coords: MediaPipe (0,1) -> Three.js World Coords (approx)
      // Inverting X because webcam is usually mirrored
      const x = (0.5 - landmarks[9].x) * 50;
      const y = (0.5 - landmarks[9].y) * 35;
      const z = -landmarks[9].z * 30; // Depth estimation

      // Detect Pinch
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const pinchDist = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) +
          Math.pow(thumbTip.y - indexTip.y, 2),
      );

      let state = 0;
      if (pinchDist < 0.05)
        state = -1.0; // Pinching
      else state = 1.0; // Open hand

      if (handedness === "Right") {
        STATE.hands.right.target.set(x, y, z);
        STATE.hands.right.state = state;
      } else {
        STATE.hands.left.target.set(x, y, z);
        STATE.hands.left.state = state;
      }
    }
  }
}

// --- INTERACTION LOGIC ---
window.setMode = (idx) => {
  STATE.targetMode = idx;
  document.querySelectorAll(".mode-btn").forEach((btn, i) => {
    if (i === idx) {
      btn.classList.add("active", "bg-white/10");
      btn.classList.remove("bg-transparent");
      btn.querySelector("span:first-child").classList.add("text-white");
    } else {
      btn.classList.remove("active", "bg-white/10");
      btn.classList.add("bg-transparent");
      btn.querySelector("span:first-child").classList.remove("text-white");
    }
  });
  const names = [
    "NEBULA CLOUD",
    "QUANTUM TORUS",
    "CYBER LATTICE",
    "WARP VORTEX",
  ];
  document.getElementById("sim-mode").innerText = names[idx];
};

window.cycleColor = (idx) => {
  STATE.colorPalette = idx;
  // Smooth color transition is handled in GSAP-like fashion in animate loop manually if needed,
  // but here we just update uniforms, which is fast enough.
  // For smoother transition we could lerp, but direct swap is responsive.
};

// --- EVENTS ---
document.getElementById("btn-audio").onclick = setupAudio;
document.getElementById("btn-cam").onclick = initHandTracking;
document.getElementById("btn-rec").onclick = () => {
  renderer.render(scene, camera);
  const link = document.createElement("a");
  link.download = `aether-os-${Date.now()}.png`;
  link.href = renderer.domElement.toDataURL("image/png");
  link.click();
};

// Click to cycle modes
document.getElementById("canvas-container").addEventListener("click", () => {
  const nextMode = (STATE.targetMode + 1) % 4;
  window.setMode(nextMode);
});

// Mouse Fallback
window.addEventListener("mousemove", (e) => {
  if (STATE.hands.active) return;
  const x = (e.clientX / window.innerWidth) * 2 - 1;
  const y = -(e.clientY / window.innerHeight) * 2 + 1;
  STATE.hands.right.target.set(x * 30, y * 20, 0);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);

  CONFIG.cameraZ = window.innerWidth < 768 ? 40 : 28;
});

// --- ANIMATION LOOP ---
const clock = new THREE.Clock();
lucide.createIcons();

// --- GENERATE STAR FIELD ---
(function generateStars() {
  const starField = document.getElementById("star-field");
  const starCount = isMobile ? 80 : 200;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < starCount; i++) {
    const star = document.createElement("div");
    star.className = "star";
    const size = Math.random() * 2.5 + 0.5; // 0.5px to 3px
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const opacity = Math.random() * 0.6 + 0.1;
    const duration = Math.random() * 4 + 3; // 3s to 7s
    const delay = Math.random() * 5;
    const animName = Math.random() > 0.5 ? "twinkle" : "twinkle-slow";
    star.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${x}%;
      top: ${y}%;
      opacity: ${opacity};
      animation: ${animName} ${duration}s ${delay}s ease-in-out infinite;
      box-shadow: 0 0 ${size * 2}px rgba(255,255,255,${opacity * 0.5});
    `;
    fragment.appendChild(star);
  }
  starField.appendChild(fragment);
})();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  STATE.time += delta;

  // Audio Level
  if (analyser) {
    analyser.getByteFrequencyData(dataArray);
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    STATE.audioLevel += (avg / 255 - STATE.audioLevel) * 0.1; // Smooth lerp
    material.uniforms.uAudio.value = STATE.audioLevel;
  }

  // Mode Transition
  if (Math.abs(STATE.mode - STATE.targetMode) > 0.001) {
    STATE.mode += (STATE.targetMode - STATE.mode) * 0.05; // Smooth slide
  } else {
    STATE.mode = STATE.targetMode;
  }
  material.uniforms.uMode.value = STATE.mode;

  // Update Time
  material.uniforms.uTime.value = STATE.time;
  finalPass.uniforms.uTime.value = STATE.time;

  // Smooth Hand/Mouse Movement
  const lerpFactor = 0.1;
  STATE.hands.left.pos.lerp(STATE.hands.left.target, lerpFactor);
  STATE.hands.right.pos.lerp(STATE.hands.right.target, lerpFactor);

  material.uniforms.uHandLeft.value.copy(STATE.hands.left.pos);
  material.uniforms.uHandRight.value.copy(STATE.hands.right.pos);
  material.uniforms.uHandLeftState.value = STATE.hands.left.state;
  material.uniforms.uHandRightState.value = STATE.hands.right.state;

  // Color Smooth Transition
  const targetC1 = palettes[STATE.colorPalette].c1;
  const targetC2 = palettes[STATE.colorPalette].c2;
  material.uniforms.uColor1.value.lerp(targetC1, 0.05);
  material.uniforms.uColor2.value.lerp(targetC2, 0.05);

  // Camera Sway (Subtle idle movement)
  if (!STATE.hands.active) {
    const zTarget = CONFIG.cameraZ + Math.sin(STATE.time * 0.5) * 2;
    camera.position.z += (zTarget - camera.position.z) * 0.02;
    camera.position.x = Math.sin(STATE.time * 0.2) * 2;
    camera.position.y = Math.cos(STATE.time * 0.15) * 2;
    camera.lookAt(0, 0, 0);
  }

  composer.render();
}

animate();
