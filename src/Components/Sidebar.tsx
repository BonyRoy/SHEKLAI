import { useNavigate } from "react-router-dom";
import { useSidebar } from "../contexts/SidebarContext";
import { HiX } from "react-icons/hi";
import packageLock from "../../package-lock.json";
import "./Sidebar.css";

const Sidebar = () => {
  const navigate = useNavigate();
  const { isOpen, closeSidebar } = useSidebar();

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
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-version">v{packageLock.version}</div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
