'use strict';

/** Erro previsível da API: vira resposta JSON com status e código estáveis. */
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

const badRequest = (code, message) => new HttpError(400, code, message);
const unauthorized = (code = 'nao_autenticado', message = 'Sessão inválida ou expirada.') =>
  new HttpError(401, code, message);
const forbidden = (code = 'acesso_negado', message = 'Você não tem permissão para esta ação.') =>
  new HttpError(403, code, message);
const notFound = (message = 'Registro não encontrado.') => new HttpError(404, 'nao_encontrado', message);
const conflict = (code, message) => new HttpError(409, code, message);
const tooMany = (message) => new HttpError(429, 'muitas_tentativas', message);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict, tooMany };
