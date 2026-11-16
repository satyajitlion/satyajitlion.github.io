/* =====================================================================
   script.js: everything on the site that moves

   TABLE OF CONTENTS
    1. SETTINGS .............. numbers you can safely tweak
    2. HELPERS & CANVASES .... shortcuts and the canvases used
    3. WEBGL SKY ............. draws the lensed starfield on the graphics card
    4. SHARED STATE .......... variables read on every frame
    5. 2D LENS (fallback) .... the same lens in plain canvas, for browsers without WebGL
    6. BUILD THE SKY ......... paints the starfield on load and on resize
    7. BUILD THE PORTRAIT .... copies your photo into a canvas so it can be lensed
    8. RIPPLES ............... gravitational waves started by clicks
    9. ANIMATION LOOP ........ runs about 60 times per second
   10. MOUSE, CLICK & CURSOR INPUT (includes the star cursor)
   11. START UP
   12. PAGES & TRANSITIONS ... #about, #research, ... routing and the lensing page-in
   13. LENS-MODEL DEMO ....... the interactive simulator on the Research page

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
const RIPPLE_MS = 2400; // how long one ripple lasts, in ms
const RIPPLE_STRENGTH = 42; // how hard a ripple bends the sky at the start, in px
const RIPPLE_REACH = 0.8; // how far ripples travel, as a fraction of the screen's longest side
const RIPPLES_PER_CLICK = 2; // number of waves sent by each nav click
const RIPPLE_GAP_MS = 260; // delay between those waves, in ms
const PAGE_OUT_MS = 320; // old page fade-out time, in ms
const PAGE_IN_MS = 1200; // new page lensing-in time, in ms
const PAGE_IN_WARP = 300; // how strongly the new page is warped when it first appears

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
  if (document.hidden || !bgPix) return;
  if (!enabled) {
    if (dirty) {
      bx.drawImage(sc, 0, 0);
      px.clearRect(0, 0, 380, 460);
      pOn = false;
      dirty = false;
    }
    return;
  }
  let lx = m.x, ly = m.y;
  if (now - m.t > 2500) {
    lx = W * (0.5 + 0.36 * Math.sin(now / 3100));
    ly = H * (0.5 + 0.3 * Math.sin(now / 2300 + 1));
  }
  const p = (now - kick.t) / 1300, k = p >= 0 && p < 1 ? Math.sin(Math.PI * p) : 0;
  const o = kick.o;
  if (o && k > 0) {
    const b = Math.min(1, k * 4);
    lx += (o.x - lx) * b;
    ly += (o.y - ly) * b;
  }
  const E = E0;
  rings.length = 0;
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
    near = r.width > 0 && k === 0 && now - m.t < 2500 && m.x > r.left - R && m.x < r.right + R && m.y > r.top - R && m.y < r.bottom + R;
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
  const t = performance.now();
  for (let i = 0; i < RIPPLES_PER_CLICK; i++) waves.push({ x: org.x, y: org.y, t: t + i * RIPPLE_GAP_MS });
}, true);
// Clicking empty sky: send one ripple from that spot.
addEventListener("pointerdown", (e) => {
  if (!e.target.closest("a,button,input,label,canvas")) waves.push({ x: e.clientX, y: e.clientY, t: performance.now() });
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
    if (e.pointerType !== "mouse") return;
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

/* ---- 12. PAGES & TRANSITIONS ---- */
// Each page is a <section id="p-NAME"> in index.html, opened with a #NAME link.
// Add a page: add its section, a nav link, and an entry in this list.
const names = { home: "Home", about: "About", research: "Research", projects: "Projects", contact: "Contact" };
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
  document.title = (id === "home" ? "" : names[id] + " – ") + "Chris Gade";
  scrollTo(0, 0);
  dirty = true;
}
// Runs when the #hash changes: fade the old page out, show the new page, lens it in.
async function route() {
  const id = names[location.hash.slice(1)] ? location.hash.slice(1) : "home";
  if (id === cur || busy) return;
  if (cur === null || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setPage(id);
    kick.t = performance.now();
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
