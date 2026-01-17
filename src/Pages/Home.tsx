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
          padding: "20px",
        }}
      >
        <h1
          style={{
            fontFamily: "Arial, Helvetica, sans-serif",
            fontWeight: "normal",
          }}
        >
          Shekl.<span className="ai-gradient">AI</span>
        </h1>
        <div style={{ padding: "20px" }}>
          <div
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
              borderRadius: "20px",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.4)",
              padding: "8px 16px",
            }}
          >
            <FaAward scale={1} style={{ color: "white", fontSize: "40px" }} />
            <p style={{ margin: 0, color: "white" }}>
              The World's First AI-Native Cash Flow Forecasting Tool
            </p>
          </div>
        </div>
        <div>
          <h2 style={{ textAlign: "center" }}>
            13-Week Cash Flow Forecasting{" "}
            <span className="ai-gradient">Made Simple</span>
          </h2>
        </div>
        <p style={{ textAlign: "center", margin: "20px 0" }}>
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
            style={{ margin: 0, lineHeight: "40px" }}
          >
            Get Started Free
          </h3>
        </div>

        <div style={{ marginTop: "40px", paddingBottom: "40px" }}>
          <Carousel />
        </div>

        <div style={{ marginTop: "40px", paddingBottom: "40px" }}>
          <What />
        </div>

        <div style={{ marginTop: "40px", paddingBottom: "40px" }}>
          <Details />
        </div>

        <div style={{ marginTop: "40px", paddingBottom: "40px" }}>
          <Pricing />
        </div>
      </div>
    </>
  );
};

export default Home;
