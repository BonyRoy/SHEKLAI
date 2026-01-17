import { useTheme } from "../contexts/ThemeContext";
import { useSidebar } from "../contexts/SidebarContext";
import { FaSun, FaMoon } from "react-icons/fa";
import "./Navbar.css";

const Navbar = () => {
  const { theme, toggleTheme } = useTheme();
  const { toggleSidebar } = useSidebar();

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
          <button
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
        </div>
      </div>
    </>
  );
};

export default Navbar;
