import { useState } from 'react';
import { toast } from 'react-toastify';
import { getEncryptionService } from './encryption';
import { setAuthToken } from './userContext';
import { API_BASE_URL } from './apiConfig';

/** Demo account for testing when backend/DB is not available. Case-sensitive. */
export const DEMO_EMAIL = 'demo@shekl.ai';
export const DEMO_PASSWORD = 'Demo123!';
export const isDemoCredentials = (email: string, password: string) =>
  email.trim().toLowerCase() === DEMO_EMAIL.toLowerCase() && password === DEMO_PASSWORD;

interface SignUpData {
  userName: string;
  phoneNumber: string;
  email: string;
  password: string;
  uuid: string;
}

interface SignInData {
  email: string;
  password: string;
}

interface ChangePasswordData {
  email: string;
  sixDigitCode: string;
  newPassword: string;
}

interface SignUpResponse {
  message: string;
  sixDigitCode: string;
  success: boolean;
}

interface SignInResponse {
  message: string;
  user: {
    id: number;
    userName: string;
    phoneNumber: string;
    email: string;
    uuid: string;
    sixDigitCode: string;
    createdAt: string;
    updatedAt: string;
  };
  success: boolean;
}

interface ChangePasswordResponse {
  message: string;
  success: boolean;
}

interface ApiError {
  detail: string;
}

interface EncryptedRequest {
  encrypted_data: string;
}

interface EncryptedResponse {
  encrypted_data: string;
  success: boolean;
}

export const useLogin = () => {
  const [loading, setLoading] = useState(false);

  const signUp = async (data: SignUpData): Promise<SignUpResponse | null> => {
    setLoading(true);
    try {
      // Get encryption service
      const encryptionService = getEncryptionService();
      
      // Encrypt the request data
      const encryptedData = encryptionService.encryptObject(data);
      console.log('[signup] decrypted request:', data);

      // Send encrypted request
      const response = await fetch(`${API_BASE_URL}/api/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          encrypted_data: encryptedData
        } as EncryptedRequest),
      });

      const result = await response.json() as EncryptedResponse | ApiError;

      if (!response.ok) {
        const error = result as ApiError;
        toast.error(error.detail || 'Sign up failed');
        return null;
      }

      // Decrypt the response
      const encryptedResponse = result as EncryptedResponse;
      const decryptedResponse = encryptionService.decryptObject<SignUpResponse>(
        encryptedResponse.encrypted_data
      );
      console.log('[signup] decrypted response:', decryptedResponse);

      toast.success(decryptedResponse.message || 'Sign up successful!');
      return decryptedResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if it's an encryption key error
      if (errorMessage.includes('ENCRYPTION_KEY')) {
        toast.error('Encryption configuration error. Please contact support.');
        console.error('Encryption error:', error);
      } else {
        toast.error('Network error. Please try again.');
        console.error('Sign up error:', error);
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (data: SignInData): Promise<SignInResponse | null> => {
    setLoading(true);
    try {
      // Demo account: sign in without API (works when backend/DB is unavailable)
      if (isDemoCredentials(data.email, data.password)) {
        await new Promise((r) => setTimeout(r, 400)); // brief delay for UX
        const demoId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const demoResponse: SignInResponse = {
          message: 'Signed in with demo account.',
          user: {
            id: demoId as unknown as number,
            userName: 'Demo User',
            phoneNumber: '',
            email: DEMO_EMAIL,
            uuid: demoId,
            sixDigitCode: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          success: true,
        };
        setAuthToken("demo-token-" + demoId);
        toast.success(demoResponse.message);
        setLoading(false);
        return demoResponse;
      }

      // Get encryption service
      const encryptionService = getEncryptionService();
      
      // Encrypt the request data
      const encryptedData = encryptionService.encryptObject(data);
      console.log('[signin] decrypted request:', data);

      // Send encrypted request
      const response = await fetch(`${API_BASE_URL}/api/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          encrypted_data: encryptedData
        } as EncryptedRequest),
      });

      const result = await response.json() as EncryptedResponse | ApiError;

      if (!response.ok) {
        const error = result as ApiError;
        toast.error(error.detail || 'Sign in failed');
        return null;
      }

      // Decrypt the response
      const encryptedResponse = result as EncryptedResponse;
      const decryptedResponse = encryptionService.decryptObject<SignInResponse>(
        encryptedResponse.encrypted_data
      );
      console.log('[signin] decrypted response:', decryptedResponse);

      // Store JWT token if present in response
      if ((decryptedResponse as unknown as Record<string, unknown>).token) {
        setAuthToken((decryptedResponse as unknown as Record<string, unknown>).token as string);
      }

      toast.success(decryptedResponse.message || 'Sign in successful!');
      return decryptedResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if it's an encryption key error
      if (errorMessage.includes('ENCRYPTION_KEY')) {
        toast.error('Encryption configuration error. Please contact support.');
        console.error('Encryption error:', error);
      } else {
        toast.error('Network error. Please try again.');
        console.error('Sign in error:', error);
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (data: ChangePasswordData): Promise<ChangePasswordResponse | null> => {
    setLoading(true);
    try {
      // Get encryption service
      const encryptionService = getEncryptionService();
      
      // Encrypt the request data
      const encryptedData = encryptionService.encryptObject(data);
      console.log('[change-password] decrypted request:', data);

      // Send encrypted request
      const response = await fetch(`${API_BASE_URL}/api/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          encrypted_data: encryptedData
        } as EncryptedRequest),
      });

      const result = await response.json() as EncryptedResponse | ApiError;

      if (!response.ok) {
        const error = result as ApiError;
        toast.error(error.detail || 'Password change failed');
        return null;
      }

      // Decrypt the response
      const encryptedResponse = result as EncryptedResponse;
      const decryptedResponse = encryptionService.decryptObject<ChangePasswordResponse>(
        encryptedResponse.encrypted_data
      );
      console.log('[change-password] decrypted response:', decryptedResponse);

      toast.success(decryptedResponse.message || 'Password changed successfully!');
      return decryptedResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if it's an encryption key error
      if (errorMessage.includes('ENCRYPTION_KEY')) {
        toast.error('Encryption configuration error. Please contact support.');
        console.error('Encryption error:', error);
      } else {
        toast.error('Network error. Please try again.');
        console.error('Change password error:', error);
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    signUp,
    signIn,
    changePassword,
    loading,
  };
};
