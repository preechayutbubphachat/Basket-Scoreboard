export type DatabaseConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

export function getDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  return {
    host: env.DATABASE_HOST ?? "localhost",
    port: Number(env.DATABASE_PORT ?? 3306),
    database: env.DATABASE_NAME ?? "basketball_scoreboard",
    user: env.DATABASE_USER ?? "root",
    password: env.DATABASE_PASSWORD ?? ""
  };
}

export function hasDatabaseEnv(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(
    env.DATABASE_HOST &&
      env.DATABASE_PORT &&
      env.DATABASE_NAME &&
      env.DATABASE_USER &&
      env.DATABASE_PASSWORD
  );
}
