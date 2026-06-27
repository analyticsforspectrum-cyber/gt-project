import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { Customer, CustomerDocument } from './schemas/customer.schema';

@Injectable()
export class CustomersService {
  constructor(@InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>) {}

  // Explicit return type: the inferred lean type is too large for TS to serialize (TS7056).
  async list(): Promise<(Customer & { id: string })[]> {
    // Read-only list: `.lean()` skips hydration; re-attach the `id` virtual the web
    // Customer type keys on (lean drops virtuals).
    const docs = await this.customerModel.find({ active: true }).sort({ name: 1 }).lean().exec();
    return docs.map((d) => ({ ...d, id: String(d._id) })) as unknown as (Customer & { id: string })[];
  }

  async findById(id: string): Promise<Customer> {
    const customer = await this.customerModel.findById(id).exec();
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async create(dto: CreateCustomerDto): Promise<Customer> {
    return this.customerModel.create({
      name: dto.name,
      phone: dto.phone || '',
      address: dto.address || '',
      notes: dto.notes || '',
      active: true
    });
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const customer = await this.customerModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async remove(id: string): Promise<{ ok: true }> {
    const customer = await this.customerModel.findByIdAndUpdate(id, { active: false }, { new: true }).exec();
    if (!customer) throw new NotFoundException('Customer not found');
    return { ok: true };
  }

  async names(): Promise<string[]> {
    const customers = await this.customerModel.find({ active: true }).select('name').sort({ name: 1 }).lean().exec();
    return customers.map((c) => c.name);
  }
}
