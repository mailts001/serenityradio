/* ══════════════════════════════════════════
   SERENITY RADIO — quotes.js
   Famous quotes rotation for DJ interlude
   ══════════════════════════════════════════ */

const QUOTES = [
  { text: "You don't have to control your thoughts. You just have to stop letting them control you.", author: "Dan Millman" },
  { text: "Almost everything will work again if you unplug it for a few minutes — including you.", author: "Anne Lamott" },
  { text: "You are enough. You have always been enough.", author: "Brené Brown" },
  { text: "Not everything that is faced can be changed. But nothing can be changed until it is faced.", author: "James Baldwin" },
  { text: "Your present circumstances don't determine where you can go. They merely determine where you start.", author: "Nido Qubein" },
  { text: "The flower that blooms in adversity is the most rare and beautiful of all.", author: "Walt Disney" },
  { text: "Sometimes the bravest thing you can do is to keep going when you really want to stop.", author: "Unknown" },
  { text: "You are not a drop in the ocean. You are the entire ocean in a drop.", author: "Rumi" },
  { text: "Healing is not linear. Be patient with yourself.", author: "Unknown" },
  { text: "What lies within us is far greater than what lies behind or before us.", author: "Ralph Waldo Emerson" },
  { text: "The wound is the place where the light enters you.", author: "Rumi" },
  { text: "Be gentle with yourself. You are a child of the universe, no less than the trees and the stars.", author: "Max Ehrmann" },
  { text: "Out of difficulties grow miracles.", author: "Jean de la Bruyère" },
  { text: "You don't have to be positive all the time. It's perfectly okay to feel sad, angry, annoyed, frustrated or anxious.", author: "Lori Deschene" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "Breathe. It's just a bad day, not a bad life.", author: "Unknown" },
  { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "You yourself, as much as anybody in the entire universe, deserve your love and affection.", author: "Buddha" },
];

let quoteIdx = 0;

function rotateQuote() {
  quoteIdx = (quoteIdx + 1) % QUOTES.length;
  const q  = QUOTES[quoteIdx];
  const el = document.getElementById('dj-quote');
  const au = document.getElementById('dj-author');

  el.style.opacity = '0';
  setTimeout(() => {
    el.textContent = '\u201c' + q.text + '\u201d';
    au.textContent = '\u2014 ' + q.author;
    el.style.opacity = '1';
    el.style.transition = 'opacity 0.8s';
  }, 500);
}

// Rotate quote every 20 seconds
setInterval(rotateQuote, 20000);
