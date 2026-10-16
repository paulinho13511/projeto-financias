'use strict';

const express = require('express');
const { HttpError } = require('./lib/errors');
const { createUserService } = require('./services/users');
const { createLoginLimiter } = require('./services/loginLimiter');
const { createAuth } = require('./middleware/auth');
const { createAuthRouter } = require('./routes/auth');
const { createAdminRouter } = require('./routes/admin');

/** Cabeçalhos de segurança e CORS restrito às origens configuradas. */
function securityMiddleware(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');

    const origin = req.get('origin');
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  };
}

function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  // JSON malformado enviado pelo cliente
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'json_invalido', message: 'Corpo da requisição inválido.' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'corpo_grande', message: 'Requisição grande demais.' } });
  }
  // erro inesperado: registra no servidor, não vaza detalhes ao cliente
  console.error('[erro interno]', err);
  return res.status(500).json({ error: { code: 'erro_interno', message: 'Erro interno. Tente novamente.' } });
}

/**
 * Monta a aplicação. Recebe as dependências (db, config) de fora,
 * o que permite testar com um banco em memória.
 */
function createApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  const users = createUserService({ db, bcryptCost: config.bcryptCost });
  const auth = createAuth({ users, config });
  const limiter = createLoginLimiter(config.login);

  app.use(securityMiddleware(config.allowedOrigins));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', createAuthRouter({ users, auth, limiter, config }));
  app.use('/api/admin', createAdminRouter({ users, auth }));

  app.use((req, res) =>
    res.status(404).json({ error: { code: 'nao_encontrado', message: 'Rota não encontrada.' } }));
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
