'use strict';

const bcrypt = require('bcryptjs');
const { conflict, notFound, badRequest } = require('../lib/errors');

/** Todas as consultas de usuário passam por aqui: nunca devolvem password_hash. */
function createUserService({ db, bcryptCost }) {
  const selectPublic = `
    SELECT id, email, name, role, active, token_version, created_at, updated_at
    FROM users`;

  const stmt = {
    byEmail: db.prepare(`${selectPublic} WHERE email = ?`),
    byEmailWithHash: db.prepare('SELECT * FROM users WHERE email = ?'),
    byId: db.prepare(`${selectPublic} WHERE id = ?`),
    byIdWithHash: db.prepare('SELECT * FROM users WHERE id = ?'),
    list: db.prepare(`${selectPublic} ORDER BY created_at, id`),
    insert: db.prepare(`
      INSERT INTO users (email, name, password_hash, role)
      VALUES (@email, @name, @password_hash, @role)`),
    countAdmins: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1"),
    countAll: db.prepare('SELECT COUNT(*) AS n FROM users'),
    setPassword: db.prepare(`
      UPDATE users
      SET password_hash = @password_hash, token_version = token_version + 1,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = @id`),
  };

  const toPublic = (row) =>
    row && {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      active: row.active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  async function hashPassword(password) {
    return bcrypt.hash(password, bcryptCost);
  }

  async function createUser({ email, name, password, role }) {
    if (stmt.byEmail.get(email)) throw conflict('email_em_uso', 'Já existe uma conta com este e-mail.');
    const password_hash = await hashPassword(password);
    try {
      const info = stmt.insert.run({ email, name, password_hash, role });
      return toPublic(stmt.byId.get(info.lastInsertRowid));
    } catch (err) {
      // duas requisições simultâneas com o mesmo e-mail: a constraint UNIQUE decide
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw conflict('email_em_uso', 'Já existe uma conta com este e-mail.');
      }
      throw err;
    }
  }

  // Atualização administrativa. Mudar 'active' ou 'role' também invalida sessões antigas.
  function updateUser(id, changes, actorId) {
    const current = stmt.byIdWithHash.get(id);
    if (!current) throw notFound('Usuário não encontrado.');

    const next = {
      name: changes.name ?? current.name,
      role: changes.role ?? current.role,
      active: changes.active === undefined ? current.active : changes.active ? 1 : 0,
    };

    const losesAdminRights = current.role === 'admin' && current.active === 1 &&
      (next.role !== 'admin' || next.active === 0);
    if (losesAdminRights && stmt.countAdmins.get().n <= 1) {
      throw conflict('ultimo_admin', 'Não é possível remover o último administrador ativo.');
    }
    if (id === actorId && next.active === 0) {
      throw badRequest('nao_pode_desativar_a_si_mesmo', 'Você não pode desativar a própria conta.');
    }

    const sessionInvalidated = next.active !== current.active || next.role !== current.role;
    db.prepare(`
      UPDATE users
      SET name = @name, role = @role, active = @active,
          token_version = token_version + @bump,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = @id`).run({ ...next, bump: sessionInvalidated ? 1 : 0, id });

    return toPublic(stmt.byId.get(id));
  }

  async function changePassword(id, newPassword) {
    const password_hash = await hashPassword(newPassword);
    stmt.setPassword.run({ id, password_hash });
    return toPublic(stmt.byId.get(id));
  }

  return {
    toPublic,
    hashPassword,
    findByEmail: (email) => stmt.byEmailWithHash.get(email),
    findPublicById: (id) => toPublic(stmt.byId.get(id)),
    findRawById: (id) => stmt.byIdWithHash.get(id),
    listUsers: () => stmt.list.all().map(toPublic),
    countUsers: () => stmt.countAll.get().n,
    createUser,
    updateUser,
    changePassword,
  };
}

module.exports = { createUserService };
