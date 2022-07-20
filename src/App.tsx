import { useEffect, useRef } from 'react';
import 'normalize.css';

type Context = CanvasRenderingContext2D;

const bright = 'rgb(0, 255, 160)';
const dim = 'rgba(0, 255, 160, 0.8)';
const glow = 'rgba(0, 255, 160, 0.6)';

const WIDTH = 400;
const HEIGHT = 250;

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

function drawPixels(ctx: Context, pixels: number[]) {
  if (pixels.length % 2 !== 0) {
    throw new Error('pixels must contain pairs of (x, y) coordinates');
  }

  if (pixels.length === 0) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pixels[0], pixels[1]);
  for (let i = 2; i < pixels.length / 2; i += 2) {
    const x = pixels[i];
    const y = pixels[i + 1];
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

let phase = 0;
let waveTimeout: number | null = null;
function draw(ctx: Context) {
  // clear existing pixels
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  // set stroke/shadow color
  ctx.strokeStyle = bright;
  ctx.shadowColor = glow;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.shadowBlur = 4;

  // draw some stuff
  drawLine(ctx, 20, 20, 20, 120);
  drawLine(ctx, 40, 20, 40, 120);

  // draw an animated sine wave
  if (waveTimeout) clearTimeout(waveTimeout);
  function wave() {
    ctx.clearRect(80, 0, WIDTH - 80, HEIGHT);
    const pixels = [];
    for (let i = 0; i < 250; i++) {
      pixels.push(90 + i);
      pixels.push(60 + Math.sin(i / 3 + phase) * 10);
    }
    drawPixels(ctx, pixels);
    phase++;
    waveTimeout = setTimeout(wave, 100);
  }
  wave();
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    draw(ctx);
  }, []);

  return (
    <div>
      <div className="flex flex-row items-center">
        <span>hello, world!</span>
        <span className="blinking-cursor" />
      </div>
      <canvas ref={canvasRef} style={{ width: WIDTH, height: HEIGHT }} />
    </div>
  );
}

export default App;
