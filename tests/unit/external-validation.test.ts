import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { XRechnungValidator } from '@/services/xrechnung/validator';

describe('XRechnungValidator.validateExternal', () => {
  let validator: XRechnungValidator;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    validator = new XRechnungValidator();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return ran=false when ENABLE_EXTERNAL_VALIDATION is not set', async () => {
    delete process.env.ENABLE_EXTERNAL_VALIDATION;
    const result = await validator.validateExternal('/tmp/test.xml');
    expect(result.ran).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('should return ran=false when ENABLE_EXTERNAL_VALIDATION is "false"', async () => {
    process.env.ENABLE_EXTERNAL_VALIDATION = 'false';
    const result = await validator.validateExternal('/tmp/test.xml');
    expect(result.ran).toBe(false);
  });

  it('should return error when JAR path is not set', async () => {
    process.env.ENABLE_EXTERNAL_VALIDATION = 'true';
    process.env.KOSIT_VALIDATOR_JAR = '';
    const result = await validator.validateExternal('/tmp/test.xml');
    expect(result.ran).toBe(false);
    expect(result.error).toContain('KOSIT_VALIDATOR_JAR');
  });

  it('should return error when JAR file does not exist', async () => {
    process.env.ENABLE_EXTERNAL_VALIDATION = 'true';
    process.env.KOSIT_VALIDATOR_JAR = '/nonexistent/validator.jar';
    const result = await validator.validateExternal('/tmp/test.xml');
    expect(result.ran).toBe(false);
    expect(result.error).toContain('KOSIT_VALIDATOR_JAR');
  });

  it('should return error when scenarios XML is missing', async () => {
    process.env.ENABLE_EXTERNAL_VALIDATION = 'true';
    // Create a temporary file to satisfy JAR check
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const tmpJar = path.join(os.tmpdir(), 'test-validator.jar');
    fs.writeFileSync(tmpJar, 'fake jar');

    process.env.KOSIT_VALIDATOR_JAR = tmpJar;
    process.env.KOSIT_SCENARIOS_XML = '';

    const result = await validator.validateExternal('/tmp/test.xml');
    expect(result.ran).toBe(false);
    expect(result.error).toContain('KOSIT_SCENARIOS_XML');

    fs.unlinkSync(tmpJar);
  });

  it('should return error when XML file does not exist', async () => {
    process.env.ENABLE_EXTERNAL_VALIDATION = 'true';
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');

    const tmpJar = path.join(os.tmpdir(), 'test-validator.jar');
    const tmpScenarios = path.join(os.tmpdir(), 'test-scenarios.xml');
    fs.writeFileSync(tmpJar, 'fake jar');
    fs.writeFileSync(tmpScenarios, '<scenarios/>');

    process.env.KOSIT_VALIDATOR_JAR = tmpJar;
    process.env.KOSIT_SCENARIOS_XML = tmpScenarios;

    const result = await validator.validateExternal('/nonexistent/invoice.xml');
    expect(result.ran).toBe(false);
    expect(result.error).toContain('XML file not found');

    fs.unlinkSync(tmpJar);
    fs.unlinkSync(tmpScenarios);
  });

  // Note: Tests for cleanup behavior (rmSync/unlinkSync) are verified through:
  // 1. Code review of finally blocks in validator.ts and xrechnung.service.ts
  // 2. Integration/manual tests with ENABLE_EXTERNAL_VALIDATION=true
  // 3. Monitoring /tmp directory for leaked files
  //
  // Direct unit testing of fs module cleanup is challenging in ESM due to
  // spying limitations. The implementation uses try/finally blocks to ensure
  // cleanup always runs, even on errors/timeouts.
});
