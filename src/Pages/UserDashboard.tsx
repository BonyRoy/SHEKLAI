import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './UserDashboard.css';

interface DashboardCardData {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  route: string;
  onClick?: () => void;
}

interface DashboardCardProps {
  card: DashboardCardData;
}

const DashboardCard: React.FC<DashboardCardProps> = React.memo(({ card }) => {
  const navigate = useNavigate();
  const gradientId = `chevron-gradient-${card.id}`;

  const handleClick = () => {
    navigate(card.route);
    card.onClick?.();
  };

  return (
    <div className="dashboard-card" onClick={handleClick}>
      <div className="card-icon">{card.icon}</div>
      <div className="card-title-wrapper">
        <h2 className="card-title ai-gradient">{card.title}</h2>
        <div className="card-chevron">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
            <path
              d="M9.29 15.88L13.17 12L9.29 8.12c-.39-.39-.39-1.02 0-1.41.39-.39 1.02-.39 1.41 0l4.59 4.59c.39.39.39 1.02 0 1.41L10.7 17.3c-.39.39-1.02.39-1.41 0-.38-.39-.39-1.03 0-1.42z"
              fill={`url(#${gradientId})`}
            />
          </svg>
        </div>
      </div>
      <p className="card-description">{card.description}</p>
    </div>
  );
});

DashboardCard.displayName = 'DashboardCard';

const UserDashboard: React.FC = () => {
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('userData');
      if (stored) {
        const user = JSON.parse(stored) as { userName?: string };
        setUserName(user.userName ?? '');
      }
    } catch {
      setUserName('');
    }
  }, []);

  const cards: DashboardCardData[] = useMemo(
    () => [
      {
        id: 'profile',
        title: 'Manage Employee Profiles',
        description: 'Create, update, and manage employee profiles and information',
        route: '/',
        icon: (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
              fill="currentColor"
            />
          </svg>
        ),
        onClick: () => console.log('Profile clicked'),
      },
      {
        id: 'organizations',
        title: 'Organizations Management',
        description: 'View and manage all your organizations and their settings',
        route: '/',
        icon: (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
              fill="currentColor"
            />
          </svg>
        ),
        onClick: () => console.log('Projects clicked'),
      },
      {
        id: 'analytics',
        title: 'Perform Analytics',
        description: 'Analyze data, generate reports, and gain valuable business insights',
        route: '/',
        icon: (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
              fill="currentColor"
            />
          </svg>
        ),
        onClick: () => console.log('Analytics clicked'),
      },
    ],
    []
  );

  return (
    <div className="user-dashboard">
      <h1 className="dashboard-title">
        Welcome{userName ? `, ${userName}` : ''}
      </h1>
      <div className="dashboard-cards">
        {cards.map((card) => (
          <DashboardCard key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
};

export default UserDashboard;
