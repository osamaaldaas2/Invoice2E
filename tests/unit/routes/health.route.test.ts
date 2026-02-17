import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: loggerMock,
}));

vi.mock('@/lib/constants', () => ({
  APP_VERSION: '1.0.0',
}));

const mockCheckDatabase = vi.hoisted(() => vi.fn());
const mockCheckRedis = vi.hoisted(() => vi.fn());
const mockCheckAIProviders = vi.hoisted(() => vi.fn());
const mockAggregateHealth = vi.hoisted(() => vi.fn());

vi.mock('@/lib/health-check', () => ({
  checkDatabase: mockCheckDatabase,
  checkRedis: mockCheckRedis,
  checkAIProviders: mockCheckAIProviders,
  aggregateHealth: mockAggregateHealth,
}));

vi.mock('@/services/format/GeneratorFactory', () => ({
  GeneratorFactory: {
    getEngineVersions: vi.fn().mockReturnValue([]),
  },
}));

// Import after mocks
import { GET } from '@/app/api/health/route';

function createMockRequest(url = 'http://localhost:3000/api/health'): Request {
  return new Request(url);
}

describe('Health API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('should return ok status when database is healthy', async () => {
      mockCheckDatabase.mockResolvedValue({ status: 'ok' });
      mockCheckRedis.mockResolvedValue({ status: 'not_configured' });
      mockCheckAIProviders.mockReturnValue({ gemini: { status: 'ok' } });
      mockAggregateHealth.mockReturnValue('healthy');

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.version).toBe('1.0.0');
      expect(data.components).toBeDefined();
      expect(data.components.database.status).toBe('ok');
    });

    it('should return degraded status when database has errors', async () => {
      mockCheckDatabase.mockResolvedValue({ status: 'degraded', message: 'Slow' });
      mockCheckRedis.mockResolvedValue({ status: 'not_configured' });
      mockCheckAIProviders.mockReturnValue({});
      mockAggregateHealth.mockReturnValue('degraded');

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('degraded');
    });

    it('should return unhealthy with 503 when components are down', async () => {
      mockCheckDatabase.mockResolvedValue({ status: 'down', message: 'Connection refused' });
      mockCheckRedis.mockResolvedValue({ status: 'down' });
      mockCheckAIProviders.mockReturnValue({});
      mockAggregateHealth.mockReturnValue('unhealthy');

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.status).toBe('unhealthy');
    });

    it('should return error status on exception', async () => {
      mockCheckDatabase.mockRejectedValue(new Error('Connection failed'));
      mockCheckRedis.mockRejectedValue(new Error('Connection failed'));
      mockCheckAIProviders.mockReturnValue({});
      mockAggregateHealth.mockImplementation(() => { throw new Error('boom'); });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.status).toBe('unhealthy');
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('should include timestamp in response', async () => {
      mockCheckDatabase.mockResolvedValue({ status: 'ok' });
      mockCheckRedis.mockResolvedValue({ status: 'not_configured' });
      mockCheckAIProviders.mockReturnValue({});
      mockAggregateHealth.mockReturnValue('healthy');

      const response = await GET();
      const data = await response.json();

      expect(data.timestamp).toBeDefined();
      expect(new Date(data.timestamp).getTime()).not.toBeNaN();
    });

    it('should include memory info in response', async () => {
      mockCheckDatabase.mockResolvedValue({ status: 'ok' });
      mockCheckRedis.mockResolvedValue({ status: 'not_configured' });
      mockCheckAIProviders.mockReturnValue({});
      mockAggregateHealth.mockReturnValue('healthy');

      const response = await GET();
      const data = await response.json();

      expect(data.memory).toBeDefined();
      expect(typeof data.memory.heapUsedMB).toBe('number');
    });
  });
});
