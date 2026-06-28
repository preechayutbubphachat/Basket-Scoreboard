import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Pool } from "mysql2/promise";

const roles = [
  { key: "ADMIN", name: "Administrator" },
  { key: "SCORER", name: "Scorer" },
  { key: "REFEREE", name: "Referee" },
  { key: "VIEWER", name: "Viewer" }
] as const;

const permissions = [
  "match.create",
  "match.read",
  "match.score.operate",
  "match.correction.request",
  "match.correction.apply",
  "match.correction.reject",
  "match.audit.read",
  "public.scoreboard.read"
] as const;

const rolePermissionMap: Record<(typeof roles)[number]["key"], readonly string[]> = {
  ADMIN: permissions,
  SCORER: ["match.read", "match.score.operate", "match.correction.request", "public.scoreboard.read"],
  REFEREE: ["match.read", "match.score.operate", "match.correction.request", "public.scoreboard.read"],
  VIEWER: ["match.read", "public.scoreboard.read"]
};

export async function seedAuth(pool: Pool) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const role of roles) {
      await connection.query(
        "INSERT IGNORE INTO roles (role_id, role_key, role_name) VALUES (?, ?, ?)",
        [randomUUID(), role.key, role.name]
      );
    }

    for (const permission of permissions) {
      await connection.query(
        "INSERT IGNORE INTO permissions (permission_id, permission_key, description) VALUES (?, ?, ?)",
        [randomUUID(), permission, permission]
      );
    }

    for (const [roleKey, permissionKeys] of Object.entries(rolePermissionMap)) {
      for (const permissionKey of permissionKeys) {
        await connection.query(
          "INSERT IGNORE INTO role_permissions (role_id, permission_id) SELECT r.role_id, p.permission_id FROM roles r INNER JOIN permissions p ON p.permission_key = ? WHERE r.role_key = ?",
          [permissionKey, roleKey]
        );
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function createOrUpdateAdmin(
  pool: Pool,
  input: { email: string; password: string; displayName: string }
) {
  if (process.env.AUTH_BOOTSTRAP_ENABLED !== "true") {
    throw new Error("AUTH_BOOTSTRAP_ENABLED must be true to create an admin");
  }

  if (input.password.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  await seedAuth(pool);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query(
      "INSERT INTO users (user_id, email, display_name, password_hash, status) VALUES (?, ?, ?, ?, 'ACTIVE') ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), password_hash = VALUES(password_hash), status = 'ACTIVE'",
      [randomUUID(), input.email, input.displayName, passwordHash]
    );
    await connection.query(
      "INSERT IGNORE INTO user_roles (user_id, role_id) SELECT u.user_id, r.role_id FROM users u INNER JOIN roles r ON r.role_key = 'ADMIN' WHERE u.email = ?",
      [input.email]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
