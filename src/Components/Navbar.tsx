import { useTheme } from "../contexts/ThemeContext";
import { useSidebar } from "../contexts/SidebarContext";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { FaSun, FaMoon, FaUserCircle } from "react-icons/fa";
import Modal from "./Modal";
import "./Navbar.css";

const Navbar = () => {
  const { theme, toggleTheme } = useTheme();
  const { toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check localStorage on mount and when it changes
    const checkLoginStatus = () => {
      const loggedIn = localStorage.getItem("isLoggedIn") === "true";
      setIsLoggedIn(loggedIn);
      if (!loggedIn) {
        setShowDropdown(false);
      }
    };

    checkLoginStatus();
    // Listen for storage changes (in case user logs in from another tab)
    window.addEventListener("storage", checkLoginStatus);
    // Also listen for custom event if login happens in same tab
    window.addEventListener("loginStatusChanged", checkLoginStatus);

    return () => {
      window.removeEventListener("storage", checkLoginStatus);
      window.removeEventListener("loginStatusChanged", checkLoginStatus);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userData");
    window.dispatchEvent(new Event("loginStatusChanged"));
    setShowDropdown(false);
    setShowLogoutModal(false);
    navigate("/");
  };

  return (
    <>
      <div className="navbar-container">
        <h1 className="navbar-title" onClick={toggleSidebar}>
          Shekl.<span className="ai-gradient">AI</span>
        </h1>
        <div style={{ display: "flex", gap: "10px" }}>
          <div style={{ height: "100%" }}>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              <div className="theme-toggle-thumb">
                {theme === "light" ? (
                  <FaSun className="theme-icon" />
                ) : (
                  <FaMoon className="theme-icon" />
                )}
              </div>
              <FaSun className="theme-icon-inactive sun" />
              <FaMoon className="theme-icon-inactive moon" />
            </button>
          </div>
          {isLoggedIn ? (
            <div className="profile-dropdown-container" ref={dropdownRef}>
       
              <div 
                className="profile-icon-wrapper"
                onClick={() => setShowDropdown(!showDropdown)}
              >
                <FaUserCircle />
              </div>
              {showDropdown && (
                <div className="profile-dropdown">
                  <button
                    className="profile-dropdown-item profile-dropdown-item-disabled"
                    disabled
                  >
                    About
                  </button>
                  <button
                    className="profile-dropdown-item"
                    onClick={() => {
                      setShowLogoutModal(true);
                      setShowDropdown(false);
                    }}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => navigate("/login")}
              style={{
                background: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
                borderRadius: "20px",
                padding: "8px 16px",
                color: "white",
                border: "none",
                cursor: "pointer",
                width: "100%",
                minWidth: "100px",
                fontWeight: "bolder",
                height: "40px",
              }}
            >
              Sign In
            </button>
          )}
        </div>
      </div>
      <Modal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        title="Confirm Logout"
        message="Are you sure you want to logout?"
        confirmText="Logout"
        cancelText="Cancel"
        onConfirm={handleLogout}
      />
    </>
  );
};

export default Navbar;
