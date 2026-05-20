import type { Role } from "../utils/roles.js";

declare global {
  namespace Express {
    interface UserClaims {
      id: string;
      email: string;
      role: Role;
      fullName: string;
    }

    interface Request {
      user?: UserClaims;
    }
  }
}

export {};

