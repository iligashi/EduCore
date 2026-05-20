import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { env } from "../../config/env.js";
import { execute, rows, withTransaction } from "../../database/mysql.js";
import { HttpError } from "../../utils/http-error.js";
import type { Role } from "../../utils/roles.js";

export interface DbUser {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: Role;
  status: "active" | "inactive";
  created_at: string;
}

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: string;
  createdAt: string;
}

function publicUser(user: DbUser): PublicUser {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.created_at
  };
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function durationToMs(value: string) {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  return amount * multipliers[unit as keyof typeof multipliers];
}

function signAccessToken(user: DbUser) {
  return jwt.sign(
    {
      email: user.email,
      role: user.role,
      fullName: user.full_name
    },
    env.JWT_ACCESS_SECRET,
    {
      subject: user.id,
      expiresIn: env.JWT_ACCESS_EXPIRES_IN
    } as jwt.SignOptions
  );
}

async function issueTokens(user: DbUser) {
  const accessToken = signAccessToken(user);
  const refreshToken = crypto.randomBytes(64).toString("hex");
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + durationToMs(env.JWT_REFRESH_EXPIRES_IN));

  await execute(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES (:id, :userId, :tokenHash, :expiresAt)`,
    {
      id: uuid(),
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt
    }
  );

  return {
    user: publicUser(user),
    accessToken,
    refreshToken
  };
}

export async function registerUser(input: {
  fullName: string;
  email: string;
  password: string;
  role: Role;
  studentProfile?: {
    studentCode?: string;
    department: string;
    semester: number;
  };
  instructorProfile?: {
    specialization: string;
  };
}) {
  const userId = uuid();
  const passwordHash = await bcrypt.hash(input.password, 12);

  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO users (id, full_name, email, password_hash, role)
       VALUES (:id, :fullName, :email, :passwordHash, :role)`,
      {
        id: userId,
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        passwordHash,
        role: input.role
      }
    );

    if (input.role === "student") {
      await connection.execute(
        `INSERT INTO students (id, user_id, student_code, department, semester)
         VALUES (:id, :userId, :studentCode, :department, :semester)`,
        {
          id: uuid(),
          userId,
          studentCode: input.studentProfile?.studentCode ?? `STU-${Date.now()}`,
          department: input.studentProfile?.department ?? "General",
          semester: input.studentProfile?.semester ?? 1
        }
      );
    }

    if (input.role === "instructor") {
      await connection.execute(
        `INSERT INTO instructors (id, user_id, specialization)
         VALUES (:id, :userId, :specialization)`,
        {
          id: uuid(),
          userId,
          specialization: input.instructorProfile?.specialization ?? "General Education"
        }
      );
    }
  });

  const [user] = await rows<DbUser>("SELECT * FROM users WHERE id = :id", { id: userId });
  return issueTokens(user);
}

export async function loginUser(email: string, password: string) {
  const [user] = await rows<DbUser>("SELECT * FROM users WHERE email = :email", { email: email.toLowerCase() });
  if (!user || user.status !== "active") {
    throw new HttpError(401, "Invalid email or password");
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    throw new HttpError(401, "Invalid email or password");
  }

  return issueTokens(user);
}

export async function refreshSession(refreshToken: string | undefined) {
  if (!refreshToken) {
    throw new HttpError(401, "Missing refresh token");
  }

  const tokenHash = hashToken(refreshToken);
  const [record] = await rows<DbUser & { token_id: string }>(
    `SELECT users.*, refresh_tokens.id AS token_id
     FROM refresh_tokens
     JOIN users ON users.id = refresh_tokens.user_id
     WHERE refresh_tokens.token_hash = :tokenHash
       AND refresh_tokens.revoked_at IS NULL
       AND refresh_tokens.expires_at > NOW()
       AND users.status = 'active'`,
    { tokenHash }
  );

  if (!record) {
    throw new HttpError(401, "Invalid refresh token");
  }

  await execute("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = :id", { id: record.token_id });
  return issueTokens(record);
}

export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;
  await execute("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = :tokenHash", {
    tokenHash: hashToken(refreshToken)
  });
}

export async function getUserById(id: string) {
  const [user] = await rows<DbUser>("SELECT * FROM users WHERE id = :id", { id });
  if (!user) {
    throw new HttpError(404, "User not found");
  }
  return publicUser(user);
}

