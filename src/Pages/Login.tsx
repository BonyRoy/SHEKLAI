import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import login from "../../public/LOGIN.png"
import "../Components/Pricing.css";
import "./Login.css";
import { useLogin, DEMO_EMAIL, DEMO_PASSWORD } from "../services/useLogin";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import FullPageLoader from "../Components/FullPageLoader";

const Login = () => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [uniqueId, setUniqueId] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  
  // Password visibility states
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  
  // Form state for Sign Up
  const [signUpData, setSignUpData] = useState({
    userName: "",
    phoneNumber: "",
    email: "",
    password: "",
  });
  
  // Form state for Sign In
  const [signInData, setSignInData] = useState({
    email: "",
    password: "",
  });
  const [rememberMe, setRememberMe] = useState(false);

  const REMEMBER_ME_EMAIL_KEY = "rememberMeEmail";
  const REMEMBER_ME_PASSWORD_KEY = "rememberMePassword";
  
  // Form state for Forgot Password
  const [forgotPasswordData, setForgotPasswordData] = useState({
    email: "",
    sixDigitCode: "",
    newPassword: "",
  });
  
  const { signUp, signIn, changePassword, loading } = useLogin();

  // Generate UUID when component mounts or switches to sign up
  useEffect(() => {
    if (isSignUp) {
      setUniqueId(crypto.randomUUID());
    }
  }, [isSignUp]);

  
  // Load remembered credentials on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBER_ME_EMAIL_KEY);
    const savedPassword = localStorage.getItem(REMEMBER_ME_PASSWORD_KEY);
    if (savedEmail !== null && savedPassword !== null) {
      setSignInData({ email: savedEmail, password: savedPassword });
      setRememberMe(true);
    }
  }, []);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px",
    background: "var(--primary)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
    fontFamily: "'Inter', sans-serif",
    letterSpacing: "-0.01em",
  };

  const inputStyle: React.CSSProperties = {};

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = "var(--primary-dark)";
    e.currentTarget.style.boxShadow = "0 4px 12px rgba(37, 99, 235, 0.25)";
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = "var(--primary)";
    e.currentTarget.style.boxShadow = "none";
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = "var(--primary-dark)";
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await signUp({
      ...signUpData,
      uuid: uniqueId,
    });
    if (result) {
      // Reset form on success
      setSignUpData({
        userName: "",
        phoneNumber: "",
        email: "",
        password: "",
      });
      setIsSignUp(false);
      setShowSignUpPassword(false);
    }
  };

  const handleRememberMeChange = (checked: boolean) => {
    setRememberMe(checked);
    if (checked) {
      localStorage.setItem(REMEMBER_ME_EMAIL_KEY, signInData.email);
      localStorage.setItem(REMEMBER_ME_PASSWORD_KEY, signInData.password);
    } else {
      localStorage.removeItem(REMEMBER_ME_EMAIL_KEY);
      localStorage.removeItem(REMEMBER_ME_PASSWORD_KEY);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await signIn(signInData);
    if (result) {
      if (rememberMe) {
        localStorage.setItem(REMEMBER_ME_EMAIL_KEY, signInData.email);
        localStorage.setItem(REMEMBER_ME_PASSWORD_KEY, signInData.password);
      } else {
        localStorage.removeItem(REMEMBER_ME_EMAIL_KEY);
        localStorage.removeItem(REMEMBER_ME_PASSWORD_KEY);
      }
      // Set localStorage flag for logged in user
      localStorage.setItem("isLoggedIn", "true");
      // Store user data if needed
      if (result.user) {
        localStorage.setItem("userData", JSON.stringify(result.user));
      }
      // Dispatch custom event to notify other components
      window.dispatchEvent(new Event("loginStatusChanged"));
      // Reset form on success
      setSignInData({
        email: "",
        password: "",
      });
      // Navigate to User Dashboard
      navigate("/user-dashboard");
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await changePassword(forgotPasswordData);
    if (result) {
      // Reset form on success
      setForgotPasswordData({
        email: "",
        sixDigitCode: "",
        newPassword: "",
      });
      setIsForgotPassword(false);
      setShowForgotPassword(false);
    }
  };

  const handleBackToSignIn = () => {
    setIsForgotPassword(false);
    setShowForgotPassword(false);
    setForgotPasswordData({
      email: "",
      sixDigitCode: "",
      newPassword: "",
    });
  };

  return (
    <>
      <FullPageLoader isLoading={loading} />
      <div className="login-container">
        <div className="login-grid">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", }}>
          <img className="login-image" src={login} alt="Login" />
        </div>        <div 
          className="login-form-container"
          style={{ padding: !isMobile ? "10px" : "0" }}
        >
          <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center" }}>
            <h1 className="ai-gradient" style={{ textAlign: "center"}}>
              {isForgotPassword ? "Forgot Password" : isSignUp ? "Sign Up" : "Sign In"}
            </h1>
          </div>
          
          {isForgotPassword ? (
            // Forgot Password Form
            <form onSubmit={handleForgotPassword}>
              <input 
                type="email" 
                placeholder="Email" 
                style={inputStyle}
                value={forgotPasswordData.email}
                onChange={(e) => setForgotPasswordData({ ...forgotPasswordData, email: e.target.value })}
                required
              />
              <input 
                type="text" 
                placeholder="6-Digit Code" 
                style={inputStyle}
                value={forgotPasswordData.sixDigitCode}
                onChange={(e) => setForgotPasswordData({ ...forgotPasswordData, sixDigitCode: e.target.value })}
                maxLength={6}
                pattern="[0-9]{6}"
                required
              />
              <div className="password-input-wrapper">
                <input 
                  type={showForgotPassword ? "text" : "password"}
                  placeholder="New Password" 
                  style={inputStyle}
                  value={forgotPasswordData.newPassword}
                  onChange={(e) => setForgotPasswordData({ ...forgotPasswordData, newPassword: e.target.value })}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowForgotPassword(!showForgotPassword)}
                  aria-label={showForgotPassword ? "Hide password" : "Show password"}
                >
                  {showForgotPassword ? <FaEye /> : <FaEyeSlash />}
                </button>
              </div>
              <button 
                type="submit" 
                style={buttonStyle}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onMouseDown={handleMouseDown}
                disabled={loading}
              >
                {loading ? "Changing Password..." : "Change Password"}
              </button>
              <p style={{ textAlign: "center", marginTop: "12px", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                Remember your password?{" "}
                <span 
                  className="ai-gradient" 
                  style={{ cursor: "pointer", fontWeight: 600 }}
                  onClick={handleBackToSignIn}
                >
                  Sign In
                </span>
              </p>
            </form>
          ) : isSignUp ? (
            // Sign Up Form
            <form onSubmit={handleSignUp}>
              <input 
                type="text" 
                placeholder="User Name" 
                style={inputStyle}
                value={signUpData.userName}
                onChange={(e) => setSignUpData({ ...signUpData, userName: e.target.value })}
                required
              />
              <input 
                type="tel" 
                placeholder="Phone Number" 
                style={inputStyle}
                value={signUpData.phoneNumber}
                onChange={(e) => setSignUpData({ ...signUpData, phoneNumber: e.target.value })}
                required
              />
              <input 
                type="email" 
                placeholder="Email" 
                style={inputStyle}
                value={signUpData.email}
                onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                required
              />
              <div className="password-input-wrapper">
                <input 
                  type={showSignUpPassword ? "text" : "password"}
                  placeholder="Password" 
                  style={inputStyle}
                  value={signUpData.password}
                  onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                  aria-label={showSignUpPassword ? "Hide password" : "Show password"}
                >
                  {showSignUpPassword ? <FaEye /> : <FaEyeSlash />}
                </button>
              </div>
              <input 
                type="hidden" 
                value={uniqueId}
              />
              <button 
                type="submit" 
                style={buttonStyle}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onMouseDown={handleMouseDown}
                disabled={loading}
              >
                {loading ? "Signing Up..." : "Sign Up"}
              </button>
              <p style={{ textAlign: "center", marginTop: "12px", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                Already have an account?{" "}
                <span 
                  className="ai-gradient" 
                  style={{ cursor: "pointer", fontWeight: 600 }}
                  onClick={() => {
                    setIsSignUp(false);
                    setShowSignUpPassword(false);
                  }}
                >
                  Sign In
                </span>
              </p>
            </form>
          ) : (
            // Sign In Form
            <form onSubmit={handleSignIn}>
              <input 
                type="email" 
                placeholder="Email" 
                style={inputStyle}
                value={signInData.email}
                onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                required
              />
              <div className="password-input-wrapper">
                <input 
                  type={showSignInPassword ? "text" : "password"}
                  placeholder="Password" 
                  style={inputStyle}
                  value={signInData.password}
                  onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowSignInPassword(!showSignInPassword)}
                  aria-label={showSignInPassword ? "Hide password" : "Show password"}
                >
                  {showSignInPassword ? <FaEye /> : <FaEyeSlash />}
                </button>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "4px",
                  marginBottom: "4px",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                  fontWeight: 500,
                }}
              >
                <input
                  type="checkbox"
                  className="remember-me-checkbox"
                  checked={rememberMe}
                  onChange={(e) => handleRememberMeChange(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#3b82f6" }}
                  aria-label="Remember me"
                />
                Remember me
              </label>
              <button 
                type="submit" 
                style={buttonStyle}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onMouseDown={handleMouseDown}
                disabled={loading}
              >
                {loading ? "Signing In..." : "Sign In"}
              </button>
              <p
                style={{
                  textAlign: "center",
                  marginTop: "12px",
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                }}
              >
                Demo account:{" "}
                <button
                  type="button"
                  onClick={() => {
                    setSignInData({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    font: "inherit",
                    color: "var(--primary)",
                    cursor: "pointer",
                    fontWeight: 600,
                    textDecoration: "underline",
                  }}
                >
                  {DEMO_EMAIL} / {DEMO_PASSWORD}
                </button>
                {" "}(click to fill)
              </p>
              <p style={{ textAlign: "center", marginTop: "8px" }}>
                <span 
                  className="ai-gradient" 
                  style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" }}
                  onClick={() => {
                    setIsForgotPassword(true);
                    setShowSignInPassword(false);
                  }}
                >
                  Forgot Password?
                </span>
              </p>
              <p style={{ textAlign: "center", marginTop: "8px", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                Don't have an account?{" "}
                <span 
                  className="ai-gradient" 
                  style={{ cursor: "pointer", fontWeight: 600 }}
                  onClick={() => {
                    setIsSignUp(true);
                    setShowSignInPassword(false);
                  }}
                >
                  Sign Up
                </span>
              </p>
            </form>
          )}
        </div>
      </div>
      </div>
    </>
  );
};

export default Login;
