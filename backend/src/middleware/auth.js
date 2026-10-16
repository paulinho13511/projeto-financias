'use strict';

const jwt = require('jsonwebtoken');
const { unauthorized, forbidden } = require('../lib/errors');

/**
 * Cria os middlewares de autenticação.
 * - authenticate: exige "Authorization: Bearer <token>", valida assinatura, emissor, audiência
 *   e versão do token contra o banco (troca de senha ou desativação derruba a sessão).
 * - requireAdmin: deve vir depois de authenticate.
 */
function createAuth({ users, config }) {
  // recebe o registro completo do banco (com token_version), nunca o objeto público
  function signToken(row) {
    return jwt.sign(
      { sub: String(row.id), role: row.role, tv: row.token_version },
      config.jwtSecret,
      {
        algorithm: 'HS256',
        expiresIn: config.jwtExpiresIn,
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
      },
    );
  }

  function authenticate(req, res, next) {
    try {
      const header = req.get('authorization') || '';
      const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header);
      if (!match) throw unauthorized();

      let claims;
      try {
        claims = jwt.verify(match[1], config.jwtSecret, {
          algorithms: ['HS256'],
          issuer: config.jwtIssuer,
          audience: config.jwtAudience,
        });
      } catch {
        throw unauthorized();
      }

      const row = users.findRawById(Number(claims.sub));
      if (!row || row.active !== 1 || row.token_version !== claims.tv) {
        throw unauthorized('sessao_revogada', 'Sessão encerrada. Entre novamente.');
      }

      req.user = { id: row.id, email: row.email, name: row.name, role: row.role };
      return next();
    } catch (err) {
      return next(err);
    }
  }

  function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') return next(forbidden());
    return next();
  }

  return { authenticate, requireAdmin, signToken };
}

module.exports = { createAuth };
