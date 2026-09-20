import { createApp } from "./app.js";
import { env, isAnthropicConfigured } from "./config/env.js";
import { initDb } from "./db/database.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("server");

try {
  await initDb(); // garante que o banco e as tabelas existam antes de aceitar requisições
} catch (err) {
  logger.error(
    "Falha ao conectar/inicializar o banco de dados. Verifique se a variável DATABASE_URL está correta no .env.",
    { error: err instanceof Error ? err.message : String(err) }
  );
  process.exit(1);
}

const app = createApp();

app.listen(env.port, () => {
  logger.info(`Servidor rodando em http://localhost:${env.port}`);
  if (!isAnthropicConfigured()) {
    logger.warn(
      "ANTHROPIC_API_KEY não configurada. As buscas de URLs e CNPJs retornarão erro explícito até que a chave seja definida no .env — o sistema não inventa resultados."
    );
  }
});
