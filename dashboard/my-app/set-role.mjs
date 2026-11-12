import { createPool } from "mysql2/promise";

const [rawEmail, role] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();

if (
  !email ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  !["office", "guard"].includes(role)
) {
  console.error("Usage: npm run set-role -- <email> <office|guard>");
  process.exitCode = 1;
} else {
  const port = Number(process.env.MYSQL_PORT ?? "3306");
  if (
    !process.env.MYSQL_USER ||
    process.env.MYSQL_PASSWORD === undefined ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    console.error("Configure MYSQL_USER, MYSQL_PASSWORD, and a valid MYSQL_PORT in .env.");
    process.exitCode = 1;
  } else {
    const pool = createPool({
      host: process.env.MYSQL_HOST ?? "127.0.0.1",
      port,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE ?? "crud_db",
      waitForConnections: true,
      connectionLimit: 1,
    });

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_users (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(254) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          role ENUM('office', 'guard') NOT NULL DEFAULT 'guard',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      try {
        await pool.query(
          "ALTER TABLE auth_users ADD COLUMN role ENUM('office', 'guard') NOT NULL DEFAULT 'guard' AFTER password_hash",
        );
      } catch (error) {
        if (
          typeof error !== "object" ||
          error === null ||
          !("errno" in error) ||
          error.errno !== 1060
        ) {
          throw error;
        }
      }

      const [users] = await pool.execute(
        "SELECT id FROM auth_users WHERE email = ? LIMIT 1",
        [email],
      );
      if (users.length === 0) {
        throw new Error(`No existing account was found for ${email}.`);
      }

      await pool.execute("UPDATE auth_users SET role = ? WHERE email = ?", [
        role,
        email,
      ]);
      console.log(`Assigned role "${role}" to ${email}.`);
    } catch (error) {
      console.error("Could not assign the account role:", error);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }
}
