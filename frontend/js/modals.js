/* ══════════════════════════════════════════
   SERENITY RADIO — modals.js
   Modal open/close, subscribe form, toast
   ══════════════════════════════════════════ */

// ── Open / Close ──
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// Close on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
});

// Close on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => {
      m.classList.remove('open');
      document.body.style.overflow = '';
    });
  }
});

// ── Subscribe ──
async function handleSubscribe() {
  const name   = document.getElementById('sub-name').value.trim();
  const email  = document.getElementById('sub-email').value.trim();
  const reason = document.getElementById('sub-reason').value;

  if (!email) {
    showToast('Please enter your email address.');
    return;
  }

  try {
    const res  = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, reason }),
    });
    const data = await res.json();

    if (res.ok) {
      closeModal('modal-subscribe');
      showToast('Welcome! Your first quote arrives tomorrow morning ✦');
      // Clear form
      document.getElementById('sub-name').value  = '';
      document.getElementById('sub-email').value = '';
      document.getElementById('sub-reason').value = '';
    } else {
      showToast(data.message || 'Something went wrong. Please try again.');
    }
  } catch {
    showToast('Could not connect. Please try again.');
  }
}

// ── Toast ──
let toastTimer = null;

function showToast(msg, duration = 3500) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}
