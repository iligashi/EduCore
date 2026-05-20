import mysql, { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { env } from "../config/env.js";

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  dateStrings: true
});

export async function assertMySqlConnection() {
  await pool.query("SELECT 1");
}

export async function rows<T>(sql: string, params: Record<string, unknown> | unknown[] = []) {
  const [result] = await pool.query<RowDataPacket[]>(sql, params as never);
  return result as T[];
}

export async function execute(sql: string, params: Record<string, unknown> | unknown[] = []) {
  const [result] = await pool.execute<ResultSetHeader>(sql, params as never);
  return result;
}

export async function withTransaction<T>(callback: (connection: PoolConnection) => Promise<T>) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
