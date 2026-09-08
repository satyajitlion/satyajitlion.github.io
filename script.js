/* =========================================================
   PORTFOLIO SCRIPT
   ========================================================= */


/* =========================================================
   FOOTER YEAR
   ========================================================= */

const yearElement =
  document.getElementById("year");


if (yearElement) {

  yearElement.textContent =
    new Date().getFullYear();

}



/* =========================================================
   MOBILE NAVIGATION
   ========================================================= */

const menuToggle =
  document.querySelector(".menu-toggle");


const navLinks =
  document.querySelector(".nav-links");


function closeMobileNav() {

  if (
    !menuToggle ||
    !navLinks
  ) {
    return;
  }


  navLinks.classList.remove(
    "active"
  );


  menuToggle.classList.remove(
    "active"
  );


  menuToggle.setAttribute(
    "aria-expanded",
    "false"
  );


  document.body.classList.remove(
    "nav-open"
  );

}



if (
  menuToggle &&
  navLinks
) {


  /* Open / close menu */

  menuToggle.addEventListener(
    "click",
    () => {

      const isOpen =
        navLinks.classList.toggle(
          "active"
        );


      menuToggle.classList.toggle(
        "active",
        isOpen
      );


      menuToggle.setAttribute(
        "aria-expanded",
        String(isOpen)
      );


      document.body.classList.toggle(
        "nav-open",
        isOpen
      );

    }
  );



  /* Close menu when a link is selected */

  navLinks
    .querySelectorAll("a")
    .forEach((link) => {

      link.addEventListener(
        "click",
        closeMobileNav
      );

    });



  /* Escape closes mobile navigation */

  document.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key === "Escape"
      ) {

        closeMobileNav();

      }

    }
  );



  /* Return to desktop layout */

  window.addEventListener(
    "resize",
    () => {

      if (
        window.innerWidth > 768
      ) {

        closeMobileNav();

      }

    }
  );

}



/* Cursor lens: original screen-space texture remapping inspired by
   https://github.com/portsmouth/gravy. Uses Canvas 2D, without a GPU dependency. */
(() => {
  const canvas = document.getElementById('lens-field');
  const toggle = document.getElementById('lens-toggle');
  const cursor = document.getElementById('lens-cursor');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  const source = document.createElement('canvas');
  const paint = source.getContext('2d', { willReadFrequently: true });
  if (!context || !paint) return;

  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = !preference.matches;
  let active = false;
  let x = 0, y = 0, width = 0, height = 0, frame = 0;
  let pixels;
  // CSS-pixel resolution bounds the work even on high-DPI screens.
  const radius = 160;
  const patch = context.createImageData(radius * 2, radius * 2);

  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(render);
  }

  function resetPointer() {
    active = false;
    document.body.classList.remove('has-lens-cursor');
    cursor?.classList.remove('is-hover', 'is-pressed');
    schedule();
  }

  function updateToggle() {
    if (toggle) {
      toggle.hidden = false;
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.textContent = enabled ? 'Cursor lens: on' : 'Cursor lens: off';
    }
    resetPointer();
  }

  function rebuild() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    canvas.width = source.width = width;
    canvas.height = source.height = height;
    paint.fillStyle = '#0A0912';
    paint.fillRect(0, 0, width, height);
    const haze = paint.createRadialGradient(width * .7, height * .35, 0,
      width * .7, height * .35, Math.max(width, height) * .8);
    haze.addColorStop(0, 'rgba(123,110,246,0.16)');
    haze.addColorStop(1, 'rgba(123,110,246,0)');
    paint.fillStyle = haze;
    paint.fillRect(0, 0, width, height);
    paint.strokeStyle = 'rgba(167,159,189,0.19)';
    paint.lineWidth = .7;
    paint.beginPath();
    for (let gx = 0; gx < width; gx += 64) {
      paint.moveTo(gx, 0); paint.lineTo(gx, height);
    }
    for (let gy = 0; gy < height; gy += 64) {
      paint.moveTo(0, gy); paint.lineTo(width, gy);
    }
    paint.stroke();
    let seed = 49273;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const count = Math.min(1800, Math.max(400, Math.floor(width * height / 2200)));
    for (let i = 0; i < count; i++) {
      const sx = random() * width, sy = random() * height;
      const size = .5 + random() * 1.3;
      paint.fillStyle = `rgba(243,239,234,${.4 + random() * .55})`;
      paint.beginPath();
      paint.arc(sx, sy, size, 0, Math.PI * 2);
      paint.fill();
    }
    for (let i = 0; i < 8; i++) {
      paint.save();
      paint.translate(random() * width, random() * height);
      paint.rotate(random() * Math.PI);
      paint.scale(1, .35);
      const size = 35 + random() * 55;
      const glow = paint.createRadialGradient(0, 0, 0, 0, 0, size);
      glow.addColorStop(0, 'rgba(243,239,234,0.35)');
      glow.addColorStop(.2, 'rgba(227,168,87,0.16)');
      glow.addColorStop(1, 'rgba(123,110,246,0)');
      paint.fillStyle = glow;
      paint.fillRect(-size, -size, size * 2, size * 2);
      paint.restore();
    }
    pixels = paint.getImageData(0, 0, width, height).data;
    schedule();
  }

  function render() {
    frame = 0;
    context.drawImage(source, 0, 0);
    if (!active || !enabled) return;
    const left = Math.floor(x) - radius, top = Math.floor(y) - radius;
    const data = patch.data, diameter = radius * 2;
    // Reverse-map a softened radial lens into the *same* source background.
    // The center magnifies ~2.5x; the smooth radial falloff bends the grid.
    // Bilinear sampling makes stars stretch continuously instead of jumping.
    for (let py = 0; py < diameter; py++) {
      for (let px = 0; px < diameter; px++) {
        const dest = (py * diameter + px) * 4;
        const screenX = left + px, screenY = top + py;
        const dx = screenX - x, dy = screenY - y;
        const distance = Math.sqrt(dx * dx + dy * dy) / radius;
        const t = Math.min(1, distance);
        const influence = 1 - t * t * (3 - 2 * t);
        const scale = 1 - .6 * influence;
        const sx = Math.max(0, Math.min(width - 1, x + dx * scale));
        const sy = Math.max(0, Math.min(height - 1, y + dy * scale));
        const ix = Math.floor(sx), iy = Math.floor(sy);
        const fx = sx - ix, fy = sy - iy;
        const a = (iy * width + ix) * 4;
        const b = (iy * width + Math.min(ix + 1, width - 1)) * 4;
        const c = (Math.min(iy + 1, height - 1) * width + ix) * 4;
        const d = (Math.min(iy + 1, height - 1) * width + Math.min(ix + 1, width - 1)) * 4;
        for (let channel = 0; channel < 3; channel++) {
          data[dest + channel] =
            (pixels[a + channel] * (1 - fx) + pixels[b + channel] * fx) * (1 - fy) +
            (pixels[c + channel] * (1 - fx) + pixels[d + channel] * fx) * fy;
        }
        data[dest + 3] = 255;
      }
    }
    context.putImageData(patch, left, top);
  }

  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !enabled) return;
    x = event.clientX; y = event.clientY;
    active = true;
    if (cursor) {
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      cursor.classList.toggle('is-hover', Boolean(event.target.closest('a, button')));
      document.body.classList.add('has-lens-cursor');
    }
    schedule();
  }, { passive: true });
  window.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && enabled) cursor?.classList.add('is-pressed');
    else resetPointer();
  });
  window.addEventListener('pointerup', () => cursor?.classList.remove('is-pressed'));
  window.addEventListener('blur', resetPointer);
  document.addEventListener('mouseleave', resetPointer);
  document.addEventListener('visibilitychange', resetPointer);
  document.addEventListener('touchstart', resetPointer, { passive: true });
  window.addEventListener('resize', () => { resetPointer(); rebuild(); });
  preference.addEventListener('change', () => {
    enabled = !preference.matches;
    updateToggle();
  });
  toggle?.addEventListener('click', () => {
    enabled = !enabled;
    updateToggle();
  });
  rebuild();
  updateToggle();
})();
