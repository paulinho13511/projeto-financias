'use strict';

/**
 * Cria a primeira conta administradora. Uso:
 *   ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD='senha-forte' ADMIN_NAME='Seu Nome' \
 *   JWT_SECRET=... npm run create-admin
 *
 * Não altera contas existentes: se o e-mail já existir, encerra sem mudar nada.
 * Use a rota PATCH /api/admin/users/:id para redefinir senhas depois.
 */

const path = require('node:path');
const src = path.join(__dirname, '..', 'src');
const { loadConfig } = require(path.join(src, 'config'));
const { openDatabase } = require(path.join(src, 'db'));
const { createUserService } = require(path.join(src, 'services', 'users'));
const { normalizeEmail, validateName, validatePassword } = require(path.join(src, 'lib', 'validate'));

async function main() {
  const config = loadConfig(process.env);
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const name = validateName(process.env.ADMIN_NAME);
  const password = validatePassword(process.env.ADMIN_PASSWORD);

  const db = openDatabase(config.dbFile);
  try {
    const users = createUserService({ db, bcryptCost: config.bcryptCost });
    if (users.findByEmail(email)) {
      console.log('Já existe uma conta com este e-mail. Nada foi alterado.');
      return;
    }
    const user = await users.createUser({ email, name, password, role: 'admin' });
    console.log(`Administrador criado: ${user.email} (id ${user.id}).`);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  // mensagens de validação (HttpError) já são legíveis; o resto é erro inesperado
  console.error(`Falha: ${err.message}`);
  process.exit(1);
});
