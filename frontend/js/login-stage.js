// Animação da tela de entrada: três esferas em triângulo equilátero, girando juntas,
// cada uma com uma cauda azul marinho atrás do sentido do movimento que termina em branco.
(function () {
  var canvas = document.querySelector("#lock .lk-canvas");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var SPHERES = 3;
  var SPEED = 0.011;          // radianos por quadro (~9 s por volta)
  var TAIL_ARC = 1.5;         // comprimento angular da cauda (rad)
  var TAIL_STEPS = 60;
  var NAVY = [30, 58, 138];
  var WHITE = [255, 255, 255];
  var W = 0, H = 0, R = 0, RS = 0, theta = 0, dpr = 1;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    var box = canvas.parentElement.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = box.width; H = box.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(W, H) * 0.34;          // raio do triângulo (distância ao centro)
    RS = Math.max(8, R * 0.2);          // raio de cada esfera
    draw();
  }

  function point(angle) {
    return [W / 2 + R * Math.cos(angle), H / 2 + R * Math.sin(angle)];
  }

  function mix(a, b, t) {
    return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * t) + "," +
      Math.round(a[1] + (b[1] - a[1]) * t) + "," +
      Math.round(a[2] + (b[2] - a[2]) * t) + ")";
  }

  function drawTail(base) {
    // a cauda fica atrás da esfera: ângulos menores que o da esfera
    for (var k = TAIL_STEPS; k > 0; k--) {
      var t0 = k / TAIL_STEPS;          // 1 = ponta da cauda, 0 = junto da esfera
      var a1 = base - TAIL_ARC * t0;
      var a2 = base - TAIL_ARC * ((k - 1) / TAIL_STEPS);
      var p1 = point(a1), p2 = point(a2);
      var fade = 1 - t0;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.strokeStyle = mix(NAVY, WHITE, t0);
      ctx.globalAlpha = 0.15 + 0.8 * fade;
      ctx.lineWidth = Math.max(0.6, RS * 1.6 * (0.25 + 0.75 * fade));
      ctx.lineCap = "round";
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawSphere(p) {
    var g = ctx.createRadialGradient(p[0] - RS * 0.35, p[1] - RS * 0.35, RS * 0.1, p[0], p[1], RS);
    g.addColorStop(0, "#4a6fbf");
    g.addColorStop(0.35, "#1d3a72");
    g.addColorStop(0.6, "#0b1d3a");
    g.addColorStop(1, "#050a18");
    ctx.beginPath();
    ctx.arc(p[0], p[1], RS, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  function drawLink(a, b) {
    // barra em forma de cápsula entre duas esferas: azul marinho, clareando em direção ao vértice seguinte
    var g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    g.addColorStop(0, mix(NAVY, NAVY, 0));
    g.addColorStop(0.7, "rgba(30,58,138,0.9)");
    g.addColorStop(1, "rgba(120,140,200,0.85)");
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = g;
    ctx.lineWidth = RS * 0.9;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var v = [];
    for (var n = 0; n < SPHERES; n++) v.push(point(theta + (n * 2 * Math.PI) / SPHERES));
    for (var m = 0; m < SPHERES; m++) drawLink(v[m], v[(m + 1) % SPHERES]);
    for (var i = 0; i < SPHERES; i++) {
      drawTail(theta + (i * 2 * Math.PI) / SPHERES);
    }
    for (var j = 0; j < SPHERES; j++) drawSphere(v[j]);
  }

  function loop() {
    theta += SPEED;
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement);
  resize();
  if (!reduce) requestAnimationFrame(loop);
})();
