export type UserRole = 'admin' | 'user';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  /** Set when the password is changed — used to invalidate JWTs issued earlier. */
  passwordChangedAt?: Date;
}
