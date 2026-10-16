'use strict';

const { loadConfig } = require('./config');
const { openDatabase } = require('./db');
const { createApp } = require('./app');

const SHUTDOWN_TIMEOUT_MS = 10_000;

function main() {
  const config = loadConfig(process.env);
  const db = openDatabase(config.dbFile);
  const app = createApp({ db, config });

  const server = app.listen(config.port, () => {
    console.log(`API financeira ouvindo na porta ${config.port}`);
  });

  // Encerramento limpo: para de aceitar conexões, fecha o banco e sai.
  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} recebido, encerrando...`);
    const forceExit = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('[promise rejeitada sem tratamento]', reason);
  });
}

try {
  main();
} catch (err) {
  // configuração inválida (ex.: JWT_SECRET ausente) ou banco não abre: não sobe o servidor
  console.error(`Falha ao iniciar: ${err.message}`);
  process.exit(1);
}
