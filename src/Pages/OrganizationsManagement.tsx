import React, { useState } from 'react';
import './OrganizationsManagement.css';
import CompanyCreationform from '../Components/CompanyCreationform';
import ExistingCompanies from '../Components/ExistingCompanies';

const OrganizationsManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'existing' | 'create'>('existing');

  return (
    <div className="organizations-management">
      <div className="tabs-container">
        <div className="tabs-header">
          <button
            className={`tab-button ${activeTab === 'existing' ? 'active' : ''}`}
            onClick={() => setActiveTab('existing')}
          >
            Existing Companies
          </button>
          <button
            className={`tab-button ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            Create Company
          </button>
        </div>
        <div className="tabs-content">
          {activeTab === 'existing' ? (
            <ExistingCompanies />
          ) : (
            <CompanyCreationform />
          )}
        </div>
      </div>
    </div>
  );
};

export default OrganizationsManagement;
