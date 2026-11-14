// Tela de entrada do TravaDin: moeda 3D (WebGL2 puro, sem bibliotecas) que gira na tela preta.
// Só o toque NA moeda abre a fenda; a moeda para de frente, entra na fenda (som + vibração), o fundo vira pedra
// e o login aparece com a mesma moeda girando devagar no lugar do logo.
// Estados no #lock (ver login.css): lk-parou, lk-entra, lk-ok, lk-aberto; lk-pronto avisa que o script assumiu.
// Sem WebGL: a moeda vira imagem girando em CSS e o toque funciona igual. Menos movimento: login direto.
(function () {
  "use strict";
  var lock = document.getElementById("lock");
  if (!lock) return;
  var canvas = document.getElementById("lkMoeda"), img = lock.querySelector(".lk-moeda-img");
  var trilho = document.getElementById("lkTrilho"), logo = document.getElementById("lkLogo"), logoImg = logo.querySelector("img");
  var toque = document.getElementById("lkToque"), pular = document.getElementById("lkPular"), skel = document.getElementById("lockSkel");
  var RM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  lock.classList.add("lk-pronto");

  // ------------------------------------------------------------------ moeda em WebGL
  var gl = null;
  try { gl = canvas.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: false }); } catch (e) { gl = null; }
  var VS = "#version 300 es\n" +
    "in vec3 p; in vec3 n; in vec2 uv; in float k; uniform mat4 M, P; out vec3 vN, vP; out vec2 vUv; out float vK;\n" +
    "void main(){ vec4 w = M * vec4(p, 1.0); vP = w.xyz; vN = mat3(M) * n; vUv = uv; vK = k; gl_Position = P * w; }";
  // ambiente de estúdio: claro em cima, escuro embaixo, uma faixa branca e um reflexo vermelho (cor do app)
  var FS = "#version 300 es\nprecision highp float;\n" +
    "in vec3 vN, vP; in vec2 vUv; in float vK; uniform sampler2D T; out vec4 o;\n" +
    "vec3 env(vec3 d){ float t = d.y * 0.5 + 0.5; vec3 c = mix(vec3(0.05, 0.06, 0.07), vec3(0.85, 0.88, 0.92), smoothstep(0.2, 0.9, t));\n" +
    "  c += vec3(1.0) * smoothstep(0.96, 1.0, 1.0 - abs(d.x - 0.45)) * 0.9 * step(0.0, d.y);\n" +
    "  c += vec3(0.9, 0.25, 0.25) * smoothstep(0.97, 1.0, 1.0 - abs(d.x + 0.6)) * 0.35; return c; }\n" +
    "void main(){ vec3 N = normalize(vN), V = normalize(-vP);\n" +
    "  if (vK > 0.5) { float a = atan(N.x, N.z); N = normalize(N + vec3(cos(a), 0.0, -sin(a)) * 0.18 * sin(vUv.x * 360.0));\n" +   // serrilha da borda
    "    vec3 R = reflect(-V, N); vec3 c = env(R) * vec3(0.82, 0.85, 0.9); float f = pow(1.0 - max(dot(N, V), 0.0), 3.0); o = vec4(c * (0.75 + 0.4 * f), 1.0); return; }\n" +
    "  vec4 t = texture(T, vUv); if (t.a < 0.5) discard;\n" +
    "  vec3 L = normalize(vec3(-0.4, 0.7, 0.6)); float d = max(dot(N, L), 0.0); vec3 R = reflect(-V, N);\n" +
    "  float sp = pow(max(dot(R, L), 0.0), 40.0); float metal = smoothstep(0.55, 0.8, dot(t.rgb, vec3(0.333)));\n" +
    "  o = vec4(t.rgb * (0.55 + 0.55 * d) + env(R) * 0.35 * metal + vec3(1.0) * sp * 0.6, 1.0); }";
  var prog, nVerts = 0, uM, uP, pronta = false;
  function sh(t, s) { var x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; }
  function montar() {
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    gl.useProgram(prog);
    // geometria: duas faces (discos com a imagem do logo) + lateral
    var S = 160, H = 0.085, v = [];
    function push(x, y, z, nx, ny, nz, u, w, k) { v.push(x, y, z, nx, ny, nz, u, w, k); }
    [1, -1].forEach(function (s) {
      for (var i = 0; i < S; i++) {
        var a = i / S * 2 * Math.PI, b = (i + 1) / S * 2 * Math.PI;
        var tri = [[0, 0], [Math.cos(a), Math.sin(a)], [Math.cos(b), Math.sin(b)]]; if (s < 0) tri.reverse();
        tri.forEach(function (q) { push(q[0], q[1], s * H, 0, 0, s, 0.5 + (s > 0 ? q[0] : -q[0]) * 0.5, 0.5 - q[1] * 0.5, 0); });
      }
    });
    for (var i = 0; i < S; i++) {
      var a = i / S * 2 * Math.PI, b = (i + 1) / S * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      [[ca, sa, H, a], [cb, sb, H, b], [cb, sb, -H, b], [ca, sa, H, a], [cb, sb, -H, b], [ca, sa, -H, a]].forEach(function (q) { push(q[0], q[1], q[2], q[0], q[1], 0, q[3], 0, 1); });
    }
    nVerts = v.length / 9;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    [["p", 3, 0], ["n", 3, 12], ["uv", 2, 24], ["k", 1, 32]].forEach(function (q) { var l = gl.getAttribLocation(prog, q[0]); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, q[1], gl.FLOAT, false, 36, q[2]); });
    uM = gl.getUniformLocation(prog, "M"); uP = gl.getUniformLocation(prog, "P");
    gl.enable(gl.DEPTH_TEST);
  }
  function semWebGL() {   // plano B: imagem girando em CSS
    gl = null; canvas.hidden = true; img.hidden = false;
  }
  if (gl) {
    try { montar(); } catch (e) { semWebGL(); }
  } else semWebGL();
  if (gl) {
    var foto = new Image();
    foto.onload = function () {
      try {
        var c = document.createElement("canvas"); c.width = c.height = 1024; c.getContext("2d").drawImage(foto, 0, 0, 1024, 1024);
        var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        pronta = true;
      } catch (e) { semWebGL(); }
    };
    foto.onerror = semWebGL;
    foto.src = "frontend/assets/logo-mark.svg";
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); parar(); semWebGL(); logoImg.hidden = false; });
  }

  function mul(a, b) { var r = new Array(16).fill(0); for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) for (var k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return r; }
  var PERSP = (function (f, a, n, fr) { var t = 1 / Math.tan(f / 2); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, 2 * fr * n / (n - fr), 0]; })(0.7, 1, 0.1, 20);
  function rx(a) { return [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1]; }
  function ry(a) { return [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1]; }
  var TR = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3.3, 1];

  // ------------------------------------------------------------------ animação
  var raf = 0, last = 0, ang = 0, vel = 1.4, freio = null, timers = [];
  function quadro(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var tilt = 0.17;
    if (freio) { var k = Math.min(1, (now - freio.t) / 600), e = 1 - Math.pow(1 - k, 3); ang = freio.a + (freio.alvo - freio.a) * e; tilt = 0.17 * (1 - e); }
    else ang += dt * vel;
    if (gl && pronta) {
      gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(uM, false, mul(TR, mul(rx(tilt), ry(ang)))); gl.uniformMatrix4fv(uP, false, PERSP);
      gl.drawArrays(gl.TRIANGLES, 0, nVerts);
    }
    raf = requestAnimationFrame(quadro);
  }
  function rodar() { if (!raf && gl) { last = performance.now(); raf = requestAnimationFrame(quadro); } }
  function parar() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function depois(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function limparTimers() { timers.forEach(clearTimeout); timers = []; }

  // "plim" de moeda gerado na hora (sem arquivo) + vibração curta onde existir (Android; o iPhone não vibra pela web)
  function plim() {
    try {
      var A = new (window.AudioContext || window.webkitAudioContext)(), t = A.currentTime;
      [[2350, 0], [3120, 0.012], [1760, 0.09]].forEach(function (q) {
        var o = A.createOscillator(), g = A.createGain(); o.type = "sine"; o.frequency.value = q[0];
        g.gain.setValueAtTime(0, t + q[1]); g.gain.linearRampToValueAtTime(0.2, t + q[1] + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + q[1] + 0.45);
        o.connect(g).connect(A.destination); o.start(t + q[1]); o.stop(t + q[1] + 0.5);
      });
      setTimeout(function () { try { A.close(); } catch (e) {} }, 900);
    } catch (e) { /* sem áudio: segue em silêncio */ }
    try { if (navigator.vibrate) navigator.vibrate([18, 40, 28]); } catch (e) {}
  }

  // a moeda vai para o lugar do logo e gira devagar
  function moedaNoLogo() {
    freio = null; vel = 0.55;
    if (gl) { logo.appendChild(canvas); logoImg.hidden = true; rodar(); }
    else { logoImg.hidden = false; }
  }
  function abrir(imediato) {
    limparTimers();
    lock.classList.add("lk-parou", "lk-aberto");
    moedaNoLogo();
    if (imediato) lock.classList.add("lk-sem-anim");
    var foco = document.getElementById("email");
    if (foco && !imediato && window.matchMedia("(hover: hover)").matches) setTimeout(function () { try { foco.focus({ preventScroll: true }); } catch (e) {} }, 900);
  }
  function inserir() {
    if (lock.classList.contains("lk-parou")) return;
    lock.classList.add("lk-parou");
    if (gl) freio = { t: performance.now(), a: ang, alvo: Math.ceil(ang / (2 * Math.PI)) * 2 * Math.PI };
    depois(650, function () { lock.classList.add("lk-entra"); });
    depois(1450, function () { plim(); lock.classList.add("lk-ok"); });
    depois(1800, function () { abrir(false); });
  }
  toque.addEventListener("click", inserir);
  pular.addEventListener("click", function () { abrir(true); });

  // começa do zero toda vez que a tela de entrada aparece
  function comecar() {
    limparTimers(); parar();
    lock.classList.remove("lk-parou", "lk-entra", "lk-ok", "lk-aberto", "lk-sem-anim");
    if (gl) { trilho.insertBefore(canvas, trilho.firstChild); }
    logoImg.hidden = !!gl;
    ang = 0; vel = 1.4; freio = null;
    // abrindo o app com sessão (esqueleto de carregamento) ou com menos movimento: login direto, sem moeda
    if ((skel && !skel.hidden) || RM.matches) { abrir(true); return; }
    rodar();
  }
  var visivel = false;
  function aoMudar() {
    var v = !lock.hidden;
    if (v === visivel) return;
    visivel = v;
    if (v) comecar(); else { parar(); limparTimers(); }
  }
  new MutationObserver(aoMudar).observe(lock, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", function () { if (!visivel) return; if (document.hidden) parar(); else rodar(); });
  aoMudar();
})();
