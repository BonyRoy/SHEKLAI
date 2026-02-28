import { FaAward } from "react-icons/fa";
import Details from "../Components/details";
import Pricing from "../Components/pricing";
import Carousel from "../Components/Carousel";
import What from "../Components/what";

const Home = () => {
  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        {/* Hero Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 24px 60px",
            maxWidth: "800px",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: "1.75rem",
              letterSpacing: "-0.5px",
              color: "var(--text-title)",
              marginBottom: "24px",
            }}
          >
            Shekl.<span className="ai-gradient">AI</span>
          </h1>

          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                background: "var(--primary)",
                borderRadius: "8px",
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 20px",
              }}
            >
              <FaAward style={{ color: "white", fontSize: "20px", flexShrink: 0 }} />
              <p
                style={{
                  margin: 0,
                  color: "white",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                }}
              >
                The World's First AI-Native Cash Flow Forecasting Tool
              </p>
            </div>
          </div>

          <h2
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 800,
              fontSize: "clamp(2rem, 5vw, 3.25rem)",
              lineHeight: 1.15,
              letterSpacing: "-1.5px",
              color: "var(--text-title)",
              marginBottom: "20px",
            }}
          >
            13-Week Cash Flow Forecasting{" "}
            <span className="ai-gradient">Made Simple</span>
          </h2>

          <p
            style={{
              fontSize: "1.1rem",
              lineHeight: 1.7,
              color: "var(--text-secondary)",
              maxWidth: "600px",
              marginBottom: "28px",
            }}
          >
            AI automatically categorizes transactions and generates forecast
            rules. Just connect your data and get an accurate cash flow forecast
            in minutes.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "40px",
            }}
          >
            <h3
              className="ai-gradient animated"
              style={{
                margin: 0,
                lineHeight: "40px",
                fontSize: "1.1rem",
                fontWeight: 700,
                letterSpacing: "-0.3px",
              }}
            >
              Get Started Free
            </h3>
          </div>
        </div>

        {/* Carousel */}
        <div style={{ width: "100%", paddingBottom: "40px" }}>
          <Carousel />
        </div>

        {/* Integrations */}
        <div style={{ width: "100%", maxWidth: "1200px", padding: "60px 24px" }}>
          <What />
        </div>

        {/* Features */}
        <div style={{ width: "100%", paddingBottom: "40px" }}>
          <Details />
        </div>

        {/* Pricing */}
        <div style={{ width: "100%", paddingBottom: "60px" }}>
          <Pricing />
        </div>
      </div>
    </>
  );
};

export default Home;
