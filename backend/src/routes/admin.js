'use strict';

const express = require('express');
const { normalizeEmail, validateName, validatePassword, validateRole } = require('../lib/validate');
const { badRequest, notFound } = require('../lib/errors');

/**
 * Gestão de contas de acesso. Somente administradores (requireAdmin).
 * Use para criar contas de familiares: cada pessoa recebe a própria conta e
 * vê apenas os próprios dados.
 */
function createAdminRouter({ users, auth }) {
  const router = express.Router();
  router.use(auth.authenticate, auth.requireAdmin);

  router.get('/users', (req, res) => {
    res.json({ users: users.listUsers() });
  });

  router.post('/users', async (req, res) => {
    const body = req.body ?? {};
    const user = await users.createUser({
      email: normalizeEmail(body.email),
      name: validateName(body.name),
      password: validatePassword(body.password),
      role: body.role === undefined ? 'member' : validateRole(body.role),
    });
    res.status(201).json({ user });
  });

  // Altera nome, papel, status e/ou redefine a senha (senha temporária para quem esqueceu).
  router.patch('/users/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw notFound();

    const body = req.body ?? {};
    const changes = {};
    if (body.name !== undefined) changes.name = validateName(body.name);
    if (body.role !== undefined) changes.role = validateRole(body.role);
    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') throw badRequest('ativo_invalido', 'Use true ou false em "active".');
      changes.active = body.active;
    }
    const newPassword = body.password === undefined ? undefined : validatePassword(body.password);
    if (Object.keys(changes).length === 0 && newPassword === undefined) {
      throw badRequest('nada_para_alterar', 'Informe name, role, active ou password.');
    }

    if (!users.findRawById(id)) throw notFound('Usuário não encontrado.');
    // updateUser aplica as regras de negócio (último admin, auto-desativação) antes de gravar
    if (Object.keys(changes).length > 0) users.updateUser(id, changes, req.user.id);
    if (newPassword !== undefined) await users.changePassword(id, newPassword);

    res.json({ user: users.findPublicById(id) });
  });

  return router;
}

module.exports = { createAdminRouter };
