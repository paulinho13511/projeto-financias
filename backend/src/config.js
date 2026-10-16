'use strict';

const path = require('node:path');

/**
 * Lê e valida a configuração a partir de variáveis de ambiente.
 * Falha cedo (na inicialização) se algo essencial estiver ausente ou fraco,
 * em vez de subir um servidor inseguro.
 */
function loadConfig(env = process.env) {
  const jwtSecret = env.JWT_SECRET || '';
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET é obrigatório e precisa ter pelo menos 32 caracteres.');
  }

  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT inválida.');
  }

  return Object.freeze({
    port,
    dbFile: env.DB_FILE || path.join(__dirname, '..', 'data', 'financas.db'),
    jwtSecret,
    jwtIssuer: 'financas-api',
    jwtAudience: 'financas-app',
    jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',
    // origens do front-end (ex.: https://seu-app.vercel.app), separadas por vírgula
    allowedOrigins: (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // true somente se a API estiver atrás de um proxy confiável (ex.: Railway, Fly, Nginx)
    trustProxy: env.TRUST_PROXY === 'true',
    bcryptCost: 12,
    login: Object.freeze({
      windowMs: 15 * 60 * 1000,
      maxFailures: 5,
    }),
  });
}

module.exports = { loadConfig };
