import { useEffect, useRef, useState } from "react";
import "./Details.css";
import {
  FiUpload,
  FiRefreshCw,
  FiTrendingUp,
  FiBarChart2,
  FiUsers,
  FiDollarSign,
} from "react-icons/fi";

const Details = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        const elementTop = rect.top;
        const elementHeight = rect.height;

        // Calculate progress: 0 when element enters viewport, 1 when fully scrolled past
        const progress = Math.max(
          0,
          Math.min(
            1,
            (windowHeight - elementTop) / (windowHeight + elementHeight)
          )
        );
        setScrollProgress(progress);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Initial calculation

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const features = [
    {
      icon: <FiUpload />,
      title: "Easy Data Import",
      description:
        "Import bank transactions and AR invoices instantly. Automatic duplicate detection and customer/vendor extraction.",
    },
    {
      icon: <FiRefreshCw />,
      title: "AI Categorization",
      description:
        "Smart AI auto-categorizes transactions. Create rules to track cash in, cash out, and analyze spending patterns.",
    },
    {
      icon: <FiTrendingUp />,
      title: "13-Week Forecast",
      description:
        "Visualize your cash waterfall. See beginning balance, inflows, outflows, and ending cash week by week.",
    },
    {
      icon: <FiBarChart2 />,
      title: "Scenario Analysis",
      description:
        "Compare base, high, and low cases. Plan for uncertainty with sensitivity analysis across three scenarios.",
    },
    {
      icon: <FiUsers />,
      title: "Team Collaboration",
      description:
        "Invite team members with role-based permissions. Owners, editors, and viewers work together seamlessly.",
    },
    {
      icon: <FiDollarSign />,
      title: "Export & Report",
      description:
        "Export to Excel or PDF with one click. Share professional reports with stakeholders and board members.",
    },
  ];

  return (
    <div ref={containerRef} className="details-container">
      <div
        className="animated-background"
        style={{
          transform: `translateY(${scrollProgress * 50}px) scale(${
            1 + scrollProgress * 0.1
          })`,
          opacity: 0.6 + scrollProgress * 0.3,
        }}
      />
      <div className="details-header">
        <h1 className="details-title">Everything You Need</h1>
        <p className="details-subtitle">
          Comprehensive tools for complete cash flow visibility
        </p>
      </div>
      <div className="features-grid">
        {features.map((feature, index) => (
          <div key={index} className="feature-card">
            <div className="feature-icon">{feature.icon}</div>
            <h3 className="feature-title">{feature.title}</h3>
            <p className="feature-description">{feature.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Details;
