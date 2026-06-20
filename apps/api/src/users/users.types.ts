export type UserRole = 'admin' | 'user';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
