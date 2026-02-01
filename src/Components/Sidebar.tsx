import { useNavigate } from "react-router-dom";
import { useSidebar } from "../contexts/SidebarContext";
import { useTheme } from "../contexts/ThemeContext";
import { useState, useEffect } from "react";
import { HiX } from "react-icons/hi";
import { FaHome, FaInfoCircle, FaUser, FaBuilding, FaChartLine, FaTags, FaExchangeAlt, FaPlug, FaSun, FaMoon, FaSignInAlt, FaSignOutAlt } from "react-icons/fa";
import Modal from "./Modal";
import packageLock from "../../package-lock.json";
import "./Sidebar.css";

const Sidebar = () => {
  const navigate = useNavigate();
  const { isOpen, closeSidebar } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    // Check localStorage on mount and when it changes
    const checkLoginStatus = () => {
      const loggedIn = localStorage.getItem("isLoggedIn") === "true";
      setIsLoggedIn(loggedIn);
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

  const handleNavigate = (path: string) => {
    navigate(path);
    closeSidebar();
  };

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userData");
    window.dispatchEvent(new Event("loginStatusChanged"));
    setShowLogoutModal(false);
    closeSidebar();
    navigate("/");
  };

  const handleSignIn = () => {
    navigate("/login");
    closeSidebar();
  };

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}
      <div className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <button className="sidebar-close-btn" onClick={closeSidebar}>
            <HiX />
          </button>
        </div>
        <div className="sidebar-content">
          <div className="sidebar-link" onClick={() => handleNavigate("/")}>
            <FaHome className="sidebar-icon" />
            <span>Home</span>
          </div>
          <div
            className="sidebar-link"
            onClick={() => handleNavigate("/about")}
          >
            <FaInfoCircle className="sidebar-icon" />
            <span>About</span>
          </div>
          {isLoggedIn && (
            <>
              <div
                className="sidebar-link"
                onClick={() => handleNavigate("/user-dashboard")}
              >
                <FaUser className="sidebar-icon" />
                <span>User Dashboard</span>
              </div>
              <div
                className="sidebar-link"
                onClick={() => handleNavigate("/company-dashboard")}
              >
                <FaBuilding className="sidebar-icon" />
                <span>Company Dashboard</span>
              </div>
              <div
                className="sidebar-link"
                onClick={() => handleNavigate("/13-week-forecast")}
              >
                <FaChartLine className="sidebar-icon" />
                <span>13-Week Forecast</span>
              </div>
              <div
                className="sidebar-link"
                onClick={() => handleNavigate("/categories")}
              >
                <FaTags className="sidebar-icon" />
                <span>Categories</span>
              </div>
              <div
                className="sidebar-link"
                onClick={() => handleNavigate("/transactions")}
              >
                <FaExchangeAlt className="sidebar-icon" />
                <span>Transactions</span>
              </div>
              <div
                className="sidebar-link"
                onClick={() => handleNavigate("/connect-data")}
              >
                <FaPlug className="sidebar-icon" />
                <span>Connect Data</span>
              </div>
            </>
          )}
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-actions">
            <button
              className="sidebar-theme-button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {theme === "light" ? (
                <FaSun className="sidebar-icon" />
              ) : (
                <FaMoon className="sidebar-icon" />
              )}
              <span>{theme === "light" ? "Light Mode" : "Dark Mode"}</span>
            </button>
            {isLoggedIn ? (
              <button
                className="sidebar-sign-button sidebar-sign-out"
                onClick={() => setShowLogoutModal(true)}
              >
                <FaSignOutAlt className="sidebar-sign-icon" />
                <span>Sign Out</span>
              </button>
            ) : (
              <button
                className="sidebar-sign-button sidebar-sign-in"
                onClick={handleSignIn}
              >
                <FaSignInAlt className="sidebar-sign-icon" />
                <span>Sign In</span>
              </button>
            )}
          </div>
          <div className="sidebar-version">v{packageLock.version}</div>
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

export default Sidebar;
