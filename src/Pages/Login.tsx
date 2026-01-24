import { useState, useEffect } from "react";
import login from "../../public/LOGIN.png"
import "../Components/Pricing.css";
import "./Login.css";

const Login = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [uniqueId, setUniqueId] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  // Generate UUID when component mounts or switches to sign up
  useEffect(() => {
    if (isSignUp) {
      setUniqueId(crypto.randomUUID());
    }
  }, [isSignUp]);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const buttonStyle = {
    width: "100%",
    padding: "8px",
    background: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "1.1rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    fontFamily: "Arial, Helvetica, sans-serif"
  };

  const inputStyle = {
    border: "none",
    borderBottom: "1px solid #ccc",
    outline: "none",
    padding: "8px 0",
    background: "transparent"
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = "translateY(-2px)";
    e.currentTarget.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.4)";
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = "translateY(0)";
    e.currentTarget.style.boxShadow = "none";
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = "translateY(0)";
  };

  return (
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
              {isSignUp ? "Sign Up" : "Sign In"}
            </h1>
          </div>
          
          {isSignUp ? (
            // Sign Up Form
            <>
              <input 
                type="text" 
                placeholder="User Name" 
                style={inputStyle}
              />
              <input 
                type="tel" 
                placeholder="Phone Number" 
                style={inputStyle}
              />
              <input 
                type="email" 
                placeholder="Email" 
                style={inputStyle}
              />
              <input 
                type="password" 
                placeholder="Password" 
                style={inputStyle}
              />
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
              >
                Sign Up
              </button>
              <p style={{ textAlign: "center" }}>
                Already have an account?{" "}
                <span 
                  className="ai-gradient" 
                  style={{ color: "blue", cursor: "pointer", fontWeight: "bold" }}
                  onClick={() => setIsSignUp(false)}
                >
                  Sign In
                </span>
              </p>
            </>
          ) : (
            // Sign In Form
            <>
              <input 
                type="email" 
                placeholder="Email" 
                style={inputStyle}
              />
              <input 
                type="password" 
                placeholder="Password" 
                style={inputStyle}
              />
              <button 
                type="submit" 
                style={buttonStyle}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onMouseDown={handleMouseDown}
              >
                Sign In
              </button>
              <p style={{ textAlign: "center" }}>
                Don't have an account?{" "}
                <span 
                  className="ai-gradient" 
                  style={{ color: "blue", cursor: "pointer", fontWeight: "bold" }}
                  onClick={() => setIsSignUp(true)}
                >
                  Sign Up
                </span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
