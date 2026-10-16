'use strict';

/**
 * Limita tentativas de login falhas por (IP + e-mail).
 * Em memória: adequado a uma instância. Se a API escalar para várias
 * instâncias, mover este contador para o banco ou para um Redis.
 */
function createLoginLimiter({ windowMs, maxFailures, now = () => Date.now() }) {
  const failures = new Map(); // chave -> { count, firstAt }

  function current(key) {
    const entry = failures.get(key);
    if (!entry) return null;
    if (now() - entry.firstAt > windowMs) {
      failures.delete(key);
      return null;
    }
    return entry;
  }

  return {
    isBlocked(key) {
      const entry = current(key);
      return Boolean(entry && entry.count >= maxFailures);
    },
    recordFailure(key) {
      const entry = current(key);
      if (entry) entry.count += 1;
      else failures.set(key, { count: 1, firstAt: now() });
    },
    reset(key) {
      failures.delete(key);
    },
    // evita crescimento ilimitado do Map
    prune() {
      for (const key of failures.keys()) current(key);
    },
  };
}

module.exports = { createLoginLimiter };
