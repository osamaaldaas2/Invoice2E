import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { ValidationError } from '@/lib/errors';
import { validateForXRechnung } from '@/validation/validation-pipeline';
import { logger } from '@/lib/logger';
import type { XRechnungInvoiceData } from './types';
import type { ValidationResult } from '@/validation/validation-result';

const execFileAsync = promisify(execFile);

export interface ExternalValidationResult {
  ran: boolean;
  valid?: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
}

/**
 * Lightweight post-generation XML structure validation.
 * Checks well-formedness, required root element/namespaces, and key CII elements.
 * This is NOT a full XSD validation — KoSIT handles that.
 */
export function validateXmlStructure(xml: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!xml || xml.trim().length === 0) {
    errors.push('XML content is empty');
    return { valid: false, errors };
  }

  // Check XML declaration
  if (!xml.trimStart().startsWith('<?xml')) {
    errors.push('Missing XML declaration (<?xml version="1.0" encoding="UTF-8"?>)');
  }

  // Check well-formedness: basic tag balance (lightweight heuristic)
  // Use bounded character classes to avoid ReDoS on malformed input
  const openTags = (xml.match(/<[a-zA-Z][^/> ]{0,200}/g) || []).length;
  const closeTags = (xml.match(/<\/[a-zA-Z][^>]{0,200}/g) || []).length;
  const selfClosing = (xml.match(/<[^>]{1,200}\/>/g) || []).length;
  if (Math.abs(openTags - closeTags - selfClosing) > 2) {
    errors.push('XML appears malformed: mismatched open/close tags');
  }

  // Check required root element
  if (!xml.includes('CrossIndustryInvoice')) {
    errors.push('Missing required root element: CrossIndustryInvoice');
  }

  // Check required namespaces
  const requiredNamespaces = [
    {
      ns: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
      label: 'CII namespace (rsm)',
    },
    {
      ns: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
      label: 'RAM namespace',
    },
  ];
  for (const { ns, label } of requiredNamespaces) {
    if (!xml.includes(ns)) {
      errors.push(`Missing required namespace: ${label}`);
    }
  }

  // Check key CII elements
  const requiredElements = [
    'ExchangedDocumentContext',
    'ExchangedDocument',
    'SupplyChainTradeTransaction',
  ];
  for (const element of requiredElements) {
    if (!xml.includes(element)) {
      errors.push(`Missing required element: ${element}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export class XRechnungValidator {
  /**
   * Validate invoice data using the full EN 16931 validation pipeline.
   * Returns structured result; throws ValidationError if blocking errors exist.
   */
  validateInvoiceData(data: XRechnungInvoiceData): ValidationResult {
    const result = validateForXRechnung(data);

    if (!result.valid) {
      // Build a human-readable error string from structured errors
      const errorMessages = result.errors.map((e) => `[${e.ruleId}] ${e.message}`);
      throw new ValidationError('XRechnung validation failed:\n' + errorMessages.join('\n'), {
        structuredErrors: result.errors as unknown as Record<string, unknown>,
      });
    }

    return result;
  }

  /**
   * Validate without throwing — returns the full structured result.
   * Useful when the caller wants to collect warnings without failing.
   */
  validateInvoiceDataSafe(data: XRechnungInvoiceData): ValidationResult {
    return validateForXRechnung(data);
  }

  /**
   * Run external KoSIT/validator CLI against a generated XML file.
   * Only runs when ENABLE_EXTERNAL_VALIDATION=true.
   *
   * Expects either:
   *   - KOSIT_VALIDATOR_JAR: path to validationtool-*-standalone.jar
   *   - KOSIT_SCENARIOS_XML: path to scenarios.xml config
   *
   * Returns { ran: false } when disabled or when the tool is missing.
   * Never throws — validation failures are returned in the result.
   */
  async validateExternal(xmlPath: string): Promise<ExternalValidationResult> {
    if (process.env.ENABLE_EXTERNAL_VALIDATION !== 'true') {
      return { ran: false };
    }

    const jarPath = process.env.KOSIT_VALIDATOR_JAR || '';
    const scenariosPath = process.env.KOSIT_SCENARIOS_XML || '';

    if (!jarPath || !fs.existsSync(jarPath)) {
      logger.warn('External validation enabled but KOSIT_VALIDATOR_JAR not found', { jarPath });
      return { ran: false, error: 'KOSIT_VALIDATOR_JAR not found or not set' };
    }

    if (!scenariosPath || !fs.existsSync(scenariosPath)) {
      logger.warn('External validation enabled but KOSIT_SCENARIOS_XML not found', {
        scenariosPath,
      });
      return { ran: false, error: 'KOSIT_SCENARIOS_XML not found or not set' };
    }

    if (!fs.existsSync(xmlPath)) {
      return { ran: false, error: `XML file not found: ${xmlPath}` };
    }

    let reportDir: string | undefined;
    try {
      reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kosit-'));
      const { stdout, stderr } = await execFileAsync(
        'java',
        [
          '--enable-native-access=ALL-UNNAMED', // Suppress Java 21+ native access warnings
          '-jar',
          jarPath,
          '-s',
          scenariosPath,
          '-o',
          reportDir,
          xmlPath,
        ],
        { timeout: 60_000 }
      );

      // KoSIT validator exits 0 for valid, non-zero for invalid
      logger.info('External validation completed', { xmlPath, reportDir });

      const isValid = !stderr?.includes('NOT VALID') && !stdout?.includes('NOT VALID');

      return {
        ran: true,
        valid: isValid,
        stdout: stdout?.slice(0, 2000),
        stderr: stderr?.slice(0, 2000),
      };
    } catch (err: unknown) {
      // When validator exits with non-zero (validation failure), execFileAsync throws
      // but the error object contains stdout/stderr with actual validation details
      const execError = err as { message: string; stdout?: string; stderr?: string; code?: number };
      const message = execError.message || String(err);
      const stdout = execError.stdout || '';
      const stderr = execError.stderr || '';

      // Try to read the actual validation report for detailed errors
      let reportContent = '';
      let reportFiles: string[] = [];
      if (reportDir) {
        try {
          // List all files in report directory to see what was generated
          reportFiles = fs.readdirSync(reportDir);

          // KoSIT generates report.xml with detailed validation results
          const reportPath = path.join(reportDir, 'report.xml');
          if (fs.existsSync(reportPath)) {
            reportContent = fs.readFileSync(reportPath, 'utf8');
            // Extract key validation info (limit to first 10000 chars)
            reportContent = reportContent.slice(0, 10000);
          }
        } catch (reportErr) {
          logger.warn('Could not read validation report', { reportErr });
        }
      }

      logger.warn('External validation error', {
        xmlPath,
        error: message,
        stdout: stdout?.slice(0, 3000), // Increased to see full results
        stderr: stderr?.slice(0, 1000),
        reportFiles,
        reportSnippet: reportContent?.slice(0, 2000),
      });

      // Extract validation result from stdout/stderr even on error
      const isInvalid =
        stderr?.includes('NOT VALID') ||
        stdout?.includes('NOT VALID') ||
        reportContent?.includes('INVALID') ||
        reportContent?.includes('notAcceptable');
      const errorDetails = isInvalid
        ? 'External validator reported invalid XML'
        : `External validator error: ${message}`;

      return {
        ran: true,
        valid: false,
        stdout: stdout?.slice(0, 2000),
        stderr: stderr?.slice(0, 2000),
        error: errorDetails,
      };
    } finally {
      // Cleanup report directory — never fail the validation if cleanup fails
      if (reportDir) {
        try {
          fs.rmSync(reportDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          logger.warn('Failed to cleanup KOSIT report directory', {
            reportDir,
            error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          });
        }
      }
    }
  }
}

export const xrechnungValidator = new XRechnungValidator();
