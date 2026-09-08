// ===== Footer year =====
document.getElementById('year').textContent = new Date().getFullYear();

// ===== Mobile nav =====
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

menuToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('active');
  menuToggle.classList.toggle('active', isOpen);
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('active');
    menuToggle.classList.remove('active');
    menuToggle.setAttribute('aria-expanded', 'false');
  });
});

// ===== Gravitational-lens starfield =====
// A starfield that bends around the cursor, loosely inspired by how
// gravitational lensing deflects light around a mass. Not a physically
// exact simulation — a visual nod to the subject.
(function () {
  const canvas = document.getElementById('lens-field');
  if (!canvas) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  const ctx = canvas.getContext('2d');
  let width, height, dpr;
  let stars = [];
  let pointer = { x: null, y: null, active: false };
  let resizeTimer;

  // The canvas is position:fixed, so it is viewport-relative and never
  // scrolls. It only ever needs to be as big as the viewport itself —
  // sizing it to page/document height was wasted space AND caused the
  // lens to drift out of sync with the cursor once the page scrolled.
  const LENS_RADIUS = 260;
  const STAR_DENSITY = 3200; // px^2 per star — lower = more stars

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    initStars();
  }

  function initStars() {
    const count = Math.floor((width * height) / STAR_DENSITY);
    stars = new Array(count).fill(0).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.4 + 0.6,
      baseAlpha: Math.random() * 0.5 + 0.45,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.015 + 0.005
    }));
  }

  function draw(time) {
    ctx.clearRect(0, 0, width, height);

    for (const s of stars) {
      let drawX = s.x;
      let drawY = s.y;

      if (pointer.active) {
        const dx = s.x - pointer.x;
        const dy = s.y - pointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LENS_RADIUS && dist > 0.01) {
          const strength = 1 - dist / LENS_RADIUS;
          const bend = strength * strength * 34;
          drawX += (dx / dist) * bend;
          drawY += (dy / dist) * bend;
        }
      }

      const twinkle = 0.5 + 0.5 * Math.sin(time * s.speed + s.phase);
      const alpha = s.baseAlpha * (0.6 + 0.4 * twinkle);

      ctx.beginPath();
      ctx.arc(drawX, drawY, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(243, 239, 234, ${alpha.toFixed(3)})`;
      ctx.fill();
    }

    if (pointer.active) {
      const ringRadius = LENS_RADIUS * 0.62;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(123, 110, 246, 0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    requestAnimationFrame(draw);
  }

  // Coordinates are viewport-relative (clientX/clientY) to match the
  // fixed, viewport-sized canvas — no scroll offset needed or wanted.
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  });

  window.addEventListener('pointerleave', () => { pointer.active = false; });
  window.addEventListener('blur', () => { pointer.active = false; });

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 100);
  });

  resize();
  requestAnimationFrame(draw);
})();
