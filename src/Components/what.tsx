import "./What.css";
import { FiFileText } from "react-icons/fi";

const What = () => {
  const integrations = [
    {
      icon: (
        <div className="integration-icon quickbooks">
          <span className="qb-text">qb</span>
        </div>
      ),
      title: "QuickBooks Online",
      description: "Sync transactions automatically",
    },
    {
      icon: (
        <div className="integration-icon plaid">
          <div className="plaid-grid">
            <div></div>
            <div></div>
            <div></div>
            <div></div>
          </div>
        </div>
      ),
      title: "Plaid",
      description: "Connect bank accounts securely",
    },
    {
      icon: (
        <div className="integration-icon csv">
          <FiFileText />
        </div>
      ),
      title: "CSV Upload",
      description: "Import from any source",
    },
  ];

  return (
    <>
      <div className="what-header">
        <h2 className="what-title">Connect Your Data in Minutes</h2>
        <p className="what-subtitle">
          Integrate with your existing tools or import data directly
        </p>
      </div>

      <div className="what-grid">
        {integrations.map((integration, index) => (
          <div key={index} className="what-card">
            <div className="what-icon-wrapper">{integration.icon}</div>
            <h3 className="what-card-title">{integration.title}</h3>
            <p className="what-card-description">{integration.description}</p>
          </div>
        ))}
      </div>
    </>
  );
};

export default What;
