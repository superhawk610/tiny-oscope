import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import 'normalize.css';

type Context = CanvasRenderingContext2D;

const bright = 'rgb(0, 255, 160)';
const dim = 'rgba(0, 255, 160, 0.65)';
const glowBright = 'rgba(0, 255, 160, 0.6)';
const glowDim = 'rgba(0, 255, 160, 0.3)';

const WIDTH = 400;
const HEIGHT = 250;
const SCALE = 1.8;

let animateTimeout: number | null = null;
let renderTimeout: number | null = null;

// -- 2D --

function clearScreen(ctx: Context) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
}

function drawLine(
  ctx: Context,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawRect(ctx: Context, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.stroke();
}

function drawRoundedRect(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + h - r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.stroke();
}

function drawPixels(ctx: Context, pixels: number[]) {
  if (pixels.length % 2 !== 0) {
    throw new Error('pixels must contain pairs of (x, y) coordinates');
  }

  if (pixels.length === 0) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pixels[0], pixels[1]);
  for (let i = 2; i < pixels.length; i += 2) {
    const x = pixels[i];
    const y = pixels[i + 1];
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

const SCREEN_GAP = 10;
const SAFE_GAP = 18;
const WRITE_GAP = 22;

function draw(ctx: Context) {
  // clear existing pixels
  clearScreen(ctx);

  // set stroke/shadow color
  ctx.strokeStyle = bright;
  ctx.shadowColor = glowBright;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.shadowBlur = 2;

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

  function inner() {
    // clear drawable area
    ctx.clearRect(
      SAFE_GAP,
      SAFE_GAP,
      WIDTH - 2 * SAFE_GAP,
      HEIGHT - 2 * SAFE_GAP
    );

    // draw gridlines
    ctx.strokeStyle = GRID_LINE;
    ctx.shadowColor = GRID_GLOW;
    ctx.setLineDash([16, 5]);
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
    ctx.strokeStyle = dim;
    ctx.shadowColor = glowDim;
    ctx.setLineDash([]);

    // draw axes
    drawLine(ctx, WRITE_GAP, HEIGHT / 2, WIDTH - WRITE_GAP, HEIGHT / 2);
    drawLine(ctx, WIDTH / 2, WRITE_GAP, WIDTH / 2, HEIGHT - WRITE_GAP);
    ctx.strokeStyle = bright;
    ctx.shadowColor = glowBright;

    // FIXME: scale labels/display with input value range

    // draw labels
    ctx.font = '16px "Syne Mono", monospace';
    ctx.fillStyle = bright;
    ctx.fillText('-2.5V', WIDTH / 2 - 53, HEIGHT - WRITE_GAP - 5);
    ctx.fillText('+2.5V', WIDTH / 2 - 53, WRITE_GAP + 18);

    // draw data series
    const pixels = [];
    for (let i = WRITE_GAP; i < WIDTH - WRITE_GAP; i++) {
      pixels.push(i);

      // sine wave
      // pixels.push(HEIGHT / 2 + Math.sin(i / 16 + phase) * 40);

      // square wave
      pixels.push(HEIGHT / 2 + (Math.sin(i / 20 + phase) > 0.5 ? 1 : -1) * 40);
    }
    drawPixels(ctx, pixels);
    phase += 0.04;
    animateTimeout = setTimeout(inner, FRAME_RATE);
  }
  inner();
}

// -- 3D --

interface GLContext {
  // The 2D canvas backing the WebGL output.
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

function render(gl: GLContext) {
  const texture = new THREE.CanvasTexture(gl.canvas);
  // const material = new THREE.MeshBasicMaterial({
  //   map: texture,
  //   transparent: true,
  // });

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
    texture.needsUpdate = true;
    gl.renderer.render(gl.scene, gl.camera);
  });
  setTimeout(() => (gl.renderer.domElement.style.opacity = '1'), 500);
}

function cleanup(ctx: Context, gl: GLContext) {
  if (animateTimeout) clearTimeout(animateTimeout);
  clearScreen(ctx);

  gl.renderer.setAnimationLoop(null);
  gl.renderer.setClearAlpha(0);
  gl.renderer.clear();
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shaderRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // not sure if doing this inside `useEffect` works?
    const canvas = canvasRef.current;
    const shader = shaderRef.current;
    if (!canvas || !shader) return;

    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d')!;
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
    render(gl);

    return () => {
      cleanup(ctx, gl);
    };
  }, []);

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
      </div>
    </div>
  );
}

export default App;
