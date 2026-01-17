import "./Footer.css";
import { FiDollarSign } from "react-icons/fi";

const Footer = () => {
  return (
    <footer className="footer-container">
      <div className="footer-content">
        <div className="footer-logo">
          <h2 className="footer-logo-text">SHEKL.AI</h2>
        </div>

        <nav className="footer-nav">
          <a href="/privacy" className="footer-link">
            Privacy Policy
          </a>
          <span className="footer-separator">|</span>
          <a href="/terms" className="footer-link">
            Terms of Service
          </a>
        </nav>

        <p className="footer-copyright">
          © 2025 Shekl.ai. Professional cash flow forecasting for growing businesses.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
