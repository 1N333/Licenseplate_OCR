import "server-only";

import { createPool } from "mysql2/promise";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

declare global {
  var mysqlPool: ReturnType<typeof createPool> | undefined;
}

export function getDb() {
  if (globalThis.mysqlPool) {
    return globalThis.mysqlPool;
  }

  const port = Number(process.env.MYSQL_PORT ?? "3306");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MYSQL_PORT must be a valid port number");
  }

  const pool = createPool({
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port,
    user: requiredEnv("MYSQL_USER"),
    password: requiredEnv("MYSQL_PASSWORD"),
    database: process.env.MYSQL_DATABASE ?? "crud_db",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  if (process.env.NODE_ENV !== "production") {
    globalThis.mysqlPool = pool;
  }

  return pool;
}
