// Globo 3D neon da tela de entrada, em WebGL2 puro (sem bibliotecas).
// Cena: esfera de vidro escuro + casca de vidro + dois feixes de anéis em fita (vários fios finos) com
// núcleo claro. Render em várias passagens: cena em HDR, brilho (bloom) em 3 níveis e reflexo no chão.
// Movimento: os anéis giram em torno do globo (tempo real, um único requestAnimationFrame) e a abertura
// tem 3 tempos: o globo acende do escuro no centro (vidro, depois cada grupo de anéis "acende" em volta, clarão
// suave), depois vai para o canto, depois o login aparece (classes
// lk-intro / lk-ready no #lock, ver login.css). O canvas cobre a tela toda; a posição e o tamanho do
// globo vêm da câmera, então nada é esticado por CSS.
(function () {
  "use strict";
  var lock = document.getElementById("lock");
  var canvas = lock && lock.querySelector(".lk-globe");
  var stageEl = lock && lock.querySelector(".lk-stage");   // reserva o lugar final do globo no layout
  if (!canvas || !stageEl) return;
  function giveUp() { canvas.hidden = true; lock.classList.remove("lk-intro"); }   // sem globo, o login aparece direto
  var gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
  if (!gl) { giveUp(); return; }

  var HDR = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
  var LOW = (window.matchMedia && window.matchMedia("(max-width: 820px)").matches) || (navigator.hardwareConcurrency || 8) <= 4;

  // ---------------------------------------------------------------- shaders
  var VS_MESH = "#version 300 es\n" +
    "in vec3 aPos; in vec3 aNormal; in float aU;\n" +
    "uniform mat4 uMVP; uniform mat4 uMV;\n" +
    "out vec3 vN; out vec3 vP; out float vU;\n" +
    "void main(){ vP = (uMV * vec4(aPos, 1.0)).xyz; vN = mat3(uMV) * aNormal; vU = aU; gl_Position = uMVP * vec4(aPos, 1.0); }";

  // fio de anel: só aparece na passagem certa (atrás ou na frente da esfera), cor varia ao longo do anel
  var FS_RING = "#version 300 es\nprecision highp float;\n" +
    "in vec3 vN; in vec3 vP; in float vU;\n" +
    "uniform vec3 uColA; uniform vec3 uColB; uniform float uPhase; uniform float uGain; uniform float uCenterZ; uniform float uPass; uniform float uLit;\n" +
    "out vec4 o;\n" +
    "void main(){\n" +
    "  bool front = vP.z > uCenterZ;\n" +
    "  if ((uPass < 0.5 && front) || (uPass > 0.5 && !front)) discard;\n" +
    "  vec3 n = normalize(vN); vec3 v = normalize(-vP);\n" +
    "  float ndv = dot(n, v); if (ndv <= 0.0) discard;\n" +
    "  float t = 0.5 + 0.5 * sin(vU + uPhase);\n" +
    "  vec3 col = mix(uColA, uColB, t);\n" +
    "  float body = smoothstep(0.0, 0.55, ndv);\n" +
    "  vec3 c = col * (0.15 + 3.4 * pow(ndv, 8.0)) * body + vec3(1.0, 0.92, 1.0) * pow(ndv, 22.0) * 1.0;\n" +
    "  float f = fract(vU / 6.2831853); float r = uLit * 1.3;\n" +
    "  float m = 1.0 - smoothstep(r - 0.3, r, f);\n" +
    "  float q = (f - (r - 0.12)) / 0.04; float tip = exp(-q * q) * sin(clamp(uLit, 0.0, 1.0) * 3.14159);\n" +
    "  c = c * m + vec3(0.9, 0.85, 1.0) * pow(ndv, 4.0) * tip * 2.5;\n" +
    "  o = vec4(c * uGain, 1.0);\n" +
    "}";

  // esfera de vidro escuro: miolo índigo, aro azul/violeta com fio rosa-claro no alto à esquerda, reflexos
  var FS_GLASS = "#version 300 es\nprecision highp float;\n" +
    "in vec3 vN; in vec3 vP; in float vU; uniform float uFade; out vec4 o;\n" +
    "void main(){\n" +
    "  vec3 n = normalize(vN); vec3 v = normalize(-vP);\n" +
    "  float ndv = dot(n, v); if (ndv <= 0.0) discard;\n" +   // sem profundidade: só a metade voltada para a câmera
    "  float fr = 1.0 - ndv;\n" +
    "  vec3 body = mix(vec3(0.004, 0.004, 0.030), vec3(0.04, 0.02, 0.16), pow(fr, 1.6));\n" +
    "  body += vec3(0.02, 0.07, 0.45) * (1.0 - smoothstep(-0.9, 0.15, n.y)) * (0.35 + 0.65 * fr);\n" +
    "  vec3 rimCol = mix(vec3(0.62, 0.22, 1.0), vec3(0.20, 0.45, 1.0), smoothstep(0.25, 0.95, abs(n.x)));\n" +
    "  rimCol = mix(rimCol, vec3(1.0, 0.55, 1.0), smoothstep(0.1, 0.9, n.y) * smoothstep(0.0, 0.9, -n.x));\n" +
    "  float rim = pow(fr, 3.0) * 0.35 + pow(fr, 10.0) * 2.4;\n" +
    "  float q = (ndv - 0.42) / 0.035;\n" +
    "  float arc = exp(-q * q) * smoothstep(0.0, 0.7, n.y * 0.6 - n.x * 0.8);\n" +
    "  vec3 emit = rimCol * rim + vec3(0.85, 0.80, 1.0) * arc * 0.55;\n" +
    "  vec3 L = normalize(vec3(-0.45, 0.65, 0.6));\n" +
    "  emit += vec3(0.8, 0.85, 1.0) * pow(max(dot(reflect(-v, n), L), 0.0), 80.0) * 0.35;\n" +
    "  float a = 0.72 + 0.20 * fr;\n" +
    "  float ef = smoothstep(0.0, 0.10, ndv);\n" +
    "  o = vec4((body * a + emit) * ef, a * ef) * uFade;\n" +
    "}";

  // casca externa: só um aro fino de vidro em volta da esfera
  var FS_SHELL = "#version 300 es\nprecision highp float;\n" +
    "in vec3 vN; in vec3 vP; in float vU; uniform float uFade; out vec4 o;\n" +
    "void main(){\n" +
    "  vec3 n = normalize(vN); vec3 v = normalize(-vP);\n" +
    "  float ndv = dot(n, v); if (ndv <= 0.0) discard;\n" +
    "  float fr = 1.0 - ndv;\n" +
    "  vec3 col = mix(vec3(0.62, 0.25, 1.0), vec3(0.22, 0.50, 1.0), smoothstep(-0.1, 0.8, -n.x));\n" +
    "  float rim = pow(fr, 5.0) * 0.55 + pow(fr, 18.0) * 1.3;\n" +
    "  o = vec4(col * rim * smoothstep(0.0, 0.08, ndv), 1.0) * uFade;\n" +
    "}";

  var VS_FS = "#version 300 es\nout vec2 vUv;\n" +
    "void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }";

  var FS_DOWN = "#version 300 es\nprecision highp float;\n" +
    "in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThr; uniform float uOff; out vec4 o;\n" +
    "void main(){\n" +
    "  vec2 e = uTexel * uOff;\n" +
    "  vec3 c = texture(uTex, vUv + e * vec2(-1.0, -1.0)).rgb + texture(uTex, vUv + e * vec2(1.0, -1.0)).rgb +\n" +
    "           texture(uTex, vUv + e * vec2(-1.0, 1.0)).rgb + texture(uTex, vUv + e * vec2(1.0, 1.0)).rgb;\n" +
    "  c *= 0.25;\n" +
    "  if (uThr > 0.0) { float l = max(c.r, max(c.g, c.b)); c *= max(l - uThr, 0.0) / max(l, 0.0001); }\n" +
    "  o = vec4(c, 1.0);\n" +
    "}";

  var FS_BLUR = "#version 300 es\nprecision highp float;\n" +
    "in vec2 vUv; uniform sampler2D uTex; uniform vec2 uDir; out vec4 o;\n" +
    "const float W[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);\n" +
    "void main(){\n" +
    "  vec3 c = texture(uTex, vUv).rgb * W[0];\n" +
    "  for (int i = 1; i < 5; i++) { c += texture(uTex, vUv + uDir * float(i)).rgb * W[i]; c += texture(uTex, vUv - uDir * float(i)).rgb * W[i]; }\n" +
    "  o = vec4(c, 1.0);\n" +
    "}";

  // composição final: cena + brilho + chão espelhado (reflexo borrado e esticado na vertical) + névoa de fundo.
  // uCenter/uPpu dizem onde o globo está na tela e o tamanho dele, então o reflexo acompanha o movimento.
  var FS_COMP = "#version 300 es\nprecision highp float;\n" +
    "in vec2 vUv; uniform sampler2D uScene; uniform sampler2D uB1; uniform sampler2D uB2; uniform sampler2D uB3;\n" +
    "uniform float uFloor; uniform float uRefl; uniform float uPulse; uniform vec2 uCenter; uniform vec2 uRes; uniform float uPpu; out vec4 o;\n" +
    "vec3 tone(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }\n" +
    "float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\n" +
    "void main(){\n" +
    "  vec2 uv = vUv; vec3 c;\n" +
    "  float K = uRes.y / (uPpu * 4.77);\n" +                    // altura da tela em "alturas de palco", a medida que calibrou o reflexo
    "  vec2 pu = (uv - uCenter) * uRes / uPpu;\n" +              // posição em unidades do mundo, com o globo na origem
    "  if (uv.y >= uFloor) {\n" +
    "    c = texture(uScene, uv).rgb * (1.0 + 0.25 * uPulse) + (0.42 * texture(uB1, uv).rgb + 0.55 * texture(uB2, uv).rgb + 0.60 * texture(uB3, uv).rgb) * (1.0 + 1.3 * uPulse);\n" +
    "  } else {\n" +
    "    float d = uFloor - uv.y; float dS = d * K; float my = uFloor + d;\n" +
    "    float fade = exp(-dS * 3.3) * (1.0 - smoothstep(0.05, 0.22, dS));\n" +
    "    vec3 s = texture(uScene, vec2(uv.x, my)).rgb;\n" +
    "    vec3 b = vec3(0.0);\n" +
    "    for (int i = -3; i <= 3; i++) { b += texture(uB1, vec2(uv.x, my + float(i) * 0.012 * (0.6 + dS * 6.0) / K)).rgb; }\n" +
    "    b /= 7.0;\n" +
    "    vec3 w2 = texture(uB2, vec2(uv.x, my + d * 0.35)).rgb; vec3 w3 = texture(uB3, vec2(uv.x, my + d * 0.6)).rgb;\n" +
    "    c = (s * 0.35 * exp(-dS * 12.0) + b * 0.9 + w2 * 0.9 + w3 * 0.8) * fade * uRefl * (1.0 + 0.8 * uPulse) * vec3(0.85, 0.72, 1.0);\n" +
    "  }\n" +
    "  float gx = (uv.x - uCenter.x) * uRes.x / (1.63 * uPpu), gy = (uv.y - uFloor) * uRes.y / (0.29 * uPpu);\n" +
    "  c += vec3(0.30, 0.12, 0.70) * exp(-gx * gx - gy * gy) * 0.30 * uRefl;\n" +
    "  c += vec3(0.35, 0.18, 0.80) * exp(-dot(pu, pu) / 11.0) * 0.10 * uRefl * (1.0 + 1.5 * uPulse);\n" +
    "  vec3 t = tone(c); float lm = dot(t, vec3(0.299, 0.587, 0.114)); t = clamp(mix(vec3(lm), t, 1.35), 0.0, 1.0);\n" +
    "  t = max(t + (hash(gl_FragCoord.xy) - 0.5) / 255.0, 0.0);\n" +
    "  o = vec4(t, max(t.r, max(t.g, t.b)));\n" +
    "}";

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs) {
    var p = gl.createProgram(), v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, "aPos"); gl.bindAttribLocation(p, 1, "aNormal"); gl.bindAttribLocation(p, 2, "aU");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.deleteShader(v); gl.deleteShader(f);
    var cache = {};
    return { p: p, u: function (n) { return n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n)); } };
  }

  // ---------------------------------------------------------------- malhas
  var meshes = [];
  function mesh(pos, nor, uu, idx) {
    var n = pos.length / 3, inter = new Float32Array(n * 7), i;
    for (i = 0; i < n; i++) {
      inter.set(pos.subarray(i * 3, i * 3 + 3), i * 7);
      inter.set(nor.subarray(i * 3, i * 3 + 3), i * 7 + 3);
      inter[i * 7 + 6] = uu[i];
    }
    var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    var m = { vao: vao, vb: vb, ib: ib, count: idx.length };
    meshes.push(m);
    return m;
  }
  function sphereMesh(lat, lon) {
    var pos = [], nor = [], uu = [], idx = [], i, j;
    for (i = 0; i <= lat; i++) {
      var th = Math.PI * i / lat;
      for (j = 0; j <= lon; j++) {
        var ph = 2 * Math.PI * j / lon;
        var x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
        pos.push(x, y, z); nor.push(x, y, z); uu.push(ph);
      }
    }
    for (i = 0; i < lat; i++) for (j = 0; j < lon; j++) {
      var a = i * (lon + 1) + j, b = a + lon + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    return mesh(new Float32Array(pos), new Float32Array(nor), new Float32Array(uu), new Uint16Array(idx));
  }
  function torusMesh(R, r, major, minor) {   // anel no plano XY, em volta do eixo Z; aU = ângulo ao longo do anel
    var pos = [], nor = [], uu = [], idx = [], i, j;
    for (i = 0; i <= major; i++) {
      var u = 2 * Math.PI * i / major, cu = Math.cos(u), su = Math.sin(u);
      for (j = 0; j <= minor; j++) {
        var v = 2 * Math.PI * j / minor, cv = Math.cos(v), sv = Math.sin(v);
        pos.push((R + r * cv) * cu, (R + r * cv) * su, r * sv);
        nor.push(cv * cu, cv * su, sv); uu.push(u);
      }
    }
    for (i = 0; i < major; i++) for (j = 0; j < minor; j++) {
      var a = i * (minor + 1) + j, b = a + minor + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    return mesh(new Float32Array(pos), new Float32Array(nor), new Float32Array(uu), new Uint16Array(idx));
  }

  // ---------------------------------------------------------------- matrizes 4x4 (coluna principal)
  function ident() { var o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; }
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  function persp(fovy, asp, n, f, shiftX, shiftY) {
    var t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[8] = -shiftX; o[9] = -shiftY; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
    return o;
  }
  function trans(x, y, z) { var o = ident(); o[12] = x; o[13] = y; o[14] = z; return o; }
  function scale(s) { var o = ident(); o[0] = o[5] = o[10] = s; return o; }
  function rotX(a) { var o = ident(), c = Math.cos(a), s = Math.sin(a); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; }
  function rotAxis(ax, ay, az, a) {   // rotação de ângulo a em torno de um eixo qualquer
    var l = Math.sqrt(ax * ax + ay * ay + az * az); ax /= l; ay /= l; az /= l;
    var c = Math.cos(a), s = Math.sin(a), t = 1 - c, o = ident();
    o[0] = t * ax * ax + c;      o[4] = t * ax * ay - s * az; o[8] = t * ax * az + s * ay;
    o[1] = t * ax * ay + s * az; o[5] = t * ay * ay + c;      o[9] = t * ay * az - s * ax;
    o[2] = t * ax * az - s * ay; o[6] = t * ay * az + s * ax; o[10] = t * az * az + c;
    return o;
  }
  function rotZ(a) { var o = ident(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; }

  // ---------------------------------------------------------------- recursos
  var pRing, pGlass, pShell, pDown, pBlur, pComp, sphere, torus, emptyVao;
  try {
    pRing = program(VS_MESH, FS_RING); pGlass = program(VS_MESH, FS_GLASS); pShell = program(VS_MESH, FS_SHELL);
    pDown = program(VS_FS, FS_DOWN); pBlur = program(VS_FS, FS_BLUR); pComp = program(VS_FS, FS_COMP);
    sphere = sphereMesh(48, 64);
    torus = torusMesh(1.0, 0.018, 220, 12);
    emptyVao = gl.createVertexArray();
  } catch (e) { giveUp(); return; }

  // três grupos de anéis em fita, cada um girando em torno do globo com um eixo e uma velocidade (rad/s) próprios.
  // tilt = inclinação do plano, roll = giro na tela, dy = deslocamento vertical, s = raio, g = brilho
  var GROUPS = [
    { axis: [0.30, 1.0, 0.15], w: 0.50, strands: [   // anel diagonal: azul elétrico e ciano, com fios violeta
      { s: 1.58, tilt: 1.20, roll: 0.42, dy: 0.02, a: [0.12, 0.38, 1.00], b: [0.20, 0.80, 1.00], ph: 0.0, g: 1.7 },
      { s: 1.62, tilt: 1.26, roll: 0.40, dy: 0.00, a: [0.55, 0.20, 1.00], b: [0.95, 0.30, 0.95], ph: 1.6, g: 1.3 },
      { s: 1.54, tilt: 1.14, roll: 0.44, dy: 0.04, a: [0.15, 0.35, 1.00], b: [0.45, 0.25, 1.00], ph: 3.1, g: 1.1 } ] },
    { axis: [0.0, 1.0, 0.0], w: -0.60, strands: [    // anel inferior: violeta e magenta (gira na horizontal, sempre fora da esfera)
      { s: 1.44, tilt: 1.33, roll: -0.05, dy: -0.74, a: [0.60, 0.20, 1.00], b: [0.95, 0.30, 0.95], ph: 0.5, g: 1.7 },
      { s: 1.38, tilt: 1.36, roll: -0.03, dy: -0.72, a: [0.12, 0.32, 1.00], b: [0.40, 0.20, 1.00], ph: 2.2, g: 1.5 },
      { s: 1.50, tilt: 1.26, roll: -0.07, dy: -0.76, a: [0.95, 0.30, 0.95], b: [0.70, 0.25, 1.00], ph: 4.0, g: 1.1 } ] },
    { axis: [1.0, 0.15, 0.10], w: 0.42, strands: [   // anel colado na esfera: rosa-claro no alto, violeta e azul nas laterais
      { s: 1.13, tilt: 0.30, roll: -0.35, dy: 0.0, a: [1.00, 0.50, 1.00], b: [0.45, 0.25, 1.00], ph: 2.4, g: 1.2 },
      { s: 1.18, tilt: 0.42, roll: 0.25, dy: 0.0, a: [0.25, 0.45, 1.00], b: [0.60, 0.22, 1.00], ph: 0.8, g: 1.1 } ] }
  ];
  var FLOOR_Y = -1.34, PITCH = 0.16, SHIFT = 0.06, DIST = 8.5, TAN15 = Math.tan(15 * Math.PI / 180);
  // tempos da abertura (s): globo grande no centro, vai para o canto, login aparece no meio do trajeto
  var HOLD = 4.8, MOVE = 1.7, READY_AT = HOLD + MOVE * 0.55;

  var T = null;   // alvos de render: { scene, res, lv:[{a,b},…], w, h }
  var SS = 1;     // fator de supersampling da cena (suaviza as bordas em telas 1x)
  function makeTarget(w, h) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, HDR ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, HDR ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex: tex, fbo: fbo, w: w, h: h, ok: gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE };
  }
  function freeTargets() {
    if (!T) return;
    var all = [T.scene]; if (T.res) all.push(T.res);
    T.lv.forEach(function (l) { all.push(l.a, l.b); });
    all.forEach(function (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); });
    T = null;
  }
  function buildTargets(w, h) {
    freeTargets();
    var t = { w: w, h: h, scene: makeTarget(Math.round(w * SS), Math.round(h * SS)), res: SS > 1 ? makeTarget(w, h) : null, lv: [] }, ok = t.scene.ok && (!t.res || t.res.ok), k;
    for (k = 1; k <= 3; k++) {
      var lw = Math.max(1, w >> k), lh = Math.max(1, h >> k);
      var l = { a: makeTarget(lw, lh), b: makeTarget(lw, lh) };
      ok = ok && l.a.ok && l.b.ok; t.lv.push(l);
    }
    T = t;
    if (!ok && HDR) { HDR = false; buildTargets(w, h); }   // sem alvo flutuante: cai para 8 bits
  }

  // ---------------------------------------------------------------- desenho
  function drawMesh(prog, m, model, view, proj) {
    var mv = mul(view, model);
    gl.uniformMatrix4fv(prog.u("uMVP"), false, mul(proj, mv));
    gl.uniformMatrix4fv(prog.u("uMV"), false, mv);
    gl.bindVertexArray(m.vao);
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
  }
  var ang = [0, 0, 0], phase = 0;   // ângulo de cada grupo e deslocamento de cor ao longo dos anéis
  function drawStrands(view, proj, pass, P) {
    gl.useProgram(pRing.p);
    gl.uniform1f(pRing.u("uCenterZ"), -DIST); gl.uniform1f(pRing.u("uPass"), pass);
    GROUPS.forEach(function (g, gi) {
      var R = rotAxis(g.axis[0], g.axis[1], g.axis[2], ang[gi]);
      gl.uniform1f(pRing.u("uLit"), P.lit[gi]);
      g.strands.forEach(function (st) {
        var model = mul(trans(0, st.dy, 0), mul(R, mul(rotZ(st.roll), mul(rotX(st.tilt), scale(st.s)))));
        gl.uniform3fv(pRing.u("uColA"), st.a); gl.uniform3fv(pRing.u("uColB"), st.b);
        gl.uniform1f(pRing.u("uPhase"), st.ph + phase); gl.uniform1f(pRing.u("uGain"), st.g);
        drawMesh(pRing, torus, model, view, proj);
      });
    });
  }
  function drawShell(view, proj, P) {
    gl.useProgram(pShell.p); gl.uniform1f(pShell.u("uFade"), P.fade);
    drawMesh(pShell, sphere, scale(1.3), view, proj);
  }
  function fsPass(prog, target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : canvas.width, target ? target.h : canvas.height);
    gl.useProgram(prog.p); gl.bindVertexArray(emptyVao);
  }
  function bindTex(unit, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }

  var L = { w: 1, h: 1, fx: 0, fy: 0, ppuF: 1, sx: 0, sy: 0, ppu0: 1 };   // medidas da tela e dos dois pontos da animação
  function render(P) {   // P = { cx, cy (px do centro do globo), ppu (px por unidade do mundo) }
    if (!canvas.width || !canvas.height || !T) return;
    var fov = 2 * Math.atan(L.h / (2 * P.ppu * DIST));
    var proj = persp(fov, L.w / L.h, 1, 60, P.cx / L.w * 2 - 1, 1 - P.cy / L.h * 2);
    var view = mul(trans(0, 0, -DIST), rotX(PITCH));

    // 1) cena em HDR: fios atrás da esfera, vidro, fios na frente, casca
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene.fbo);
    gl.viewport(0, 0, T.scene.w, T.scene.h);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.ONE, gl.ONE);
    drawStrands(view, proj, 0, P);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(pGlass.p); gl.uniform1f(pGlass.u("uFade"), P.fade);
    drawMesh(pGlass, sphere, ident(), view, proj);
    gl.blendFunc(gl.ONE, gl.ONE);
    drawStrands(view, proj, 1, P);
    drawShell(view, proj, P);
    gl.disable(gl.BLEND);

    // 2) resolve o supersampling (se houver) e faz o brilho: filtro em 1/2, depois 1/4 e 1/8, cada nível borrado em H e V
    var base = T.scene, src, k, l;
    if (T.res) {
      fsPass(pDown, T.res);
      bindTex(0, T.scene.tex); gl.uniform1i(pDown.u("uTex"), 0);
      gl.uniform2f(pDown.u("uTexel"), 1 / T.scene.w, 1 / T.scene.h); gl.uniform1f(pDown.u("uThr"), 0.0); gl.uniform1f(pDown.u("uOff"), 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      base = T.res;
    }
    src = base;
    for (k = 0; k < 3; k++) {
      l = T.lv[k];
      fsPass(pDown, l.a);
      bindTex(0, src.tex); gl.uniform1i(pDown.u("uTex"), 0);
      gl.uniform2f(pDown.u("uTexel"), 1 / src.w, 1 / src.h); gl.uniform1f(pDown.u("uThr"), k === 0 ? 0.45 : 0.0); gl.uniform1f(pDown.u("uOff"), 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      fsPass(pBlur, l.b);
      bindTex(0, l.a.tex); gl.uniform1i(pBlur.u("uTex"), 0); gl.uniform2f(pBlur.u("uDir"), 1 / l.a.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      fsPass(pBlur, l.a);
      bindTex(0, l.b.tex); gl.uniform1i(pBlur.u("uTex"), 0); gl.uniform2f(pBlur.u("uDir"), 0, 1 / l.a.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = l.a;
    }

    // 3) composição na tela, com o chão espelhado
    fsPass(pComp, null);
    bindTex(0, base.tex); gl.uniform1i(pComp.u("uScene"), 0);
    bindTex(1, T.lv[0].a.tex); gl.uniform1i(pComp.u("uB1"), 1);
    bindTex(2, T.lv[1].a.tex); gl.uniform1i(pComp.u("uB2"), 2);
    bindTex(3, T.lv[2].a.tex); gl.uniform1i(pComp.u("uB3"), 3);
    gl.uniform1f(pComp.u("uFloor"), (floorNdc(proj, view) + 1) / 2);
    gl.uniform1f(pComp.u("uRefl"), P.refl); gl.uniform1f(pComp.u("uPulse"), P.pulse);
    gl.uniform2f(pComp.u("uCenter"), P.cx / L.w, 1 - P.cy / L.h);
    gl.uniform2f(pComp.u("uRes"), L.w, L.h);
    gl.uniform1f(pComp.u("uPpu"), P.ppu);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function floorNdc(proj, view) {   // projeta o ponto do chão (0, FLOOR_Y, 0) e devolve o Y em NDC
    var m = mul(proj, view);
    var y = m[5] * FLOOR_Y + m[13], wv = m[7] * FLOOR_Y + m[15];   // x = z = 0
    return y / wv;
  }

  // ---------------------------------------------------------------- tamanho e linha do tempo
  var RM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

  function layout() {   // lê onde o globo termina (reserva do layout) e onde ele começa (centro da tela)
    var cr = canvas.getBoundingClientRect(), sr = stageEl.getBoundingClientRect();
    L.w = Math.max(1, cr.width); L.h = Math.max(1, cr.height);
    var ws = Math.max(1, sr.width), hs = Math.max(1, sr.height);
    L.ppuF = hs / (2 * TAN15 * Math.max(8.1, 8.9 / (ws / hs)));
    L.fx = sr.left - cr.left + ws / 2;
    L.fy = sr.top - cr.top + hs / 2 - SHIFT * hs / 2;
    L.ppu0 = Math.max(L.ppuF, Math.min(L.w * 0.26, L.h * 0.20));
    L.sx = L.w / 2; L.sy = L.h * 0.46;
  }
  function poseAt(tl) {
    var e = ease(clamp((tl - HOLD) / MOVE, 0, 1));
    var breathe = 0.93 + 0.07 * ease(clamp(tl / HOLD, 0, 1));          // aproximação lenta e discreta durante a abertura
    function sm(a, b) { var x = clamp((tl - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
    var pu = clamp((tl - 3.3) / 0.9, 0, 1);
    return {
      e: e, cx: L.sx + (L.fx - L.sx) * e, cy: L.sy + (L.fy - L.sy) * e,
      ppu: L.ppu0 * Math.pow(L.ppuF / L.ppu0, e) * breathe,
      fade: sm(0, 1.0),                                                // vidro e casca surgem do escuro
      lit: [clamp((tl - 1.5) / 1.2, 0, 1), clamp((tl - 2.4) / 1.2, 0, 1), clamp((tl - 0.8) / 1.2, 0, 1)],   // anel diagonal, inferior e colado na esfera acendem em sequência
      refl: sm(1.2, 3.6),                                              // chão e névoa acompanham a luz
      pulse: Math.pow(Math.sin(pu * Math.PI), 2) * 0.85                // clarão suave quando tudo está aceso
    };
  }

  function resize() {
    var box = canvas.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;   // tela de entrada escondida
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
    if (w === canvas.width && h === canvas.height && T) return;
    SS = Math.max(1, Math.min(2, (LOW ? 1.25 : 1.5) / dpr));
    canvas.width = w; canvas.height = h;
    buildTargets(w, h);
    layout();
    if (!running) render(poseAt(shown ? (RM.matches ? 99 : 0) : 99));
  }

  // ---------------------------------------------------------------- laço de animação (um só)
  var running = false, shown = false, readyOn = false, raf = 0, tStart = 0, last = 0, pausedAt = 0;
  function setReady() { readyOn = true; lock.classList.add("lk-ready"); }
  function frame(now) {
    raf = 0;
    if (!running) return;
    if (!canvas.isConnected) { dispose(); return; }
    var dt = clamp((now - last) / 1000, 0, 0.1); last = now;   // segundos reais: a velocidade não depende dos quadros por segundo
    layout();
    var tl = (now - tStart) / 1000, P = poseAt(tl);
    var boost = 1 + 1.6 * (1 - P.e);                           // gira mais rápido na abertura e desacelera ao ir para o canto
    for (var i = 0; i < GROUPS.length; i++) ang[i] += GROUPS[i].w * boost * dt;
    phase += 0.45 * boost * dt;
    if (!readyOn && tl >= READY_AT) setReady();
    render(P);
    raf = requestAnimationFrame(frame);
  }
  function halt() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function begin() {   // a tela de entrada apareceu: reinicia a abertura
    halt();
    resize(); layout();
    ang[0] = ang[1] = ang[2] = 0; phase = 0; readyOn = false;
    lock.classList.add("lk-intro"); lock.classList.remove("lk-ready");
    if (RM.matches) { setReady(); render(poseAt(99)); return; }   // movimento reduzido: quadro parado, login direto
    running = true; tStart = last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function onLock() {
    var vis = !lock.hidden;
    if (vis === shown) return;
    shown = vis;
    if (vis) begin(); else halt();
  }
  function onVisibility() {   // aba em segundo plano: pausa e retoma sem pular a abertura
    if (!shown || RM.matches) return;
    if (document.hidden) { pausedAt = performance.now(); halt(); }
    else if (!running) { var n = performance.now(); tStart += n - pausedAt; last = n; running = true; raf = requestAnimationFrame(frame); }
  }
  function onMotion() { if (shown) begin(); }

  var rzT = 0;
  function onSize() { clearTimeout(rzT); rzT = setTimeout(function () { rzT = 0; resize(); }, 120); }
  var ro = window.ResizeObserver ? new ResizeObserver(onSize) : null;
  if (ro) ro.observe(canvas);
  var mo = new MutationObserver(onLock);
  mo.observe(lock, { attributes: true, attributeFilter: ["hidden"] });
  window.addEventListener("resize", onSize);
  document.addEventListener("visibilitychange", onVisibility);
  if (RM.addEventListener) RM.addEventListener("change", onMotion);
  canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); halt(); giveUp(); });

  // libera tudo se o componente sair da página
  function dispose() {
    halt(); clearTimeout(rzT);
    mo.disconnect(); if (ro) ro.disconnect();
    window.removeEventListener("resize", onSize);
    document.removeEventListener("visibilitychange", onVisibility);
    if (RM.removeEventListener) RM.removeEventListener("change", onMotion);
    freeTargets();
    meshes.forEach(function (m) { gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); });
    [pRing, pGlass, pShell, pDown, pBlur, pComp].forEach(function (p) { gl.deleteProgram(p.p); });
    var ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext();
  }
  canvas.__lkDispose = dispose;

  onLock();   // se a tela de entrada já estiver visível quando o script carregar
})();
