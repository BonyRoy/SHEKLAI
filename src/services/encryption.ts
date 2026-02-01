/**
 * Encryption/Decryption utility for React/TypeScript
 * Compatible with Python backend encryption
 * 
 * Installation:
 * npm install crypto-js
 * npm install --save-dev @types/crypto-js
 * 
 * This implementation uses AES-256-CBC with SHA256 key derivation,
 * which is compatible with the Python backend encryption
 */

import CryptoJS from 'crypto-js';

class EncryptionService {
  private key: CryptoJS.lib.WordArray;

  constructor(encryptionKey: string) {
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY must be provided');
    }
    
    // Derive a 32-byte key using SHA256 (same as Python)
    // Python: key_hash = hashlib.sha256(self.encryption_key.encode()).digest()
    const keyHash = CryptoJS.SHA256(encryptionKey);
    
    // Convert to WordArray for CryptoJS (32 bytes = 256 bits)
    this.key = keyHash;
  }

  /**
   * Encrypt a string using AES-256-CBC
   * Compatible with Python implementation
   * @param data - Data to encrypt
   * @returns Base64-encoded encrypted string (format: IV + ciphertext)
   */
  encrypt(data: string): string {
    if (!data) return data;
    
    try {
      // Generate a random IV for each encryption (16 bytes)
      const iv = CryptoJS.lib.WordArray.random(16);
      
      // Encrypt using AES-256-CBC
      const encrypted = CryptoJS.AES.encrypt(data, this.key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      
      // Combine IV and ciphertext
      // Format: IV (16 bytes) + ciphertext, all base64 encoded
      const ivArray = iv;
      const ciphertextArray = encrypted.ciphertext;
      
      // Combine IV and ciphertext
      const combined = ivArray.clone().concat(ciphertextArray);
      
      // Convert to base64 string
      return combined.toString(CryptoJS.enc.Base64);
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Decrypt a string
   * Compatible with Python implementation
   * @param encryptedData - Base64-encoded encrypted string (format: IV + ciphertext)
   * @returns Decrypted string
   */
  decrypt(encryptedData: string): string {
    if (!encryptedData) return encryptedData;
    
    try {
      // Decode from base64
      const combined = CryptoJS.enc.Base64.parse(encryptedData);
      
      // Extract IV (first 16 bytes = 4 words) and ciphertext (rest)
      const ivWords = combined.words.slice(0, 4);
      const ciphertextWords = combined.words.slice(4);
      
      const iv = CryptoJS.lib.WordArray.create(ivWords, 16);
      const ciphertext = CryptoJS.lib.WordArray.create(ciphertextWords);
      
      // Decrypt using AES-256-CBC
      const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: ciphertext } as CryptoJS.lib.CipherParams,
        this.key,
        {
          iv: iv,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        }
      );
      
      const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (!decryptedStr) {
        throw new Error('Decryption failed: Invalid encrypted data or wrong key');
      }
      
      return decryptedStr;
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Encrypt a JavaScript object/JSON
   * @param data - Object to encrypt
   * @returns Base64-encoded encrypted JSON string
   */
  encryptObject<T>(data: T): string {
    const jsonStr = JSON.stringify(data);
    return this.encrypt(jsonStr);
  }

  /**
   * Decrypt and parse JSON string back to object
   * @param encryptedData - Base64-encoded encrypted JSON string
   * @returns Decrypted object
   */
  decryptObject<T>(encryptedData: string): T {
    const jsonStr = this.decrypt(encryptedData);
    return JSON.parse(jsonStr) as T;
  }
}

// Helper function to get encryption service instance
// In React, get the key from environment variable
export const getEncryptionService = (): EncryptionService => {
  // Try different environment variable names for different frameworks
  // Check for Vite (import.meta.env)
  let encryptionKey: string | null = null;
  
  // Vite uses import.meta.env
  // Check for both VITE_ENCRYPTION_KEY and REACT_APP_ENCRYPTION_KEY
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // Debug: Log what's available in development
    if (import.meta.env.DEV) {
      // console.log('Checking for encryption key in import.meta.env...');
      // console.log('VITE_ENCRYPTION_KEY:', import.meta.env.VITE_ENCRYPTION_KEY ? 'Found' : 'Not found');
      // console.log('REACT_APP_ENCRYPTION_KEY:', import.meta.env.REACT_APP_ENCRYPTION_KEY ? 'Found' : 'Not found');
    }
    encryptionKey = import.meta.env.VITE_ENCRYPTION_KEY || 
                    import.meta.env.REACT_APP_ENCRYPTION_KEY || 
                    null;
  }
  
  // Fallback to process.env (for Create React App or Next.js)
  // Safely check for process.env without TypeScript errors
  if (!encryptionKey) {
    try {
      // Access process through window or globalThis if available
      const env = (() => {
        try {
          // Check if we're in a Node.js-like environment
          if (typeof window !== 'undefined' && (window as any).process?.env) {
            return (window as any).process.env;
          }
          // Check globalThis for process
          if (typeof globalThis !== 'undefined' && (globalThis as any).process?.env) {
            return (globalThis as any).process.env;
          }
        } catch {
          // Ignore errors
        }
        return null;
      })();
      
      if (env) {
        encryptionKey = env.REACT_APP_ENCRYPTION_KEY || 
                        env.NEXT_PUBLIC_ENCRYPTION_KEY || 
                        null;
      }
    } catch (e) {
      // process is not available, skip
    }
  }
  
  // Fallback to window.ENV (for runtime injection)
  if (!encryptionKey && typeof window !== 'undefined') {
    encryptionKey = (window as any).ENV?.ENCRYPTION_KEY || null;
  }
  
  // Fallback to localStorage
  if (!encryptionKey && typeof window !== 'undefined') {
    encryptionKey = localStorage.getItem('ENCRYPTION_KEY');
  }
  
  if (!encryptionKey) {
    // Debug: Log available env vars (for development only)
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
      console.warn('Available env vars:', Object.keys(import.meta.env).filter(key => key.startsWith('VITE_')));
    }
    
    // Provide helpful error message based on the build tool
    const isVite = typeof import.meta !== 'undefined' && import.meta.env;
    const errorMessage = isVite
      ? 'ENCRYPTION_KEY must be set. ' +
        'For Vite projects, add VITE_ENCRYPTION_KEY (not REACT_APP_ENCRYPTION_KEY) to your .env file. ' +
        'Note: Environment variables in Vite must be prefixed with VITE_ to be exposed to the client. ' +
        'Quick fix: Set localStorage.setItem("ENCRYPTION_KEY", "your-key") in browser console.'
      : 'ENCRYPTION_KEY must be set. ' +
        'Add REACT_APP_ENCRYPTION_KEY (Create React App) or NEXT_PUBLIC_ENCRYPTION_KEY (Next.js) to your .env file, ' +
        'or set it in localStorage with key "ENCRYPTION_KEY".';
    
    throw new Error(errorMessage);
  }
  
  return new EncryptionService(encryptionKey);
};

// Export the class and helper function
export { EncryptionService };
export default getEncryptionService;
