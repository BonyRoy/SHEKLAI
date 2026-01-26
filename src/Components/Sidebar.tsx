import { useNavigate } from "react-router-dom";
import { useSidebar } from "../contexts/SidebarContext";
import { useState, useEffect } from "react";
import { HiX } from "react-icons/hi";
import packageLock from "../../package-lock.json";
import "./Sidebar.css";

const Sidebar = () => {
  const navigate = useNavigate();
  const { isOpen, closeSidebar } = useSidebar();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

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
            Home
          </div>
          <div
            className="sidebar-link"
            onClick={() => handleNavigate("/about")}
          >
            About
          </div>
          {isLoggedIn && (
            <div
              className="sidebar-link"
              onClick={() => handleNavigate("/user-dashboard")}
            >
              User Dashboard
            </div>
          )}
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-version">v{packageLock.version}</div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
