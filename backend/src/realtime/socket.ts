import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { env } from "../config/env.js";
import { isRole } from "../utils/roles.js";

let io: Server | undefined;

export function setupSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: env.CLIENT_URL,
      credentials: true
    }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== "string") {
      next();
      return;
    }

    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
      if (typeof decoded === "object" && typeof decoded.sub === "string" && isRole(decoded.role)) {
        socket.data.userId = decoded.sub;
        socket.data.role = decoded.role;
      }
      next();
    } catch {
      next();
    }
  });

  io.on("connection", (socket) => {
    if (socket.data.userId) {
      socket.join(`user:${socket.data.userId}`);
    }
    if (socket.data.role) {
      socket.join(`role:${socket.data.role}`);
    }
  });

  return io;
}

export function getIo() {
  return io;
}

