// Animação da tela de entrada (igual à referência): três esferas em triângulo equilátero
// girando juntas. Cada esfera tem uma cauda reta que afina e apaga atrás do sentido do
// movimento. Abertura: as esferas surgem do escuro e só então o formulário aparece.
(function () {
  var canvas = document.querySelector("#lock .lk-canvas");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var SPHERES = 3;
  var SPEED = 0.012;            // rad/quadro, rotação lenta e contínua
  var TAIL = 2.6;               // comprimento da cauda em raios da esfera
  var FADE_IN = 1400;           // ms da abertura
  var NAVY = [30, 58, 138];
  var PURPLE = [139, 92, 246];  // cor do ícone (uma esfera)
  var WHITE = [255, 255, 255];
  var W = 0, H = 0, R = 0, RS = 0, theta = 0, dpr = 1, start = 0;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }

  function resize() {
    var box = canvas.parentElement.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = box.width; H = box.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(W, H) * 0.34;
    RS = Math.max(8, R * 0.2);
    draw(1);
  }

  function center(a) {
    return [W / 2 + R * Math.cos(a), H / 2 + R * Math.sin(a)];
  }

  function drawTail(a, color, alpha) {
    // direção oposta ao movimento: derivada de (cos a, sin a) negada
    var dx = Math.sin(a), dy = -Math.cos(a);
    var p = center(a);
    var L = RS * TAIL;
    var tx = p[0] + dx * L, ty = p[1] + dy * L;
    // perpendicular para dar largura à cauda
    var px = -dy, py = dx;
    var g = ctx.createLinearGradient(p[0], p[1], tx, ty);
    g.addColorStop(0, rgba(color, 0.95 * alpha));
    g.addColorStop(0.55, rgba(color, 0.45 * alpha));
    g.addColorStop(1, rgba(WHITE, 0));
    ctx.beginPath();
    ctx.moveTo(p[0] + px * RS * 0.9, p[1] + py * RS * 0.9);
    ctx.lineTo(tx + px * RS * 0.18, ty + py * RS * 0.18);
    ctx.lineTo(tx - px * RS * 0.18, ty - py * RS * 0.18);
    ctx.lineTo(p[0] - px * RS * 0.9, p[1] - py * RS * 0.9);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  }

  function drawSphere(p, purple, alpha) {
    var g = ctx.createRadialGradient(p[0] - RS * 0.35, p[1] - RS * 0.35, RS * 0.1, p[0], p[1], RS);
    if (purple) {
      g.addColorStop(0, "#d4c2ff");
      g.addColorStop(0.35, "#8b5cf6");
      g.addColorStop(0.6, "#4c1d95");
      g.addColorStop(1, "#1e0b3d");
    } else {
      g.addColorStop(0, "#4a6fbf");
      g.addColorStop(0.35, "#1d3a72");
      g.addColorStop(0.6, "#0b1d3a");
      g.addColorStop(1, "#050a18");
    }
    ctx.beginPath();
    ctx.arc(p[0], p[1], RS, 0, Math.PI * 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function draw(alpha) {
    ctx.clearRect(0, 0, W, H);
    var i, angles = [];
    for (i = 0; i < SPHERES; i++) angles.push(theta + (i * 2 * Math.PI) / SPHERES);
    for (i = 0; i < SPHERES; i++) drawTail(angles[i], i === 0 ? PURPLE : NAVY, alpha);
    for (i = 0; i < SPHERES; i++) drawSphere(center(angles[i]), i === 0, alpha);
  }

  function frame(now) {
    if (!start) start = now;
    var t = Math.min(1, (now - start) / FADE_IN);
    var ease = 1 - Math.pow(1 - t, 3);
    theta += SPEED;
    draw(ease);
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement);
  resize();
  if (reduce) { draw(1); return; }
  requestAnimationFrame(frame);
})();
