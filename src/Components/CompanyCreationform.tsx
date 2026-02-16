import React, { useState, useRef, useEffect } from 'react';
import './CompanyCreationform.css';
import { FiChevronDown, FiSearch } from 'react-icons/fi';

interface FormData {
  // Company Details
  companyName: string;
  industry: string;
  businessEmail: string;
  companyLogo: File | null;
  
  // Business Model
  collectMoney: string[];
  sellFrequency: string;
  currency: string;
  
  // Company Structure
  companySize: string;
  manageMultipleCompanies: string;
  companyNames: string;
  
  // Financial Setup
  connectBankAccount: string;
  
  // Additional Details
  hearAboutShekl: string[];
  primaryContactName: string;
  date: string;
}

interface CurrencyOption {
  value: string;
  label: string;
}

interface SearchableDropdownProps {
  options: CurrencyOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    option.value.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus search input when dropdown opens
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSearchQuery('');
    }
  };

  return (
    <div className="searchable-dropdown" ref={dropdownRef}>
      <div
        className={`searchable-dropdown__trigger ${isOpen ? 'open' : ''}`}
        onClick={handleToggle}
      >
        <span className={selectedOption ? '' : 'placeholder'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <FiChevronDown className={`searchable-dropdown__chevron ${isOpen ? 'rotated' : ''}`} />
      </div>
      {isOpen && (
        <div className="searchable-dropdown__menu">
          <div className="searchable-dropdown__search">
            <FiSearch className="searchable-dropdown__search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="searchable-dropdown__search-input"
              placeholder="Search currency..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="searchable-dropdown__options">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  className={`searchable-dropdown__option ${
                    value === option.value ? 'selected' : ''
                  }`}
                  onClick={() => handleSelect(option.value)}
                >
                  {option.label}
                </div>
              ))
            ) : (
              <div className="searchable-dropdown__no-results">No results found</div>
            )}
          </div>
        </div>
      )}
      {required && !value && (
        <input
          type="text"
          required
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0 }}
          tabIndex={-1}
        />
      )}
    </div>
  );
};

const CompanyCreationform = () => {
  const [formData, setFormData] = useState<FormData>({
    companyName: '',
    industry: '',
    businessEmail: '',
    companyLogo: null,
    collectMoney: [],
    sellFrequency: '',
    currency: '',
    companySize: '',
    manageMultipleCompanies: '',
    companyNames: '',
    connectBankAccount: '',
    hearAboutShekl: [],
    primaryContactName: '',
    date: new Date().toISOString().split('T')[0],
  });

  const [otherCollectMoney, setOtherCollectMoney] = useState('');
  const [otherSellFrequency, setOtherSellFrequency] = useState('');
  const [otherHearAbout, setOtherHearAbout] = useState('');

  // Autopopulate business email and primary contact name from logged-in user
  useEffect(() => {
    try {
      const stored = localStorage.getItem('userData');
      if (stored) {
        const user = JSON.parse(stored) as { 
          userName?: string; 
          email?: string; 
        };
        if (user.email) {
          setFormData(prev => ({
            ...prev,
            businessEmail: user.email || ''
          }));
        }
        if (user.userName) {
          setFormData(prev => ({
            ...prev,
            primaryContactName: user.userName || ''
          }));
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }, []);

  const currencyOptions: CurrencyOption[] = [
    { value: 'USD', label: 'USD - US Dollar' },
    { value: 'EUR', label: 'EUR - Euro' },
    { value: 'GBP', label: 'GBP - British Pound' },
    { value: 'JPY', label: 'JPY - Japanese Yen' },
    { value: 'AUD', label: 'AUD - Australian Dollar' },
    { value: 'CAD', label: 'CAD - Canadian Dollar' },
    { value: 'CHF', label: 'CHF - Swiss Franc' },
    { value: 'CNY', label: 'CNY - Chinese Yuan' },
    { value: 'INR', label: 'INR - Indian Rupee' },
    { value: 'SGD', label: 'SGD - Singapore Dollar' },
    { value: 'HKD', label: 'HKD - Hong Kong Dollar' },
    { value: 'NZD', label: 'NZD - New Zealand Dollar' },
    { value: 'MXN', label: 'MXN - Mexican Peso' },
    { value: 'BRL', label: 'BRL - Brazilian Real' },
    { value: 'ZAR', label: 'ZAR - South African Rand' },
    { value: 'KRW', label: 'KRW - South Korean Won' },
    { value: 'SEK', label: 'SEK - Swedish Krona' },
    { value: 'NOK', label: 'NOK - Norwegian Krone' },
    { value: 'DKK', label: 'DKK - Danish Krone' },
    { value: 'PLN', label: 'PLN - Polish Zloty' },
    { value: 'RUB', label: 'RUB - Russian Ruble' },
    { value: 'TRY', label: 'TRY - Turkish Lira' },
    { value: 'AED', label: 'AED - UAE Dirham' },
    { value: 'SAR', label: 'SAR - Saudi Riyal' },
  ];

  const handleCurrencyChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      currency: value
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCheckboxChange = (name: keyof FormData, value: string) => {
    setFormData(prev => {
      const currentArray = (prev[name] as string[]) || [];
      if (currentArray.includes(value)) {
        return {
          ...prev,
          [name]: currentArray.filter(item => item !== value)
        };
      } else {
        return {
          ...prev,
          [name]: [...currentArray, value]
        };
      }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData(prev => ({
        ...prev,
        companyLogo: e.target.files![0]
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form Data:', formData);
    // Handle form submission here
  };

  return (
    <div className="company-creation-form">
      <div className="form-header">
        <h1 className="form-title">SHEKL COMPANY REGISTRATION</h1>
        <p className="form-subtitle">Set up your business profile to generate forecasts and insights.</p>
      </div>

      <form onSubmit={handleSubmit} className="registration-form">
        {/* COMPANY DETAILS */}
        <section className="form-section">
          <h2 className="section-title">COMPANY DETAILS</h2>
          
          <div className="company-details-grid">
            <div className="form-group">
              <label htmlFor="companyName">Company Name:</label>
              <input
                type="text"
                id="companyName"
                name="companyName"
                value={formData.companyName}
                onChange={handleInputChange}
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="industry">Industry:</label>
              <input
                type="text"
                id="industry"
                name="industry"
                value={formData.industry}
                onChange={handleInputChange}
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="businessEmail">Business Email:</label>
              <input
                type="email"
                id="businessEmail"
                name="businessEmail"
                value={formData.businessEmail}
                onChange={handleInputChange}
                className="form-input"
                disabled
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="companyLogo">Company Logo (optional):</label>
              <input
                type="file"
                id="companyLogo"
                name="companyLogo"
                onChange={handleFileChange}
                accept="image/*"
                className="form-input-file"
              />
              {formData.companyLogo && (
                <span className="file-name">{formData.companyLogo.name}</span>
              )}
            </div>
          </div>
        </section>

        {/* BUSINESS MODEL */}
        <section className="form-section">
          <h2 className="section-title">BUSINESS MODEL</h2>
          
          <div className="business-model-grid">
            <div className="form-group">
              <label className="form-label">How do you collect money?</label>
              <div className="checkbox-group">
                {[
                  'Subscription (Monthly)',
                  'Subscription (Yearly)',
                  'I sell products',
                  'I sell services',
                  'Usage-based billing',
                  'Restaurant / Food business'
                ].map(option => (
                  <label key={option} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.collectMoney.includes(option)}
                      onChange={() => handleCheckboxChange('collectMoney', option)}
                      className="checkbox-input"
                    />
                    <span>{option}</span>
                  </label>
                ))}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.collectMoney.includes('Other')}
                    onChange={() => handleCheckboxChange('collectMoney', 'Other')}
                    className="checkbox-input"
                  />
                  <span>Other</span>
                  {formData.collectMoney.includes('Other') && (
                    <input
                      type="text"
                      value={otherCollectMoney}
                      onChange={(e) => setOtherCollectMoney(e.target.value)}
                      placeholder="Specify other"
                      className="other-input"
                    />
                  )}
                </label>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">How often do you sell?</label>
              <div className="radio-group">
                {[
                  'Every day',
                  'Multiple times per week',
                  'Multiple times per month',
                  'Sporadically'
                ].map(option => (
                  <label key={option} className="radio-label">
                    <input
                      type="radio"
                      name="sellFrequency"
                      value={option}
                      checked={formData.sellFrequency === option}
                      onChange={handleInputChange}
                      className="radio-input"
                    />
                    <span>{option}</span>
                  </label>
                ))}
                <label className="radio-label">
                  <input
                    type="radio"
                    name="sellFrequency"
                    value="Other"
                    checked={formData.sellFrequency === 'Other'}
                    onChange={handleInputChange}
                    className="radio-input"
                  />
                  <span>Other</span>
                  {formData.sellFrequency === 'Other' && (
                    <input
                      type="text"
                      value={otherSellFrequency}
                      onChange={(e) => setOtherSellFrequency(e.target.value)}
                      placeholder="Specify other"
                      className="other-input"
                    />
                  )}
                </label>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="currency">Currency:</label>
            <SearchableDropdown
              options={currencyOptions}
              value={formData.currency}
              onChange={handleCurrencyChange}
              placeholder="Select currency"
              required
            />
          </div>
        </section>

        {/* COMPANY STRUCTURE */}
        <section className="form-section">
          <h2 className="section-title">COMPANY STRUCTURE</h2>
          
          <div className="company-structure-grid">
            <div className="form-group">
              <label className="form-label">Company Size (Headcount):</label>
              <div className="radio-group radio-group-inline">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="companySize"
                    value="1-5"
                    checked={formData.companySize === '1-5'}
                    onChange={handleInputChange}
                    className="radio-input"
                  />
                  <span>1–5</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="companySize"
                    value="6-20"
                    checked={formData.companySize === '6-20'}
                    onChange={handleInputChange}
                    className="radio-input"
                  />
                  <span>6–20</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="companySize"
                    value="21-50"
                    checked={formData.companySize === '21-50'}
                    onChange={handleInputChange}
                    className="radio-input"
                  />
                  <span>21–50</span>
                </label>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Will you manage multiple companies?</label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="manageMultipleCompanies"
                    value="No"
                    checked={formData.manageMultipleCompanies === 'No'}
                    onChange={handleInputChange}
                    className="radio-input"
                  />
                  <span>No</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="manageMultipleCompanies"
                    value="Yes"
                    checked={formData.manageMultipleCompanies === 'Yes'}
                    onChange={handleInputChange}
                    className="radio-input"
                  />
                  <span>Yes → If yes, list company names below:</span>
                </label>
              </div>
              {formData.manageMultipleCompanies === 'Yes' && (
                <textarea
                  name="companyNames"
                  value={formData.companyNames}
                  onChange={handleInputChange}
                  placeholder="List company names here..."
                  className="form-textarea"
                  rows={4}
                />
              )}
            </div>
          </div>
        </section>

        {/* FINANCIAL SETUP */}
        <section className="form-section">
          <h2 className="section-title">FINANCIAL SETUP</h2>
          
          <div className="form-group">
            <label className="form-label">Connect Business Bank Account (Recommended):</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="connectBankAccount"
                  value="Connect now"
                  checked={formData.connectBankAccount === 'Connect now'}
                  onChange={handleInputChange}
                  className="radio-input"
                />
                <span>Connect now</span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="connectBankAccount"
                  value="Skip for now"
                  checked={formData.connectBankAccount === 'Skip for now'}
                  onChange={handleInputChange}
                  className="radio-input"
                />
                <span>Skip for now</span>
              </label>
            </div>
          </div>
        </section>

        {/* ADDITIONAL DETAILS */}
        <section className="form-section">
          <h2 className="section-title">ADDITIONAL DETAILS</h2>
          
          <div className="form-group">
            <label className="form-label">How did you hear about Shekl?</label>
            <div className="checkbox-group">
              {[
                'Google Search',
                'Social Media',
                'Referral',
                'Partner / Investor',
                'Event / Webinar'
              ].map(option => (
                <label key={option} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.hearAboutShekl.includes(option)}
                    onChange={() => handleCheckboxChange('hearAboutShekl', option)}
                    className="checkbox-input"
                  />
                  <span>{option}</span>
                </label>
              ))}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.hearAboutShekl.includes('Other')}
                  onChange={() => handleCheckboxChange('hearAboutShekl', 'Other')}
                  className="checkbox-input"
                />
                <span>Other</span>
                {formData.hearAboutShekl.includes('Other') && (
                  <input
                    type="text"
                    value={otherHearAbout}
                    onChange={(e) => setOtherHearAbout(e.target.value)}
                    placeholder="Specify other"
                    className="other-input"
                  />
                )}
              </label>
            </div>
          </div>

          <div className="additional-details-grid">
            <div className="form-group">
              <label htmlFor="primaryContactName">Primary Contact Name:</label>
              <input
                type="text"
                id="primaryContactName"
                name="primaryContactName"
                value={formData.primaryContactName}
                onChange={handleInputChange}
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="date">Date:</label>
              <input
                type="date"
                id="date"
                name="date"
                value={formData.date}
                onChange={handleInputChange}
                className="form-input"
                required
              />
            </div>
          </div>
        </section>

        <div className="form-actions">
          <button type="submit" className="submit-button">
            Submit Registration
          </button>
        </div>
      </form>
    </div>
  );
};

export default CompanyCreationform;
