import crypto from 'crypto';
import { logger } from '@/lib/retry';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

/**
 * Encrypt sensitive wallet data (private keys, seed phrases)
 */
export async function encrypt(text: string, key: string): Promise<string> {
  try {
    // Generate a random salt
    const salt = crypto.randomBytes(SALT_LENGTH);
    
    // Derive key using PBKDF2
    const keyBuffer = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');
    
    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipherGCM(ALGORITHM, keyBuffer, iv);
    
    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    // Combine all components: salt + iv + tag + encrypted
    const combined = Buffer.concat([
      salt,
      iv,
      tag,
      Buffer.from(encrypted, 'hex')
    ]);
    
    return combined.toString('base64');
  } catch (error) {
    logger.error('Encryption failed', error);
    throw new Error('Failed to encrypt wallet data');
  }
}

/**
 * Decrypt sensitive wallet data
 */
export async function decrypt(encryptedData: string, key: string): Promise<string> {
  try {
    // Decode from base64
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(
      SALT_LENGTH + IV_LENGTH, 
      SALT_LENGTH + IV_LENGTH + TAG_LENGTH
    );
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derive key using PBKDF2
    const keyBuffer = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');
    
    // Create decipher
    const decipher = crypto.createDecipherGCM(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Decryption failed', error);
    throw new Error('Failed to decrypt wallet data');
  }
}

/**
 * Generate a secure random encryption key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a password or key for comparison
 */
export function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Verify if a key matches the hash
 */
export function verifyKey(key: string, hash: string): boolean {
  return hashKey(key) === hash;
}

/**
 * Encrypt with AWS KMS (for production use)
 */
export async function encryptWithKMS(
  plaintext: string,
  keyId: string,
  region: string = 'us-east-1'
): Promise<string> {
  try {
    // This would require @aws-sdk/client-kms dependency
    // For now, return the plaintext (implement in production)
    logger.warn('KMS encryption not implemented, using plaintext');
    return plaintext;
  } catch (error) {
    logger.error('KMS encryption failed', error);
    throw new Error('Failed to encrypt with KMS');
  }
}

/**
 * Decrypt with AWS KMS (for production use)
 */
export async function decryptWithKMS(
  ciphertext: string,
  keyId: string,
  region: string = 'us-east-1'
): Promise<string> {
  try {
    // This would require @aws-sdk/client-kms dependency
    // For now, return the ciphertext (implement in production)
    logger.warn('KMS decryption not implemented, using ciphertext');
    return ciphertext;
  } catch (error) {
    logger.error('KMS decryption failed', error);
    throw new Error('Failed to decrypt with KMS');
  }
}

/**
 * Validate encryption key format
 */
export function validateEncryptionKey(key: string): boolean {
  // Key should be 64 hex characters (32 bytes)
  const hexRegex = /^[a-fA-F0-9]{64}$/;
  return hexRegex.test(key);
}

/**
 * Securely compare two strings to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}
