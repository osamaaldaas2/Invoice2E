/**
 * API Keys module barrel export.
 * B2B programmatic access with scope-based authorization.
 */

export { ApiKeyService, ApiKeyError } from './api-keys';
export { authenticateApiKey, isApiKeyContext } from './middleware';
export type {
  ApiKey,
  ApiKeyScope,
  ApiKeyContext,
  ApiKeyResponse,
  ApiKeyCreatedResponse,
  CreateApiKeyRequest,
} from './types';
export { VALID_SCOPES, API_KEY_PREFIX } from './types';
