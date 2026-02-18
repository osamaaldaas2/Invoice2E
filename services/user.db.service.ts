import { createAdminClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError, NotFoundError } from '@/lib/errors';
import type { User } from '@/types';
import { camelToSnakeKeys, snakeToCamelKeys } from '@/lib/database-helpers';

export type CreateUserData = {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
};

export type UpdateUserData = {
  firstName?: string;
  lastName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  taxId?: string;
  language?: string;
};

export class UserDatabaseService {
  private getSupabase() {
    return createAdminClient();
  }

  async createUser(data: CreateUserData): Promise<User> {
    const supabase = this.getSupabase();
    const snakeData = camelToSnakeKeys(data);

    const { data: user, error } = await supabase
      .from('users')
      .insert([snakeData])
      .select()
      .single();

    if (error) {
      logger.error('Failed to create user', { error: error.message });
      throw new AppError('DB_ERROR', 'Failed to create user', 500);
    }

    return snakeToCamelKeys(user) as User;
  }

  async getUserById(userId: string): Promise<User> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();

    if (error) {
      logger.error('Failed to get user', { userId, error: error.message });
      throw new NotFoundError('User not found');
    }

    return snakeToCamelKeys(data) as User;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase.from('users').select('*').eq('email', email).single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to get user by email', { email, error: error.message });
      throw new AppError('DB_ERROR', 'Database query failed', 500);
    }

    return snakeToCamelKeys(data) as User;
  }

  async updateUser(userId: string, data: UpdateUserData): Promise<User> {
    const supabase = this.getSupabase();
    const snakeData = camelToSnakeKeys(data);

    const { data: user, error } = await supabase
      .from('users')
      .update(snakeData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update user', { userId, error: error.message });
      throw new AppError('DB_ERROR', 'Failed to update user', 500);
    }

    return snakeToCamelKeys(user) as User;
  }
}

export const userDbService = new UserDatabaseService();
