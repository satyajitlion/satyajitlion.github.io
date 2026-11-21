/* =====================================================================
   script.js: everything on the site that moves

   TABLE OF CONTENTS
    1. SETTINGS .............. numbers you can safely tweak
    2. HELPERS & CANVASES .... shortcuts and the canvases used
    2B. EFFECTS ON/OFF ....... one switch for the lens, ripples, cursor and transitions
    3. WEBGL SKY ............. draws the lensed starfield on the graphics card
    4. SHARED STATE .......... variables read on every frame
    5. 2D LENS (fallback) .... the same lens in plain canvas, for browsers without WebGL
    6. BUILD THE SKY ......... paints the starfield on load and on resize
    7. BUILD THE PORTRAIT .... copies your photo into a canvas so it can be lensed
    8. RIPPLES ............... gravitational waves started by clicks
    9. ANIMATION LOOP ........ runs about 60 times per second
   10. MOUSE, CLICK & CURSOR INPUT (includes the star cursor)
   11. START UP
   11B. PERSONAL LIFE ..... sidebar page: dog wipe, Undertale scene, music
   12. PAGES & TRANSITIONS ... #about, #research, ... routing and the lensing page-in
   11D. GAME THEMES ........ click a game: the page re-themes; parallax background
   13. LENS-MODEL DEMO ....... the interactive simulator on the Research page
   14. CONTACT FORM ......... the message form on the Contact page

   NAME GLOSSARY (short names used below)
     bg, bx      visible 2D canvas behind the page + its drawing context (fallback only)
     sc, sp      hidden canvas holding the unlensed starfield + its context
     bgPix       raw pixels of that starfield: the "source" the lens looks things up in
     pc, px      portrait canvas + context;  ps, pp  hidden copy of the photo;  ptPix  its pixels
     W, H        viewport width and height in pixels
     m           last mouse position and time;  kick  the last nav click (position and time)
     waves       active click ripples;  rings  the ripple rings computed for this frame
   ===================================================================== */

/* ---- 1. SETTINGS (safe to edit) ---- */
const LENS_RADIUS = 200; // size of the area the cursor lens can bend, in px
const LENS_STRENGTH = 64; // lens strength (Einstein radius in px): bigger = stronger, wider ring
const RIPPLE_MS = 1500; // how long one ripple lasts, in ms
const RIPPLE_STRENGTH = 16; // how hard a ripple bends the sky at the start, in px
const RIPPLE_REACH = 0.7; // how far ripples travel, as a fraction of the screen's longest side
const RIPPLES_PER_CLICK = 1; // number of waves sent by each nav click
const RIPPLE_GAP_MS = 200; // delay between those waves, in ms (only matters if RIPPLES_PER_CLICK is above 1)
const RIPPLE_COOLDOWN_MS = 900; // a new ripple is ignored if another started less than this many ms ago
const IDLE_SPEED = 0.35; // how fast the lens drifts when the mouse is idle (1 = original speed, smaller = slower)
const IDLE_STRENGTH = 0.7; // lens strength while idle (1 = same as when following the mouse)
const PAGE_OUT_MS = 160; // old page fade-out time, in ms
const PAGE_IN_MS = 600; // new page lensing-in time, in ms
const PAGE_IN_WARP = 150; // how strongly the new page is warped when it first appears
const RESPECT_REDUCED_MOTION = false; // true = visitors whose device has "Reduce motion" turned on get instant page changes
// (no wipe, no lensing). Set to false to always play the animations, e.g. if you can't see them on your own computer.

/* ---- 2. HELPERS & CANVASES ---- */
// $("#id") is a shortcut for document.querySelector
const $ = (s) => document.querySelector(s);
$("#yr").textContent = new Date().getFullYear();
// Canvases: the page background (2D fallback), the hidden unlensed starfield, and the portrait
const bg = $("#bg"),
  bx = bg.getContext("2d"),
  sc = document.createElement("canvas"),
  sp = sc.getContext("2d", { willReadFrequently: true });
const pc = $("#ptc"),
  pw = $(".pt"),
  px = pc.getContext("2d"),
  ps = document.createElement("canvas"),
  pp = ps.getContext("2d", { willReadFrequently: true });
const R = LENS_RADIUS,
  E0 = LENS_STRENGTH,
  S = 22,
  patchB = bx.createImageData(2 * R, 2 * R),
  patchP = px.createImageData(2 * R, 2 * R);

/* ---- 2B. VISUAL EFFECTS ON/OFF ---- */
// One switch turns off the lens, ripples, star cursor and page transitions, leaving a plain starfield and the normal
// mouse cursor. The choice is remembered. Visitors whose device asks for reduced motion start with effects off.
let vfxOn = (() => {
  let saved = null;
  try { saved = localStorage.getItem("vfx"); } catch (e) {}
  if (saved) return saved === "on";
  return !(RESPECT_REDUCED_MOTION && matchMedia("(prefers-reduced-motion: reduce)").matches);
})();
function applyVfx() {
  document.documentElement.classList.toggle("no-vfx", !vfxOn);
  if (!vfxOn) document.documentElement.classList.remove("custom-cursor");
  for (const b of document.querySelectorAll("#fxToggle, #fxToggle2")) {
    b.setAttribute("aria-pressed", String(vfxOn));
    b.title = "Visual effects: " + (vfxOn ? "on" : "off") + " (click to change)";
  }
  $("#fxToggle2").textContent = "Effects: " + (vfxOn ? "on" : "off");
}
function setVfx(on) {
  vfxOn = on;
  try { localStorage.setItem("vfx", on ? "on" : "off"); } catch (e) {}
  applyVfx();
}
document.addEventListener("click", (e) => { if (e.target.closest("#fxToggle, #fxToggle2")) setVfx(!vfxOn); });
applyVfx();

/* ---- 3. WEBGL SKY ---- */
// Builds a full-screen shader that draws the starfield bent by the cursor lens and the ripples.
// If WebGL is unavailable, GL stays null and section 5 draws the same thing in plain canvas.
let GL = null, gcv, gU;
(function() {
  try {
    const c = document.createElement("canvas");
    c.setAttribute("aria-hidden", "true");
    c.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:0";
    const g = c.getContext("webgl", { antialias: false, alpha: false });
    if (!g) return;
    const sh = (t, x) => {
      const o = g.createShader(t);
      g.shaderSource(o, x);
      g.compileShader(o);
      if (!g.getShaderParameter(o, g.COMPILE_STATUS)) throw 1;
      return o;
    }, pr = g.createProgram();
    g.attachShader(pr, sh(g.VERTEX_SHADER, "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}"));
    g.attachShader(pr, sh(g.FRAGMENT_SHADER, `precision highp float;uniform sampler2D t;uniform vec2 res,L;uniform float E,Rr;uniform vec4 w[4];
// main() runs once for every screen pixel. t = starfield, res = screen size, L = lens position,
// E = lens strength, Rr = lens radius, w[4] = ripple rings as (x, y, radius, strength).
// Step 1: add up how far the ripple rings push this pixel (o) and how bright their crests are (gw).
void main(){vec2 p=vec2(gl_FragCoord.x,res.y-gl_FragCoord.y),o=vec2(0.);float gw=0.;
for(int i=0;i<4;i++){vec4 k=w[i];if(k.w>0.){vec2 d=p-k.xy;float r=length(d)+1e-3,s=34.+.027*k.z,e=(r-k.z)/s,x=exp(-e*e);o+=d/r*k.w*e*x;gw+=x*k.w;}}
// Step 2: the cursor lens. Pixels near L look up a different spot in the starfield.
vec2 d=p-L;float r2=dot(d,d),u=clamp((sqrt(r2)/Rr-.45)/.55,0.,1.),wn=1.-u*u*(3.-2.*u),f=1.-wn*E*E/(r2+484.);
vec3 c=texture2D(t,(L+d*f+o)/res).rgb;c=c*(1.+gw*.011)+vec3(.30,.26,.85)*gw*.006;
// Step 3: a faint amber ring marks the lens edge.
float rg=(sqrt(r2)-E)/1.4;c+=vec3(.89,.66,.34)*.35*exp(-rg*rg);gl_FragColor=vec4(c,1.);}`));
    g.linkProgram(pr);
    if (!g.getProgramParameter(pr, g.LINK_STATUS)) throw 1;
    g.useProgram(pr);
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    const a = g.getAttribLocation(pr, "a");
    g.enableVertexAttribArray(a);
    g.vertexAttribPointer(a, 2, g.FLOAT, false, 0, 0);
    g.bindTexture(g.TEXTURE_2D, g.createTexture());
    for (const k of [g.TEXTURE_WRAP_S, g.TEXTURE_WRAP_T]) g.texParameteri(g.TEXTURE_2D, k, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    gU = { res: g.getUniformLocation(pr, "res"), L: g.getUniformLocation(pr, "L"), E: g.getUniformLocation(pr, "E"), Rr: g.getUniformLocation(pr, "Rr"), w: g.getUniformLocation(pr, "w") };
    document.body.insertBefore(c, document.getElementById("bg"));
    document.getElementById("bg").style.display = "none";
    gcv = c;
    GL = g;
  } catch (e) {
    GL = null;
  }
})();

/* ---- 4. SHARED STATE ---- */
const rings = [], od = [0, 0];
let rbuf, rc, rx, enabled = true, W = 0, H = 0, bgPix, ptPix, dirty = true;
const m = { x: -1e3, y: -1e3, t: -1e9 }, kick = { t: -1e9 };

/* ---- 5. 2D LENS (fallback) ---- */
// Bends a square patch of pixels around (lx, ly) like a point-mass lens: each pixel is
// replaced by the starfield pixel at "position minus strength²/distance". The effect fades
// to nothing at the patch edge. Used for the portrait, and for the sky when WebGL is missing.
function lens(ctx, patch, pix, sw, sh, lx, ly, E, rp) {
  const d = patch.data, L = Math.floor(lx) - R, T = Math.floor(ly) - R, D = 2 * R;
  for (let j = 0; j < D; j++) {
    const yy = T + j;
    if (yy < 0 || yy >= sh) continue;
    for (let i = 0; i < D; i++) {
      const xx = L + i;
      if (xx < 0 || xx >= sw) continue;
      const dx2 = xx - lx,
        dy = yy - ly,
        r2 = dx2 * dx2 + dy * dy,
        u = Math.min(1, Math.max(0, (Math.sqrt(r2) / R - 0.45) / 0.55)),
        w = 1 - u * u * (3 - 2 * u),
        f = 1 - w * E * E / (r2 + S * S);
      if (rp) disp(xx, yy, od);
      else {
        od[0] = od[1] = 0;
      }
      const x = Math.max(0, Math.min(sw - 1.001, lx + dx2 * f + od[0])),
        y = Math.max(0, Math.min(sh - 1.001, ly + dy * f + od[1])),
        ix = x | 0,
        iy = y | 0,
        fx = x - ix,
        fy = y - iy;
      const a = (iy * sw + ix) * 4, b = a + 4, c = a + sw * 4, e = c + 4, o = (j * D + i) * 4;
      for (let k = 0; k < 3; k++) d[o + k] = (pix[a + k] * (1 - fx) + pix[b + k] * fx) * (1 - fy) + (pix[c + k] * (1 - fx) + pix[e + k] * fx) * fy;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(patch, L, T);
}

/* ---- 6. BUILD THE SKY ---- */
// Paints the starfield (haze, grid, stars, faint galaxies) into the hidden canvas, then uploads it
// to the graphics card. The star pattern is seeded, so it looks the same every visit.
function buildBG() {
  W = innerWidth;
  H = innerHeight;
  bg.width = sc.width = W;
  bg.height = sc.height = H;
  sp.fillStyle = "#0A0912";
  sp.fillRect(0, 0, W, H);
  const hz = sp.createRadialGradient(W * 0.7, H * 0.35, 0, W * 0.7, H * 0.35, Math.max(W, H) * 0.8);
  hz.addColorStop(0, "rgba(123,110,246,.18)");
  hz.addColorStop(1, "rgba(123,110,246,0)");
  sp.fillStyle = hz;
  sp.fillRect(0, 0, W, H);
  sp.strokeStyle = "rgba(167,159,189,.17)";
  sp.lineWidth = 0.7;
  sp.beginPath();
  for (let g = 0; g < W; g += 64) {
    sp.moveTo(g, 0);
    sp.lineTo(g, H);
  }
  for (let g = 0; g < H; g += 64) {
    sp.moveTo(0, g);
    sp.lineTo(W, g);
  }
  sp.stroke();
  let s = 49273;
  const r = () => (s = s * 1664525 + 1013904223 >>> 0) / 4294967296;
  for (let i = 0, n = Math.min(1800, Math.max(400, W * H / 2200 | 0)); i < n; i++) {
    sp.fillStyle = `rgba(243,239,234,${0.4 + r() * 0.55})`;
    sp.beginPath();
    sp.arc(r() * W, r() * H, 0.5 + r() * 1.3, 0, 6.2832);
    sp.fill();
  }
  for (let i = 0; i < 9; i++) {
    sp.save();
    sp.translate(r() * W, r() * H);
    sp.rotate(r() * 3.14);
    sp.scale(1, 0.35);
    const z = 35 + r() * 55, g = sp.createRadialGradient(0, 0, 0, 0, 0, z);
    g.addColorStop(0, "rgba(243,239,234,.35)");
    g.addColorStop(0.2, "rgba(227,168,87,.16)");
    g.addColorStop(1, "rgba(123,110,246,0)");
    sp.fillStyle = g;
    sp.fillRect(-z, -z, 2 * z, 2 * z);
    sp.restore();
  }
  bgPix = sp.getImageData(0, 0, W, H).data;
  if (GL) {
    gcv.width = W;
    gcv.height = H;
    GL.viewport(0, 0, W, H);
    GL.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, GL.RGBA, GL.UNSIGNED_BYTE, sc);
  }
  bx.drawImage(sc, 0, 0);
  rbuf = new ImageData(W, H);
  rc = document.createElement("canvas");
  rc.width = W;
  rc.height = H;
  rx = rc.getContext("2d");
  dirty = true;
}

/* ---- 7. BUILD THE PORTRAIT ---- */
// Draws the photo into a hidden canvas with the same crop and zoom as the visible <img>
// (matches the CSS in style.css: .pt img), so the lens can read its pixels.
function buildPT() {
  const im = $("#ptimg"),
    w = ps.width = 380,
    h = ps.height = 460,
    z = 1.45,
    ox = w / 2,
    oy = h * 0.45;
  const k = Math.max(w / im.naturalWidth, h / im.naturalHeight),
    iw = im.naturalWidth * k,
    ih = im.naturalHeight * k,
    x0 = (w - iw) / 2,
    y0 = (h - ih) / 2;
  pp.fillStyle = "#0d0b1a";
  pp.fillRect(0, 0, w, h);
  pp.drawImage(im, ox + (x0 - ox) * z, oy + (y0 - oy) * z, iw * z, ih * z);
  ptPix = pp.getImageData(0, 0, w, h).data;
}

/* ---- 8. RIPPLES ---- */
// waves: one entry per ripple, {x, y, t} = where and when it started.
const waves = [];
let pOn = false, org = null;
// Start a ripple at (x, y). Ignored while effects are off, or if another ripple started less than RIPPLE_COOLDOWN_MS ago.
let lastRipple = -1e9;
function spawnRipple(x, y) {
  const t = performance.now();
  if (!vfxOn || t - lastRipple < RIPPLE_COOLDOWN_MS) return;
  lastRipple = t;
  for (let i = 0; i < RIPPLES_PER_CLICK; i++) waves.push({ x, y, t: t + i * RIPPLE_GAP_MS });
}
// How far ripple rings push the pixel at (x, y): a smooth bump travelling outward from each click.
function disp(x, y, o) {
  let ox = 0, oy = 0;
  for (const g of rings) {
    const dx2 = x - g.x,
      dy = y - g.y,
      r = Math.sqrt(dx2 * dx2 + dy * dy) || 1,
      d = (r - g.r) / g.s;
    if (d > -3 && d < 3) {
      const f = g.a * d * Math.exp(-d * d);
      ox += dx2 / r * f;
      oy += dy / r * f;
    }
  }
  o[0] = ox;
  o[1] = oy;
}
// Fallback only: draws the rippled sky into a hidden canvas (the GPU shader does this itself).
function ripples() {
  const d = rbuf.data, o = [0, 0];
  d.fill(0);
  for (const g of rings) {
    const Ro = g.r + 3 * g.s,
      Ri = Math.max(0, g.r - 3 * g.s),
      ya = Math.max(0, Math.floor(g.y - Ro)),
      yb = Math.min(H - 1, Math.ceil(g.y + Ro));
    for (let y = ya; y <= yb; y++) {
      const dy = y - g.y,
        xo = Math.sqrt(Math.max(0, Ro * Ro - dy * dy)),
        xi = Math.abs(dy) < Ri ? Math.sqrt(Ri * Ri - dy * dy) : 0;
      for (const [a, b] of [[g.x - xo, g.x - xi], [g.x + xi, g.x + xo]]) for (let x = Math.max(0, Math.ceil(a)), e = Math.min(W - 1, b); x <= e; x++) {
        disp(x, y, o);
        const sx = Math.max(0, Math.min(W - 1.001, x + o[0])),
          sy = Math.max(0, Math.min(H - 1.001, y + o[1])),
          ix = sx | 0,
          iy = sy | 0,
          fx = sx - ix,
          fy = sy - iy,
          p = (iy * W + ix) * 4,
          q = p + 4,
          r = p + W * 4,
          t = r + 4,
          u = (y * W + x) * 4;
        for (let k = 0; k < 3; k++) d[u + k] = (bgPix[p + k] * (1 - fx) + bgPix[q + k] * fx) * (1 - fy) + (bgPix[r + k] * (1 - fx) + bgPix[t + k] * fx) * fy;
        d[u + 3] = 255;
      }
    }
  }
  rx.putImageData(rbuf, 0, 0);
}

/* ---- 9. ANIMATION LOOP ---- */
// frame() is called by the browser before every repaint; it wraps draw() so one error cannot stop the loop.
function frame(now) {
  requestAnimationFrame(frame);
  try {
    draw(now);
  } catch (e) {
    console.error(e);
  }
}
// Works out where the lens is (mouse, last nav click, or an idle drift), turns waves into rings,
// then draws the sky and, while the mouse is near it, the lensed portrait.
function draw(now) {
  if (document.hidden || !bgPix || document.body.classList.contains("undertale")) return; // sky is hidden on the Personal life page
  if (!enabled) {
    if (dirty) {
      bx.drawImage(sc, 0, 0);
      px.clearRect(0, 0, 380, 460);
      pOn = false;
      dirty = false;
    }
    return;
  }
  let lx = m.x, ly = m.y, idle = false;
  if (now - m.t > 2500) { // mouse idle: the lens drifts slowly on its own
    idle = true;
    lx = W * (0.5 + 0.3 * Math.sin((now * IDLE_SPEED) / 3100));
    ly = H * (0.5 + 0.24 * Math.sin((now * IDLE_SPEED) / 2300 + 1));
  }
  if (!vfxOn) { lx = -1e4; ly = -1e4; } // effects off: park the lens off-screen so only the plain sky shows
  const p = (now - kick.t) / 900, k = p >= 0 && p < 1 ? Math.sin(Math.PI * p) : 0;
  const o = kick.o;
  if (o && k > 0) {
    const b = Math.min(1, k * 4);
    lx += (o.x - lx) * b;
    ly += (o.y - ly) * b;
  }
  const E = idle ? E0 * IDLE_STRENGTH : E0;
  rings.length = 0;
  if (!vfxOn) waves.length = 0;
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i], q = (now - w.t) / RIPPLE_MS;
    if (q >= 1) {
      waves.splice(i, 1);
      continue;
    }
    if (q < 0) continue;
    const r2 = q * Math.max(W, H) * RIPPLE_REACH,
      a = RIPPLE_STRENGTH * Math.pow(1 - q, 1.2),
      sg = 34 + 0.027 * r2;
    rings.push({ x: w.x, y: w.y, r: r2, a, s: sg });
  }
  if (GL) {
    const v = new Float32Array(16);
    rings.slice(0, 4).forEach((g, i) => v.set([g.x, g.y, g.r, g.a], i * 4));
    GL.uniform2f(gU.res, W, H);
    GL.uniform2f(gU.L, lx, ly);
    GL.uniform1f(gU.E, E);
    GL.uniform1f(gU.Rr, R);
    GL.uniform4fv(gU.w, v);
    GL.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
  } else {
    bx.drawImage(sc, 0, 0);
    if (rings.length) {
      ripples();
      bx.drawImage(rc, 0, 0);
    }
    lens(bx, patchB, bgPix, W, H, lx, ly, E, 1);
    bx.strokeStyle = "rgba(227,168,87,.35)";
    bx.lineWidth = 1;
    bx.beginPath();
    bx.arc(lx, ly, E, 0, 6.2832);
    bx.stroke();
  }
  const r = pw.getBoundingClientRect(),
    near = vfxOn && r.width > 0 && k === 0 && now - m.t < 2500 && m.x > r.left - R && m.x < r.right + R && m.y > r.top - R && m.y < r.bottom + R;
  if (near) {
    const q = pc.width / r.width;
    px.drawImage(ps, 0, 0);
    lens(px, patchP, ptPix, pc.width, pc.height, (m.x - r.left) * q, (m.y - r.top) * q, E0 * 0.7 * q);
    pOn = true;
  } else if (pOn) {
    px.clearRect(0, 0, pc.width, pc.height);
    pOn = false;
  }
}

/* ---- 10. MOUSE & CLICK INPUT ---- */
// Clicking an internal link (nav, buttons): remember where, and start ripples from that point.
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const r = a.getBoundingClientRect();
  org = { x: e.clientX || r.left + r.width / 2, y: e.clientY || r.top + r.height / 2 };
  spawnRipple(org.x, org.y);
}, true);
// Clicking empty sky: send one ripple from that spot.
addEventListener("pointerdown", (e) => {
  if (!e.target.closest("a,button,input,textarea,select,label,canvas,summary")) spawnRipple(e.clientX, e.clientY);
});
// Track the mouse; the lens follows it (and drifts on its own when the mouse is idle).
addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") {
    m.x = e.clientX;
    m.y = e.clientY;
    m.t = performance.now();
  }
}, { passive: true });
document.addEventListener("mouseleave", () => {
  m.t = -1e9;
});
addEventListener("resize", buildBG);
buildBG();

// Star cursor: follows the mouse, grows over links/buttons/sliders, shrinks while clicking.
// Only runs on devices with a real mouse. Styles are in style.css, section 14.
const cursorEl = $("#cursor");
if (cursorEl && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  const root = document.documentElement;
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || !vfxOn) return;
    root.classList.add("custom-cursor"); // hides the arrow and shows the star
    cursorEl.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    cursorEl.classList.toggle("hover", !!e.target.closest("a, button, summary, input, label"));
  }, { passive: true });
  addEventListener("pointerdown", () => cursorEl.classList.add("down"));
  addEventListener("pointerup", () => cursorEl.classList.remove("down"));
  document.addEventListener("mouseleave", () => root.classList.remove("custom-cursor")); // mouse left the window
}

/* ---- 11. START UP ---- */
// Build the sky and portrait, then start the animation loop.
const ph = $("#ptimg");
ph.complete && ph.naturalWidth ? buildPT() : ph.onload = buildPT;
requestAnimationFrame(frame);

/* ---- 11B. PERSONAL LIFE: dog wipe, Undertale scene, music ---- */
const DOG_SRC = "undertale/annoying-dog.png"; // the dog sprite (it faces left)
const DOG_ROW_PX = 64; // height of each row of running dogs, in px (smaller = more dogs)

// Short sound effects for the dog wipe (optional: drop either <audio> and the call becomes a no-op)

const DOG_BARK = $("#dogBark");

function playDog(el, volume = 0.5) {
  if (!el || !el.readyState) return;   // file missing or not loaded yet
  if (music.muted) return;             // respect the existing "Music: off" button
  el.currentTime = 0;                  // restart from the top if it was already playing
  el.volume = volume;
  el.play().catch(() => {});           // ignore autoplay rejections
}

// Clone-based bark player: each call gets its own <audio> clone, so barks overlap
// instead of cutting each other off. barkPool keeps references alive while playing.
const barkPool = new Set();
function playBark(volume = 0.5) {
  if (!DOG_BARK || DOG_BARK.readyState < 2) return;
  if (music.muted) return;
  const a = DOG_BARK.cloneNode();
  a.volume = volume;
  a.playbackRate = 0.92 + Math.random() * 0.16;   // slightly different pitch per dog
  barkPool.add(a);
  a.onended = () => barkPool.delete(a);
  a.onerror = () => barkPool.delete(a);
  a.play().catch(() => barkPool.delete(a));
}

function primeAudio(el) {
  if (!el) return;
  const v = el.volume;
  el.volume = 0;
  el.play().then(() => {
    el.pause();
    el.currentTime = 0;
    el.volume = v;
  }).catch(() => {});
}

primeAudio(DOG_BARK);   // optional: removes first-play latency (see below)

const DOG_THEME = $("#dogTheme");
const THEME_VOL = 0.2;      // lower than the bark's 0.6; try 0.15–0.3
let themeFade = 0;

// Linear fade for the theme only. Separate timer from fadeMusic, so the waterfall
// track and the bark are never touched by these calls.
function fadeTheme(to, ms) {
  clearInterval(themeFade);
  const from = DOG_THEME.volume, t0 = performance.now();
  themeFade = setInterval(() => {
    const p = Math.min(1, (performance.now() - t0) / ms);
    DOG_THEME.volume = Math.max(0, Math.min(1, from + (to - from) * p));
    if (p === 1) {
      clearInterval(themeFade);
      if (to === 0) { DOG_THEME.pause(); DOG_THEME.currentTime = 0; }
    }
  }, 40);
}

function playTheme() {
  if (!DOG_THEME || DOG_THEME.readyState < 2) return;
  if (music.muted) return;
  DOG_THEME.pause();
  DOG_THEME.currentTime = 0;          // restart from the top every wipe
  DOG_THEME.volume = 0;
  DOG_THEME.play()
    .then(() => fadeTheme(THEME_VOL, 400))   // short fade-in masks the start
    .catch(() => {});                          // autoplay blocked → silent, no crash
}

function stopTheme(ms = 900) {
  if (!DOG_THEME || DOG_THEME.paused) return;
  fadeTheme(0, ms);
}

let MUSIC_VOLUME = 0.15; // 0 to 1, the waterfall music volume on the Personal life page
const music = $("#waterfall");
const wipeEl = $("#wipe");
let fadeTimer;
// Smoothly change the music volume; at 0 it also pauses.
function fadeMusic(to, ms) {
  clearInterval(fadeTimer);
  const from = music.volume, t0 = performance.now();
  fadeTimer = setInterval(() => {
    const p = Math.min(1, (performance.now() - t0) / ms);
    music.volume = Math.max(0, Math.min(1, from + (to - from) * p));
    if (p === 1) {
      clearInterval(fadeTimer);
      if (to === 0) music.pause();
    }
  }, 40);
}
// Start (fade in) or stop (fade out) the music. Fails quietly if the mp3 is missing or the browser blocks it.
function personalAudio(on) {
  if (on) {
    music.volume = 0;
    music.play().catch(() => {});
    fadeMusic(MUSIC_VOLUME, 2000);
  } else if (!music.paused) {
    fadeMusic(0, 800);
  }
}
// Touch screens have no hover, so the sidebar works in two taps: the first tap pops Frisk out
// (same as hovering on a computer), the second tap opens the Personal life page.
const sideEl = $(".side");
let lastPointer = "mouse", sideTimer;
function closeSide() {
  sideEl.classList.remove("open");
  clearTimeout(sideTimer);
}
addEventListener("pointerdown", (e) => {
  lastPointer = e.pointerType;
  if (!e.target.closest(".side")) closeSide(); // tapping anywhere else hides Frisk again
}, true);
document.addEventListener("click", (e) => {
  if (!e.target.closest(".side") || lastPointer !== "touch" || sideEl.classList.contains("open")) return;
  e.preventDefault(); // first tap: stay on this page
  e.stopImmediatePropagation(); // and don't start the music yet
  sideEl.classList.add("open");
  sideTimer = setTimeout(closeSide, 5000); // Frisk hides again if you don't tap a second time
}, true);
addEventListener("hashchange", closeSide);
// Clicking the sidebar is a user gesture, so start the music silently now; browsers allow it.
document.addEventListener("click", (e) => {
  if (e.target.closest('a[href="#personal"]')) {
    music.volume = 0;
    music.play().catch(() => {});
  }
}, true);
// Undertale-style typewriter: types out the text in data-text.
// [[word]] segments are wrapped in a .det span so they can be colored via CSS.
function typeLine(el) {
  const raw = el.dataset.text || "";
  const segments = raw.split(/(\[\[.*?\]\])/).filter(Boolean).map((s) => {
    const isMarker = s.startsWith("[[") && s.endsWith("]]");
    return { text: isMarker ? s.slice(2, -2) : s, cls: isMarker ? "det" : "" };
  });
  el.textContent = "";
  const spans = segments.map((seg) => {
    const span = document.createElement("span");
    if (seg.cls) span.className = seg.cls;
    el.appendChild(span);
    return span;
  });
  let segIdx = 0, charIdx = 0;
  (function tick() {
    if (segIdx >= segments.length) return;
    const seg = segments[segIdx];
    spans[segIdx].textContent = seg.text.slice(0, ++charIdx);
    if (charIdx >= seg.text.length) {
      segIdx++;
      charIdx = 0;
    }
    if (segIdx < segments.length) setTimeout(tick, 28);
  })();
}
// The wipe. 1) rows of dogs run in from both sides dragging a black curtain, 2) they collide in the middle
// (white flash), 3) swap() changes the page while the screen is black, 4) the dogs run back out and reveal it.
async function dogWipe(swap) {
  const W = innerWidth, H = innerHeight, rows = Math.ceil(H / DOG_ROW_PX), rh = H / rows, groups = [];
  wipeEl.className = "";
  wipeEl.innerHTML = "";
  wipeEl.hidden = false;
  for (const side of ["l", "r"]) {
    for (let r = 0; r < rows; r++) {
      const g = document.createElement("div");
      g.className = "run " + side;
      g.style.cssText = `top:${r * rh}px;height:${rh + 1}px;width:${W / 2 + 40 + Math.random() * 60}px;`;
      let html = "<i></i>"; // the curtain
      for (let k = 0; k < 3; k++) { // one leading dog and two chasing it, each a different size
        const h = rh * (1.05 + Math.random() * 0.45);
        const pos = k ? rh * (0.7 * k + 0.6) + Math.random() * 24 : -rh * 0.35;
        html += `<img src="${DOG_SRC}" alt="" style="height:${h}px;${side === "l" ? "right" : "left"}:${pos}px;animation-delay:${-Math.random() * 0.3}s">`;
      }
      g.innerHTML = html;
      wipeEl.append(g);
      groups.push(g);
    }
  }
  const flash = document.createElement("div");
  flash.className = "flash";
  wipeEl.append(flash);
  const away = (g) => (g.classList.contains("l") ? "-101%" : "101%");
  const move = (from, to, ms, ease, spread) => Promise.all(groups.map((g) =>
    g.animate([{ transform: `translateX(${from(g)})` }, { transform: `translateX(${to(g)})` }],
      { duration: ms, delay: Math.random() * spread, easing: ease, fill: "both" }).finished));

  playTheme();

  // Multiple barks, staggered. Count scales with how many rows of dogs there are.
  const runInDuration = 1400;
  const barkCount = Math.max(2, Math.min(5, Math.round(rows / 4)));
  const barkTimers = [];
  for (let i = 0; i < barkCount; i++) {
    barkTimers.push(setTimeout(
      () => playBark(0.35 + Math.random() * 0.25),
      (runInDuration - 100) + i * 90 + Math.random() * 60
    ));
  }

  await move(away, () => "0%", runInDuration, "cubic-bezier(.5,0,.9,.6)", 350);
  barkTimers.forEach(clearTimeout);

  await flash.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 380 }).finished;
  await new Promise((r) => setTimeout(r, 240));
  swap();
  wipeEl.classList.add("out");                                      // dogs turn around

  stopTheme(1500);                                                  // ← fade out over the run-out
  await move(() => "0%", away, 1500, "cubic-bezier(.1,.6,.3,1)", 350);
  wipeEl.hidden = true;
  wipeEl.innerHTML = "";
}
// Page buttons: change the scene, mute the music
$("#sceneBtn").addEventListener("click", () => {
  setUtTheme("undertale");
  const bg = $("#utBg");
  bg.classList.toggle("waterfall");
  bg.classList.toggle("marsh");
});
$("#muteBtn").addEventListener("click", (e) => {
  music.muted = !music.muted;
  e.currentTarget.textContent = music.muted ? "Music: off" : "Music: on";
  e.currentTarget.setAttribute("aria-pressed", String(music.muted));
});

// Volume slider: updates MUSIC_VOLUME, and re-fades the music if it's currently playing.
const volSlider = $("#volSlider");
if (volSlider) {
  volSlider.value = MUSIC_VOLUME;
  volSlider.addEventListener("input", () => {
    MUSIC_VOLUME = +volSlider.value;
    if (music.paused && MUSIC_VOLUME > 0) {
      // dragging up from 0 should restart playback
      music.volume = 0;
      music.play()
        .then(() => fadeMusic(MUSIC_VOLUME, 200))
        .catch(() => {});          // still blocked → the retry below will catch the next click
    } else if (!music.paused) {
      fadeMusic(MUSIC_VOLUME, 180);
    }
  });
}

/* ---- 11C. COMIC PANELS: tilt with pointer, click to open a zoom window ----
   Handles the three info panels (.ut-box) and the three drawings (.art). */
(function comicPanels() {
  const panels = Array.from(document.querySelectorAll(
    ".ut-grid > .ut-box, .art-grid > .art"
  ));
  if (!panels.length) return;

  // --- tilt ---
  let raf = 0;
  let px = 0, py = 0;
  const applyTilt = () => {
    raf = 0;
    panels.forEach((p) => {
      if (!px) {
        p.style.setProperty("--rx", "0deg");
        p.style.setProperty("--ry", "0deg");
        p.style.setProperty("--tx", "0px");
        p.style.setProperty("--ty", "0px");
        return;
      }
      const r = p.getBoundingClientRect();
      const dx = (px - (r.left + r.width / 2)) / r.width;
      const dy = (py - (r.top + r.height / 2)) / r.height;
      p.style.setProperty("--rx", (-dy * 6).toFixed(2) + "deg");
      p.style.setProperty("--ry", ( dx * 6).toFixed(2) + "deg");
      p.style.setProperty("--tx", ( dx * 3).toFixed(2) + "px");
      p.style.setProperty("--ty", ( dy * 3).toFixed(2) + "px");
    });
  };

  document.querySelectorAll(".ut-grid, .art-grid").forEach((grid) => {
    grid.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      px = e.clientX; py = e.clientY;
      if (!raf) raf = requestAnimationFrame(applyTilt);
    }, { passive: true });
    grid.addEventListener("pointerleave", () => {
      px = py = 0;
      if (!raf) raf = requestAnimationFrame(applyTilt);
    });
  });

  // --- music switcher (only fires inside the modal, only for .song-choice items) ---
  let currentSong = "undertale/waterfall.mp3";

  function applyPlayingState() {
    document.querySelectorAll(".song-choice").forEach((li) => {
      li.classList.toggle("playing", li.dataset.song === currentSong);
    });
  }

  function switchSong(src) {
    if (src === currentSong) {
      // Same song: resume if it was paused (e.g. via the volume slider), else no-op.
      if (music.paused) {
        music.volume = 0;
        music.play().then(() => fadeMusic(MUSIC_VOLUME, 800)).catch(() => {});
      }
      return;
    }
    currentSong = src;
    clearInterval(fadeTimer);
    if (!music.paused) music.pause();
    music.src = src;
    music.load();
    music.volume = 0;
    music.play()
      .then(() => fadeMusic(MUSIC_VOLUME, 800))
      .catch(() => {});           // autoplay blocked → silent, no crash
    applyPlayingState();
  }

  // --- zoom window ---
  const modal   = document.getElementById("panelModal");
  if (!modal) return;
  const slot     = modal.querySelector(".panel-modal__content");
  const closeBtn = modal.querySelector(".panel-modal__close");
  const backdrop = modal.querySelector(".panel-modal__backdrop");
  let lastFocus = null;

  function openPanel(panel) {
    lastFocus = panel;
    slot.replaceChildren();
    const clone = panel.cloneNode(true);
    clone.classList.remove("open");
    clone.removeAttribute("tabindex");
    clone.removeAttribute("role");
    clone.removeAttribute("aria-haspopup");
    slot.appendChild(clone);

    // NEW: widen the window when the source is a drawing
    modal.querySelector(".panel-modal__window")
        .classList.toggle("art-mode", panel.classList.contains("art"));

    applyPlayingState();
    
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    closeBtn.focus();
  }

  function closePanel() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = "";
    slot.replaceChildren();
    if (lastFocus) lastFocus.focus();
  }

  panels.forEach((p) => {
    p.setAttribute("tabindex", "0");
    p.setAttribute("role", "button");
    p.setAttribute("aria-haspopup", "dialog");
    p.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      openPanel(p);
    });
    p.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPanel(p);
      }
    });
  });

  closeBtn.addEventListener("click", closePanel);

  // Delegated click: catches .song-choice inside any clone that ends up in the modal.
  slot.addEventListener("click", (e) => {
    const choice = e.target.closest(".song-choice");
    if (!choice) return;
    e.stopPropagation();
    switchSong(choice.dataset.song);
  });

  applyPlayingState();   // initial state on page load: ♪ on Waterfall

  backdrop.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
  });
  addEventListener("hashchange", closePanel);
})();



/* ---- 11D. GAME THEMES AND PARALLAX BACKGROUND ---- */
// Clicking a game title re-themes the Personal life page: background scene, colours and floating particles.
// The looks live in style.css (sections 18 and 20) as body.theme-GAME. "undertale" is the default look.
function setUtTheme(game) {
  Array.from(document.body.classList).filter((n) => n.startsWith("theme-") && n !== "theme-swap").forEach((n) => document.body.classList.remove(n));
  if (game !== "undertale") document.body.classList.add("theme-" + game);
  document.body.classList.toggle("ut-themed", game !== "undertale"); // switches on the full theme (fonts, boxes, cursor): style.css section 21
  document.querySelectorAll("button.game").forEach((b) => b.classList.toggle("on", b.dataset.game === game));
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button.game");
  if (!b || b.classList.contains("on")) return;
  document.body.classList.add("theme-swap"); // fade the scene out...
  setTimeout(() => {
    setUtTheme(b.dataset.game); // ...switch the look...
    document.body.classList.remove("theme-swap"); // ...and fade it back in
  }, vfxOn ? 350 : 0);
});
// Parallax: the scene moves slower than the contents, so past the contents only the scene is left.
const utBg = $("#utBg"), utFx = $("#utFx");
let parallaxQueued = false;
function parallax() {
  parallaxQueued = false;
  if (!document.body.classList.contains("undertale")) return;
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const p = Math.min(1, scrollY / max); // 0 at the top of the page, 1 at the bottom
  utBg.style.transform = vfxOn ? `translate3d(0, ${-p * 0.3 * innerHeight}px, 0)` : ""; // scene: slowest layer
  utFx.style.transform = vfxOn ? `translate3d(0, ${-p * 0.6 * innerHeight}px, 0)` : ""; // particles: in between
  // The dark veil fades as the empty screen scrolls into view, so the scene shows in full.
  const reveal = $(".ut-reveal").getBoundingClientRect();
  document.body.style.setProperty("--veil", Math.max(0.12, Math.min(1, reveal.top / innerHeight)));
}
addEventListener("scroll", () => {
  if (!parallaxQueued) {
    parallaxQueued = true;
    requestAnimationFrame(parallax);
  }
}, { passive: true });
addEventListener("resize", parallax);
$("#utUp").addEventListener("click", () => scrollTo({ top: 0, behavior: vfxOn ? "smooth" : "auto" }));

/* ---- 12. PAGES & TRANSITIONS ---- */
// Each page is a <section id="p-NAME"> in index.html, opened with a #NAME link.
// Add a page: add its section, a nav link, and an entry in this list.
const names = { home: "Home", about: "About", research: "Research", projects: "Projects", contact: "Contact",
  personal: "Personal life" };
// Page-in animation: builds a lens-shaped displacement map centred on the click and
// relaxes it to nothing, so the page appears to resolve out of a lensed image.
async function lensIn(el, cx, cy, ms) {
  try {
    const w = el.offsetWidth,
      h = el.offsetHeight,
      k = 0.25,
      mw = Math.max(2, w * k | 0),
      mh = Math.max(2, h * k | 0),
      c = document.createElement("canvas");
    c.width = mw;
    c.height = mh;
    const g = c.getContext("2d"),
      im = g.createImageData(mw, mh),
      d = im.data,
      Rm = 460 * k,
      ox = cx * k,
      oy = cy * k,
      cl = (v) => Math.max(-1, Math.min(1, v));
    for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
      const dx2 = i - ox,
        dy = j - oy,
        r = Math.hypot(dx2, dy) / Rm,
        q = r < 2.2 ? Math.exp(-r * r * 1.5) : 0,
        o = (j * mw + i) * 4;
      d[o] = 128 + 127 * cl(-dx2 / Rm * q * 1.6);
      d[o + 1] = 128 + 127 * cl(-dy / Rm * q * 1.6);
      d[o + 2] = 128;
      d[o + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    const F = $("#lensf"), I = $("#lfi"), D = $("#lfd");
    for (const n of [F, I]) {
      n.setAttribute("width", w);
      n.setAttribute("height", h);
    }
    I.setAttribute("href", c.toDataURL());
    D.setAttribute("scale", "0");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    el.style.filter = "url(#lensf)";
    await new Promise((res) => {
      const t0 = performance.now();
      (function f(t) {
        const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
        D.setAttribute("scale", String(PAGE_IN_WARP * (1 - e)));
        el.style.opacity = Math.min(1, p * 2.2);
        p < 1 ? requestAnimationFrame(f) : res();
      })(t0);
    });
  } catch (e) {
  } finally {
    el.style.filter = "";
    el.style.opacity = "";
  }
}
// cur = page currently shown, busy = a transition is running
let cur = null, busy = false;
const mark = (id) => document.querySelectorAll(".nav nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + id));
// Instantly shows one page and hides the rest, updates the nav highlight and the tab title.
function setPage(id) {
  document.querySelectorAll(".page").forEach((p) => p.hidden = p.id !== "p-" + id);
  mark(id);
  cur = id;
  document.body.classList.toggle("undertale", id === "personal"); // switches the whole look (style.css section 15)
  personalAudio(id === "personal");
  parallax();
  if (id === "personal") typeLine($("#utTalk"));
  document.title = (id === "home" ? "" : names[id] + " – ") + "Chris Gade";
  scrollTo(0, 0);
  dirty = true;
}
// Runs when the #hash changes: fade the old page out, show the new page, lens it in.
async function route() {
  const id = names[location.hash.slice(1)] ? location.hash.slice(1) : "home";
  if (id === cur || busy) return;
  if (cur === null || !vfxOn) { // effects off (or reduced motion): switch pages instantly
    setPage(id);
    kick.t = performance.now();
    return;
  }
  // Opening or leaving the Personal life page uses the dog wipe instead of the lens transition
  if (id === "personal" || cur === "personal") {
    busy = true;
    mark(id);
    await dogWipe(() => setPage(id));
    busy = false;
    route();
    return;
  }
  busy = true;
  kick.t = performance.now();
  kick.o = org || { x: innerWidth / 2, y: innerHeight / 2 };
  org = null;
  mark(id);
  const from = $("#p-" + cur);
  await from.animate([{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(7px)" }], { duration: PAGE_OUT_MS, easing: "ease-in", fill: "forwards" }).finished;
  from.getAnimations().forEach((a) => a.cancel());
  setPage(id);
  const to = $("#p-" + id);
  to.style.opacity = 0;
  const rc2 = to.getBoundingClientRect();
  await lensIn(to, kick.o.x - rc2.left, kick.o.y - rc2.top, PAGE_IN_MS);
  busy = false;
  route();
}
addEventListener("hashchange", route);
route();

/* ---- 13. LENS-MODEL DEMO ---- */
// Research page simulator: an isothermal lens plus external shear. Every screen pixel is traced
// back to the source plane; the glow is where the background galaxy (src) shows up.
const dc = $("#demo"),
  dx = dc.getContext("2d"),
  di = dx.createImageData(340, 340),
  src = { x: 14, y: -9 };
// Redraws the simulator from the three sliders and the galaxy position.
function demo() {
  const E = +$("#e").value,
    g = +$("#g").value,
    A = +$("#a").value * Math.PI / 90,
    g1 = g * Math.cos(A),
    g2 = g * Math.sin(A),
    d = di.data;
  for (let y = 0; y < 340; y++) for (let x = 0; x < 340; x++) {
    const tx = x - 170,
      ty = y - 170,
      r = Math.hypot(tx, ty) || 1,
      u = tx - E * tx / r - (g1 * tx + g2 * ty),
      v = ty - E * ty / r - (g2 * tx - g1 * ty);
    const q = Math.exp(-((u - src.x) ** 2 + (v - src.y) ** 2) / 162), o = (y * 340 + x) * 4;
    d[o] = 10 + q * 245;
    d[o + 1] = 9 + q * 170;
    d[o + 2] = 18 + q * 80;
    d[o + 3] = 255;
  }
  dx.putImageData(di, 0, 0);
  dx.strokeStyle = "rgba(123,110,246,.9)";
  dx.lineWidth = 1.5;
  dx.beginPath();
  dx.arc(170 + src.x, 170 + src.y, 5, 0, 6.2832);
  dx.stroke();
}
// Dragging on the canvas moves the background galaxy.
function mv(e) {
  const r = dc.getBoundingClientRect();
  src.x = Math.max(-60, Math.min(60, (e.clientX - r.left) * 340 / r.width - 170));
  src.y = Math.max(-60, Math.min(60, (e.clientY - r.top) * 340 / r.height - 170));
  demo();
}
dc.addEventListener("pointerdown", (e) => {
  dc.setPointerCapture(e.pointerId);
  mv(e);
  dc.onpointermove = mv;
});
dc.addEventListener("pointerup", () => dc.onpointermove = null);
["e", "g", "a"].forEach((i) => $("#" + i).addEventListener("input", demo));
demo();

/* ---- 14. CONTACT FORM ---- */
// The form on the Contact page sends the message to your inbox through a free form service, so no server is needed.
// FORM_ENDPOINT uses FormSubmit: the FIRST message you get asks you to confirm your email once. After that it just works.
// Prefer another service? Formspree, Web3Forms or Getform work the same way: paste the endpoint URL they give you here.
const FORM_ENDPOINT = "https://formsubmit.co/ajax/satyajitlion@gmail.com";
const contactForm = $("#contactForm"), formStatus = $("#formStatus");
// The three cards above the form pick the topic in the form (instead of opening an email).
document.querySelectorAll(".paths a").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  const topic = decodeURIComponent((a.getAttribute("href").split("subject=")[1] || ""));
  if (topic) contactForm.elements.reason.value = topic;
  contactForm.scrollIntoView({ behavior: "smooth", block: "center" });
  contactForm.elements.message.focus({ preventScroll: true });
}));
contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!contactForm.checkValidity()) { contactForm.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(contactForm));
  if (data._honey) return; // bots fill the hidden field; people never see it
  const btn = contactForm.querySelector("button[type=submit]");
  btn.disabled = true;
  formStatus.textContent = "Sending...";
  try {
    const res = await fetch(FORM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...data, _subject: "Portfolio message: " + data.reason, _captcha: "false", _template: "table" }),
    });
    if (!res.ok) throw new Error(res.status);
    contactForm.reset();
    formStatus.textContent = "Thanks! Your message has been sent.";
  } catch (err) {
    formStatus.innerHTML = 'That did not go through. Please email me directly at <a href="mailto:satyajitlion@gmail.com">satyajitlion@gmail.com</a>.';
  }
  btn.disabled = false;
});