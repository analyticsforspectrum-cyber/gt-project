import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './schemas/user.schema';
import { PublicUser } from './users.types';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly config: ConfigService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSeedAdmin();
  }

  async ensureSeedAdmin(): Promise<void> {
    const email = this.config.getOrThrow<string>('ADMIN_EMAIL').toLowerCase().trim();
    const existing = await this.userModel.findOne({ email }).exec();
    if (existing) return;

    const password = this.config.getOrThrow<string>('ADMIN_PASSWORD');
    const passwordHash = await bcrypt.hash(password, 12);
    await this.userModel.create({
      email,
      name: this.config.get<string>('ADMIN_NAME', 'GDE TORT Admin'),
      passwordHash,
      role: 'admin',
      active: true
    });
  }

  async list(): Promise<PublicUser[]> {
    // `.lean()` skips hydration for this read-only list; map _id->id and the public
    // fields directly (lean drops the `id` virtual toPublicUser relies on).
    const users = await this.userModel.find().sort({ createdAt: -1 }).lean().exec();
    return users.map((u) => ({
      id: String(u._id),
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      passwordChangedAt: u.passwordChangedAt
    }));
  }

  async create(dto: CreateUserDto): Promise<PublicUser> {
    const existing = await this.userModel.findOne({ email: dto.email }).exec();
    if (existing) throw new ConflictException('Email is already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.userModel.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: dto.role || 'user',
      active: true
    });
    return this.toPublicUser(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<PublicUser> {
    const user = await this.userModel.findById(id).select('+passwordHash').exec();
    if (!user) throw new NotFoundException('User not found');

    if (dto.email && dto.email !== user.email) {
      const existing = await this.userModel.findOne({ email: dto.email }).exec();
      if (existing) throw new ConflictException('Email is already registered');
      user.email = dto.email;
    }
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.active !== undefined) user.active = dto.active;
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 12);
      user.passwordChangedAt = new Date();
    }

    await user.save();
    return this.toPublicUser(user);
  }

  async findById(id: string): Promise<PublicUser | null> {
    const user = await this.userModel.findById(id).exec();
    return user ? this.toPublicUser(user) : null;
  }

  async findDocumentByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase().trim() })
      .select('+passwordHash')
      .exec();
  }

  toPublicUser(user: UserDocument): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      passwordChangedAt: user.passwordChangedAt
    };
  }
}
