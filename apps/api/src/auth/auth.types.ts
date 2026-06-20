import { UserRole } from '../users/users.types';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
}
