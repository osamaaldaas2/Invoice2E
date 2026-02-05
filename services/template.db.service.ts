/**
 * Template Database Service
 * Manages invoice templates for users
 * 
 * @module services/template.db.service
 */

import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';

export interface TemplateData {
    name: string;
    description?: string;
    // Seller
    sellerName?: string;
    sellerEmail?: string;
    sellerPhone?: string;
    sellerTaxId?: string;
    sellerIban?: string;
    sellerBic?: string;
    sellerAddressStreet?: string;
    sellerAddressPostalCode?: string;
    sellerAddressCity?: string;
    sellerAddressCountry?: string;
    sellerContactName?: string;
    // Buyer
    buyerName?: string;
    buyerEmail?: string;
    buyerAddressStreet?: string;
    buyerAddressPostalCode?: string;
    buyerAddressCity?: string;
    buyerAddressCountry?: string;
    buyerReference?: string;
    // Payment
    paymentTerms?: string;
    paymentInstructions?: string;
}

export interface Template extends TemplateData {
    id: string;
    userId: string;
    isDefault: boolean;
    usageCount: number;
    createdAt: string;
    updatedAt: string;
}

export class TemplateDBService {
    /**
     * Save a new template
     */
    async saveTemplate(userId: string, data: TemplateData): Promise<Template> {
        logger.info('Saving template', { userId, name: data.name });

        const supabase = createServerClient();

        const insertData = {
            user_id: userId,
            name: data.name,
            description: data.description,
            seller_name: data.sellerName,
            seller_email: data.sellerEmail,
            seller_phone: data.sellerPhone,
            seller_tax_id: data.sellerTaxId,
            seller_iban: data.sellerIban,
            seller_bic: data.sellerBic,
            seller_address_street: data.sellerAddressStreet,
            seller_address_postal_code: data.sellerAddressPostalCode,
            seller_address_city: data.sellerAddressCity,
            seller_address_country: data.sellerAddressCountry || 'DE',
            seller_contact_name: data.sellerContactName,
            buyer_name: data.buyerName,
            buyer_email: data.buyerEmail,
            buyer_address_street: data.buyerAddressStreet,
            buyer_address_postal_code: data.buyerAddressPostalCode,
            buyer_address_city: data.buyerAddressCity,
            buyer_address_country: data.buyerAddressCountry || 'DE',
            buyer_reference: data.buyerReference,
            payment_terms: data.paymentTerms,
            payment_instructions: data.paymentInstructions,
        };

        const { data: template, error } = await supabase
            .from('user_templates')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            logger.error('Failed to save template', { error });
            throw new Error(`Failed to save template: ${error.message}`);
        }

        return this.mapToTemplate(template);
    }

    /**
     * List all templates for a user
     */
    async listTemplates(userId: string): Promise<Template[]> {
        logger.info('Listing templates', { userId });

        const supabase = createServerClient();

        const { data: templates, error } = await supabase
            .from('user_templates')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('Failed to list templates', { error });
            throw new Error(`Failed to list templates: ${error.message}`);
        }

        return templates.map(this.mapToTemplate);
    }

    /**
     * Get a single template by ID
     */
    async getTemplate(userId: string, templateId: string): Promise<Template | null> {
        logger.info('Getting template', { userId, templateId });

        const supabase = createServerClient();

        const { data: template, error } = await supabase
            .from('user_templates')
            .select('*')
            .eq('id', templateId)
            .eq('user_id', userId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null; // Not found
            }
            logger.error('Failed to get template', { error });
            throw new Error(`Failed to get template: ${error.message}`);
        }

        return this.mapToTemplate(template);
    }

    /**
     * Update a template
     */
    async updateTemplate(userId: string, templateId: string, data: Partial<TemplateData>): Promise<Template> {
        logger.info('Updating template', { userId, templateId });

        const supabase = createServerClient();

        const updateData: Record<string, unknown> = {};

        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.sellerName !== undefined) updateData.seller_name = data.sellerName;
        if (data.sellerEmail !== undefined) updateData.seller_email = data.sellerEmail;
        if (data.sellerPhone !== undefined) updateData.seller_phone = data.sellerPhone;
        if (data.sellerTaxId !== undefined) updateData.seller_tax_id = data.sellerTaxId;
        if (data.sellerIban !== undefined) updateData.seller_iban = data.sellerIban;
        if (data.sellerBic !== undefined) updateData.seller_bic = data.sellerBic;
        if (data.sellerAddressStreet !== undefined) updateData.seller_address_street = data.sellerAddressStreet;
        if (data.sellerAddressPostalCode !== undefined) updateData.seller_address_postal_code = data.sellerAddressPostalCode;
        if (data.sellerAddressCity !== undefined) updateData.seller_address_city = data.sellerAddressCity;
        if (data.sellerAddressCountry !== undefined) updateData.seller_address_country = data.sellerAddressCountry;
        if (data.sellerContactName !== undefined) updateData.seller_contact_name = data.sellerContactName;
        if (data.buyerName !== undefined) updateData.buyer_name = data.buyerName;
        if (data.buyerEmail !== undefined) updateData.buyer_email = data.buyerEmail;
        if (data.buyerAddressStreet !== undefined) updateData.buyer_address_street = data.buyerAddressStreet;
        if (data.buyerAddressPostalCode !== undefined) updateData.buyer_address_postal_code = data.buyerAddressPostalCode;
        if (data.buyerAddressCity !== undefined) updateData.buyer_address_city = data.buyerAddressCity;
        if (data.buyerAddressCountry !== undefined) updateData.buyer_address_country = data.buyerAddressCountry;
        if (data.buyerReference !== undefined) updateData.buyer_reference = data.buyerReference;
        if (data.paymentTerms !== undefined) updateData.payment_terms = data.paymentTerms;
        if (data.paymentInstructions !== undefined) updateData.payment_instructions = data.paymentInstructions;

        const { data: template, error } = await supabase
            .from('user_templates')
            .update(updateData)
            .eq('id', templateId)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            logger.error('Failed to update template', { error });
            throw new Error(`Failed to update template: ${error.message}`);
        }

        return this.mapToTemplate(template);
    }

    /**
     * Delete a template
     */
    async deleteTemplate(userId: string, templateId: string): Promise<void> {
        logger.info('Deleting template', { userId, templateId });

        const supabase = createServerClient();

        const { error } = await supabase
            .from('user_templates')
            .delete()
            .eq('id', templateId)
            .eq('user_id', userId);

        if (error) {
            logger.error('Failed to delete template', { error });
            throw new Error(`Failed to delete template: ${error.message}`);
        }
    }

    /**
     * Increment usage count for a template
     */
    async incrementUsageCount(templateId: string): Promise<void> {
        const supabase = createServerClient();

        const { error } = await supabase.rpc('increment_template_usage', {
            p_template_id: templateId
        });

        if (error) {
            // Non-critical, just log warning
            logger.warn('Failed to increment template usage', { error });
        }
    }

    /**
     * Set a template as default
     */
    async setDefaultTemplate(userId: string, templateId: string): Promise<void> {
        const supabase = createServerClient();

        // First, unset any existing default
        await supabase
            .from('user_templates')
            .update({ is_default: false })
            .eq('user_id', userId);

        // Then set the new default
        const { error } = await supabase
            .from('user_templates')
            .update({ is_default: true })
            .eq('id', templateId)
            .eq('user_id', userId);

        if (error) {
            logger.error('Failed to set default template', { error });
            throw new Error(`Failed to set default template: ${error.message}`);
        }
    }

    /**
     * Get default template for a user
     */
    async getDefaultTemplate(userId: string): Promise<Template | null> {
        const supabase = createServerClient();

        const { data: template, error } = await supabase
            .from('user_templates')
            .select('*')
            .eq('user_id', userId)
            .eq('is_default', true)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            logger.error('Failed to get default template', { error });
            throw new Error(`Failed to get default template: ${error.message}`);
        }

        return this.mapToTemplate(template);
    }

    /**
     * Map database row to Template interface
     */
    private mapToTemplate(row: Record<string, unknown>): Template {
        return {
            id: row.id as string,
            userId: row.user_id as string,
            name: row.name as string,
            description: row.description as string | undefined,
            sellerName: row.seller_name as string | undefined,
            sellerEmail: row.seller_email as string | undefined,
            sellerPhone: row.seller_phone as string | undefined,
            sellerTaxId: row.seller_tax_id as string | undefined,
            sellerIban: row.seller_iban as string | undefined,
            sellerBic: row.seller_bic as string | undefined,
            sellerAddressStreet: row.seller_address_street as string | undefined,
            sellerAddressPostalCode: row.seller_address_postal_code as string | undefined,
            sellerAddressCity: row.seller_address_city as string | undefined,
            sellerAddressCountry: row.seller_address_country as string | undefined,
            sellerContactName: row.seller_contact_name as string | undefined,
            buyerName: row.buyer_name as string | undefined,
            buyerEmail: row.buyer_email as string | undefined,
            buyerAddressStreet: row.buyer_address_street as string | undefined,
            buyerAddressPostalCode: row.buyer_address_postal_code as string | undefined,
            buyerAddressCity: row.buyer_address_city as string | undefined,
            buyerAddressCountry: row.buyer_address_country as string | undefined,
            buyerReference: row.buyer_reference as string | undefined,
            paymentTerms: row.payment_terms as string | undefined,
            paymentInstructions: row.payment_instructions as string | undefined,
            isDefault: row.is_default as boolean,
            usageCount: row.usage_count as number,
            createdAt: row.created_at as string,
            updatedAt: row.updated_at as string,
        };
    }
}

// Export singleton instance
export const templateDBService = new TemplateDBService();
