import http from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectMongo } from "./database/mongo.js";
import { assertMySqlConnection } from "./database/mysql.js";
import { setupSocket } from "./realtime/socket.js";

async function bootstrap() {
  await assertMySqlConnection();
  await connectMongo();

  const server = http.createServer(app);
  setupSocket(server);

  server.listen(env.PORT, () => {
    console.log(`EduCore API listening on http://localhost:${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start EduCore API");
  console.error(error);
  process.exit(1);
});

