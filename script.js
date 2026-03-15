// Premium brand marquee animations with GSAP
const panel = document.querySelector('.marquee-panel');
const rows = document.querySelectorAll('.marquee-row');

function buildMarquee(row, direction) {
  const track = row.querySelector('.marquee-track');
  if (!track) return null;

  // Duplicate items for seamless loop
  const items = Array.from(track.children);
  items.forEach((item) => track.appendChild(item.cloneNode(true)));

  const update = () => {
    const halfWidth = track.scrollWidth / 2;
    const duration = 26; // base cinematic speed
    if (direction === 'right') {
      return gsap.fromTo(
        track,
        { x: -halfWidth },
        { x: 0, duration, ease: 'none', repeat: -1 }
      );
    }
    return gsap.fromTo(
      track,
      { x: 0 },
      { x: -halfWidth, duration, ease: 'none', repeat: -1 }
    );
  };

  let tween = update();

  window.addEventListener('resize', () => {
    if (tween) tween.kill();
    gsap.set(track, { x: 0 });
    tween = update();
  });

  return tween;
}

const tweens = Array.from(rows).map((row) => buildMarquee(row, row.dataset.direction));

// Pause smoothly on hover
if (panel) {
  panel.addEventListener('mouseenter', () => {
    tweens.forEach((t) => t && gsap.to(t, { timeScale: 0, duration: 0.6, ease: 'power2.out' }));
  });
  panel.addEventListener('mouseleave', () => {
    tweens.forEach((t) => t && gsap.to(t, { timeScale: 1, duration: 0.6, ease: 'power2.out' }));
    resetMagnet();
  });
}

// Velocity-based speed boost on scroll
let lastScroll = window.scrollY;
let boostTimeout = null;
window.addEventListener('scroll', () => {
  const current = window.scrollY;
  const delta = Math.abs(current - lastScroll);
  lastScroll = current;

  const boost = Math.min(1.6, 1 + delta / 300);
  tweens.forEach((t) => t && gsap.to(t, { timeScale: boost, duration: 0.2 }));

  clearTimeout(boostTimeout);
  boostTimeout = setTimeout(() => {
    tweens.forEach((t) => t && gsap.to(t, { timeScale: 1, duration: 0.6, ease: 'power2.out' }));
  }, 120);
});

// Mouse parallax + magnetic hover
const items = document.querySelectorAll('.brand-item');

function resetMagnet() {
  items.forEach((item) => gsap.to(item, { x: 0, y: 0, duration: 0.4, ease: 'power2.out' }));
}

if (panel) {
  panel.addEventListener('mousemove', (e) => {
    const rect = panel.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;

    rows.forEach((row, idx) => {
      const depth = idx === 0 ? 10 : 16;
      gsap.to(row, { x: x * depth, y: y * depth * 0.4, duration: 0.4, ease: 'power2.out' });
    });

    items.forEach((item) => {
      const r = item.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const max = 140;
      if (dist < max) {
        const strength = (1 - dist / max) * 6;
        gsap.to(item, { x: (dx / max) * strength, y: (dy / max) * strength, duration: 0.2, ease: 'power2.out' });
      }
    });
  });
}

// Lightbox for portfolio images/videos
const lightbox = document.getElementById('lightbox');
if (lightbox) {
  const mediaWrap = lightbox.querySelector('.lightbox-media');
  const closeBtn = lightbox.querySelector('.lightbox-close');
  const backdrop = lightbox.querySelector('.lightbox-backdrop');

  function closeLightbox() {
    lightbox.classList.remove('active');
    mediaWrap.innerHTML = '';
    document.body.style.overflow = '';
  }

  function openLightbox(type, src, alt) {
    mediaWrap.innerHTML = '';
    if (type === 'video') {
      const video = document.createElement('video');
      video.src = src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      mediaWrap.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = src;
      img.alt = alt || 'Portfolio image';
      mediaWrap.appendChild(img);
    }
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  document.querySelectorAll('.media-card').forEach((card) => {
    card.addEventListener('click', () => {
      const type = card.dataset.type || 'image';
      const src = card.dataset.src;
      const title = card.querySelector('h3')?.textContent || '';
      if (src) openLightbox(type, src, title);
    });
  });

  closeBtn.addEventListener('click', closeLightbox);
  backdrop.addEventListener('click', closeLightbox);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });
}

// Keep inputs interactive as before
const inputs = document.querySelectorAll('input,select');
inputs.forEach((input) => {
  input.addEventListener('focus', () => { input.style.background = '#2b2b2b'; });
  input.addEventListener('blur', () => { input.style.background = '#1e1e1e'; });
});

// Contact form submission (works for index and contact page)
const contactForms = document.querySelectorAll('form');
contactForms.forEach((form) => {
  form.addEventListener('submit', async (e) => {
    const hasContact = form.querySelector('textarea') || form.querySelector('input[type=\"email\"]');
    if (!hasContact) return;
    e.preventDefault();

    const name = form.querySelector('input[type=\"text\"]')?.value || \"\";
    const email = form.querySelector('input[type=\"email\"]')?.value || \"\";
    const need = form.querySelector('select')?.value || \"\";
    const message = form.querySelector('textarea')?.value || \"\";

    try {
      const res = await fetch('http://localhost:4000/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, need, message })
      });
      if (res.ok) {
        alert('Message sent. We will contact you soon.');
        form.reset();
      } else {
        alert('Failed to send message.');
      }
    } catch (err) {
      alert('Server unavailable.');
    }
  });
});
