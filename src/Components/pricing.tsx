import "./Pricing.css";
import { FiCheck } from "react-icons/fi";

const Pricing = () => {
  const features = [
    "13-week cash flow forecasting",
    "AI-powered transaction categorization",
    "QuickBooks, Plaid & CSV integrations",
    "High/Base/Low scenario analysis",
    "Excel & PDF exports",
    "Add unlimited team members",
  ];

  return (<>
      <div className="pricing-header">
        <span className="pricing-tag">Simple Pricing</span>
        <h1 className="pricing-title">One Plan, Everything Included</h1>
        <p className="pricing-subtitle">
          No hidden fees. No feature restrictions. Full access to all
          capabilities.
        </p>
      </div>

      <div className="pricing-card">
        <div className="pricing-banner">30-Day Free Trial</div>

        <div className="pricing-amount">
          <span className="pricing-price">$25</span>
          <span className="pricing-period">/user/month</span>
        </div>

        <p className="pricing-billing">Billed based on team size</p>

        <ul className="pricing-features">
          {features.map((feature, index) => (
            <li key={index} className="pricing-feature-item">
              <FiCheck className="pricing-check-icon" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <button className="pricing-button">Start Free Trial</button>

        <p className="pricing-disclaimer">No credit card required to start</p>
      </div>
    </>
  );
};

export default Pricing;
