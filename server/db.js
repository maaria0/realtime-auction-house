const { Pool } = require("pg");

function buildPoolConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.PGSSLMODE === "require"
          ? { rejectUnauthorized: false }
          : undefined,
    };
  }

  const host = process.env.PGHOST;
  const database = process.env.PGDATABASE;

  if (!host || !database) {
    throw new Error(
      "Database configuration missing. Provide DATABASE_URL or PGHOST/PGDATABASE"
    );
  }

  return {
    host,
    database,
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl:
      process.env.PGSSLMODE === "require"
        ? { rejectUnauthorized: false }
        : undefined,
  };
}

const pool = new Pool(buildPoolConfig());

pool.on("error", (err) => {
  console.error("Unexpected database error", err);
});

module.exports = pool;
