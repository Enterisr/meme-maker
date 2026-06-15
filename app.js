/* ============================================================
   State
   ============================================================ */
const canvas  = document.getElementById('canvas');
const ctx     = canvas.getContext('2d');
const pholder = document.getElementById('placeholder-msg');

// Single mode
let img    = null;
let imgNW  = 0, imgNH = 0;
let displayW = 0, displayH = 0;
let capTopH = 0, capBotH = 0;
let imgMirrorX = false;

// Shared text
let texts  = [];
let selId  = null;
let uid    = 1;
let boxes  = []; // text hit-test cache

// Collage mode
let mode       = 'single';
let photos     = [];
let selPhotoId = null;
let photoUid   = 1000;
let colW       = 1080;
let colH       = 1080;
let bgColor    = '#ffffff';
let photoBoxes  = []; // photo hit-test cache
let handleBoxes = []; // resize-handle hit-test cache

// Drag state
let drag = { on: false, type: null, id: null, ox: 0, oy: 0,
             corner: null, origX: 0, origY: 0, origW: 0, origH: 0 };

/* ============================================================
   Font loading
   ============================================================ */
document.fonts.ready.then(() => { render(); });

/* ============================================================
   Mode switching
   ============================================================ */
function setMode(m) {
  mode = m;
  document.getElementById('single-sections').style.display  = m === 'single'  ? '' : 'none';
  document.getElementById('collage-sections').style.display = m === 'collage' ? '' : 'none';
  document.getElementById('tab-single').classList.toggle('active',  m === 'single');
  document.getElementById('tab-collage').classList.toggle('active', m === 'collage');

  if (m === 'collage') {
    pholder.style.display = 'none';
    selId = null;
    document.getElementById('props-sec').style.display = 'none';
    render();
  } else {
    selPhotoId = null;
    if (!img) {
      pholder.style.display = '';
      canvas.width  = 800;
      canvas.height = 500;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, 800, 500);
    } else {
      render();
    }
  }
}

/* ============================================================
   Single mode — upload / drag-drop
   ============================================================ */
const dropZ   = document.getElementById('drop-zone');
const fileInp = document.getElementById('file-input');

dropZ.addEventListener('click', () => fileInp.click());
fileInp.addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });

dropZ.addEventListener('dragover', e => { e.preventDefault(); dropZ.classList.add('over'); });
dropZ.addEventListener('dragleave', () => dropZ.classList.remove('over'));
dropZ.addEventListener('drop', e => {
  e.preventDefault();
  dropZ.classList.remove('over');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const i   = new Image();
  i.onload  = () => {
    img   = i;
    imgNW = i.naturalWidth;
    imgNH = i.naturalHeight;
    imgMirrorX = false;
    document.getElementById('btn-mirror-img').classList.remove('active');
    pholder.style.display = 'none';
    document.getElementById('caption-sec').style.display = '';
    document.getElementById('img-controls').style.display = '';
    computeDisplaySize();
    render();
  };
  i.src = url;
}

/* ============================================================
   Single mode — mirror image
   ============================================================ */
function toggleImgMirror() {
  imgMirrorX = !imgMirrorX;
  document.getElementById('btn-mirror-img').classList.toggle('active', imgMirrorX);
  render();
}

/* ============================================================
   Collage mode — photo management
   ============================================================ */
const colDropZ     = document.getElementById('col-drop-zone');
const photoFileInp = document.getElementById('photo-file-input');

colDropZ.addEventListener('click', () => photoFileInp.click());
photoFileInp.addEventListener('change', e => {
  Array.from(e.target.files).forEach(loadPhotoFile);
  e.target.value = '';
});
colDropZ.addEventListener('dragover', e => { e.preventDefault(); colDropZ.classList.add('over'); });
colDropZ.addEventListener('dragleave', () => colDropZ.classList.remove('over'));
colDropZ.addEventListener('drop', e => {
  e.preventDefault();
  colDropZ.classList.remove('over');
  Array.from(e.dataTransfer.files).forEach(f => { if (f.type.startsWith('image/')) loadPhotoFile(f); });
});

// drop anywhere on canvas area
document.getElementById('main').addEventListener('dragover', e => e.preventDefault());
document.getElementById('main').addEventListener('drop', e => {
  e.preventDefault();
  const files = e.dataTransfer.files;
  if (!files.length) return;
  if (mode === 'single') {
    loadFile(files[0]);
  } else {
    Array.from(files).forEach(f => { if (f.type.startsWith('image/')) loadPhotoFile(f); });
  }
});

function loadPhotoFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const i   = new Image();
  i.onload  = () => addPhotoToCollage(i);
  i.onerror = () => alert('Cannot load: ' + file.name);
  i.src = url;
}

function addPhotoFromURL() {
  const url = document.getElementById('photo-url').value.trim();
  if (!url) { alert('Enter an image URL'); return; }
  const i       = new Image();
  i.crossOrigin = 'anonymous';
  i.onload = () => {
    addPhotoToCollage(i);
    document.getElementById('photo-url').value = '';
  };
  i.onerror = () => {
    // fallback without crossOrigin (canvas will be tainted but image displays)
    const i2 = new Image();
    i2.onload  = () => {
      addPhotoToCollage(i2);
      document.getElementById('photo-url').value = '';
    };
    i2.onerror = () => alert('Cannot load image. Check the URL.');
    i2.src = url;
  };
  i.src = url;
}

function addPhotoToCollage(imgEl) {
  const maxW  = colW * 0.65;
  const maxH  = colH * 0.65;
  const scale = Math.min(1, maxW / imgEl.naturalWidth, maxH / imgEl.naturalHeight);
  const w = Math.round(imgEl.naturalWidth  * scale);
  const h = Math.round(imgEl.naturalHeight * scale);
  const x = Math.round((colW - w) / 2);
  const y = Math.round((colH - h) / 2);

  const p = { id: photoUid++, img: imgEl, x, y, w, h,
               naturalW: imgEl.naturalWidth, naturalH: imgEl.naturalHeight,
               mirrorX: false };
  photos.push(p);
  document.getElementById('photos-sec').style.display = '';
  selectPhoto(p.id);
}

function selectPhoto(id) {
  selPhotoId = id;
  selId = null;
  document.getElementById('props-sec').style.display = 'none';
  refreshList();
  const p = photos.find(x => x.id === id);
  if (p) {
    document.getElementById('photo-props-sec').style.display = '';
    document.getElementById('btn-mirror-photo').classList.toggle('active', !!p.mirrorX);
    updatePhotoPropFields();
  } else {
    document.getElementById('photo-props-sec').style.display = 'none';
  }
  refreshPhotoList();
  render();
}

function updatePhotoPropFields() {
  const p = photos.find(x => x.id === selPhotoId);
  if (!p) return;
  document.getElementById('pp-x').value = Math.round(p.x);
  document.getElementById('pp-y').value = Math.round(p.y);
  document.getElementById('pp-w').value = Math.round(p.w);
  document.getElementById('pp-h').value = Math.round(p.h);
}

function setPhotoProp(key, val) {
  const p = photos.find(x => x.id === selPhotoId);
  if (!p) return;
  p[key] = val;
}

function fitPhotoToCanvas() {
  const p = photos.find(x => x.id === selPhotoId);
  if (!p) return;
  p.x = 0; p.y = 0; p.w = colW; p.h = colH;
  updatePhotoPropFields();
  render();
}

function resetPhotoSize() {
  const p = photos.find(x => x.id === selPhotoId);
  if (!p) return;
  const scale = Math.min(1, (colW * 0.65) / p.naturalW, (colH * 0.65) / p.naturalH);
  p.w = Math.round(p.naturalW * scale);
  p.h = Math.round(p.naturalH * scale);
  updatePhotoPropFields();
  render();
}

function togglePhotoMirror() {
  const p = photos.find(x => x.id === selPhotoId);
  if (!p) return;
  p.mirrorX = !p.mirrorX;
  document.getElementById('btn-mirror-photo').classList.toggle('active', p.mirrorX);
  render();
}

function bringForward() {
  const idx = photos.findIndex(x => x.id === selPhotoId);
  if (idx < photos.length - 1) {
    [photos[idx], photos[idx + 1]] = [photos[idx + 1], photos[idx]];
    refreshPhotoList();
    render();
  }
}

function sendBack() {
  const idx = photos.findIndex(x => x.id === selPhotoId);
  if (idx > 0) {
    [photos[idx], photos[idx - 1]] = [photos[idx - 1], photos[idx]];
    refreshPhotoList();
    render();
  }
}

function deleteSelectedPhoto() {
  photos = photos.filter(x => x.id !== selPhotoId);
  selPhotoId = null;
  document.getElementById('photo-props-sec').style.display = 'none';
  if (photos.length === 0) document.getElementById('photos-sec').style.display = 'none';
  refreshPhotoList();
  render();
}

function refreshPhotoList() {
  const list = document.getElementById('photo-list');
  if (!list) return;
  list.innerHTML = '';
  photos.forEach((p, idx) => {
    const div = document.createElement('div');
    div.className = 'ti' + (p.id === selPhotoId ? ' sel' : '');

    // thumbnail via mini-canvas
    const th  = document.createElement('canvas');
    th.width  = 36; th.height = 28;
    th.className = 'ti-thumb';
    try { th.getContext('2d').drawImage(p.img, 0, 0, 36, 28); } catch(e) {}

    const lbl = document.createElement('span');
    lbl.className = 'ti-lbl';
    lbl.textContent = `Photo ${idx + 1}  ${p.naturalW}×${p.naturalH}`;

    div.appendChild(th);
    div.appendChild(lbl);
    div.addEventListener('click', () => selectPhoto(p.id));
    list.appendChild(div);
  });
}

function setColSize(w, h) {
  colW = w; colH = h;
  document.getElementById('col-w').value = w;
  document.getElementById('col-h').value = h;
  render();
}

/* ============================================================
   Resize handles (collage mode)
   ============================================================ */
function renderPhotoHandles(p) {
  const s = 9;
  ctx.save();

  // selection border
  ctx.strokeStyle = '#4a9eff';
  ctx.lineWidth   = 2;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(p.x, p.y, p.w, p.h);
  ctx.setLineDash([]);

  // corner handles
  const corners = [
    { corner: 'nw', hx: p.x,       hy: p.y       },
    { corner: 'ne', hx: p.x + p.w, hy: p.y       },
    { corner: 'sw', hx: p.x,       hy: p.y + p.h },
    { corner: 'se', hx: p.x + p.w, hy: p.y + p.h },
  ];

  corners.forEach(c => {
    ctx.fillStyle   = '#fff';
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth   = 2;
    ctx.fillRect(c.hx - s / 2, c.hy - s / 2, s, s);
    ctx.strokeRect(c.hx - s / 2, c.hy - s / 2, s, s);
    handleBoxes.push({ photoId: p.id, corner: c.corner,
                       x: c.hx - s / 2, y: c.hy - s / 2, s });
  });

  ctx.restore();
}

function hitHandle(cx, cy) {
  for (let i = handleBoxes.length - 1; i >= 0; i--) {
    const h = handleBoxes[i];
    if (cx >= h.x && cx <= h.x + h.s && cy >= h.y && cy <= h.y + h.s) return h;
  }
  return null;
}

function hitPhoto(cx, cy) {
  for (let i = photoBoxes.length - 1; i >= 0; i--) {
    const b = photoBoxes[i];
    if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) return b.id;
  }
  return null;
}

function resizeCursor(corner) {
  return { nw: 'nw-resize', ne: 'ne-resize', sw: 'sw-resize', se: 'se-resize' }[corner] || 'move';
}

/* ============================================================
   Layout / canvas sizing (single mode)
   ============================================================ */
function computeDisplaySize() {
  if (!img) return;
  const isMobile = window.innerWidth <= 768;
  const maxW = isMobile
    ? window.innerWidth - 24
    : Math.min(1200, window.innerWidth - 340);
  const scale = Math.min(1, maxW / imgNW);
  displayW = Math.round(imgNW * scale);
  displayH = Math.round(imgNH * scale);
}

function getCapHeight(textEl) {
  const text = textEl.value.trim();
  if (!text) return 0;
  const sz    = +document.getElementById('cap-size').value || 42;
  const lines = text.split('\n').length;
  return Math.max(sz * 1.8, lines * sz * 1.45 + sz * 0.5);
}

function setCanvasSize() {
  capTopH = getCapHeight(document.getElementById('cap-top'));
  capBotH = getCapHeight(document.getElementById('cap-bot'));
  canvas.width  = displayW;
  canvas.height = displayH + Math.round(capTopH) + Math.round(capBotH);
}

/* ============================================================
   Render
   ============================================================ */
function render() {
  if (mode === 'collage') { renderCollage(); return; }
  if (!img) return;
  renderSingle();
}

function renderSingle() {
  computeDisplaySize();
  setCanvasSize();

  const W       = canvas.width;
  const imgYOff = Math.round(capTopH);

  ctx.clearRect(0, 0, W, canvas.height);

  if (capTopH > 0) {
    ctx.fillStyle = document.getElementById('cap-top-bg').value;
    ctx.fillRect(0, 0, W, imgYOff);
    drawCaption(
      document.getElementById('cap-top').value,
      document.getElementById('cap-top-fg').value,
      0, imgYOff
    );
  }

  // Draw image with optional horizontal mirror
  ctx.save();
  if (imgMirrorX) {
    ctx.translate(displayW, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, 0, imgYOff, displayW, displayH);
  ctx.restore();

  if (capBotH > 0) {
    const yBot = imgYOff + displayH;
    ctx.fillStyle = document.getElementById('cap-bot-bg').value;
    ctx.fillRect(0, yBot, W, Math.round(capBotH));
    drawCaption(
      document.getElementById('cap-bot').value,
      document.getElementById('cap-bot-fg').value,
      yBot, Math.round(capBotH)
    );
  }

  boxes = [];
  texts.forEach(t => {
    const bb = drawText(t, t.id === selId);
    boxes.push({ id: t.id, ...bb });
  });
}

function renderCollage() {
  canvas.width  = colW;
  canvas.height = colH;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, colW, colH);

  photoBoxes  = [];
  handleBoxes = [];

  photos.forEach(p => {
    ctx.save();
    if (p.mirrorX) {
      ctx.translate(p.x + p.w, p.y);
      ctx.scale(-1, 1);
      ctx.drawImage(p.img, 0, 0, p.w, p.h);
    } else {
      ctx.drawImage(p.img, p.x, p.y, p.w, p.h);
    }
    ctx.restore();
    photoBoxes.push({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h });
  });

  // handles on top of photos, below texts
  if (selPhotoId !== null) {
    const p = photos.find(x => x.id === selPhotoId);
    if (p) renderPhotoHandles(p);
  }

  boxes = [];
  texts.forEach(t => {
    const bb = drawText(t, t.id === selId);
    boxes.push({ id: t.id, ...bb });
  });
}

function drawCaption(text, color, yStart, barH) {
  const sz     = +document.getElementById('cap-size').value || 42;
  const lines  = text.split('\n');
  const lineH  = sz * 1.45;
  const totalH = lines.length * lineH;
  const startY = yStart + (barH - totalH) / 2 + sz * 0.9;

  ctx.save();
  ctx.font        = `900 ${sz}px 'Rubik', sans-serif`;
  ctx.textAlign   = 'center';
  ctx.direction   = 'rtl';
  ctx.fillStyle   = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth   = 1;

  lines.forEach((line, i) => {
    const y = startY + i * lineH;
    ctx.strokeText(line, canvas.width / 2, y);
    ctx.fillText(line, canvas.width / 2, y);
  });
  ctx.restore();
}

function drawText(t, isSelected) {
  const rawLines = (t.text || '').split('\n');
  const lines    = t.upper ? rawLines.map(l => l.toUpperCase()) : rawLines;
  const sz       = t.size || 60;
  const lineH    = sz * 1.3;
  const weight   = t.bold ? '900' : '700';
  const family   = `'${t.font || 'Rubik'}', sans-serif`;

  ctx.save();
  ctx.font      = `${weight} ${sz}px ${family}`;
  ctx.textAlign = t.align || 'center';
  ctx.direction = 'rtl';

  if (t.shadow) {
    ctx.shadowColor   = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur    = sz * 0.12;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
  }

  const maxW = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);

  lines.forEach((line, i) => {
    const y = t.y + i * lineH;
    if ((t.strokeWidth || 0) > 0) {
      ctx.strokeStyle = t.strokeColor || '#000';
      ctx.lineWidth   = t.strokeWidth;
      ctx.lineJoin    = 'round';
      ctx.strokeText(line, t.x, y);
    }
    ctx.fillStyle = t.color || '#fff';
    ctx.fillText(line, t.x, y);
  });

  ctx.restore();

  const align = t.align || 'center';
  const bx = align === 'center' ? t.x - maxW / 2
            : align === 'right'  ? t.x - maxW
            : t.x;
  const by = t.y - sz * 0.85;
  const bh = lines.length * lineH;

  if (isSelected) {
    ctx.save();
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(bx - 8, by - 6, maxW + 16, bh + 10);
    ctx.setLineDash([]);
    ctx.restore();
  }

  return { x: bx - 8, y: by - 6, w: maxW + 16, h: bh + 10 };
}

/* ============================================================
   Text: add / select / edit / delete
   ============================================================ */
function addText() {
  if (mode === 'single' && !img) { alert('Upload an image first'); return; }
  const text = document.getElementById('new-text').value.trim();
  if (!text) { alert('Enter text'); return; }

  const t = {
    id:          uid++,
    text,
    x:           Math.round(canvas.width  / 2),
    y:           Math.round(canvas.height / 2),
    font:        document.getElementById('new-font').value,
    size:        +document.getElementById('new-size').value || 60,
    bold:        true,
    upper:       false,
    shadow:      false,
    color:       document.getElementById('new-color').value,
    strokeColor: document.getElementById('new-stroke').value,
    strokeWidth: +document.getElementById('new-sw').value || 4,
    align:       'center',
  };

  texts.push(t);
  document.getElementById('new-text').value = '';
  document.getElementById('texts-sec').style.display = '';
  selectText(t.id);
  render();
}

function selectText(id) {
  selId = id;
  selPhotoId = null;
  document.getElementById('photo-props-sec').style.display = 'none';
  refreshPhotoList();

  const t = texts.find(x => x.id === id);
  if (!t) {
    document.getElementById('props-sec').style.display = 'none';
    refreshList();
    render();
    return;
  }

  document.getElementById('props-sec').style.display = '';
  document.getElementById('p-text').value          = t.text;
  document.getElementById('p-font').value          = t.font;
  document.getElementById('p-size').value          = t.size;
  document.getElementById('p-color').value         = t.color;
  document.getElementById('p-stroke-color').value  = t.strokeColor;
  document.getElementById('p-sw').value            = t.strokeWidth;
  document.getElementById('p-sw-val').textContent  = t.strokeWidth + 'px';

  document.getElementById('btn-bold').classList.toggle('active',   !!t.bold);
  document.getElementById('btn-shadow').classList.toggle('active', !!t.shadow);
  document.getElementById('btn-upper').classList.toggle('active',  !!t.upper);
  highlightAlign(t.align === 'right' ? 'r' : t.align === 'left' ? 'l' : 'c');

  refreshList();
  render();
}

function setProp(key, val) {
  const t = texts.find(x => x.id === selId);
  if (!t) return;
  t[key] = val;
  render();
}

function toggleProp(key) {
  const t = texts.find(x => x.id === selId);
  if (!t) return;
  t[key] = !t[key];
  const btnId = key === 'upper' ? 'btn-upper' : 'btn-' + key;
  document.getElementById(btnId).classList.toggle('active', t[key]);
  render();
}

function highlightAlign(which) {
  ['r', 'c', 'l'].forEach(k => {
    document.getElementById('al-' + k).classList.toggle('active', k === which);
  });
}

function deleteSelected() {
  texts = texts.filter(x => x.id !== selId);
  selId = null;
  document.getElementById('props-sec').style.display = 'none';
  if (texts.length === 0) document.getElementById('texts-sec').style.display = 'none';
  refreshList();
  render();
}

function refreshList() {
  const list = document.getElementById('text-list');
  list.innerHTML = '';
  texts.forEach(t => {
    const div = document.createElement('div');
    div.className = 'ti' + (t.id === selId ? ' sel' : '');
    div.innerHTML = `
      <span class="ti-dot" style="background:${t.color};"></span>
      <span class="ti-lbl">${t.text.replace(/\n/g, ' ')}</span>
    `;
    div.addEventListener('click', () => selectText(t.id));
    list.appendChild(div);
  });
}

/* ============================================================
   Canvas coordinate helper
   ============================================================ */
function canvasXY(e) {
  const r  = canvas.getBoundingClientRect();
  const sx = canvas.width  / r.width;
  const sy = canvas.height / r.height;
  return { cx: (e.clientX - r.left) * sx, cy: (e.clientY - r.top) * sy };
}

function hitTest(cx, cy) {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) return b.id;
  }
  return null;
}

/* ============================================================
   Canvas pointer interaction (shared by mouse + touch)
   ============================================================ */
function handlePointerDown(cx, cy) {
  if (mode === 'collage') {
    const hh = hitHandle(cx, cy);
    if (hh) {
      const p = photos.find(x => x.id === hh.photoId);
      if (p) {
        drag = { on: true, type: 'resize', id: hh.photoId, corner: hh.corner,
                 ox: cx, oy: cy, origX: p.x, origY: p.y, origW: p.w, origH: p.h };
        return;
      }
    }

    const textHit = hitTest(cx, cy);
    if (textHit !== null) {
      selectText(textHit);
      const t = texts.find(x => x.id === textHit);
      drag = { on: true, type: 'text', id: textHit, ox: cx - t.x, oy: cy - t.y };
      return;
    }

    const photoId = hitPhoto(cx, cy);
    if (photoId !== null) {
      selId = null;
      document.getElementById('props-sec').style.display = 'none';
      refreshList();
      selectPhoto(photoId);
      const p = photos.find(x => x.id === photoId);
      drag = { on: true, type: 'photo', id: photoId, ox: cx - p.x, oy: cy - p.y };
      return;
    }

    selId = null;
    selPhotoId = null;
    document.getElementById('props-sec').style.display = 'none';
    document.getElementById('photo-props-sec').style.display = 'none';
    refreshList();
    refreshPhotoList();
    render();

  } else {
    const hit = hitTest(cx, cy);
    if (hit !== null) {
      selectText(hit);
      const t = texts.find(x => x.id === hit);
      drag = { on: true, type: 'text', id: hit, ox: cx - t.x, oy: cy - t.y };
    } else {
      selId = null;
      document.getElementById('props-sec').style.display = 'none';
      refreshList();
      render();
    }
  }
}

function handlePointerMove(cx, cy) {
  if (drag.on) {
    if (drag.type === 'text') {
      const t = texts.find(x => x.id === drag.id);
      if (t) { t.x = Math.round(cx - drag.ox); t.y = Math.round(cy - drag.oy); render(); }
      canvas.style.cursor = 'grabbing';

    } else if (drag.type === 'photo') {
      const p = photos.find(x => x.id === drag.id);
      if (p) {
        p.x = Math.round(cx - drag.ox);
        p.y = Math.round(cy - drag.oy);
        updatePhotoPropFields();
        render();
      }
      canvas.style.cursor = 'grabbing';

    } else if (drag.type === 'resize') {
      const p = photos.find(x => x.id === drag.id);
      if (p) {
        const { origX, origY, origW, origH } = drag;
        const MIN = 20;
        switch (drag.corner) {
          case 'se':
            p.w = Math.max(MIN, cx - origX);
            p.h = Math.max(MIN, cy - origY);
            break;
          case 'sw':
            p.w = Math.max(MIN, origX + origW - cx);
            p.h = Math.max(MIN, cy - origY);
            p.x = origX + origW - p.w;
            break;
          case 'ne':
            p.w = Math.max(MIN, cx - origX);
            p.h = Math.max(MIN, origY + origH - cy);
            p.y = origY + origH - p.h;
            break;
          case 'nw':
            p.w = Math.max(MIN, origX + origW - cx);
            p.h = Math.max(MIN, origY + origH - cy);
            p.x = origX + origW - p.w;
            p.y = origY + origH - p.h;
            break;
        }
        updatePhotoPropFields();
        render();
      }
      canvas.style.cursor = resizeCursor(drag.corner);
    }
    return;
  }

  // hover cursors (mouse only — no-op on touch)
  if (mode === 'collage') {
    const hh = hitHandle(cx, cy);
    if (hh) { canvas.style.cursor = resizeCursor(hh.corner); return; }
    if (hitTest(cx, cy) !== null) { canvas.style.cursor = 'grab'; return; }
    if (hitPhoto(cx, cy) !== null) { canvas.style.cursor = 'move'; return; }
    canvas.style.cursor = 'default';
  } else {
    canvas.style.cursor = hitTest(cx, cy) !== null ? 'grab' : 'default';
  }
}

function handlePointerUp() { drag.on = false; drag.type = null; }

canvas.addEventListener('mousedown',  e => { const { cx, cy } = canvasXY(e); handlePointerDown(cx, cy); });
canvas.addEventListener('mousemove',  e => { const { cx, cy } = canvasXY(e); handlePointerMove(cx, cy); });
canvas.addEventListener('mouseup',    handlePointerUp);
canvas.addEventListener('mouseleave', handlePointerUp);

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const { cx, cy } = canvasXY(e.touches[0]);
  handlePointerDown(cx, cy);
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const { cx, cy } = canvasXY(e.touches[0]);
  handlePointerMove(cx, cy);
}, { passive: false });

canvas.addEventListener('touchend', handlePointerUp);

/* ============================================================
   Download (regular — fails on tainted canvas)
   ============================================================ */
function download() {
  if (mode === 'single' && !img) { alert('No image to save'); return; }

  const prevSel      = selId;
  const prevPhotoSel = selPhotoId;
  selId      = null;
  selPhotoId = null;
  render();

  const a    = document.createElement('a');
  a.download = 'meme.png';
  try {
    a.href = canvas.toDataURL('image/png');
    a.click();
  } catch (err) {
    alert('Cannot download — an external URL image may be blocked (CORS).\nUse "Screenshot & Save" instead, or select a local file.');
  }

  selId      = prevSel;
  selPhotoId = prevPhotoSel;
  render();
}

/* ============================================================
   Screenshot & Save (CORS bypass via getDisplayMedia)
   ============================================================ */
async function screenshotSave() {
  if (mode === 'single' && !img) { alert('No image to save'); return; }

  // Clear selection and render clean
  const prevSel      = selId;
  const prevPhotoSel = selPhotoId;
  selId      = null;
  selPhotoId = null;
  render();

  // Try fast path first (no CORS issue)
  try {
    const a = document.createElement('a');
    a.download = 'meme.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
    selId = prevSel; selPhotoId = prevPhotoSel;
    render();
    return;
  } catch (e) {
    // Canvas is tainted — fall through to screenshot
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    alert('Screenshot API not supported in this browser.\nTry Chrome 107+ or use a local file instead of a URL.');
    selId = prevSel; selPhotoId = prevPhotoSel;
    render();
    return;
  }

  // Scroll canvas into view so it's fully visible when captured
  canvas.scrollIntoView({ behavior: 'instant', block: 'center' });

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser',
        width:  { ideal: screen.width  * (window.devicePixelRatio || 1) },
        height: { ideal: screen.height * (window.devicePixelRatio || 1) },
      },
      selfBrowserSurface: 'include',
      preferCurrentTab: true,
      audio: false,
    });

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await new Promise(res => { video.onloadedmetadata = res; });
    await video.play();

    // Wait one frame so the video has actual content
    await new Promise(res => requestAnimationFrame(res));

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Map canvas element rect → video frame coordinates
    const rect   = canvas.getBoundingClientRect();
    const scaleX = vw / window.innerWidth;
    const scaleY = vh / window.innerHeight;

    const sx = rect.left   * scaleX;
    const sy = rect.top    * scaleY;
    const sw = rect.width  * scaleX;
    const sh = rect.height * scaleY;

    // Output at native canvas resolution
    const out = document.createElement('canvas');
    out.width  = canvas.width;
    out.height = canvas.height;
    out.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, out.width, out.height);

    stream.getTracks().forEach(t => t.stop());

    const a = document.createElement('a');
    a.download = 'meme.png';
    a.href = out.toDataURL('image/png');
    a.click();

  } catch (err) {
    if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
      alert('Screenshot failed: ' + err.message);
    }
  }

  selId = prevSel; selPhotoId = prevPhotoSel;
  render();
}

/* ============================================================
   Window resize
   ============================================================ */
window.addEventListener('resize', () => { if (mode === 'single' && img) render(); });

/* ============================================================
   Keyboard shortcuts
   ============================================================ */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selId !== null)      { deleteSelected();      e.preventDefault(); }
    if (selPhotoId !== null) { deleteSelectedPhoto(); e.preventDefault(); }
  }
  if (e.key === 'Escape') {
    selId = null;
    selPhotoId = null;
    document.getElementById('props-sec').style.display = 'none';
    document.getElementById('photo-props-sec').style.display = 'none';
    refreshList();
    refreshPhotoList();
    render();
  }

  const nudge = e.shiftKey ? 10 : 1;

  const t = texts.find(x => x.id === selId);
  if (t) {
    if (e.key === 'ArrowLeft')  { t.x -= nudge; render(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { t.x += nudge; render(); e.preventDefault(); }
    if (e.key === 'ArrowUp')    { t.y -= nudge; render(); e.preventDefault(); }
    if (e.key === 'ArrowDown')  { t.y += nudge; render(); e.preventDefault(); }
  }

  const p = photos.find(x => x.id === selPhotoId);
  if (p) {
    if (e.key === 'ArrowLeft')  { p.x -= nudge; updatePhotoPropFields(); render(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { p.x += nudge; updatePhotoPropFields(); render(); e.preventDefault(); }
    if (e.key === 'ArrowUp')    { p.y -= nudge; updatePhotoPropFields(); render(); e.preventDefault(); }
    if (e.key === 'ArrowDown')  { p.y += nudge; updatePhotoPropFields(); render(); e.preventDefault(); }
  }
});

/* ============================================================
   Init
   ============================================================ */
(function () {
  canvas.width  = 800;
  canvas.height = 500;
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, 800, 500);
})();
