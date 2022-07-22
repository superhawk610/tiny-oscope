import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api';
import * as THREE from 'three';
import 'normalize.css';

const bright = 'rgb(0, 255, 160)';
const dim = 'rgba(0, 255, 160, 0.65)';
const glowBright = 'rgba(0, 255, 160, 0.6)';
const glowDim = 'rgba(0, 255, 160, 0.3)';

const WIDTH = 400;
const HEIGHT = 250;
const SCALE = 1.8;

let updateAverage = false;
let autoZoom = false;
let resetCoords = false;

const MAX_ZOOM = 32;
const MAX_VOLT = 5;

let zoom = 1;
let min = 0;
let max = MAX_VOLT;

// returns the current analog voltage reading, as
// a value in the range [0, 1], where 0 means 0V
// and 1 means 5V
function analogRead(): Promise<number> {
  return invoke('analog_read');
  // return Math.random();
}

function clamp(min: number, max: number, n: number) {
  return Math.min(Math.max(n, min), max);
}

// t is the distance through the range [0, 1]
// values of t outside this range will be clamped
function lerp(min: number, max: number, t: number) {
  return (max - min) * clamp(0, 1, t) + min;
}

// given a range and output value from `lerp`, return the
// `t` required to generate that value in that range
function invlerp(min: number, max: number, v: number) {
  return clamp(0, 1, (v - min) / (max - min));
}

// -- 2D --

function clearScreen(ctx: Context) {
  ctx.inner.clearRect(0, 0, WIDTH, HEIGHT);
}

function drawLine(
  ctx: Context,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  ctx.inner.beginPath();
  ctx.inner.moveTo(x1, y1);
  ctx.inner.lineTo(x2, y2);
  ctx.inner.stroke();
}

function drawRect(ctx: Context, x: number, y: number, w: number, h: number) {
  ctx.inner.beginPath();
  ctx.inner.moveTo(x, y);
  ctx.inner.lineTo(x + w, y);
  ctx.inner.lineTo(x + w, y + h);
  ctx.inner.lineTo(x, y + h);
  ctx.inner.lineTo(x, y);
  ctx.inner.closePath();
  ctx.inner.stroke();
}

function drawRoundedRect(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.inner.beginPath();
  ctx.inner.moveTo(x + r, y);
  ctx.inner.lineTo(x + w - r, y);
  ctx.inner.arcTo(x + w, y, x + w, y + h - r, r);
  ctx.inner.lineTo(x + w, y + h - r);
  ctx.inner.arcTo(x + w, y + h, x + r, y + h, r);
  ctx.inner.lineTo(x + r, y + h);
  ctx.inner.arcTo(x, y + h, x, y + r, r);
  ctx.inner.lineTo(x, y + r);
  ctx.inner.arcTo(x, y, x + r, y, r);
  ctx.inner.closePath();
  ctx.inner.stroke();
}

function drawPixels(ctx: Context, pixels: number[]) {
  if (pixels.length % 2 !== 0) {
    throw new Error('pixels must contain pairs of (x, y) coordinates');
  }

  if (pixels.length === 0) {
    return;
  }

  ctx.inner.beginPath();
  ctx.inner.moveTo(pixels[0], pixels[1]);
  for (let i = 2; i < pixels.length; i += 2) {
    const x = pixels[i];
    const y = pixels[i + 1];
    ctx.inner.lineTo(x, y);
  }
  ctx.inner.stroke();
}

const SCREEN_GAP = 10;
const SAFE_GAP = 18;
const WRITE_GAP = 22;

function draw(ctx: Context) {
  // clear existing pixels
  clearScreen(ctx);

  // set stroke/shadow color
  ctx.inner.strokeStyle = bright;
  ctx.inner.shadowColor = glowBright;
  ctx.inner.shadowOffsetX = 0;
  ctx.inner.shadowOffsetY = 0;
  ctx.inner.shadowBlur = 2;

  // draw screen border
  drawRoundedRect(
    ctx,
    SCREEN_GAP,
    SCREEN_GAP,
    WIDTH - 2 * SCREEN_GAP,
    HEIGHT - 2 * SCREEN_GAP,
    8
  );

  // perform any repeating draws
  loop(ctx);
}

const FRAME_RATE = 1_000 / 60;

const GRID_OFFSET = 38;
const GRID_V_GAP = 40;
const GRID_H_GAP = 40;
const GRID_LINE = 'rgba(255, 255, 255, 0.3)';
const GRID_GLOW = 'rgba(255, 255, 255, 0.1)';

function loop(ctx: Context) {
  let phase = 0;
  const PHASE_STEP = 1;
  let coords: number[];
  resetCoords = true;

  async function inner() {
    if (resetCoords) {
      coords = new Array(WIDTH - WRITE_GAP * 2).fill(0.5);
      resetCoords = false;
    }

    // clear drawable area
    ctx.inner.clearRect(
      SAFE_GAP,
      SAFE_GAP,
      WIDTH - 2 * SAFE_GAP,
      HEIGHT - 2 * SAFE_GAP
    );

    // draw gridlines
    ctx.inner.strokeStyle = GRID_LINE;
    ctx.inner.shadowColor = GRID_GLOW;
    ctx.inner.setLineDash([16, 5]);
    for (
      let i = WRITE_GAP + GRID_OFFSET;
      i < HEIGHT - WRITE_GAP;
      i += GRID_V_GAP
    ) {
      drawLine(ctx, WRITE_GAP, i, WIDTH - WRITE_GAP, i);
    }
    for (
      let i = WRITE_GAP + GRID_OFFSET;
      i < WIDTH - WRITE_GAP;
      i += GRID_H_GAP
    ) {
      drawLine(ctx, i, WRITE_GAP, i, HEIGHT - WRITE_GAP);
    }
    ctx.inner.strokeStyle = dim;
    ctx.inner.shadowColor = glowDim;
    ctx.inner.setLineDash([]);

    // draw axes
    drawLine(ctx, WRITE_GAP, HEIGHT / 2, WIDTH - WRITE_GAP, HEIGHT / 2);
    drawLine(ctx, WIDTH / 2, WRITE_GAP, WIDTH / 2, HEIGHT - WRITE_GAP);
    ctx.inner.strokeStyle = bright;
    ctx.inner.shadowColor = glowBright;

    // draw labels
    if (autoZoom) {
      const coordMin = coords.reduce((a, b) => Math.min(a, b));
      const coordMax = coords.reduce((a, b) => Math.max(a, b));
      const range = coordMax - coordMin;
      zoom = (1 / range) * 0.8; // zoom out a bit to leave a gap
      zoom = Math.max(1, zoom); // try not to zoom too far outside 5V

      autoZoom = false;
      updateAverage = true;
    }

    if (updateAverage) {
      const average = lerp(
        0,
        MAX_VOLT,
        coords.reduce((a, b) => a + b) / coords.length
      );
      const halfRange = MAX_VOLT / zoom / 2;
      min = average - halfRange;
      max = average + halfRange;

      updateAverage = false;
    }

    ctx.inner.font = '16px "Syne Mono", monospace';
    ctx.inner.fillStyle = bright;
    ctx.inner.textAlign = 'right';
    ctx.inner.textBaseline = 'bottom';
    ctx.inner.fillText(
      `${min < 0 ? '' : '+'}${min.toFixed(min < 1 && min >= 0.05 ? 2 : 1)}V`,
      WIDTH / 2 - 8,
      HEIGHT - WRITE_GAP - 5
    );
    ctx.inner.textBaseline = 'top';
    ctx.inner.fillText(
      `${max < 0 ? '' : '+'}${max.toFixed(max < 1 && max >= 0.05 ? 2 : 1)}V`,
      WIDTH / 2 - 8,
      WRITE_GAP + 5
    );

    // get data
    coords[phase] = await analogRead();
    phase = (phase + PHASE_STEP) % coords.length;

    // draw data series
    const pixels = [];
    for (let i = 0; i < coords.length; i++) {
      const t = coords[(i + phase) % coords.length];
      pixels.push(i + WRITE_GAP);
      pixels.push(
        HEIGHT -
          WRITE_GAP -
          lerp(
            24,
            HEIGHT - WRITE_GAP * 2 - 24,
            invlerp(min / MAX_VOLT, max / MAX_VOLT, t)
          )
      );

      // sine wave
      // pixels.push(HEIGHT / 2 + Math.sin(i / 16 + phase) * 40);

      // square wave
      // pixels.push(HEIGHT / 2 + (Math.sin(i / 20 + phase) > 0.5 ? 1 : -1) * 40);
    }
    drawPixels(ctx, pixels);
    if (ctx.texture) ctx.texture.needsUpdate = true;
    if (!ctx.closed) ctx.timeout = setTimeout(inner, FRAME_RATE);
  }
  if (!ctx.closed) inner();
}

// -- 3D --

interface Context {
  inner: CanvasRenderingContext2D;
  timeout: number | null;
  closed: boolean;

  // probably cursed, oh well
  // (seems like 3D texture will rely on the 2D renderer to update
  // it in a timely fashion, so we should probably just combine the
  // 2D/3D contexts, or maybe nest them)
  texture: THREE.Texture | null;
}

interface GLContext {
  // The 2D canvas backing the WebGL output.
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

function render(gl: GLContext, ctx: Context) {
  const texture = new THREE.CanvasTexture(gl.canvas);
  // const material = new THREE.MeshBasicMaterial({
  //   map: texture,
  //   transparent: true,
  // });

  ctx.texture = texture;

  const vertexShader = `
    varying vec2 v_uv;

    void main() {
      v_uv = uv;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform sampler2D tex;

    varying vec2 v_uv;

    const float threshold = 0.4;
    const float factor = 0.3;

    void main() {
      float x = v_uv.x;
      float y = v_uv.y;
      float d = sqrt(pow(x - 0.5, 2.0) + pow(y - 0.5, 2.0));
      vec2 v = normalize(vec2(x - 0.5, y - 0.5));

      // rounded screen corners
      float t = d + d * factor * (d - threshold);
      // float t = d;

      // shadow around corners
      // float a = d < threshold ? 0.0 : 0.8 * (d - threshold);
      float a = 0.0;

      vec4 sampled = texture(tex, vec2(x, y)) * (d < threshold ? 1.0 : 0.0)
                   + texture(tex, vec2(0.5, 0.5) + v * t) * (d < threshold ? 0.0 : 1.0);

      // gl_FragColor = sampled * (1.0 - a) + vec4(0, 0, 0, 1) * a;
      gl_FragColor = sampled;
    }
  `;

  const uniforms = { tex: { type: 't', value: texture } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
  });
  const geometry = new THREE.PlaneGeometry(WIDTH, HEIGHT);
  const mesh = new THREE.Mesh(geometry, material);
  gl.scene.add(mesh);

  gl.renderer.setSize(WIDTH * SCALE, HEIGHT * SCALE);
  gl.renderer.setAnimationLoop(() => {
    // texture.needsUpdate = true;
    gl.renderer.render(gl.scene, gl.camera);
  });
  setTimeout(() => (gl.renderer.domElement.style.opacity = '1'), 500);
}

function cleanup(ctx: Context, gl: GLContext) {
  ctx.closed = true;
  if (ctx.timeout) clearTimeout(ctx.timeout);
  clearScreen(ctx);

  gl.renderer.setAnimationLoop(null);
  gl.renderer.setClearAlpha(0);
  gl.renderer.clear();
}

interface Stats {
  amplitude: number;
  frequency: number;
  wavelength: number;
}

function fetchStats(): Promise<Stats> {
  return invoke('stats');
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shaderRef = useRef<HTMLCanvasElement>(null);

  const [amplitude, setAmplitude] = useState('--');
  const [frequency, setFrequency] = useState('--');
  const [wavelength, setWavelength] = useState('--');

  useEffect(() => {
    // not sure if doing this inside `useEffect` works?
    const canvas = canvasRef.current;
    const shader = shaderRef.current;
    if (!canvas || !shader) return;

    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const inner = canvas.getContext('2d')!;
    const ctx = { inner, timeout: null, closed: false, texture: null };
    draw(ctx);

    const scene = new THREE.Scene();
    // Calculate the distance to move the camera backwards to make the canvas
    // texture fill the available space, as explained in the linked SO answer.
    // ref: https://stackoverflow.com/a/31777283/885098
    const fov = 70;
    const z = HEIGHT / (2 * Math.tan((fov * Math.PI) / 360));
    const camera = new THREE.PerspectiveCamera(70, WIDTH / HEIGHT, 0.01, z);
    camera.position.z = z;
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      canvas: shader,
      antialias: true,
    });
    const gl = { canvas, renderer, scene, camera };
    render(gl, ctx);

    return () => {
      cleanup(ctx, gl);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const stats = await fetchStats();
      setAmplitude(`${stats.amplitude.toFixed(3)}V`);
      setFrequency(`${stats.frequency.toFixed(3)}Hz`);
      setWavelength(`${stats.wavelength.toFixed(3)}s`);
    }, 1_000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const auto = () => {
    autoZoom = true;
  };

  const reset = () => {
    zoom = 1;
    min = 0;
    max = MAX_VOLT;
    resetCoords = true;
  };

  const zoomIn = () => {
    zoom = Math.min(zoom * 2, MAX_ZOOM);
    updateAverage = true;
  };

  const zoomOut = () => {
    zoom = Math.max(zoom / 2, 1);
    updateAverage = true;
  };

  return (
    <div className="flex items-center justify-center h-screen w-screen">
      <div>
        <div
          style={{ width: WIDTH * SCALE }}
          className="flex flex-col items-center justify-center"
        >
          <div className="flex flex-row items-center justify-center">
            <span>tiny-oscope v0.1.0</span>
            <span className="blinking-cursor" />
          </div>
          <div>
            (c) {new Date().getFullYear()} Aaron Ross, All Rights Reserved.
          </div>
        </div>
        <canvas
          ref={canvasRef}
          // width={WIDTH}
          // height={HEIGHT}
          // style={{ width: WIDTH * SCALE, height: HEIGHT * SCALE }}
          style={{ display: 'none' }}
        />
        <canvas
          ref={shaderRef}
          style={{ transition: 'opacity 500ms ease-in', opacity: 0 }}
        />
        <div className="flex flex-row justify-center" style={{ opacity: 0.7 }}>
          <div className="mr-12">AMP: {amplitude}</div>
          <div className="mr-12">FREQ: {frequency}</div>
          <div>WVLN: {wavelength}</div>
        </div>
        <div className="flex flex-row justify-center">
          <button className="btn mr-5" disabled>
            function
          </button>
          <button className="btn mr-5" onClick={auto}>
            auto
          </button>
          <button className="btn mr-5" onClick={reset}>
            reset
          </button>
          <button className="btn mr-5" onClick={zoomOut}>
            zoom -
          </button>
          <button className="btn" onClick={zoomIn}>
            zoom +
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
