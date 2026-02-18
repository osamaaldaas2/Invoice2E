import { createAdminClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError, NotFoundError } from '@/lib/errors';
import type { InvoiceConversion } from '@/types';
import { camelToSnakeKeys, snakeToCamelKeys } from '@/lib/database-helpers';
import { CreateConversionData, UpdateConversionData } from './types';

export class ConversionService {
  private getSupabase() {
    return createAdminClient();
  }

  async createConversion(data: CreateConversionData): Promise<InvoiceConversion> {
    const supabase = this.getSupabase();
    const snakeData = camelToSnakeKeys(data);

    const { data: conversion, error } = await supabase
      .from('invoice_conversions')
      .insert([snakeData])
      .select()
      .single();

    if (error) {
      logger.error('Failed to create conversion', { error: error.message });
      throw new AppError('DB_ERROR', 'Failed to save conversion', 500);
    }

    return snakeToCamelKeys(conversion) as InvoiceConversion;
  }

  async updateConversion(
    conversionId: string,
    data: UpdateConversionData
  ): Promise<InvoiceConversion> {
    const supabase = this.getSupabase();
    const snakeData = camelToSnakeKeys(data);

    const { data: conversion, error } = await supabase
      .from('invoice_conversions')
      .update(snakeData)
      .eq('id', conversionId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update conversion', { conversionId, error: error.message });
      throw new AppError('DB_ERROR', 'Failed to update conversion', 500);
    }

    return snakeToCamelKeys(conversion) as InvoiceConversion;
  }

  async getConversionById(conversionId: string): Promise<InvoiceConversion> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('invoice_conversions')
      .select('*')
      .eq('id', conversionId)
      .single();

    if (error) {
      logger.error('Failed to get conversion', { conversionId, error: error.message });
      throw new NotFoundError('Conversion not found');
    }

    return snakeToCamelKeys(data) as InvoiceConversion;
  }

  async getUserConversions(userId: string, limit: number = 10): Promise<InvoiceConversion[]> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('invoice_conversions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Failed to get conversions', { userId, error: error.message });
      throw new AppError('DB_ERROR', 'Failed to fetch conversions', 500);
    }

    return (data ?? []).map(
      (item: Record<string, unknown>) => snakeToCamelKeys(item) as InvoiceConversion
    );
  }
}

export const conversionService = new ConversionService();
