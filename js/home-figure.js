// The figure on the home page: a simplified, live simulation of COUP
// ("Continuous, Optimistic Utilitarian Procrastination"), from
// Graham & Leyton-Brown, "Utilitarian Algorithm Configuration for
// Infinite Parameter Spaces" (arXiv:2405.18246).
//
// What follows the paper (Algorithm 2):
//   - every configuration keeps an upper and a lower confidence bound on
//     its utility, a captime, and the fraction of runs that finished;
//   - each step runs the configuration with the highest upper bound;
//   - a configuration's captime doubles when the capped runs matter more
//     than the statistical uncertainty;
//   - a phase ends when (best upper bound - best lower bound) < epsilon_p,
//     and the next phase samples more configurations.
//
// What is simplified for the picture:
//   - runtimes are made up (log-normal, one median per configuration);
//   - the confidence width is scaled down so that bars tighten after
//     hundreds of runs instead of tens of thousands;
//   - the phase schedule (epsilon_p, gamma_p) is chosen to look good.

(function () {
  const stage = document.querySelector('.config-stage');
  if (!stage) return;

  const canvas = stage.querySelector('canvas');
  const readout = stage.querySelector('.config-readout');
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Simulation -------------------------------------------------------

  const DELTA = 0.01;          // failure probability
  const K0 = 1;                // runtime at which utility falls to 1/2
  const WIDTH_SCALE = 0.3;     // display-only narrowing of the bounds
  const MAX_PHASE = 9;

  // Log-Laplace utility of a runtime (as in the paper's experiments).
  const utility = (t) => (t < K0 ? 1 - 0.5 * (t / K0) : 0.5 * (K0 / t));
  const epsilonOf = (p) => Math.exp(-p / 3);
  const gammaOf = (p) => Math.exp(-p / 5);
  const sizeOf = (p) => Math.ceil(Math.log((Math.PI * Math.PI * p * p) / (3 * DELTA)) / gammaOf(p));

  let configs, phase, lastPhase, runs, lastRun, bestUcb, bestLcb, pick;
  let phaseOver, pauseUntil, finished;

  function gaussian() {
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += Math.random();
    return (sum - 3) / Math.sqrt(0.5);
  }

  function newConfig() {
    return {
      median: Math.log(0.03) + Math.random() * Math.log(100),   // 0.03 .. 3
      times: [], m: 0, kappa: 1, sumU: 0, done: 0,
      ucb: 1, lcb: 0, uhat: 0
    };
  }

  function alpha(m, kappa) {
    const l = Math.log2(kappa) + 1;
    const n = configs.length;
    return WIDTH_SCALE * Math.sqrt(Math.log((36 * phase * phase * n * m * m * l * l) / DELTA) / (2 * m));
  }

  function updateBounds(c) {
    if (c.m === 0) { c.ucb = 1; c.lcb = 0; return; }
    const a = alpha(c.m, c.kappa);
    const uk = utility(c.kappa);
    c.uhat = c.sumU / c.m;
    c.ucb = Math.min(1, c.uhat + (1 - uk) * a);
    c.lcb = Math.max(0, c.uhat - a - uk * (1 - c.done / c.m));
  }

  function findBest() {
    bestUcb = -1; bestLcb = -1; pick = 0;
    let next = 0;
    configs.forEach(function (c, i) {
      if (c.ucb > bestUcb || (c.ucb === bestUcb && c.m < configs[next].m)) { bestUcb = c.ucb; next = i; }
      if (c.lcb > bestLcb) { bestLcb = c.lcb; pick = i; }
    });
    return next;
  }

  function startPhase() {
    phase += 1;
    const target = sizeOf(phase);
    while (configs.length < target) configs.push(newConfig());
    configs.forEach(updateBounds);
    findBest();
    phaseOver = false;
  }

  function reset() {
    configs = [];
    phase = 0;
    runs = 0;
    lastRun = -1;
    finished = false;
    pauseUntil = 0;
    startPhase();
  }

  // One run of the configuration with the highest upper bound.
  function step() {
    const i = findBest();
    if (bestUcb - bestLcb < epsilonOf(phase)) { phaseOver = true; return; }

    const c = configs[i];
    c.m += 1;
    if (c.m > 1) {
      const capped = 1 - c.done / (c.m - 1);
      if (2 * alpha(c.m, c.kappa) <= utility(c.kappa) * capped) {
        // Captime doubling: re-read every earlier run under the new cap.
        c.kappa *= 2;
        c.sumU = 0; c.done = 0;
        for (const t of c.times) {
          c.sumU += utility(Math.min(t, c.kappa));
          if (t <= c.kappa) c.done += 1;
        }
      }
    }
    const t = Math.exp(c.median + 0.7 * gaussian());
    c.times.push(t);
    c.sumU += utility(Math.min(t, c.kappa));
    if (t <= c.kappa) c.done += 1;
    updateBounds(c);
    runs += 1;
    lastRun = i;
    findBest();
  }

  // ---- Drawing ----------------------------------------------------------

  const PAD = { left: 38, right: 30, top: 42, bottom: 18 };
  const NAVY = '30, 58, 138';
  const ACCENT = '#06b6d4';
  let width, height, plotW, plotH, slots;

  const xOf = (i) => PAD.left + (i + 0.5) * (plotW / slots);
  const yOf = (u) => PAD.top + (1 - u) * plotH;

  function measure() {
    const dpr = window.devicePixelRatio || 1;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    plotW = width - PAD.left - PAD.right;
    plotH = height - PAD.top - PAD.bottom;
    // Narrow screens stop at an earlier phase so the bars stay readable.
    lastPhase = 1;
    for (let p = 1; p <= MAX_PHASE; p++) if (sizeOf(p) * 7 <= plotW) lastPhase = p;
    slots = sizeOf(lastPhase);
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = 'middle';

    // Utility axis
    [0, 0.5, 1].forEach(function (u) {
      ctx.strokeStyle = '#edf0f5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD.left, yOf(u) + 0.5);
      ctx.lineTo(width - PAD.right, yOf(u) + 0.5);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText(u === 0.5 ? '0.5' : String(u), PAD.left - 8, yOf(u));
    });
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('utility', 10, 14);

    // The gap COUP is trying to close: best upper bound minus best lower bound
    const yTop = yOf(bestUcb);
    const yBottom = yOf(bestLcb);
    ctx.fillStyle = 'rgba(6, 182, 212, 0.09)';
    ctx.fillRect(PAD.left, yTop, plotW, yBottom - yTop);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD.left, yBottom + 0.5);
    ctx.lineTo(width - PAD.right, yBottom + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ACCENT;
    ctx.font = 'italic 13px Georgia, serif';
    ctx.fillText('ε', width - PAD.right + 9, (yTop + yBottom) / 2);

    // One bar per configuration
    const spacing = plotW / slots;
    const barW = Math.max(2, Math.min(6, spacing * 0.42));
    for (let i = 0; i < slots; i++) {
      const x = xOf(i);
      const c = configs[i];
      if (!c) {
        // Not sampled yet
        ctx.fillStyle = '#cfd7e3';
        ctx.beginPath();
        ctx.arc(x, yOf(0), 1.4, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const ruledOut = c.ucb < bestLcb;
      if (i === pick) ctx.fillStyle = ACCENT;
      else if (ruledOut) ctx.fillStyle = 'rgba(' + NAVY + ', 0.12)';
      else ctx.fillStyle = 'rgba(' + NAVY + ', ' + (c.m === 0 ? 0.16 : 0.5) + ')';
      const y1 = yOf(c.ucb);
      const y2 = Math.max(y1 + 3, yOf(c.lcb));
      ctx.beginPath();
      ctx.roundRect(x - barW / 2, y1, barW, y2 - y1, barW / 2);
      ctx.fill();

      if (c.m > 0 && !ruledOut && i !== pick) {
        ctx.fillStyle = 'rgb(' + NAVY + ')';
        ctx.beginPath();
        ctx.arc(x, yOf(c.uhat), Math.min(2.2, barW / 2 + 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Pointer under COUP's current pick, so it stays visible when its bar is tiny
    {
      const x = xOf(pick);
      const y = Math.min(yOf(0) - 2, Math.max(yOf(configs[pick].ucb) + 3, yOf(configs[pick].lcb)) + 5);
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.moveTo(x - 5, y + 7);
      ctx.lineTo(x + 5, y + 7);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
    }

    // Marker over the configuration that was just run
    if (lastRun >= 0 && !finished) {
      const x = xOf(lastRun);
      const y = yOf(configs[lastRun].ucb) - 5;
      ctx.fillStyle = 'rgb(' + NAVY + ')';
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 6);
      ctx.lineTo(x + 4, y - 6);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
    }

    readout.textContent = 'phase ' + phase + ' · ' + configs.length + ' configurations · ' + runs.toLocaleString('en-US') + ' runs';
  }

  // ---- Animation --------------------------------------------------------

  const TICK_MS = 60;
  const PHASE_PAUSE_MS = 900;
  const END_PAUSE_MS = 6000;

  function advance(now) {
    if (now < pauseUntil) return;
    if (finished) { reset(); return; }
    if (phaseOver) {
      if (phase >= lastPhase) { finished = true; pauseUntil = now + END_PAUSE_MS; return; }
      startPhase();
      return;
    }
    // Few runs per tick at first, more as the totals grow.
    const batch = Math.max(1, Math.round(runs / 45));
    for (let k = 0; k < batch && !phaseOver; k++) step();
    if (phaseOver) pauseUntil = now + PHASE_PAUSE_MS;
  }

  function runToEnd() {
    for (;;) {
      while (!phaseOver) step();
      if (phase >= lastPhase) break;
      startPhase();
    }
    finished = true;
    draw();
  }

  function restart() {
    measure();
    reset();
    if (reduceMotion) runToEnd();
    else draw();
  }

  if (!ctx.roundRect) {
    ctx.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
  }

  restart();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);

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

  let onScreen = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
    }).observe(stage);
  }

  setInterval(function () {
    if (!onScreen || document.hidden) return;
    advance(performance.now());
    draw();
  }, TICK_MS);
})();
