'use strict';

const { badRequest } = require('./errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 10;
// bcrypt considera só os 72 primeiros bytes da senha; passar disso seria silenciosamente truncado
const MAX_PASSWORD_BYTES = 72;

function normalizeEmail(value) {
  if (typeof value !== 'string') throw badRequest('email_invalido', 'Informe um e-mail válido.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    throw badRequest('email_invalido', 'Informe um e-mail válido.');
  }
  return email;
}

function validateName(value) {
  if (typeof value !== 'string') throw badRequest('nome_invalido', 'Informe o nome.');
  const name = value.trim();
  if (name.length < 2 || name.length > 80) {
    throw badRequest('nome_invalido', 'O nome precisa ter entre 2 e 80 caracteres.');
  }
  return name;
}

function validatePassword(value) {
  if (typeof value !== 'string') throw badRequest('senha_invalida', 'Informe a senha.');
  if (value.length < MIN_PASSWORD) {
    throw badRequest('senha_invalida', `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_PASSWORD_BYTES) {
    throw badRequest('senha_invalida', `A senha pode ter no máximo ${MAX_PASSWORD_BYTES} bytes.`);
  }
  return value;
}

function validateRole(value) {
  if (value !== 'admin' && value !== 'member') {
    throw badRequest('papel_invalido', 'O papel deve ser "admin" ou "member".');
  }
  return value;
}

/** Senha de login: só checa tipo e tamanho máximo; a regra de criação não se aplica a quem já tem conta. */
function requireLoginPassword(value) {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > 1024) {
    throw badRequest('dados_invalidos', 'Informe e-mail e senha.');
  }
  return value;
}

module.exports = {
  normalizeEmail,
  validateName,
  validatePassword,
  validateRole,
  requireLoginPassword,
  MIN_PASSWORD,
};
