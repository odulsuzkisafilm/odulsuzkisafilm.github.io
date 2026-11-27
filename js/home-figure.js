// Fig. 1 on the home page: a small animation of algorithm configuration.
// A hidden "landscape" assigns every parameter setting (a dot) a runtime.
// An iterated local search explores it: it evaluates neighbours of its
// current setting, moves when one is faster, and jumps elsewhere when stuck.

(function () {
  const stage = document.querySelector('.config-stage');
  if (!stage) return;

  const canvas = stage.querySelector('canvas');
  const readout = stage.querySelector('.config-readout');
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CELL = 16;            // distance between dots, in CSS pixels
  const STEP_MS = 85;         // time between evaluations
  const PAUSE_MS = 4000;      // rest before starting a new landscape
  const STUCK_AFTER = 16;     // failed neighbours before a jump

  const NAVY = [30, 58, 138];
  const PALE = [199, 210, 227];
  const UNSEEN = '#e3e8f0';
  const ACCENT = '#06b6d4';

  let width, height, cols, rows, offsetX, offsetY;
  let land, seen, current, best, trail, evaluations, budget, stuck, finishedAt;
  let onScreen = true;

  const rand = (n) => Math.floor(Math.random() * n);
  const cellX = (i) => offsetX + (i % cols) * CELL;
  const cellY = (i) => offsetY + Math.floor(i / cols) * CELL;

  // Map a landscape value in [0, 1] to a runtime between ~20 s and ~0.1 s.
  const runtimeOf = (v) => Math.pow(10, 1.3 - 2.3 * v);

  function measure() {
    const dpr = window.devicePixelRatio || 1;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.max(4, Math.floor((width - CELL) / CELL));
    rows = Math.max(3, Math.floor((height - CELL) / CELL));
    offsetX = (width - (cols - 1) * CELL) / 2;
    offsetY = (height - (rows - 1) * CELL) / 2;
  }

  function evaluate(i) {
    seen[i] = 1;
    evaluations += 1;
  }

  function newLandscape() {
    const bumps = [];
    const count = 4 + rand(3);
    for (let b = 0; b < count; b++) {
      bumps.push({
        x: Math.random() * cols,
        y: Math.random() * rows,
        spread: (0.05 + Math.random() * 0.09) * cols,
        peak: b === 0 ? 1 : 0.4 + Math.random() * 0.5
      });
    }

    land = new Float32Array(cols * rows);
    let top = 0;
    for (let i = 0; i < land.length; i++) {
      const x = i % cols;
      const y = Math.floor(i / cols);
      let v = 0;
      for (const bump of bumps) {
        const dx = x - bump.x;
        const dy = (y - bump.y) * 1.6;
        v = Math.max(v, bump.peak * Math.exp(-(dx * dx + dy * dy) / (2 * bump.spread * bump.spread)));
      }
      v += Math.random() * 0.05;
      land[i] = v;
      if (v > top) top = v;
    }
    for (let i = 0; i < land.length; i++) land[i] /= top;

    seen = new Uint8Array(cols * rows);
    evaluations = 0;
    stuck = 0;
    finishedAt = null;
    budget = Math.min(280, Math.round(cols * rows * 0.34));
    current = rand(cols * rows);
    evaluate(current);
    best = current;
    trail = [{ cell: current, jump: false }];
  }

  function neighbourOf(i) {
    const x = i % cols;
    const y = Math.floor(i / cols);
    for (let attempt = 0; attempt < 8; attempt++) {
      const nx = x + rand(5) - 2;
      const ny = y + rand(5) - 2;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const n = ny * cols + nx;
      if (n !== i) return n;
    }
    return i;
  }

  function step() {
    if (stuck >= STUCK_AFTER) {
      // Stuck in a local optimum: jump to a fresh part of the space.
      current = rand(cols * rows);
      evaluate(current);
      trail.push({ cell: current, jump: true });
      stuck = 0;
    } else {
      const candidate = neighbourOf(current);
      evaluate(candidate);
      if (land[candidate] > land[current]) {
        current = candidate;
        trail.push({ cell: current, jump: false });
        stuck = 0;
      } else {
        stuck += 1;
      }
    }
    if (land[current] > land[best]) best = current;
    if (evaluations >= budget) finishedAt = performance.now();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    // Dots
    for (let i = 0; i < land.length; i++) {
      const x = cellX(i);
      const y = cellY(i);
      ctx.beginPath();
      if (seen[i]) {
        const v = land[i];
        const c = PALE.map((p, k) => Math.round(p + (NAVY[k] - p) * v));
        ctx.fillStyle = 'rgb(' + c.join(',') + ')';
        ctx.arc(x, y, 2 + 4.6 * v, 0, Math.PI * 2);
      } else {
        ctx.fillStyle = UNSEEN;
        ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Path of the search: solid for improvements, dashed for jumps
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ACCENT;
    for (let t = 1; t < trail.length; t++) {
      const from = trail[t - 1].cell;
      const to = trail[t].cell;
      ctx.beginPath();
      ctx.setLineDash(trail[t].jump ? [3, 5] : []);
      ctx.globalAlpha = trail[t].jump ? 0.45 : 0.9;
      ctx.moveTo(cellX(from), cellY(from));
      ctx.lineTo(cellX(to), cellY(to));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Best setting found so far
    ctx.beginPath();
    ctx.arc(cellX(best), cellY(best), 10.5, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = ACCENT;
    ctx.stroke();

    // Where the search is now
    if (current !== best) {
      ctx.beginPath();
      ctx.arc(cellX(current), cellY(current), 8, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(30, 58, 138, 0.75)';
      ctx.stroke();
    }

    readout.textContent = evaluations + ' runs · best ' + runtimeOf(land[best]).toFixed(2) + ' s';
  }

  function runToEnd() {
    while (finishedAt === null) step();
    draw();
  }

  function restart() {
    measure();
    newLandscape();
    if (reduceMotion) runToEnd();
    else draw();
  }

  restart();

  stage.addEventListener('click', restart);

  let resizeTimer;
  let lastWidth = canvas.clientWidth;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (canvas.clientWidth === lastWidth) return;
      lastWidth = canvas.clientWidth;
      restart();
    }, 200);
  });

  if (reduceMotion) return;

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
    }).observe(stage);
  }

  setInterval(function () {
    if (!onScreen || document.hidden) return;
    if (finishedAt !== null) {
      if (performance.now() - finishedAt > PAUSE_MS) {
        newLandscape();
        draw();
      }
      return;
    }
    step();
    draw();
  }, STEP_MS);
})();
