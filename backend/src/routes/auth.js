'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { normalizeEmail, requireLoginPassword, validatePassword } = require('../lib/validate');
const { badRequest, unauthorized, forbidden, tooMany } = require('../lib/errors');

/**
 * Rotas públicas de login e rotas de sessão do usuário logado.
 */
function createAuthRouter({ users, auth, limiter, config }) {
  const router = express.Router();

  // Hash fictício para gastar o mesmo tempo quando o e-mail não existe
  // (evita descobrir quais e-mails têm conta medindo a resposta).
  const DUMMY_HASH = bcrypt.hashSync('tempo-constante-sem-uso-real', config.bcryptCost);

  router.post('/login', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = requireLoginPassword(req.body?.password);
    const key = `${req.ip}|${email}`;

    if (limiter.isBlocked(key)) {
      throw tooMany('Muitas tentativas. Aguarde 15 minutos e tente de novo.');
    }

    const row = users.findByEmail(email);
    const ok = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);

    if (!row || !ok) {
      limiter.recordFailure(key);
      throw unauthorized('credenciais_invalidas', 'E-mail ou senha incorretos.');
    }
    if (row.active !== 1) {
      // checado só depois da senha, para não revelar contas desativadas a quem não sabe a senha
      throw forbidden('conta_desativada', 'Esta conta está desativada. Fale com o administrador.');
    }

    limiter.reset(key);
    res.json({
      token: auth.signToken(row),
      expiresIn: config.jwtExpiresIn,
      user: users.toPublic(row),
    });
  });

  router.get('/me', auth.authenticate, (req, res) => {
    res.json({ user: users.findPublicById(req.user.id) });
  });

  // Troca de senha pelo próprio usuário. Gera novo token e invalida os antigos (token_version).
  router.post('/password', auth.authenticate, async (req, res) => {
    const currentPassword = requireLoginPassword(req.body?.currentPassword);
    const newPassword = validatePassword(req.body?.newPassword);

    const row = users.findRawById(req.user.id);
    const ok = await bcrypt.compare(currentPassword, row.password_hash);
    if (!ok) throw unauthorized('senha_atual_incorreta', 'A senha atual está incorreta.');
    if (currentPassword === newPassword) {
      throw badRequest('senha_repetida', 'A nova senha precisa ser diferente da atual.');
    }

    await users.changePassword(row.id, newPassword);
    const updated = users.findRawById(row.id);
    res.json({ token: auth.signToken(updated), user: users.toPublic(updated) });
  });

  return router;
}

module.exports = { createAuthRouter };
