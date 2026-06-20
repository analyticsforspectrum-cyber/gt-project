import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './auth.types';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService
  ) {}

  async login(dto: LoginDto) {
    const userDocument = await this.usersService.findDocumentByEmailWithPassword(dto.email);
    if (!userDocument || !userDocument.active) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const ok = await bcrypt.compare(dto.password, userDocument.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');

    const user = this.usersService.toPublicUser(userDocument);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role
    };

    return {
      accessToken: this.jwtService.sign(payload),
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '8h'),
      user
    };
  }
}
