import { useState } from 'react';
import { toast } from 'react-toastify';

const API_BASE_URL = 'http://localhost:8000';

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

export const useLogin = () => {
  const [loading, setLoading] = useState(false);

  const signUp = async (data: SignUpData): Promise<SignUpResponse | null> => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        const error = result as ApiError;
        toast.error(error.detail || 'Sign up failed');
        return null;
      }

      const signUpResponse = result as SignUpResponse;
      toast.success(signUpResponse.message || 'Sign up successful!');
      return signUpResponse;
    } catch (error) {
      toast.error('Network error. Please try again.');
      console.error('Sign up error:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (data: SignInData): Promise<SignInResponse | null> => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        const error = result as ApiError;
        toast.error(error.detail || 'Sign in failed');
        return null;
      }

      const signInResponse = result as SignInResponse;
      toast.success(signInResponse.message || 'Sign in successful!');
      return signInResponse;
    } catch (error) {
      toast.error('Network error. Please try again.');
      console.error('Sign in error:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (data: ChangePasswordData): Promise<ChangePasswordResponse | null> => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        const error = result as ApiError;
        toast.error(error.detail || 'Password change failed');
        return null;
      }

      const changePasswordResponse = result as ChangePasswordResponse;
      toast.success(changePasswordResponse.message || 'Password changed successfully!');
      return changePasswordResponse;
    } catch (error) {
      toast.error('Network error. Please try again.');
      console.error('Change password error:', error);
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
