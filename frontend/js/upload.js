/* ══════════════════════════════════════════
   SERENITY RADIO — upload.js
   Musician file upload — drop zone + submit
   ══════════════════════════════════════════ */

let selectedFile = null;

function showFileName(input) {
  selectedFile = input.files[0];
  if (selectedFile) {
    document.getElementById('file-name').textContent = '✓ ' + selectedFile.name;
  }
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) {
    selectedFile = file;
    document.getElementById('file-name').textContent = '✓ ' + file.name;
  }
}

async function handleUpload() {
  const artist = document.getElementById('up-artist').value.trim();
  const email  = document.getElementById('up-email').value.trim();
  const title  = document.getElementById('up-title').value.trim();
  const genre  = document.getElementById('up-genre').value;

  if (!artist || !email || !title) {
    showToast('Please fill in all required fields.');
    return;
  }
  if (!selectedFile) {
    showToast('Please select a music file to upload.');
    return;
  }

  // Validate file type
  const allowed = ['.mp3', '.wav', '.flac'];
  const ext = '.' + selectedFile.name.split('.').pop().toLowerCase();
  if (!allowed.includes(ext)) {
    showToast('Only MP3, WAV or FLAC files are accepted.');
    return;
  }

  // Validate size (50MB max)
  if (selectedFile.size > 50 * 1024 * 1024) {
    showToast('File too large. Maximum size is 50MB.');
    return;
  }

  const formData = new FormData();
  formData.append('file',   selectedFile);
  formData.append('artist', artist);
  formData.append('email',  email);
  formData.append('title',  title);
  formData.append('genre',  genre);

  try {
    showToast('Uploading… please wait.');
    const res  = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (res.ok) {
      closeModal('modal-upload');
      showToast('Submitted! Our curators will review within 5–7 days ↑');
      // Clear form
      document.getElementById('up-artist').value = '';
      document.getElementById('up-email').value  = '';
      document.getElementById('up-title').value  = '';
      document.getElementById('file-name').textContent = '';
      selectedFile = null;
    } else {
      showToast(data.message || 'Upload failed. Please try again.');
    }
  } catch {
    showToast('Could not connect. Please try again.');
  }
}
